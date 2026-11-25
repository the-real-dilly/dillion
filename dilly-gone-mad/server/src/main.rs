/* ==========================================================================
   DILLY GONE MAD — HA Rust WebSocket Multiplayer Server
   Zero-dependency RFC 6455 WebSocket + Redis Pub/Sub + PostgreSQL + K8s Probes
   Run: cargo run --release --manifest-path dilly-gone-mad/server/Cargo.toml
   ========================================================================== */

mod ha;

use ha::{pg_escape, HaContext};
use std::collections::HashMap;
use std::env;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::{Arc, Mutex};
use std::thread;

const REDIS_CHANNEL: &str = "dilly:mad:events";

struct Player {
    id: String,
    name: String,
    mode: String, // "car" | "foot" | "heli" | "plane" | "boat"
    stream: TcpStream,
    x: f64,
    y: f64,
    z: f64,
    h: f64,
}

struct WorldState {
    next_id: u64,
    players: HashMap<String, Player>,
}

fn main() {
    let args: Vec<String> = env::args().collect();
    let port: u16 = args
        .get(1)
        .and_then(|s| s.parse().ok())
        .or_else(|| env::var("PORT").ok().and_then(|s| s.parse().ok()))
        .unwrap_or(8082);

    let ha_ctx = HaContext::from_env("dilly-gone-mad");

    // Ensure PostgreSQL tables exist if DATABASE_URL is configured
    let _ = ha_ctx.pg_exec(
        "CREATE TABLE IF NOT EXISTS dilly_mad_players (\
            callsign TEXT PRIMARY KEY,\
            last_x DOUBLE PRECISION DEFAULT 0,\
            last_y DOUBLE PRECISION DEFAULT 0,\
            last_z DOUBLE PRECISION DEFAULT 0,\
            mode TEXT DEFAULT 'car',\
            updated_at TIMESTAMPTZ DEFAULT NOW()\
         );\
         CREATE TABLE IF NOT EXISTS dilly_mad_chat (\
            id BIGSERIAL PRIMARY KEY,\
            callsign TEXT NOT NULL,\
            message TEXT NOT NULL,\
            pod_id TEXT NOT NULL,\
            created_at TIMESTAMPTZ DEFAULT NOW()\
         );",
    );

    let state = Arc::new(Mutex::new(WorldState {
        next_id: 1,
        players: HashMap::new(),
    }));

    // Subscribe to Redis Pub/Sub for cross-pod HA fanout
    {
        let st = Arc::clone(&state);
        ha_ctx.spawn_subscriber(REDIS_CHANNEL.to_string(), move |payload| {
            let mut g = st.lock().unwrap();
            broadcast_local(&mut g, None, payload);
        });
    }

    let addr = format!("0.0.0.0:{}", port);
    let listener = TcpListener::bind(&addr).expect("Failed to bind Dilly Gone Mad HA server");
    println!(
        "[Dilly Gone Mad HA Server] Listening on ws://0.0.0.0:{} (pod: {})",
        port, ha_ctx.pod_id
    );

    for stream in listener.incoming().flatten() {
        let st = Arc::clone(&state);
        let ctx = ha_ctx.clone();
        thread::spawn(move || handle_client(stream, st, ctx));
    }
}

fn handle_client(mut stream: TcpStream, state: Arc<Mutex<WorldState>>, ha_ctx: HaContext) {
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

    // Kubernetes /healthz, /readyz, and status check
    let Some(key) = ws_key else {
        let cnt = state.lock().unwrap().players.len();
        let body = ha_ctx.health_json("dilly-gone-mad-server", cnt);
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
        let id = format!("dm-{}-{:04x}", &ha_ctx.pod_id.chars().take(6).collect::<String>(), g.next_id);
        g.next_id += 1;
        g.players.insert(
            id.clone(),
            Player {
                id: id.clone(),
                name: "Driver".to_string(),
                mode: "car".to_string(),
                stream: write_stream,
                x: 0.0,
                y: 0.0,
                z: 0.0,
                h: 0.0,
            },
        );
        id
    };

    while let Some(msg) = read_ws_frame(&mut stream) {
        process_message(&pid, &msg, &state, &ha_ctx);
    }

    // Disconnect cleanup
    let leave_msg = format!("{{\"type\":\"leave\",\"id\":\"{}\"}}", pid);
    {
        let mut g = state.lock().unwrap();
        g.players.remove(&pid);
        broadcast_local(&mut g, None, &leave_msg);
    }
    ha_ctx.publish(REDIS_CHANNEL, &leave_msg);
}

fn process_message(pid: &str, raw: &str, state: &Arc<Mutex<WorldState>>, ha_ctx: &HaContext) {
    let mtype = json_str(raw, "type").unwrap_or_default();
    match mtype.as_str() {
        "join" => {
            let name = json_str(raw, "name")
                .map(|s| sanitize(&s, 18))
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| "Driver".to_string());
            let mode = json_str(raw, "mode").unwrap_or_else(|| "car".to_string());
            let x = json_num(raw, "x").unwrap_or(0.0);
            let y = json_num(raw, "y").unwrap_or(0.0);
            let z = json_num(raw, "z").unwrap_or(0.0);
            let h = json_num(raw, "h").unwrap_or(0.0);

            let (welcome, join_ev) = {
                let mut g = state.lock().unwrap();
                if let Some(p) = g.players.get_mut(pid) {
                    p.name = name.clone();
                    p.mode = mode.clone();
                    p.x = x;
                    p.y = y;
                    p.z = z;
                    p.h = h;
                }
                let list: Vec<String> = g
                    .players
                    .values()
                    .filter(|p| p.id != pid)
                    .map(|p| {
                        format!(
                            "{{\"id\":\"{}\",\"name\":\"{}\",\"mode\":\"{}\",\"x\":{:.2},\"y\":{:.2},\"z\":{:.2},\"h\":{:.3}}}",
                            p.id, escape_json(&p.name), escape_json(&p.mode), p.x, p.y, p.z, p.h
                        )
                    })
                    .collect();
                let welcome = format!(
                    "{{\"type\":\"welcome\",\"id\":\"{}\",\"pod\":\"{}\",\"players\":[{}]}}",
                    pid,
                    escape_json(&ha_ctx.pod_id),
                    list.join(",")
                );
                let join_ev = format!(
                    "{{\"type\":\"player_join\",\"player\":{{\"id\":\"{}\",\"name\":\"{}\",\"mode\":\"{}\",\"x\":{:.2},\"y\":{:.2},\"z\":{:.2},\"h\":{:.3}}}}}",
                    pid, escape_json(&name), escape_json(&mode), x, y, z, h
                );
                if let Some(p) = g.players.get_mut(pid) {
                    let _ = send_ws_text(&mut p.stream, &welcome);
                }
                broadcast_local(&mut g, Some(pid), &join_ev);
                (welcome, join_ev)
            };
            let _ = welcome;
            ha_ctx.publish(REDIS_CHANNEL, &join_ev);
            ha_ctx.pg_exec_async(format!(
                "INSERT INTO dilly_mad_players (callsign, last_x, last_y, last_z, mode, updated_at) \
                 VALUES ('{}', {:.2}, {:.2}, {:.2}, '{}', NOW()) \
                 ON CONFLICT (callsign) DO UPDATE SET last_x=EXCLUDED.last_x, last_y=EXCLUDED.last_y, last_z=EXCLUDED.last_z, mode=EXCLUDED.mode, updated_at=NOW();",
                pg_escape(&name), x, y, z, pg_escape(&mode)
            ));
        }
        "state" => {
            let x = json_num(raw, "x").unwrap_or(0.0);
            let y = json_num(raw, "y").unwrap_or(0.0);
            let z = json_num(raw, "z").unwrap_or(0.0);
            let h = json_num(raw, "h").unwrap_or(0.0);
            let mode = json_str(raw, "mode").unwrap_or_else(|| "car".to_string());
            let name = {
                let mut g = state.lock().unwrap();
                let mut nm = "Driver".to_string();
                if let Some(p) = g.players.get_mut(pid) {
                    p.x = x; p.y = y; p.z = z; p.h = h; p.mode = mode.clone();
                    nm = p.name.clone();
                }
                let ev = format!(
                    "{{\"type\":\"state\",\"id\":\"{}\",\"name\":\"{}\",\"mode\":\"{}\",\"x\":{:.2},\"y\":{:.2},\"z\":{:.2},\"h\":{:.3}}}",
                    pid, escape_json(&nm), escape_json(&mode), x, y, z, h
                );
                broadcast_local(&mut g, Some(pid), &ev);
                ev
            };
            ha_ctx.publish(REDIS_CHANNEL, &name);
        }
        "chat" => {
            let text = json_str(raw, "text").map(|s| sanitize(&s, 140)).unwrap_or_default();
            if text.is_empty() { return; }
            let (sender, ev) = {
                let mut g = state.lock().unwrap();
                let sender = g.players.get(pid).map(|p| p.name.clone()).unwrap_or_else(|| "Driver".to_string());
                let ev = format!(
                    "{{\"type\":\"chat\",\"name\":\"{}\",\"text\":\"{}\"}}",
                    escape_json(&sender), escape_json(&text)
                );
                broadcast_local(&mut g, None, &ev);
                (sender, ev)
            };
            ha_ctx.publish(REDIS_CHANNEL, &ev);
            ha_ctx.pg_exec_async(format!(
                "INSERT INTO dilly_mad_chat (callsign, message, pod_id) VALUES ('{}', '{}', '{}');",
                pg_escape(&sender), pg_escape(&text), pg_escape(&ha_ctx.pod_id)
            ));
        }
        _ => {}
    }
}

fn broadcast_local(g: &mut WorldState, exclude: Option<&str>, msg: &str) {
    let mut dead = Vec::new();
    for (id, p) in g.players.iter_mut() {
        if exclude == Some(id.as_str()) { continue; }
        if send_ws_text(&mut p.stream, msg).is_err() {
            dead.push(id.clone());
        }
    }
    for id in dead {
        g.players.remove(&id);
    }
}

// ---------- RFC 6455 WebSocket Framing & Helpers ----------
fn read_ws_frame(stream: &mut TcpStream) -> Option<String> {
    let mut hdr = [0u8; 2];
    stream.read_exact(&mut hdr).ok()?;
    let opcode = hdr[0] & 0x0f;
    if opcode == 8 { return None; }
    let masked = (hdr[1] & 0x80) != 0;
    let mut len = (hdr[1] & 0x7f) as usize;
    if len == 126 {
        let mut ext = [0u8; 2];
        stream.read_exact(&mut ext).ok()?;
        len = u16::from_be_bytes(ext) as usize;
    } else if len == 127 {
        let mut ext = [0u8; 8];
        stream.read_exact(&mut ext).ok()?;
        len = u64::from_be_bytes(ext) as usize;
    }
    if len > 65536 { return None; }
    let mut mask = [0u8; 4];
    if masked { stream.read_exact(&mut mask).ok()?; }
    let mut payload = vec![0u8; len];
    stream.read_exact(&mut payload).ok()?;
    if masked {
        for i in 0..len { payload[i] ^= mask[i % 4]; }
    }
    if opcode == 9 {
        let _ = stream.write_all(&[0x8a, 0x00]);
        return Some(String::new());
    }
    Some(String::from_utf8_lossy(&payload).to_string())
}

fn send_ws_text(stream: &mut TcpStream, msg: &str) -> std::io::Result<()> {
    let b = msg.as_bytes();
    let mut frame = Vec::with_capacity(b.len() + 10);
    frame.push(0x81);
    if b.len() < 126 {
        frame.push(b.len() as u8);
    } else if b.len() < 65536 {
        frame.push(126);
        frame.extend_from_slice(&(b.len() as u16).to_be_bytes());
    } else {
        frame.push(127);
        frame.extend_from_slice(&(b.len() as u64).to_be_bytes());
    }
    frame.extend_from_slice(b);
    stream.write_all(&frame)
}

fn json_str(raw: &str, key: &str) -> Option<String> {
    let pat = format!("\"{}\"", key);
    let idx = raw.find(&pat)?;
    let rest = &raw[idx + pat.len()..];
    let colon = rest.find(':')?;
    let val = rest[colon + 1..].trim_start();
    if !val.starts_with('"') { return None; }
    let mut out = String::new();
    let mut esc = false;
    for ch in val[1..].chars() {
        if esc { out.push(ch); esc = false; }
        else if ch == '\\' { esc = true; }
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

fn escape_json(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}

fn compute_ws_accept(key: &str) -> String {
    let concat = format!("{}258EAFA5-E914-47DA-95CA-C5AB0DC85B11", key);
    base64_encode(&sha1(concat.as_bytes()))
}

fn sha1(data: &[u8]) -> [u8; 20] {
    let mut h: [u32; 5] = [0x67452301, 0xEFCDAB89, 0x98BADCFE, 0x10325476, 0xC3D2E1F0];
    let bit_len = (data.len() as u64) * 8;
    let mut msg = data.to_vec();
    msg.push(0x80);
    while msg.len() % 64 != 56 { msg.push(0); }
    msg.extend_from_slice(&bit_len.to_be_bytes());
    for chunk in msg.chunks_exact(64) {
        let mut w = [0u32; 80];
        for i in 0..16 { w[i] = u32::from_be_bytes([chunk[i * 4], chunk[i * 4 + 1], chunk[i * 4 + 2], chunk[i * 4 + 3]]); }
        for i in 16..80 { w[i] = (w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16]).rotate_left(1); }
        let (mut a, mut b, mut c, mut d, mut e) = (h[0], h[1], h[2], h[3], h[4]);
        for i in 0..80 {
            let (f, k) = match i {
                0..=19 => ((b & c) | ((!b) & d), 0x5A827999u32),
                20..=39 => (b ^ c ^ d, 0x6ED9EBA1u32),
                40..=59 => ((b & c) | (b & d) | (c & d), 0x8F1BBCDCu32),
                _ => (b ^ c ^ d, 0xCA62C1D6u32),
            };
            let temp = a.rotate_left(5).wrapping_add(f).wrapping_add(e).wrapping_add(k).wrapping_add(w[i]);
            e = d; d = c; c = b.rotate_left(30); b = a; a = temp;
        }
        h[0] = h[0].wrapping_add(a); h[1] = h[1].wrapping_add(b); h[2] = h[2].wrapping_add(c);
        h[3] = h[3].wrapping_add(d); h[4] = h[4].wrapping_add(e);
    }
    let mut out = [0u8; 20];
    for (i, v) in h.iter().enumerate() { out[i * 4..i * 4 + 4].copy_from_slice(&v.to_be_bytes()); }
    out
}

fn base64_encode(input: &[u8]) -> String {
    const T: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::new();
    let mut i = 0;
    while i < input.len() {
        let b0 = input[i] as u32;
        let b1 = if i + 1 < input.len() { input[i + 1] as u32 } else { 0 };
        let b2 = if i + 2 < input.len() { input[i + 2] as u32 } else { 0 };
        let n = (b0 << 16) | (b1 << 8) | b2;
        out.push(T[((n >> 18) & 63) as usize] as char);
        out.push(T[((n >> 12) & 63) as usize] as char);
        out.push(if i + 1 < input.len() { T[((n >> 6) & 63) as usize] as char } else { '=' });
        out.push(if i + 2 < input.len() { T[(n & 63) as usize] as char } else { '=' });
        i += 3;
    }
    out
}
