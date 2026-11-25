/* ==========================================================================
   DILLYVERSE — Authoritative Rust WebSocket Multiplayer Server
   Zero-dependency RFC 6455 WebSocket server with world seed sync,
   server-authoritative block persistence, chat, and anti-cheat validation.
   Run: cargo run --release -- [port] [seed]
   ========================================================================== */

use std::collections::HashMap;
use std::env;
use std::fs;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

struct Client {
    id: String,
    name: String,
    stream: TcpStream,
    x: f64,
    y: f64,
    z: f64,
    yaw: f64,
    last_edit: Instant,
}

struct ServerState {
    seed: String,
    next_id: u64,
    clients: HashMap<String, Client>,
    blocks: HashMap<String, u32>, // "x,y,z" -> blockId
    dirty: bool,
}

const SAVE_FILE: &str = "dillyverse-server-world.json";

fn main() {
    let args: Vec<String> = env::args().collect();
    let port: u16 = args
        .get(1)
        .and_then(|s| s.parse().ok())
        .or_else(|| env::var("PORT").ok().and_then(|s| s.parse().ok()))
        .unwrap_or(25565);
    let seed = args
        .get(2)
        .cloned()
        .or_else(|| env::var("DILLYVERSE_SEED").ok())
        .unwrap_or_else(|| "DILLYVERSE-MP-01".to_string());

    let mut initial_blocks = HashMap::new();
    if let Ok(raw) = fs::read_to_string(SAVE_FILE) {
        load_persisted_blocks(&raw, &mut initial_blocks);
        println!(
            "[DillyVerse Rust Server] Loaded {} persisted block edits.",
            initial_blocks.len()
        );
    }

    let state = Arc::new(Mutex::new(ServerState {
        seed: seed.clone(),
        next_id: 1,
        clients: HashMap::new(),
        blocks: initial_blocks,
        dirty: false,
    }));

    // Periodic world persistence thread (every 20s)
    {
        let st = Arc::clone(&state);
        thread::spawn(move || loop {
            thread::sleep(Duration::from_secs(20));
            let snapshot = {
                let mut guard = st.lock().unwrap();
                if !guard.dirty {
                    continue;
                }
                guard.dirty = false;
                (guard.seed.clone(), guard.blocks.clone())
            };
            persist_blocks(&snapshot.0, &snapshot.1);
        });
    }

    let addr = format!("0.0.0.0:{}", port);
    let listener = TcpListener::bind(&addr).expect("Failed to bind DillyVerse Rust server");
    println!(
        "[DillyVerse Rust Server] Listening on ws://localhost:{} (seed: {})",
        port, seed
    );

    for stream in listener.incoming().flatten() {
        let st = Arc::clone(&state);
        thread::spawn(move || handle_connection(stream, st));
    }
}

fn handle_connection(mut stream: TcpStream, state: Arc<Mutex<ServerState>>) {
    let _ = stream.set_nodelay(true);
    let mut header_buf = [0u8; 4096];
    let n = match stream.read(&mut header_buf) {
        Ok(n) if n > 0 => n,
        _ => return,
    };
    let req = String::from_utf8_lossy(&header_buf[..n]);

    // Extract Sec-WebSocket-Key
    let ws_key = req.lines().find_map(|line| {
        let lower = line.to_ascii_lowercase();
        if lower.starts_with("sec-websocket-key:") {
            Some(line.split_once(':')?.1.trim().to_string())
        } else {
            None
        }
    });

    // Plain HTTP health/status check
    let Some(key) = ws_key else {
        let (seed, players, blocks) = {
            let g = state.lock().unwrap();
            (g.seed.clone(), g.clients.len(), g.blocks.len())
        };
        let body = format!(
            "{{\"name\":\"DillyVerse Rust Server\",\"seed\":\"{}\",\"players\":{},\"blocks\":{}}}",
            json_escape(&seed),
            players,
            blocks
        );
        let resp = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            body.len(),
            body
        );
        let _ = stream.write_all(resp.as_bytes());
        return;
    };

    // RFC 6455 Upgrade Handshake
    let accept = compute_ws_accept(&key);
    let handshake = format!(
        "HTTP/1.1 101 Switching Protocols\r\n\
         Upgrade: websocket\r\n\
         Connection: Upgrade\r\n\
         Sec-WebSocket-Accept: {}\r\n\r\n",
        accept
    );
    if stream.write_all(handshake.as_bytes()).is_err() {
        return;
    }

    let write_stream = match stream.try_clone() {
        Ok(s) => s,
        Err(_) => return,
    };

    let client_id = {
        let mut g = state.lock().unwrap();
        let id = format!("p{:04x}", g.next_id);
        g.next_id += 1;
        g.clients.insert(
            id.clone(),
            Client {
                id: id.clone(),
                name: "Explorer".to_string(),
                stream: write_stream,
                x: 0.0,
                y: 45.0,
                z: 0.0,
                yaw: 0.0,
                last_edit: Instant::now() - Duration::from_secs(1),
            },
        );
        id
    };

    // Read WebSocket frames until disconnect
    let mut acc: Vec<u8> = Vec::with_capacity(4096);
    let mut tmp = [0u8; 4096];
    loop {
        match stream.read(&mut tmp) {
            Ok(0) | Err(_) => break,
            Ok(read_n) => {
                acc.extend_from_slice(&tmp[..read_n]);
                while let Some((op, payload)) = try_decode_frame(&mut acc) {
                    match op {
                        0x1 => {
                            if let Ok(text) = String::from_utf8(payload) {
                                handle_message(&client_id, &text, &state);
                            }
                        }
                        0x8 => {
                            acc.clear();
                            break;
                        }
                        0x9 => {
                            // Ping -> Pong
                            let pong = encode_frame(0xA, &payload);
                            let _ = stream.write_all(&pong);
                        }
                        _ => {}
                    }
                }
            }
        }
    }

    // Cleanup on disconnect
    let leave_msg = {
        let mut g = state.lock().unwrap();
        g.clients.remove(&client_id).map(|c| {
            format!(
                "{{\"type\":\"player_leave\",\"id\":\"{}\",\"name\":\"{}\"}}",
                json_escape(&c.id),
                json_escape(&c.name)
            )
        })
    };
    if let Some(msg) = leave_msg {
        broadcast(&state, &msg, None);
    }
}

fn handle_message(client_id: &str, text: &str, state: &Arc<Mutex<ServerState>>) {
    let msg_type = json_get_str(text, "type").unwrap_or_default();

    match msg_type.as_str() {
        "join" => {
            let raw_name = json_get_str(text, "name").unwrap_or_else(|| "Explorer".to_string());
            let clean_name: String = raw_name.trim().chars().take(18).collect();
            let name = if clean_name.is_empty() {
                "Explorer".to_string()
            } else {
                clean_name
            };

            let (welcome, join_bc) = {
                let mut g = state.lock().unwrap();
                if let Some(c) = g.clients.get_mut(client_id) {
                    c.name = name.clone();
                }
                let players_json: Vec<String> = g
                    .clients
                    .values()
                    .map(|c| {
                        format!(
                            "{{\"id\":\"{}\",\"name\":\"{}\",\"x\":{:.2},\"y\":{:.2},\"z\":{:.2},\"yaw\":{:.2}}}",
                            json_escape(&c.id),
                            json_escape(&c.name),
                            c.x,
                            c.y,
                            c.z,
                            c.yaw
                        )
                    })
                    .collect();
                let blocks_json: Vec<String> = g
                    .blocks
                    .iter()
                    .map(|(k, v)| format!("[\"{}\",{}]", json_escape(k), v))
                    .collect();
                let welcome = format!(
                    "{{\"type\":\"welcome\",\"id\":\"{}\",\"seed\":\"{}\",\"blocks\":[{}],\"players\":[{}]}}",
                    json_escape(client_id),
                    json_escape(&g.seed),
                    blocks_json.join(","),
                    players_json.join(",")
                );
                let join_bc = format!(
                    "{{\"type\":\"player_join\",\"player\":{{\"id\":\"{}\",\"name\":\"{}\",\"x\":0,\"y\":45,\"z\":0,\"yaw\":0}}}}",
                    json_escape(client_id),
                    json_escape(&name)
                );
                (welcome, join_bc)
            };

            send_to(state, client_id, &welcome);
            broadcast(state, &join_bc, Some(client_id));
            println!("[Join] {} ({})", name, client_id);
        }

        "move" => {
            let x = json_get_f64(text, "x").unwrap_or(0.0);
            let y = json_get_f64(text, "y").unwrap_or(45.0);
            let z = json_get_f64(text, "z").unwrap_or(0.0);
            let yaw = json_get_f64(text, "yaw").unwrap_or(0.0);
            {
                let mut g = state.lock().unwrap();
                if let Some(c) = g.clients.get_mut(client_id) {
                    c.x = x;
                    c.y = y;
                    c.z = z;
                    c.yaw = yaw;
                }
            }
            let bc = format!(
                "{{\"type\":\"player_move\",\"id\":\"{}\",\"x\":{:.2},\"y\":{:.2},\"z\":{:.2},\"yaw\":{:.2}}}",
                json_escape(client_id),
                x,
                y,
                z,
                yaw
            );
            broadcast(state, &bc, Some(client_id));
        }

        "block_set" => {
            let Some(bx) = json_get_f64(text, "x").map(|v| v.floor() as i64) else {
                return;
            };
            let Some(by) = json_get_f64(text, "y").map(|v| v.floor() as i64) else {
                return;
            };
            let Some(bz) = json_get_f64(text, "z").map(|v| v.floor() as i64) else {
                return;
            };
            let Some(bid) = json_get_f64(text, "blockId").map(|v| v as u32) else {
                return;
            };

            // Server-authoritative anti-cheat: bounds, block ID, rate limit, reach check
            if by <= 0 || by >= 95 || bid > 30 {
                return;
            }
            let accepted = {
                let mut g = state.lock().unwrap();
                let now = Instant::now();
                let ok = if let Some(c) = g.clients.get_mut(client_id) {
                    let elapsed = now.duration_since(c.last_edit);
                    let dx = (bx as f64) - c.x;
                    let dy = (by as f64) - c.y;
                    let dz = (bz as f64) - c.z;
                    let dist = (dx * dx + dy * dy + dz * dz).sqrt();
                    if elapsed >= Duration::from_millis(45) && dist <= 9.5 {
                        c.last_edit = now;
                        true
                    } else {
                        false
                    }
                } else {
                    false
                };
                if ok {
                    g.blocks.insert(format!("{},{},{}", bx, by, bz), bid);
                    g.dirty = true;
                }
                ok
            };

            if accepted {
                let bc = format!(
                    "{{\"type\":\"block_set\",\"x\":{},\"y\":{},\"z\":{},\"blockId\":{}}}",
                    bx, by, bz, bid
                );
                broadcast(state, &bc, Some(client_id));
            }
        }

        "chat" => {
            let raw = json_get_str(text, "text").unwrap_or_default();
            let clean: String = raw.trim().chars().take(180).collect();
            if clean.is_empty() {
                return;
            }
            let sender = {
                let g = state.lock().unwrap();
                g.clients
                    .get(client_id)
                    .map(|c| c.name.clone())
                    .unwrap_or_else(|| "Explorer".to_string())
            };
            let bc = format!(
                "{{\"type\":\"chat\",\"name\":\"{}\",\"text\":\"{}\"}}",
                json_escape(&sender),
                json_escape(&clean)
            );
            broadcast(state, &bc, None);
        }

        _ => {}
    }
}

fn send_to(state: &Arc<Mutex<ServerState>>, target_id: &str, json: &str) {
    let frame = encode_frame(0x1, json.as_bytes());
    let mut g = state.lock().unwrap();
    if let Some(c) = g.clients.get_mut(target_id) {
        let _ = c.stream.write_all(&frame);
    }
}

fn broadcast(state: &Arc<Mutex<ServerState>>, json: &str, except_id: Option<&str>) {
    let frame = encode_frame(0x1, json.as_bytes());
    let mut g = state.lock().unwrap();
    for (id, c) in g.clients.iter_mut() {
        if except_id.map_or(false, |ex| ex == id) {
            continue;
        }
        let _ = c.stream.write_all(&frame);
    }
}

/* ---------- RFC 6455 WebSocket Framing ---------- */

fn encode_frame(opcode: u8, payload: &[u8]) -> Vec<u8> {
    let len = payload.len();
    let mut out = Vec::with_capacity(len + 10);
    out.push(0x80 | (opcode & 0x0f));
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
    if buf.len() < 2 {
        return None;
    }
    let op = buf[0] & 0x0f;
    let masked = (buf[1] & 0x80) != 0;
    let mut len = (buf[1] & 0x7f) as usize;
    let mut off = 2;
    if len == 126 {
        if buf.len() < 4 {
            return None;
        }
        len = u16::from_be_bytes([buf[2], buf[3]]) as usize;
        off = 4;
    } else if len == 127 {
        if buf.len() < 10 {
            return None;
        }
        let mut b8 = [0u8; 8];
        b8.copy_from_slice(&buf[2..10]);
        len = u64::from_be_bytes(b8) as usize;
        off = 10;
    }
    let mask_len = if masked { 4 } else { 0 };
    let total = off + mask_len + len;
    if buf.len() < total {
        return None;
    }
    let mut payload = buf[off + mask_len..total].to_vec();
    if masked {
        let mask = [buf[off], buf[off + 1], buf[off + 2], buf[off + 3]];
        for (i, byte) in payload.iter_mut().enumerate() {
            *byte ^= mask[i & 3];
        }
    }
    buf.drain(..total);
    Some((op, payload))
}

/* ---------- Pure-Rust SHA-1 + Base64 for Sec-WebSocket-Accept ---------- */

fn compute_ws_accept(key: &str) -> String {
    let mut input = key.as_bytes().to_vec();
    input.extend_from_slice(b"258EAFA5-E914-47DA-95CA-C5AB0DC85B11");
    let digest = sha1(&input);
    base64_encode(&digest)
}

fn sha1(data: &[u8]) -> [u8; 20] {
    let mut h0: u32 = 0x67452301;
    let mut h1: u32 = 0xEFCDAB89;
    let mut h2: u32 = 0x98BADCFE;
    let mut h3: u32 = 0x10325476;
    let mut h4: u32 = 0xC3D2E1F0;

    let bit_len = (data.len() as u64) * 8;
    let mut msg = data.to_vec();
    msg.push(0x80);
    while (msg.len() % 64) != 56 {
        msg.push(0);
    }
    msg.extend_from_slice(&bit_len.to_be_bytes());

    for chunk in msg.chunks_exact(64) {
        let mut w = [0u32; 80];
        for i in 0..16 {
            w[i] = u32::from_be_bytes([
                chunk[i * 4],
                chunk[i * 4 + 1],
                chunk[i * 4 + 2],
                chunk[i * 4 + 3],
            ]);
        }
        for i in 16..80 {
            w[i] = (w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16]).rotate_left(1);
        }

        let (mut a, mut b, mut c, mut d, mut e) = (h0, h1, h2, h3, h4);
        for (i, &wi) in w.iter().enumerate() {
            let (f, k) = match i {
                0..=19 => ((b & c) | ((!b) & d), 0x5A827999u32),
                20..=39 => (b ^ c ^ d, 0x6ED9EBA1u32),
                40..=59 => ((b & c) | (b & d) | (c & d), 0x8F1BBCDCu32),
                _ => (b ^ c ^ d, 0xCA62C1D6u32),
            };
            let temp = a
                .rotate_left(5)
                .wrapping_add(f)
                .wrapping_add(e)
                .wrapping_add(k)
                .wrapping_add(wi);
            e = d;
            d = c;
            c = b.rotate_left(30);
            b = a;
            a = temp;
        }

        h0 = h0.wrapping_add(a);
        h1 = h1.wrapping_add(b);
        h2 = h2.wrapping_add(c);
        h3 = h3.wrapping_add(d);
        h4 = h4.wrapping_add(e);
    }

    let mut out = [0u8; 20];
    for (i, h) in [h0, h1, h2, h3, h4].iter().enumerate() {
        out[i * 4..i * 4 + 4].copy_from_slice(&h.to_be_bytes());
    }
    out
}

fn base64_encode(input: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(input.len().div_ceil(3) * 4);
    for chunk in input.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = if chunk.len() > 1 { chunk[1] as u32 } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] as u32 } else { 0 };
        let triple = (b0 << 16) | (b1 << 8) | b2;
        out.push(TABLE[((triple >> 18) & 0x3f) as usize] as char);
        out.push(TABLE[((triple >> 12) & 0x3f) as usize] as char);
        out.push(if chunk.len() > 1 {
            TABLE[((triple >> 6) & 0x3f) as usize] as char
        } else {
            '='
        });
        out.push(if chunk.len() > 2 {
            TABLE[(triple & 0x3f) as usize] as char
        } else {
            '='
        });
    }
    out
}

/* ---------- Lightweight JSON Helpers & World Persistence ---------- */

fn json_escape(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for ch in s.chars() {
        match ch {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => {}
            c => out.push(c),
        }
    }
    out
}

fn json_get_str(json: &str, key: &str) -> Option<String> {
    let pat = format!("\"{}\"", key);
    let idx = json.find(&pat)?;
    let rest = &json[idx + pat.len()..];
    let colon = rest.find(':')?;
    let after = rest[colon + 1..].trim_start();
    if !after.starts_with('"') {
        return None;
    }
    let mut out = String::new();
    let mut chars = after[1..].chars();
    while let Some(ch) = chars.next() {
        if ch == '\\' {
            if let Some(esc) = chars.next() {
                out.push(match esc {
                    'n' => '\n',
                    't' => '\t',
                    'r' => '\r',
                    other => other,
                });
            }
        } else if ch == '"' {
            return Some(out);
        } else {
            out.push(ch);
        }
    }
    None
}

fn json_get_f64(json: &str, key: &str) -> Option<f64> {
    let pat = format!("\"{}\"", key);
    let idx = json.find(&pat)?;
    let rest = &json[idx + pat.len()..];
    let colon = rest.find(':')?;
    let after = rest[colon + 1..].trim_start();
    let end = after
        .find(|c: char| !matches!(c, '0'..='9' | '-' | '+' | '.' | 'e' | 'E'))
        .unwrap_or(after.len());
    after[..end].parse::<f64>().ok()
}

fn persist_blocks(seed: &str, blocks: &HashMap<String, u32>) {
    let entries: Vec<String> = blocks
        .iter()
        .map(|(k, v)| format!("\"{}\":{}", json_escape(k), v))
        .collect();
    let body = format!(
        "{{\"seed\":\"{}\",\"blocks\":{{{}}}}}",
        json_escape(seed),
        entries.join(",")
    );
    let _ = fs::write(SAVE_FILE, body);
}

fn load_persisted_blocks(raw: &str, out: &mut HashMap<String, u32>) {
    let Some(idx) = raw.find("\"blocks\"") else {
        return;
    };
    let rest = &raw[idx..];
    let Some(open) = rest.find('{') else { return };
    let Some(close) = rest[open..].find('}') else {
        return;
    };
    let inner = &rest[open + 1..open + close];
    for pair in inner.split(',') {
        let Some((k, v)) = pair.split_once(':') else {
            continue;
        };
        let key = k.trim().trim_matches('"').to_string();
        if let Ok(val) = v.trim().parse::<u32>() {
            if !key.is_empty() {
                out.insert(key, val);
            }
        }
    }
}
