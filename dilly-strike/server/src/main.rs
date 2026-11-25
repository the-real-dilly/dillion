/* ==========================================================================
   DILLY STRIKE — Authoritative Rust WebSocket Tactical FPS Server
   Zero-dependency RFC 6455 WebSocket server supporting:
   - ALPHA (Gold) vs OMEGA (Cyan) team balancing
   - Real-time 3D position, yaw, pitch, weapon & crouch sync
   - Server-authoritative damage, headshots, kills, killfeed & team scores
   - Smoke & flashbang ability broadcast + tactical chat
   Run: cargo run --release --manifest-path dilly-strike/server/Cargo.toml -- [port]
   ========================================================================== */

use std::collections::HashMap;
use std::env;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::{Arc, Mutex};
use std::thread;

struct Player {
    id: String,
    name: String,
    team: String, // "alpha" | "omega"
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
    score_alpha: u32,
    score_omega: u32,
    players: HashMap<String, Player>,
}

fn main() {
    let args: Vec<String> = env::args().collect();
    let port: u16 = args
        .get(1)
        .and_then(|s| s.parse().ok())
        .or_else(|| env::var("PORT").ok().and_then(|s| s.parse().ok()))
        .unwrap_or(25566);

    let state = Arc::new(Mutex::new(MatchState {
        next_id: 1,
        score_alpha: 0,
        score_omega: 0,
        players: HashMap::new(),
    }));

    let addr = format!("0.0.0.0:{}", port);
    let listener = TcpListener::bind(&addr).expect("Failed to bind Dilly Strike Rust server");
    println!("[Dilly Strike Rust Server] Listening on ws://localhost:{}", port);

    for stream in listener.incoming().flatten() {
        let st = Arc::clone(&state);
        thread::spawn(move || handle_client(stream, st));
    }
}

fn handle_client(mut stream: TcpStream, state: Arc<Mutex<MatchState>>) {
    let _ = stream.set_nodelay(true);
    let mut buf = [0u8; 4096];
    let n = match stream.read(&mut buf) {
        Ok(n) if n > 0 => n,
        _ => return,
    };
    let req = String::from_utf8_lossy(&buf[..n]);

    let ws_key = req.lines().find_map(|line| {
        if line.to_ascii_lowercase().starts_with("sec-websocket-key:") {
            Some(line.split_once(':')?.1.trim().to_string())
        } else {
            None
        }
    });

    let Some(key) = ws_key else {
        let (cnt, sa, so) = {
            let g = state.lock().unwrap();
            (g.players.len(), g.score_alpha, g.score_omega)
        };
        let body = format!(
            "{{\"name\":\"Dilly Strike Rust Server\",\"players\":{},\"alpha\":{},\"omega\":{}}}",
            cnt, sa, so
        );
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
        let alpha_n = g.players.values().filter(|p| p.team == "alpha").count();
        let omega_n = g.players.values().filter(|p| p.team == "omega").count();
        let team = if alpha_n <= omega_n { "alpha" } else { "omega" }.to_string();
        let (sx, sz) = if team == "alpha" { (-24.0, 0.0) } else { (24.0, 0.0) };
        g.players.insert(
            id.clone(),
            Player {
                id: id.clone(),
                name: "Agent".to_string(),
                team,
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
            format!(
                "{{\"type\":\"leave\",\"id\":\"{}\",\"name\":\"{}\"}}",
                json_esc(&p.id),
                json_esc(&p.name)
            )
        })
    };
    if let Some(m) = leave_msg {
        broadcast(&state, &m, None);
    }
}

fn handle_msg(pid: &str, text: &str, state: &Arc<Mutex<MatchState>>) {
    let mtype = json_str(text, "type").unwrap_or_default();
    match mtype.as_str() {
        "join" => {
            let raw = json_str(text, "name").unwrap_or_else(|| "Agent".to_string());
            let clean: String = raw.trim().chars().take(16).collect();
            let name = if clean.is_empty() { "Agent".to_string() } else { clean };

            let (welcome, join_bc) = {
                let mut g = state.lock().unwrap();
                let mut team = "alpha".to_string();
                if let Some(p) = g.players.get_mut(pid) {
                    p.name = name.clone();
                    team = p.team.clone();
                }
                let plist: Vec<String> = g
                    .players
                    .values()
                    .map(|p| {
                        format!(
                            "{{\"id\":\"{}\",\"name\":\"{}\",\"team\":\"{}\",\"x\":{:.2},\"y\":{:.2},\"z\":{:.2},\"yaw\":{:.2},\"weapon\":\"{}\",\"hp\":{},\"kills\":{},\"deaths\":{}}}",
                            json_esc(&p.id), json_esc(&p.name), json_esc(&p.team),
                            p.x, p.y, p.z, p.yaw, json_esc(&p.weapon), p.hp, p.kills, p.deaths
                        )
                    })
                    .collect();
                let welcome = format!(
                    "{{\"type\":\"welcome\",\"id\":\"{}\",\"team\":\"{}\",\"alpha\":{},\"omega\":{},\"players\":[{}]}}",
                    json_esc(pid), json_esc(&team), g.score_alpha, g.score_omega, plist.join(",")
                );
                let join_bc = format!(
                    "{{\"type\":\"player_join\",\"player\":{{\"id\":\"{}\",\"name\":\"{}\",\"team\":\"{}\",\"x\":0,\"y\":0,\"z\":0,\"yaw\":0,\"weapon\":\"vandal\",\"hp\":100,\"kills\":0,\"deaths\":0}}}}",
                    json_esc(pid), json_esc(&name), json_esc(&team)
                );
                (welcome, join_bc)
            };
            send_to(state, pid, &welcome);
            broadcast(state, &join_bc, Some(pid));
            println!("[Strike Join] {} ({})", name, pid);
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
            broadcast(state, &bc, Some(pid));
        }

        "hit" => {
            let Some(target_id) = json_str(text, "target") else { return };
            let dmg = (json_f64(text, "dmg").unwrap_or(25.0) as i32).clamp(1, 160);
            let hs = text.contains("\"hs\":true") || text.contains("\"hs\": true");
            let weapon = json_str(text, "weapon").unwrap_or_else(|| "vandal".to_string());

            let (dmg_msg, kill_msg) = {
                let mut g = state.lock().unwrap();
                let attacker_info = g.players.get(pid).map(|p| (p.name.clone(), p.team.clone()));
                let Some((att_name, att_team)) = attacker_info else { return };

                let mut killed = false;
                let vic_name;
                let new_hp;
                let new_armor;

                if let Some(vic) = g.players.get_mut(&target_id) {
                    if vic.team == att_team || vic.hp <= 0 {
                        return; // no friendly fire
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
                    if att_team == "alpha" { g.score_alpha += 1; } else { g.score_omega += 1; }
                }

                let dmg_m = format!(
                    "{{\"type\":\"damaged\",\"id\":\"{}\",\"hp\":{},\"armor\":{},\"by\":\"{}\",\"hs\":{}}}",
                    json_esc(&target_id), new_hp, new_armor, json_esc(&att_name), hs
                );
                let kill_m = if killed {
                    Some(format!(
                        "{{\"type\":\"kill\",\"killer\":\"{}\",\"victim\":\"{}\",\"victimId\":\"{}\",\"weapon\":\"{}\",\"hs\":{},\"alpha\":{},\"omega\":{}}}",
                        json_esc(&att_name), json_esc(&vic_name), json_esc(&target_id),
                        json_esc(&weapon), hs, g.score_alpha, g.score_omega
                    ))
                } else {
                    None
                };
                (dmg_m, kill_m)
            };

            send_to(state, &target_id, &dmg_msg);
            if let Some(km) = kill_msg {
                broadcast(state, &km, None);
            }
        }

        "smoke" => {
            let x = json_f64(text, "x").unwrap_or(0.0);
            let y = json_f64(text, "y").unwrap_or(1.5);
            let z = json_f64(text, "z").unwrap_or(0.0);
            let bc = format!("{{\"type\":\"smoke\",\"x\":{:.2},\"y\":{:.2},\"z\":{:.2}}}", x, y, z);
            broadcast(state, &bc, Some(pid));
        }

        "chat" => {
            let raw = json_str(text, "text").unwrap_or_default();
            let clean: String = raw.trim().chars().take(160).collect();
            if clean.is_empty() { return; }
            let sender = {
                let g = state.lock().unwrap();
                g.players.get(pid).map(|p| p.name.clone()).unwrap_or_else(|| "Agent".to_string())
            };
            let bc = format!(
                "{{\"type\":\"chat\",\"name\":\"{}\",\"text\":\"{}\"}}",
                json_esc(&sender), json_esc(&clean)
            );
            broadcast(state, &bc, None);
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

fn broadcast(state: &Arc<Mutex<MatchState>>, json: &str, except: Option<&str>) {
    let frame = encode_frame(0x1, json.as_bytes());
    let mut g = state.lock().unwrap();
    for (id, p) in g.players.iter_mut() {
        if except.map_or(false, |e| e == id) { continue; }
        let _ = p.stream.write_all(&frame);
    }
}

/* ---------- RFC 6455 WebSocket + SHA-1 + Base64 + JSON Helpers ---------- */

fn encode_frame(op: u8, payload: &[u8]) -> Vec<u8> {
    let len = payload.len();
    let mut out = Vec::with_capacity(len + 10);
    out.push(0x80 | (op & 0x0f));
    if len < 126 {
        out.push(len as u8);
    } else if len < 65536 {
        out.push(126);
        out.extend_from_slice(&(len as u16).to_be_bytes());
    } else {
        out.push(127);
        out.extend_from_slice(&(len as u64).to_be_bytes());
    }
    out.extend_from_slice(payload);
    out
}

fn try_decode_frame(buf: &mut Vec<u8>) -> Option<(u8, Vec<u8>)> {
    if buf.len() < 2 { return None; }
    let op = buf[0] & 0x0f;
    let masked = (buf[1] & 0x80) != 0;
    let mut len = (buf[1] & 0x7f) as usize;
    let mut off = 2;
    if len == 126 {
        if buf.len() < 4 { return None; }
        len = u16::from_be_bytes([buf[2], buf[3]]) as usize;
        off = 4;
    } else if len == 127 {
        if buf.len() < 10 { return None; }
        let mut b8 = [0u8; 8];
        b8.copy_from_slice(&buf[2..10]);
        len = u64::from_be_bytes(b8) as usize;
        off = 10;
    }
    let mlen = if masked { 4 } else { 0 };
    let total = off + mlen + len;
    if buf.len() < total { return None; }
    let mut payload = buf[off + mlen..total].to_vec();
    if masked {
        let mask = [buf[off], buf[off + 1], buf[off + 2], buf[off + 3]];
        for (i, b) in payload.iter_mut().enumerate() { *b ^= mask[i & 3]; }
    }
    buf.drain(..total);
    Some((op, payload))
}

fn compute_ws_accept(key: &str) -> String {
    let mut input = key.as_bytes().to_vec();
    input.extend_from_slice(b"258EAFA5-E914-47DA-95CA-C5AB0DC85B11");
    base64_encode(&sha1(&input))
}

fn sha1(data: &[u8]) -> [u8; 20] {
    let (mut h0, mut h1, mut h2, mut h3, mut h4) =
        (0x67452301u32, 0xEFCDAB89u32, 0x98BADCFEu32, 0x10325476u32, 0xC3D2E1F0u32);
    let bit_len = (data.len() as u64) * 8;
    let mut msg = data.to_vec();
    msg.push(0x80);
    while (msg.len() % 64) != 56 { msg.push(0); }
    msg.extend_from_slice(&bit_len.to_be_bytes());
    for chunk in msg.chunks_exact(64) {
        let mut w = [0u32; 80];
        for i in 0..16 {
            w[i] = u32::from_be_bytes([chunk[i*4], chunk[i*4+1], chunk[i*4+2], chunk[i*4+3]]);
        }
        for i in 16..80 { w[i] = (w[i-3] ^ w[i-8] ^ w[i-14] ^ w[i-16]).rotate_left(1); }
        let (mut a, mut b, mut c, mut d, mut e) = (h0, h1, h2, h3, h4);
        for (i, &wi) in w.iter().enumerate() {
            let (f, k) = match i {
                0..=19 => ((b & c) | ((!b) & d), 0x5A827999u32),
                20..=39 => (b ^ c ^ d, 0x6ED9EBA1u32),
                40..=59 => ((b & c) | (b & d) | (c & d), 0x8F1BBCDCu32),
                _ => (b ^ c ^ d, 0xCA62C1D6u32),
            };
            let t = a.rotate_left(5).wrapping_add(f).wrapping_add(e).wrapping_add(k).wrapping_add(wi);
            e = d; d = c; c = b.rotate_left(30); b = a; a = t;
        }
        h0 = h0.wrapping_add(a); h1 = h1.wrapping_add(b); h2 = h2.wrapping_add(c);
        h3 = h3.wrapping_add(d); h4 = h4.wrapping_add(e);
    }
    let mut out = [0u8; 20];
    for (i, h) in [h0, h1, h2, h3, h4].iter().enumerate() { out[i*4..i*4+4].copy_from_slice(&h.to_be_bytes()); }
    out
}

fn base64_encode(input: &[u8]) -> String {
    const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(input.len().div_ceil(3) * 4);
    for ch in input.chunks(3) {
        let b0 = ch[0] as u32;
        let b1 = if ch.len() > 1 { ch[1] as u32 } else { 0 };
        let b2 = if ch.len() > 2 { ch[2] as u32 } else { 0 };
        let tr = (b0 << 16) | (b1 << 8) | b2;
        out.push(T[((tr >> 18) & 0x3f) as usize] as char);
        out.push(T[((tr >> 12) & 0x3f) as usize] as char);
        out.push(if ch.len() > 1 { T[((tr >> 6) & 0x3f) as usize] as char } else { '=' });
        out.push(if ch.len() > 2 { T[(tr & 0x3f) as usize] as char } else { '=' });
    }
    out
}

fn json_esc(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for ch in s.chars() {
        match ch {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            c if (c as u32) < 0x20 => {}
            c => out.push(c),
        }
    }
    out
}

fn json_str(json: &str, key: &str) -> Option<String> {
    let pat = format!("\"{}\"", key);
    let idx = json.find(&pat)?;
    let rest = &json[idx + pat.len()..];
    let colon = rest.find(':')?;
    let after = rest[colon + 1..].trim_start();
    if !after.starts_with('"') { return None; }
    let mut out = String::new();
    let mut chars = after[1..].chars();
    while let Some(c) = chars.next() {
        if c == '\\' { if let Some(e) = chars.next() { out.push(e); } }
        else if c == '"' { return Some(out); }
        else { out.push(c); }
    }
    None
}

fn json_f64(json: &str, key: &str) -> Option<f64> {
    let pat = format!("\"{}\"", key);
    let idx = json.find(&pat)?;
    let rest = &json[idx + pat.len()..];
    let colon = rest.find(':')?;
    let after = rest[colon + 1..].trim_start();
    let end = after.find(|c: char| !matches!(c, '0'..='9' | '-' | '+' | '.' | 'e' | 'E')).unwrap_or(after.len());
    after[..end].parse::<f64>().ok()
}
