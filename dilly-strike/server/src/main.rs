/* ==========================================================================
   DILLY STRIKE — Authoritative Rust WebSocket Tactical FPS Server
   Zero-dependency RFC 6455 WebSocket server supporting:
   - ALPHA (Gold) vs OMEGA (Cyan) team balancing
   - Real-time 3D position, yaw, pitch, weapon & crouch sync
   - Server-authoritative damage, headshots, kills, killfeed & team scores
   - Smoke & flashbang ability broadcast + tactical chat
   - Map rooms: `join` may carry "map" (maps.rs ids/codes); each map is its own
     room (players, teams, scores, broadcasts). Missing/unknown map -> dustline.
   - RANKED: any path containing "/ranked" is served by ranked.rs (see README.md)
   Run: cargo run --release --manifest-path dilly-strike/server/Cargo.toml -- [port]
   ========================================================================== */

use dilly_strike_server::ha::{pg_escape, HaContext};
use dilly_strike_server::maps::{self, MapDef};
use dilly_strike_server::ranked::Ranked;
use dilly_strike_server::util::{compute_ws_accept, encode_frame, json_esc, json_f64, json_str, try_decode_frame};
use std::collections::HashMap;
use std::env;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::{Arc, Mutex};
use std::thread;

const REDIS_CHANNEL: &str = "dilly:strike:events";

/// Redis fan-out channel per map room. dustline keeps the original channel name so
/// pods running an older build still share the dustline room.
fn room_channel(map: &MapDef) -> String {
    if map.id == maps::DEFAULT_MAP.id {
        REDIS_CHANNEL.to_string()
    } else {
        format!("{}:{}", REDIS_CHANNEL, map.id)
    }
}

struct Player {
    id: String,
    name: String,
    team: String, // "alpha" | "omega"
    map: &'static MapDef,
    stream: TcpStream,
    x: f64,
    y: f64,
    z: f64,
    yaw: f64,
    pitch: f64,
    weapon: String,
    hp: i32,
    armor: i32,
    kills: u32,
    deaths: u32,
}

struct MatchState {
    next_id: u64,
    /// per-map room score [alpha, omega]
    scores: HashMap<&'static str, [u32; 2]>,
    players: HashMap<String, Player>,
    ha: HaContext,
}

fn main() {
    let args: Vec<String> = env::args().collect();
    let port: u16 = args
        .get(1)
        .and_then(|s| s.parse().ok())
        .or_else(|| env::var("PORT").ok().and_then(|s| s.parse().ok()))
        .unwrap_or(8081);

    let ha_ctx = HaContext::from_env("dilly-strike");
    let _ = ha_ctx.pg_exec(
        "CREATE TABLE IF NOT EXISTS dilly_strike_stats (\
            callsign TEXT PRIMARY KEY,\
            kills INTEGER DEFAULT 0,\
            deaths INTEGER DEFAULT 0,\
            headshots INTEGER DEFAULT 0,\
            updated_at TIMESTAMPTZ DEFAULT NOW()\
         );",
    );

    let state = Arc::new(Mutex::new(MatchState {
        next_id: 1,
        scores: HashMap::new(),
        players: HashMap::new(),
        ha: ha_ctx.clone(),
    }));

    // Subscribe to Redis Pub/Sub for cross-pod HA fanout (one channel per map room)
    for map in maps::MAPS.iter().copied() {
        let st = Arc::clone(&state);
        ha_ctx.spawn_subscriber(room_channel(map), move |payload| {
            broadcast_local(&st, map, payload, None);
        });
    }

    let ranked = Ranked::from_env(ha_ctx.clone());

    let addr = format!("0.0.0.0:{}", port);
    let listener = TcpListener::bind(&addr).expect("Failed to bind Dilly Strike HA server");
    println!(
        "[Dilly Strike HA Rust Server] Listening on ws://0.0.0.0:{} (pod: {})",
        port, ha_ctx.pod_id
    );

    for stream in listener.incoming().flatten() {
        let st = Arc::clone(&state);
        let rk = Arc::clone(&ranked);
        thread::spawn(move || handle_client(stream, st, rk));
    }
}

fn handle_client(mut stream: TcpStream, state: Arc<Mutex<MatchState>>, ranked: Arc<Ranked>) {
    let _ = stream.set_nodelay(true);
    let mut buf = [0u8; 4096];
    let n = match stream.read(&mut buf) {
        Ok(n) if n > 0 => n,
        _ => return,
    };
    let req = String::from_utf8_lossy(&buf[..n]);

    // ---- ranked mode (ranked.rs) ----
    if req.split_whitespace().nth(1).map_or(false, |p| p.contains("/ranked")) {
        ranked.serve(stream, &req);
        return;
    }

    let ws_key = req.lines().find_map(|line| {
        if line.to_ascii_lowercase().starts_with("sec-websocket-key:") {
            Some(line.split_once(':')?.1.trim().to_string())
        } else {
            None
        }
    });

    let Some(key) = ws_key else {
        let body = {
            let g = state.lock().unwrap();
            g.ha.health_json("dilly-strike-server", g.players.len())
        };
        let resp = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            body.len(),
            body
        );
        let _ = stream.write_all(resp.as_bytes());
        return;
    };

    let accept = compute_ws_accept(&key);
    let hs = format!(
        "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: {}\r\n\r\n",
        accept
    );
    if stream.write_all(hs.as_bytes()).is_err() {
        return;
    }

    let write_stream = match stream.try_clone() {
        Ok(s) => s,
        Err(_) => return,
    };

    let pid = {
        let mut g = state.lock().unwrap();
        let id = format!("ag{:04x}", g.next_id);
        g.next_id += 1;
        let map = maps::DEFAULT_MAP;
        let team = balanced_team(&g, map, None);
        let ([sx, _, sz], _) = map.spawn(team == "alpha", 2);
        g.players.insert(
            id.clone(),
            Player {
                id: id.clone(),
                name: "Agent".to_string(),
                team,
                map,
                stream: write_stream,
                x: sx,
                y: 0.0,
                z: sz,
                yaw: 0.0,
                pitch: 0.0,
                weapon: "vandal".to_string(),
                hp: 100,
                armor: 50,
                kills: 0,
                deaths: 0,
            },
        );
        id
    };

    let mut acc: Vec<u8> = Vec::with_capacity(4096);
    let mut tmp = [0u8; 4096];
    loop {
        match stream.read(&mut tmp) {
            Ok(0) | Err(_) => break,
            Ok(rn) => {
                acc.extend_from_slice(&tmp[..rn]);
                while let Some((op, payload)) = try_decode_frame(&mut acc) {
                    match op {
                        0x1 => {
                            if let Ok(text) = String::from_utf8(payload) {
                                handle_msg(&pid, &text, &state);
                            }
                        }
                        0x8 => {
                            acc.clear();
                            break;
                        }
                        0x9 => {
                            let _ = stream.write_all(&encode_frame(0xA, &payload));
                        }
                        _ => {}
                    }
                }
            }
        }
    }

    let leave_msg = {
        let mut g = state.lock().unwrap();
        g.players.remove(&pid).map(|p| {
            (
                p.map,
                format!(
                    "{{\"type\":\"leave\",\"id\":\"{}\",\"name\":\"{}\"}}",
                    json_esc(&p.id),
                    json_esc(&p.name)
                ),
            )
        })
    };
    if let Some((map, m)) = leave_msg {
        broadcast(&state, map, &m, None);
    }
}

/// Smaller team of a map room (ties -> alpha), ignoring `except` (the joining player).
fn balanced_team(g: &MatchState, map: &MapDef, except: Option<&str>) -> String {
    let room = g.players.values().filter(|p| p.map.id == map.id && except.map_or(true, |e| e != p.id));
    let (mut alpha_n, mut omega_n) = (0, 0);
    for p in room {
        if p.team == "alpha" {
            alpha_n += 1;
        } else {
            omega_n += 1;
        }
    }
    if alpha_n <= omega_n { "alpha" } else { "omega" }.to_string()
}

fn room_of(state: &Arc<Mutex<MatchState>>, pid: &str) -> &'static MapDef {
    state.lock().unwrap().players.get(pid).map(|p| p.map).unwrap_or(maps::DEFAULT_MAP)
}

fn handle_msg(pid: &str, text: &str, state: &Arc<Mutex<MatchState>>) {
    let mtype = json_str(text, "type").unwrap_or_default();
    match mtype.as_str() {
        "join" => {
            let raw = json_str(text, "name").unwrap_or_else(|| "Agent".to_string());
            let clean: String = raw.trim().chars().take(16).collect();
            let name = if clean.is_empty() { "Agent".to_string() } else { clean };

            // map room: validated against maps.rs, missing/unknown -> dustline
            let map = maps::resolve(json_str(text, "map").as_deref());

            let (welcome, join_bc, old_room) = {
                let mut g = state.lock().unwrap();
                let old_room = g.players.get(pid).map(|p| p.map).filter(|m| m.id != map.id);
                let team = balanced_team(&g, map, Some(pid));
                let ([sx, _, sz], yaw) = map.spawn(team == "alpha", 2);
                if let Some(p) = g.players.get_mut(pid) {
                    p.name = name.clone();
                    p.team = team.clone();
                    p.map = map;
                    p.x = sx;
                    p.y = 0.0;
                    p.z = sz;
                    p.yaw = yaw;
                }
                let [score_alpha, score_omega] = g.scores.get(map.id).copied().unwrap_or([0, 0]);
                let plist: Vec<String> = g
                    .players
                    .values()
                    .filter(|p| p.map.id == map.id)
                    .map(|p| {
                        format!(
                            "{{\"id\":\"{}\",\"name\":\"{}\",\"team\":\"{}\",\"x\":{:.2},\"y\":{:.2},\"z\":{:.2},\"yaw\":{:.2},\"weapon\":\"{}\",\"hp\":{},\"kills\":{},\"deaths\":{}}}",
                            json_esc(&p.id), json_esc(&p.name), json_esc(&p.team),
                            p.x, p.y, p.z, p.yaw, json_esc(&p.weapon), p.hp, p.kills, p.deaths
                        )
                    })
                    .collect();
                let welcome = format!(
                    "{{\"type\":\"welcome\",\"id\":\"{}\",\"team\":\"{}\",\"map\":\"{}\",\"map_code\":\"{}\",\"maps\":[{}],\"alpha\":{},\"omega\":{},\"players\":[{}]}}",
                    json_esc(pid), json_esc(&team), map.id, map.code, MapDef::json_list(), score_alpha, score_omega, plist.join(",")
                );
                let join_bc = format!(
                    "{{\"type\":\"player_join\",\"player\":{{\"id\":\"{}\",\"name\":\"{}\",\"team\":\"{}\",\"x\":{:.2},\"y\":0,\"z\":{:.2},\"yaw\":{:.2},\"weapon\":\"vandal\",\"hp\":100,\"kills\":0,\"deaths\":0}}}}",
                    json_esc(pid), json_esc(&name), json_esc(&team), sx, sz, yaw
                );
                (welcome, join_bc, old_room)
            };
            // re-join into another map: tell the old room this player left it
            if let Some(old) = old_room {
                let bye = format!("{{\"type\":\"leave\",\"id\":\"{}\",\"name\":\"{}\"}}", json_esc(pid), json_esc(&name));
                broadcast(state, old, &bye, Some(pid));
            }
            send_to(state, pid, &welcome);
            broadcast(state, map, &join_bc, Some(pid));
            println!("[Strike Join] {} ({}) on {}", name, pid, map.code);
        }

        "state" => {
            let x = json_f64(text, "x").unwrap_or(0.0);
            let y = json_f64(text, "y").unwrap_or(0.0);
            let z = json_f64(text, "z").unwrap_or(0.0);
            let yaw = json_f64(text, "yaw").unwrap_or(0.0);
            let pitch = json_f64(text, "pitch").unwrap_or(0.0);
            let weapon = json_str(text, "weapon").unwrap_or_else(|| "vandal".to_string());
            {
                let mut g = state.lock().unwrap();
                if let Some(p) = g.players.get_mut(pid) {
                    p.x = x; p.y = y; p.z = z; p.yaw = yaw; p.pitch = pitch;
                    p.weapon = weapon.clone();
                }
            }
            let bc = format!(
                "{{\"type\":\"state\",\"id\":\"{}\",\"x\":{:.2},\"y\":{:.2},\"z\":{:.2},\"yaw\":{:.2},\"pitch\":{:.2},\"weapon\":\"{}\"}}",
                json_esc(pid), x, y, z, yaw, pitch, json_esc(&weapon)
            );
            broadcast(state, room_of(state, pid), &bc, Some(pid));
        }

        "hit" => {
            let Some(target_id) = json_str(text, "target") else { return };
            let dmg = (json_f64(text, "dmg").unwrap_or(25.0) as i32).clamp(1, 160);
            let hs = text.contains("\"hs\":true") || text.contains("\"hs\": true");
            let weapon = json_str(text, "weapon").unwrap_or_else(|| "vandal".to_string());

            let (dmg_msg, kill_msg, room) = {
                let mut g = state.lock().unwrap();
                let attacker_info = g.players.get(pid).map(|p| (p.name.clone(), p.team.clone(), p.map));
                let Some((att_name, att_team, room)) = attacker_info else { return };

                let mut killed = false;
                let vic_name;
                let new_hp;
                let new_armor;

                if let Some(vic) = g.players.get_mut(&target_id) {
                    if vic.team == att_team || vic.hp <= 0 || vic.map.id != room.id {
                        return; // no friendly fire, no hits across map rooms
                    }
                    vic_name = vic.name.clone();
                    let absorb = (dmg / 2).min(vic.armor);
                    vic.armor -= absorb;
                    vic.hp = (vic.hp - (dmg - absorb)).max(0);
                    new_hp = vic.hp;
                    new_armor = vic.armor;
                    if vic.hp <= 0 {
                        killed = true;
                        vic.deaths += 1;
                        vic.hp = 100;
                        vic.armor = 50;
                    }
                } else {
                    return;
                }

                if killed {
                    if let Some(att) = g.players.get_mut(pid) {
                        att.kills += 1;
                    }
                    let sc = g.scores.entry(room.id).or_insert([0, 0]);
                    if att_team == "alpha" { sc[0] += 1; } else { sc[1] += 1; }
                }
                let [score_alpha, score_omega] = g.scores.get(room.id).copied().unwrap_or([0, 0]);

                let dmg_m = format!(
                    "{{\"type\":\"damaged\",\"id\":\"{}\",\"hp\":{},\"armor\":{},\"by\":\"{}\",\"hs\":{}}}",
                    json_esc(&target_id), new_hp, new_armor, json_esc(&att_name), hs
                );
                let kill_m = if killed {
                    g.ha.pg_exec_async(format!(
                        "INSERT INTO dilly_strike_stats (callsign, kills, deaths, headshots, updated_at) \
                         VALUES ('{}', 1, 0, {}, NOW()) \
                         ON CONFLICT (callsign) DO UPDATE SET kills = dilly_strike_stats.kills + 1, headshots = dilly_strike_stats.headshots + {}, updated_at = NOW();\
                         INSERT INTO dilly_strike_stats (callsign, kills, deaths, headshots, updated_at) \
                         VALUES ('{}', 0, 1, 0, NOW()) \
                         ON CONFLICT (callsign) DO UPDATE SET deaths = dilly_strike_stats.deaths + 1, updated_at = NOW();",
                        pg_escape(&att_name), if hs { 1 } else { 0 }, if hs { 1 } else { 0 }, pg_escape(&vic_name)
                    ));
                    Some(format!(
                        "{{\"type\":\"kill\",\"killer\":\"{}\",\"victim\":\"{}\",\"victimId\":\"{}\",\"weapon\":\"{}\",\"hs\":{},\"alpha\":{},\"omega\":{}}}",
                        json_esc(&att_name), json_esc(&vic_name), json_esc(&target_id),
                        json_esc(&weapon), hs, score_alpha, score_omega
                    ))
                } else {
                    None
                };
                (dmg_m, kill_m, room)
            };

            send_to(state, &target_id, &dmg_msg);
            if let Some(km) = kill_msg {
                broadcast(state, room, &km, None);
            }
        }

        "smoke" => {
            let x = json_f64(text, "x").unwrap_or(0.0);
            let y = json_f64(text, "y").unwrap_or(1.5);
            let z = json_f64(text, "z").unwrap_or(0.0);
            let bc = format!("{{\"type\":\"smoke\",\"x\":{:.2},\"y\":{:.2},\"z\":{:.2}}}", x, y, z);
            broadcast(state, room_of(state, pid), &bc, Some(pid));
        }

        "chat" => {
            let raw = json_str(text, "text").unwrap_or_default();
            let clean: String = raw.trim().chars().take(160).collect();
            if clean.is_empty() { return; }
            let (sender, room) = {
                let g = state.lock().unwrap();
                g.players.get(pid).map(|p| (p.name.clone(), p.map)).unwrap_or_else(|| ("Agent".to_string(), maps::DEFAULT_MAP))
            };
            let bc = format!(
                "{{\"type\":\"chat\",\"name\":\"{}\",\"text\":\"{}\"}}",
                json_esc(&sender), json_esc(&clean)
            );
            broadcast(state, room, &bc, None);
        }
        _ => {}
    }
}

fn send_to(state: &Arc<Mutex<MatchState>>, tid: &str, json: &str) {
    let frame = encode_frame(0x1, json.as_bytes());
    let mut g = state.lock().unwrap();
    if let Some(p) = g.players.get_mut(tid) {
        let _ = p.stream.write_all(&frame);
    }
}

/// Send to every local player in one map room.
fn broadcast_local(state: &Arc<Mutex<MatchState>>, map: &MapDef, json: &str, except: Option<&str>) {
    let frame = encode_frame(0x1, json.as_bytes());
    let mut g = state.lock().unwrap();
    for (id, p) in g.players.iter_mut() {
        if p.map.id != map.id || except.map_or(false, |e| e == id) { continue; }
        let _ = p.stream.write_all(&frame);
    }
}

fn broadcast(state: &Arc<Mutex<MatchState>>, map: &MapDef, json: &str, except: Option<&str>) {
    broadcast_local(state, map, json, except);
    let ha = state.lock().unwrap().ha.clone();
    ha.publish(&room_channel(map), json);
}

/* WebSocket / SHA-1 / Base64 / JSON helpers now live in util.rs (shared with ranked mode). */
