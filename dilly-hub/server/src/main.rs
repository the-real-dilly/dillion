/* ==========================================================================
   DILLY GAMING HUB API — HA Rust Server (Accounts, Leaderboard, RP & Rooms)
   Zero-dependency HTTP/1.1 REST API + PostgreSQL + Redis Pub/Sub + K8s Probes
   Port: 8083 | Ingress: https://apibuild.dillonmay.com/api
   ========================================================================== */

mod ha;
mod session;

use ha::{pg_escape, HaContext};
use std::collections::HashMap;
use std::env;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{SystemTime, UNIX_EPOCH};

const REDIS_CHANNEL: &str = "dilly:hub:rooms";
/// Session tokens last 7 days; services verify them with the shared DILLY_SESSION_SECRET.
const SESSION_TTL_SECS: u64 = 7 * 24 * 3600;

fn session_secret() -> Option<Vec<u8>> {
    env::var("DILLY_SESSION_SECRET").ok().filter(|s| s.len() >= session::MIN_SECRET_LEN).map(|s| s.into_bytes())
}

#[derive(Clone)]
struct Account {
    callsign: String,
    pin_hash: String,
    rp_job: String,
    xp: u64,
    strike_kills: u32,
    strike_hs: u32,
    mad_cash: u64,
    verse_blocks: u64,
}

#[derive(Clone)]
struct Room {
    code: String,
    name: String,
    game: String,      // "dilly-gone-mad" | "dilly-strike" | "dillyverse"
    mode: String,      // "Roleplay (RP)" | "Free Roam" | "Competitive 5v5" | "Survival RP"
    host: String,
    is_private: bool,
    is_rp: bool,
    max_players: u32,
    players: u32,
}

struct HubState {
    accounts: HashMap<String, Account>,
    rooms: HashMap<String, Room>,
    /// Failed PIN attempts per account key (unix secs), for brute-force throttling.
    login_fails: HashMap<String, Vec<u64>>,
    ha: HaContext,
}

fn main() {
    let args: Vec<String> = env::args().collect();
    let port: u16 = args
        .get(1)
        .and_then(|s| s.parse().ok())
        .or_else(|| env::var("PORT").ok().and_then(|s| s.parse().ok()))
        .unwrap_or(8083);

    let ha_ctx = HaContext::from_env("dilly-hub");

    // Initialize PostgreSQL tables if DATABASE_URL is configured
    let _ = ha_ctx.pg_exec(
        "CREATE TABLE IF NOT EXISTS dilly_accounts (\
            callsign TEXT PRIMARY KEY,\
            pin_hash TEXT NOT NULL,\
            rp_job TEXT DEFAULT 'Civilian',\
            xp BIGINT DEFAULT 100,\
            strike_kills INTEGER DEFAULT 0,\
            strike_hs INTEGER DEFAULT 0,\
            mad_cash BIGINT DEFAULT 250,\
            verse_blocks BIGINT DEFAULT 0,\
            updated_at TIMESTAMPTZ DEFAULT NOW()\
         );\
         CREATE TABLE IF NOT EXISTS dilly_rooms (\
            code TEXT PRIMARY KEY,\
            name TEXT NOT NULL,\
            game TEXT NOT NULL,\
            mode TEXT NOT NULL,\
            host TEXT NOT NULL,\
            is_private BOOLEAN DEFAULT FALSE,\
            is_rp BOOLEAN DEFAULT FALSE,\
            max_players INTEGER DEFAULT 16,\
            created_at TIMESTAMPTZ DEFAULT NOW()\
         );",
    );

    let mut rooms = HashMap::new();
    // Featured Official Roleplay & Community Servers
    for r in [
        Room {
            code: "RP-CITY".into(),
            name: "Los Pepinos Serious RP — Main City".into(),
            game: "dilly-gone-mad".into(),
            mode: "Roleplay (RP)".into(),
            host: "Dilly Gaming Official".into(),
            is_private: false,
            is_rp: true,
            max_players: 32,
            players: 14,
        },
        Room {
            code: "RP-DRFT".into(),
            name: "Midnight Street Racing & Car Meets RP".into(),
            game: "dilly-gone-mad".into(),
            mode: "Roleplay (RP)".into(),
            host: "Los Pepinos Auto Club".into(),
            is_private: false,
            is_rp: true,
            max_players: 24,
            players: 9,
        },
        Room {
            code: "STRK-01".into(),
            name: "de_dustline Competitive 5v5 Ranked".into(),
            game: "dilly-strike".into(),
            mode: "Competitive 5v5".into(),
            host: "Dilly Gaming Official".into(),
            is_private: false,
            is_rp: false,
            max_players: 10,
            players: 8,
        },
        Room {
            code: "VRS-KNG".into(),
            name: "Dillyverse Kingdoms — Faction Survival RP".into(),
            game: "dillyverse".into(),
            mode: "Survival RP".into(),
            host: "Dilly Gaming Official".into(),
            is_private: false,
            is_rp: true,
            max_players: 24,
            players: 11,
        },
    ] {
        rooms.insert(r.code.clone(), r);
    }

    // Hydrate user-created rooms from PostgreSQL if available
    if let Ok(rows) = ha_ctx.pg_query(
        "SELECT code, name, game, mode, host, is_private, is_rp, max_players FROM dilly_rooms ORDER BY created_at DESC LIMIT 60;",
    ) {
        for r in rows {
            if r.len() >= 8 {
                let code = r[0].clone();
                rooms.insert(
                    code.clone(),
                    Room {
                        code,
                        name: r[1].clone(),
                        game: r[2].clone(),
                        mode: r[3].clone(),
                        host: r[4].clone(),
                        is_private: r[5] == "t" || r[5] == "true",
                        is_rp: r[6] == "t" || r[6] == "true",
                        max_players: r[7].parse().unwrap_or(16),
                        players: 1,
                    },
                );
            }
        }
    }

    // Seed studio leaderboard accounts + hydrate from PostgreSQL
    let mut accounts = HashMap::new();
    for (name, job, xp, sk, shs, mc, vb) in [
        ("DillyBoss", "Crime Boss", 14800, 142, 68, 48500, 1420),
        ("OfficerBrine", "LPPD Officer", 11200, 98, 41, 29400, 860),
        ("DriftQueen", "Street Racer", 9650, 76, 33, 36200, 540),
        ("VoxelArchitect", "Civilian", 8900, 44, 18, 12800, 2910),
        ("MedicMay", "EMS Medic", 7400, 62, 29, 19500, 720),
    ] {
        accounts.insert(
            name.to_lowercase(),
            Account {
                callsign: name.into(),
                pin_hash: "seed".into(),
                rp_job: job.into(),
                xp,
                strike_kills: sk,
                strike_hs: shs,
                mad_cash: mc,
                verse_blocks: vb,
            },
        );
    }
    if let Ok(rows) = ha_ctx.pg_query(
        "SELECT callsign, pin_hash, rp_job, xp, strike_kills, strike_hs, mad_cash, verse_blocks FROM dilly_accounts LIMIT 200;",
    ) {
        for r in rows {
            if r.len() >= 8 {
                let cs = r[0].clone();
                accounts.insert(
                    cs.to_lowercase(),
                    Account {
                        callsign: cs,
                        pin_hash: r[1].clone(),
                        rp_job: r[2].clone(),
                        xp: r[3].parse().unwrap_or(100),
                        strike_kills: r[4].parse().unwrap_or(0),
                        strike_hs: r[5].parse().unwrap_or(0),
                        mad_cash: r[6].parse().unwrap_or(250),
                        verse_blocks: r[7].parse().unwrap_or(0),
                    },
                );
            }
        }
    }

    let state = Arc::new(Mutex::new(HubState {
        accounts,
        rooms,
        login_fails: HashMap::new(),
        ha: ha_ctx.clone(),
    }));

    // Subscribe to Redis Pub/Sub so rooms created on another K8s pod appear immediately
    {
        let st = Arc::clone(&state);
        ha_ctx.spawn_subscriber(REDIS_CHANNEL.to_string(), move |payload| {
            if let (Some(code), Some(name), Some(game), Some(mode), Some(host)) = (
                json_str(payload, "code"),
                json_str(payload, "name"),
                json_str(payload, "game"),
                json_str(payload, "mode"),
                json_str(payload, "host"),
            ) {
                let is_private = payload.contains("\"is_private\":true");
                let is_rp = payload.contains("\"is_rp\":true");
                let max_players = json_num(payload, "max_players").unwrap_or(16.0) as u32;
                st.lock().unwrap().rooms.insert(
                    code.clone(),
                    Room {
                        code,
                        name,
                        game,
                        mode,
                        host,
                        is_private,
                        is_rp,
                        max_players,
                        players: 1,
                    },
                );
            }
        });
    }

    let addr = format!("0.0.0.0:{}", port);
    let listener = TcpListener::bind(&addr).expect("Failed to bind Dilly Hub HA server");
    println!(
        "[Dilly Hub HA API] Listening on http://0.0.0.0:{} (pod: {})",
        port, ha_ctx.pod_id
    );

    for stream in listener.incoming().flatten() {
        let st = Arc::clone(&state);
        thread::spawn(move || handle_http(stream, st));
    }
}

fn handle_http(mut stream: TcpStream, state: Arc<Mutex<HubState>>) {
    let _ = stream.set_read_timeout(Some(std::time::Duration::from_secs(4)));
    let mut buf = [0u8; 8192];
    let n = match stream.read(&mut buf) {
        Ok(n) if n > 0 => n,
        _ => return,
    };
    let req = String::from_utf8_lossy(&buf[..n]);
    let mut lines = req.lines();
    let first = lines.next().unwrap_or("");
    let mut parts = first.split_whitespace();
    let method = parts.next().unwrap_or("GET");
    let raw_path = parts.next().unwrap_or("/");
    let path = raw_path.split('?').next().unwrap_or("/");
    let body = req.split_once("\r\n\r\n").map(|(_, b)| b).unwrap_or("");

    if method == "OPTIONS" {
        send_json(&mut stream, 204, "");
        return;
    }

    match (method, path) {
        ("GET", "/healthz") | ("GET", "/readyz") | ("GET", "/") => {
            let g = state.lock().unwrap();
            let j = g.ha.health_json("dilly-hub-server", g.rooms.len());
            send_json(&mut stream, 200, &j);
        }

        ("POST", "/api/auth/login") => {
            let callsign = json_str(body, "callsign")
                .map(|s| sanitize(&s, 18))
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| "DillyPlayer".into());
            let pin = json_str(body, "pin").unwrap_or_else(|| "0000".into());
            let rp_job = json_str(body, "rp_job")
                .map(|s| sanitize(&s, 24))
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| "Civilian".into());
            let key = callsign.to_lowercase();
            if pin.is_empty() || pin.chars().count() > 32 || !session::valid_callsign(&callsign) {
                send_json(&mut stream, 400, "{\"error\":\"invalid callsign or PIN\"}");
                return;
            }
            let pin_h = simple_hash(&format!("{}:{}", key, pin));
            let now = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);

            // Accounts created on another replica: hydrate from PostgreSQL before deciding.
            let known = state.lock().unwrap().accounts.contains_key(&key);
            if !known {
                let ha_ctx = state.lock().unwrap().ha.clone();
                if let Ok(rows) = ha_ctx.pg_query(&format!(
                    "SELECT callsign, pin_hash, rp_job, xp, strike_kills, strike_hs, mad_cash, verse_blocks FROM dilly_accounts WHERE lower(callsign) = '{}' LIMIT 1;",
                    pg_escape(&key)
                )) {
                    if let Some(r) = rows.first().filter(|r| r.len() >= 8) {
                        state.lock().unwrap().accounts.entry(key.clone()).or_insert_with(|| Account {
                            callsign: r[0].clone(),
                            pin_hash: r[1].clone(),
                            rp_job: r[2].clone(),
                            xp: r[3].parse().unwrap_or(100),
                            strike_kills: r[4].parse().unwrap_or(0),
                            strike_hs: r[5].parse().unwrap_or(0),
                            mad_cash: r[6].parse().unwrap_or(250),
                            verse_blocks: r[7].parse().unwrap_or(0),
                        });
                    }
                }
            }

            let verdict = {
                let mut g = state.lock().unwrap();
                let fails = g.login_fails.entry(key.clone()).or_default();
                fails.retain(|t| now.saturating_sub(*t) < 600);
                if fails.len() >= 8 {
                    Err((429, "{\"error\":\"too many attempts, wait a few minutes\"}"))
                } else {
                    match g.accounts.get_mut(&key) {
                        // studio showcase accounts can't be signed into
                        Some(a) if a.pin_hash == "seed" => Err((403, "{\"error\":\"callsign reserved\"}")),
                        // created anonymously via /api/stats: first PIN login claims it
                        Some(a) if a.pin_hash == "guest" => {
                            a.pin_hash = pin_h.clone();
                            Ok(())
                        }
                        Some(a) if a.pin_hash != pin_h => Err((401, "{\"error\":\"wrong PIN for this callsign\"}")),
                        _ => Ok(()),
                    }
                }
            };
            if let Err((code, msg)) = verdict {
                if code == 401 {
                    state.lock().unwrap().login_fails.entry(key.clone()).or_default().push(now);
                }
                send_json(&mut stream, code, msg);
                return;
            }

            let (acc, ha_ctx) = {
                let mut g = state.lock().unwrap();
                let entry = g.accounts.entry(key).or_insert_with(|| Account {
                    callsign: callsign.clone(),
                    pin_hash: pin_h.clone(),
                    rp_job: rp_job.clone(),
                    xp: 100,
                    strike_kills: 0,
                    strike_hs: 0,
                    mad_cash: 250,
                    verse_blocks: 0,
                });
                if !rp_job.is_empty() {
                    entry.rp_job = rp_job.clone();
                }
                (entry.clone(), g.ha.clone())
            };

            ha_ctx.pg_exec_async(format!(
                "INSERT INTO dilly_accounts (callsign, pin_hash, rp_job, xp, strike_kills, strike_hs, mad_cash, verse_blocks, updated_at) \
                 VALUES ('{}', '{}', '{}', {}, {}, {}, {}, {}, NOW()) \
                 ON CONFLICT (callsign) DO UPDATE SET rp_job = EXCLUDED.rp_job, pin_hash = EXCLUDED.pin_hash, updated_at = NOW();",
                pg_escape(&acc.callsign), pg_escape(&acc.pin_hash), pg_escape(&acc.rp_job),
                acc.xp, acc.strike_kills, acc.strike_hs, acc.mad_cash, acc.verse_blocks
            ));

            // Signed session token for other Dilly services (e.g. Dilly Strike ranked).
            let mut body_json = account_json(&acc);
            if let Some(secret) = session_secret() {
                let exp = now + SESSION_TTL_SECS;
                let tok = session::issue_token(&secret, &acc.callsign, exp);
                body_json.pop();
                body_json.push_str(&format!(",\"token\":\"{}\",\"token_exp\":{}}}", tok, exp));
            }
            send_json(&mut stream, 200, &body_json);
        }

        ("GET", "/api/leaderboard") => {
            let g = state.lock().unwrap();
            let mut list: Vec<&Account> = g.accounts.values().collect();
            list.sort_by(|a, b| b.xp.cmp(&a.xp));
            let rows: Vec<String> = list.into_iter().take(20).map(account_json).collect();
            send_json(&mut stream, 200, &format!("{{\"players\":[{}]}}", rows.join(",")));
        }

        ("POST", "/api/stats") => {
            let callsign = json_str(body, "callsign").map(|s| sanitize(&s, 18)).unwrap_or_default();
            if callsign.is_empty() {
                send_json(&mut stream, 400, "{\"error\":\"missing callsign\"}");
                return;
            }
            let add_kills = json_num(body, "strike_kills").unwrap_or(0.0).max(0.0) as u32;
            let add_hs = json_num(body, "strike_hs").unwrap_or(0.0).max(0.0) as u32;
            let add_cash = json_num(body, "mad_cash").unwrap_or(0.0).max(0.0) as u64;
            let add_blocks = json_num(body, "verse_blocks").unwrap_or(0.0).max(0.0) as u64;
            let key = callsign.to_lowercase();

            let (acc, ha_ctx) = {
                let mut g = state.lock().unwrap();
                let entry = g.accounts.entry(key).or_insert_with(|| Account {
                    callsign: callsign.clone(),
                    pin_hash: "guest".into(),
                    rp_job: "Civilian".into(),
                    xp: 100,
                    strike_kills: 0,
                    strike_hs: 0,
                    mad_cash: 250,
                    verse_blocks: 0,
                });
                entry.strike_kills += add_kills;
                entry.strike_hs += add_hs;
                entry.mad_cash += add_cash;
                entry.verse_blocks += add_blocks;
                entry.xp += (add_kills as u64) * 50 + add_cash / 10 + add_blocks * 5;
                (entry.clone(), g.ha.clone())
            };

            ha_ctx.pg_exec_async(format!(
                "INSERT INTO dilly_accounts (callsign, pin_hash, rp_job, xp, strike_kills, strike_hs, mad_cash, verse_blocks, updated_at) \
                 VALUES ('{}', '{}', '{}', {}, {}, {}, {}, {}, NOW()) \
                 ON CONFLICT (callsign) DO UPDATE SET xp={}, strike_kills={}, strike_hs={}, mad_cash={}, verse_blocks={}, updated_at=NOW();",
                pg_escape(&acc.callsign), pg_escape(&acc.pin_hash), pg_escape(&acc.rp_job),
                acc.xp, acc.strike_kills, acc.strike_hs, acc.mad_cash, acc.verse_blocks,
                acc.xp, acc.strike_kills, acc.strike_hs, acc.mad_cash, acc.verse_blocks
            ));
            send_json(&mut stream, 200, &account_json(&acc));
        }

        ("GET", "/api/rooms") => {
            let g = state.lock().unwrap();
            let list: Vec<String> = g
                .rooms
                .values()
                .filter(|r| !r.is_private)
                .map(room_json)
                .collect();
            send_json(&mut stream, 200, &format!("{{\"rooms\":[{}]}}", list.join(",")));
        }

        ("POST", "/api/rooms/create") => {
            let name = json_str(body, "name")
                .map(|s| sanitize(&s, 40))
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| "Private Dilly Lobby".into());
            let game = json_str(body, "game").unwrap_or_else(|| "dilly-gone-mad".into());
            let mode = json_str(body, "mode").unwrap_or_else(|| "Roleplay (RP)".into());
            let host = json_str(body, "host")
                .map(|s| sanitize(&s, 18))
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| "Host".into());
            let is_private = body.contains("\"is_private\":true");
            let is_rp = body.contains("\"is_rp\":true") || mode.to_ascii_lowercase().contains("rp") || mode.to_ascii_lowercase().contains("roleplay");
            let max_players = (json_num(body, "max_players").unwrap_or(16.0) as u32).clamp(2, 64);
            let code = gen_room_code();

            let room = Room {
                code: code.clone(),
                name,
                game,
                mode,
                host,
                is_private,
                is_rp,
                max_players,
                players: 1,
            };
            let j = room_json(&room);
            let ha_ctx = {
                let mut g = state.lock().unwrap();
                g.rooms.insert(code.clone(), room.clone());
                g.ha.clone()
            };
            ha_ctx.publish(REDIS_CHANNEL, &j);
            ha_ctx.pg_exec_async(format!(
                "INSERT INTO dilly_rooms (code, name, game, mode, host, is_private, is_rp, max_players) \
                 VALUES ('{}', '{}', '{}', '{}', '{}', {}, {}, {}) ON CONFLICT (code) DO NOTHING;",
                pg_escape(&room.code), pg_escape(&room.name), pg_escape(&room.game),
                pg_escape(&room.mode), pg_escape(&room.host), room.is_private, room.is_rp, room.max_players
            ));
            send_json(&mut stream, 200, &j);
        }

        ("GET", p) if p.starts_with("/api/rooms/code/") => {
            let code = p.trim_start_matches("/api/rooms/code/").trim().to_ascii_uppercase();
            let g = state.lock().unwrap();
            if let Some(r) = g.rooms.get(&code) {
                send_json(&mut stream, 200, &room_json(r));
            } else {
                send_json(&mut stream, 404, "{\"error\":\"Room code not found\"}");
            }
        }

        _ => {
            send_json(&mut stream, 404, "{\"error\":\"Not found\"}");
        }
    }
}

fn send_json(stream: &mut TcpStream, status: u16, body: &str) {
    let reason = match status {
        200 => "OK",
        204 => "No Content",
        400 => "Bad Request",
        401 => "Unauthorized",
        403 => "Forbidden",
        404 => "Not Found",
        429 => "Too Many Requests",
        _ => "OK",
    };
    let resp = format!(
        "HTTP/1.1 {} {}\r\n\
         Content-Type: application/json\r\n\
         Access-Control-Allow-Origin: *\r\n\
         Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n\
         Access-Control-Allow-Headers: Content-Type\r\n\
         Content-Length: {}\r\n\
         Connection: close\r\n\r\n{}",
        status, reason, body.len(), body
    );
    let _ = stream.write_all(resp.as_bytes());
}

fn account_json(a: &Account) -> String {
    format!(
        "{{\"callsign\":\"{}\",\"rp_job\":\"{}\",\"xp\":{},\"strike_kills\":{},\"strike_hs\":{},\"mad_cash\":{},\"verse_blocks\":{}}}",
        esc(&a.callsign), esc(&a.rp_job), a.xp, a.strike_kills, a.strike_hs, a.mad_cash, a.verse_blocks
    )
}

fn room_json(r: &Room) -> String {
    format!(
        "{{\"code\":\"{}\",\"name\":\"{}\",\"game\":\"{}\",\"mode\":\"{}\",\"host\":\"{}\",\"is_private\":{},\"is_rp\":{},\"max_players\":{},\"players\":{}}}",
        esc(&r.code), esc(&r.name), esc(&r.game), esc(&r.mode), esc(&r.host),
        r.is_private, r.is_rp, r.max_players, r.players
    )
}

fn gen_room_code() -> String {
    const CHARS: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let mut seed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos() as u64)
        .unwrap_or(1234567);
    let mut out = String::from("DL-");
    for _ in 0..4 {
        seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        let idx = ((seed >> 32) as usize) % CHARS.len();
        out.push(CHARS[idx] as char);
    }
    out
}

fn simple_hash(s: &str) -> String {
    let mut h: u64 = 0xcbf29ce484222325;
    for b in s.bytes() {
        h ^= b as u64;
        h = h.wrapping_mul(0x100000001b3);
    }
    format!("{:016x}", h)
}

fn json_str(raw: &str, key: &str) -> Option<String> {
    let pat = format!("\"{}\"", key);
    let idx = raw.find(&pat)?;
    let rest = &raw[idx + pat.len()..];
    let colon = rest.find(':')?;
    let val = rest[colon + 1..].trim_start();
    if !val.starts_with('"') { return None; }
    let mut out = String::new();
    let mut esc_c = false;
    for ch in val[1..].chars() {
        if esc_c { out.push(ch); esc_c = false; }
        else if ch == '\\' { esc_c = true; }
        else if ch == '"' { return Some(out); }
        else { out.push(ch); }
    }
    None
}

fn json_num(raw: &str, key: &str) -> Option<f64> {
    let pat = format!("\"{}\"", key);
    let idx = raw.find(&pat)?;
    let rest = &raw[idx + pat.len()..];
    let colon = rest.find(':')?;
    let val = rest[colon + 1..].trim_start();
    let end = val.find(|c: char| !matches!(c, '0'..='9' | '-' | '.' | 'e' | 'E' | '+')).unwrap_or(val.len());
    val[..end].parse().ok()
}

fn sanitize(s: &str, max_len: usize) -> String {
    s.chars().filter(|c| !c.is_control() && *c != '<' && *c != '>').take(max_len).collect()
}

fn esc(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}
