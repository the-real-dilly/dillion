//! Networking: TCP listener, /health, WebSocket upgrade, per-IP limits, matchmaking into rooms.
use crate::proto::parse_input;
use crate::room::{ClientId, Config, Phase, Room, RoomInfo, RoomMsg};
use crate::world::World;
use futures_util::{SinkExt, StreamExt};
use serde_json::Value;
use std::collections::HashMap;
use std::net::{IpAddr, SocketAddr};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::mpsc;
use tokio_tungstenite::tungstenite::protocol::WebSocketConfig;
use tokio_tungstenite::tungstenite::Message;

pub const MAX_MSG: usize = 8 * 1024;
const MAX_CONN_PER_IP: usize = 8;
const MAX_CONNECTS_PER_MIN: usize = 40;
const MSGS_PER_SEC: f64 = 90.0;
const MSG_BURST: f64 = 180.0;

struct RoomHandle {
    tx: mpsc::Sender<RoomMsg>,
    info: Arc<Mutex<RoomInfo>>,
}
pub struct Shared {
    cfg: Config,
    world: Mutex<World>,
    rooms: Mutex<HashMap<String, RoomHandle>>,
    ips: Mutex<HashMap<IpAddr, (usize, Vec<Instant>)>>,
    next_cid: AtomicU64,
    started: Instant,
}

pub async fn run(addr: SocketAddr, cfg: Config, world: World) -> std::io::Result<()> {
    let listener = TcpListener::bind(addr).await?;
    serve(listener, cfg, world).await
}

pub async fn serve(listener: TcpListener, cfg: Config, world: World) -> std::io::Result<()> {
    let shared = Arc::new(Shared { cfg, world: Mutex::new(world), rooms: Mutex::new(HashMap::new()), ips: Mutex::new(HashMap::new()), next_cid: AtomicU64::new(1), started: Instant::now() });
    loop {
        let (stream, peer) = listener.accept().await?;
        let _ = stream.set_nodelay(true);
        let sh = shared.clone();
        tokio::spawn(async move {
            if let Err(e) = handle_conn(sh, stream, peer).await {
                log(&format!("connection {} closed: {}", peer, e));
            }
        });
    }
}

fn log(msg: &str) {
    eprintln!("[last-zone] {}", msg);
}

/// client IP, honouring X-Forwarded-For only from a local reverse proxy
fn client_ip(peer: SocketAddr, head: &str) -> IpAddr {
    if peer.ip().is_loopback() {
        for line in head.lines() {
            if let Some(v) = line.strip_prefix("X-Forwarded-For:").or_else(|| line.strip_prefix("x-forwarded-for:")) {
                if let Some(ip) = v.split(',').next().and_then(|s| s.trim().parse().ok()) {
                    return ip;
                }
            }
        }
    }
    peer.ip()
}

async fn handle_conn(sh: Arc<Shared>, stream: TcpStream, peer: SocketAddr) -> Result<(), String> {
    // peek the request head: answer GET /health directly, otherwise hand over to the WebSocket upgrade
    let mut buf = [0u8; 2048];
    let mut n;
    let deadline = Instant::now() + Duration::from_secs(5);
    loop {
        let got = tokio::time::timeout(Duration::from_secs(5), stream.peek(&mut buf)).await.map_err(|_| "timeout")?.map_err(|e| e.to_string())?;
        if got == 0 {
            return Err("eof".into());
        }
        n = got;
        if buf[..n].windows(4).any(|w| w == b"\r\n\r\n") || n == buf.len() || Instant::now() > deadline {
            break;
        }
        tokio::time::sleep(Duration::from_millis(5)).await;
    }
    let head = String::from_utf8_lossy(&buf[..n]).to_string();
    if head.starts_with("GET /health") {
        return health(sh, stream).await;
    }
    let ip = client_ip(peer, &head);
    // per-IP connection limits
    {
        let mut ips = sh.ips.lock().unwrap();
        let e = ips.entry(ip).or_insert((0, vec![]));
        let now = Instant::now();
        e.1.retain(|t| now.duration_since(*t) < Duration::from_secs(60));
        if e.0 >= MAX_CONN_PER_IP || e.1.len() >= MAX_CONNECTS_PER_MIN {
            return Err(format!("rate limited {}", ip));
        }
        e.0 += 1;
        e.1.push(now);
    }
    let r = ws_session(sh.clone(), stream).await;
    if let Some(e) = sh.ips.lock().unwrap().get_mut(&ip) {
        e.0 = e.0.saturating_sub(1);
    }
    r
}

async fn health(sh: Arc<Shared>, mut stream: TcpStream) -> Result<(), String> {
    let mut sink = [0u8; 2048];
    let _ = stream.read(&mut sink).await;
    let body = {
        let rooms = sh.rooms.lock().unwrap();
        let playing = rooms.values().filter(|r| r.info.lock().map(|i| i.phase == Phase::Playing).unwrap_or(false)).count();
        let humans: usize = rooms.values().map(|r| r.info.lock().map(|i| i.humans).unwrap_or(0)).sum();
        serde_json::json!({ "ok": true, "game": "dillion-last-zone", "protocol": crate::proto::PROTOCOL_VERSION, "rooms": rooms.len(), "matches": playing, "players": humans, "uptime": sh.started.elapsed().as_secs() }).to_string()
    };
    let resp = format!("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: *\r\nCache-Control: no-store\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", body.len(), body);
    stream.write_all(resp.as_bytes()).await.map_err(|e| e.to_string())?;
    Ok(())
}

fn sanitize_name(s: &str) -> String {
    let n: String = s.chars().filter(|c| c.is_ascii_alphanumeric() || *c == ' ' || *c == '-' || *c == '_').take(16).collect();
    let n = n.trim().to_string();
    if n.is_empty() { "Contractor".into() } else { n }
}
fn sanitize_room(s: &str) -> Option<String> {
    let r: String = s.chars().filter(|c| c.is_ascii_alphanumeric()).take(8).collect::<String>().to_uppercase();
    if r.len() >= 3 { Some(r) } else { None }
}
fn new_code(sh: &Shared) -> String {
    let n = sh.next_cid.fetch_add(1, Ordering::Relaxed) ^ (sh.started.elapsed().as_nanos() as u64);
    let letters = b"ABCDEFGHJKLMNPQRSTUVWXYZ";
    (0..4).map(|i| letters[((n >> (i * 5)) % letters.len() as u64) as usize] as char).collect()
}

/// find or create a room; returns its sender
fn place(sh: &Arc<Shared>, wanted: Option<String>) -> Result<(String, mpsc::Sender<RoomMsg>), String> {
    let mut rooms = sh.rooms.lock().unwrap();
    rooms.retain(|_, r| !r.tx.is_closed() && !r.info.lock().map(|i| i.closed).unwrap_or(true));
    let code = match wanted {
        Some(code) => {
            if let Some(r) = rooms.get(&code) {
                let i = r.info.lock().unwrap();
                if i.phase != Phase::Lobby {
                    return Err("That room's match is already under way. Try again in a minute, or leave the room code empty.".into());
                }
                if i.humans >= sh.cfg.max_humans {
                    return Err("That room is full.".into());
                }
            }
            code
        }
        None => rooms.iter().find(|(_, r)| r.info.lock().map(|i| i.phase == Phase::Lobby && i.humans < sh.cfg.max_humans).unwrap_or(false)).map(|(c, _)| c.clone()).unwrap_or_else(|| new_code(sh)),
    };
    if !rooms.contains_key(&code) {
        if rooms.len() >= 64 {
            return Err("Server busy".into());
        }
        let (tx, rx) = mpsc::channel::<RoomMsg>(1024);
        let info = Arc::new(Mutex::new(RoomInfo { phase: Phase::Lobby, humans: 0, closed: false }));
        let world = sh.world.lock().unwrap().clone();
        let room = Room::new(code.clone(), sh.cfg.clone(), world, info.clone());
        tokio::spawn(room_loop(room, rx, info.clone()));
        rooms.insert(code.clone(), RoomHandle { tx, info });
        log(&format!("room {} created", code));
    }
    Ok((code.clone(), rooms[&code].tx.clone()))
}

async fn room_loop(mut room: Room, mut rx: mpsc::Receiver<RoomMsg>, info: Arc<Mutex<RoomInfo>>) {
    let mut iv = tokio::time::interval(Duration::from_micros(16_667));
    iv.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Burst);
    loop {
        tokio::select! {
            _ = iv.tick() => {
                room.update();
                if !room.alive() { break; }
            }
            msg = rx.recv() => match msg {
                Some(m) => room.handle(m),
                None => break,
            }
        }
    }
    if let Ok(mut i) = info.lock() {
        i.closed = true;
    }
    log(&format!("room {} closed", room.code));
}

async fn ws_session(sh: Arc<Shared>, stream: TcpStream) -> Result<(), String> {
    let mut cfg = WebSocketConfig::default();
    cfg.max_message_size = Some(MAX_MSG);
    cfg.max_frame_size = Some(MAX_MSG);
    let ws = tokio_tungstenite::accept_async_with_config(stream, Some(cfg)).await.map_err(|e| e.to_string())?;
    let (mut sink, mut source) = ws.split();
    // 1. hello (JSON) within 10 s
    let hello = tokio::time::timeout(Duration::from_secs(10), source.next()).await.map_err(|_| "no hello")?.ok_or("closed")?.map_err(|e| e.to_string())?;
    let hv: Value = match hello {
        Message::Text(t) => serde_json::from_str(&t).map_err(|_| "bad hello")?,
        _ => return Err("expected hello".into()),
    };
    if hv["t"] != "hello" {
        return Err("expected hello".into());
    }
    let name = sanitize_name(hv["name"].as_str().unwrap_or(""));
    let wanted = hv["room"].as_str().and_then(sanitize_room);
    let (code, room_tx) = match place(&sh, wanted) {
        Ok(x) => x,
        Err(msg) => {
            let _ = sink.send(Message::Text(serde_json::json!({ "t": "err", "msg": msg }).to_string())).await;
            return Err(msg);
        }
    };
    let cid: ClientId = sh.next_cid.fetch_add(1, Ordering::Relaxed);
    let (out_tx, mut out_rx) = mpsc::channel::<Message>(256);
    let pong_tx = out_tx.clone();
    room_tx.send(RoomMsg::Join { cid, name: name.clone(), tx: out_tx }).await.map_err(|_| "room gone")?;
    log(&format!("{} joined room {}", name, code));
    // writer
    let writer = tokio::spawn(async move {
        while let Some(m) = out_rx.recv().await {
            if sink.send(m).await.is_err() {
                break;
            }
        }
        let _ = sink.close().await;
    });
    // reader with a token-bucket rate limit
    let mut tokens = MSG_BURST;
    let mut last = Instant::now();
    let mut strikes = 0;
    let result = loop {
        let msg = match tokio::time::timeout(Duration::from_secs(30), source.next()).await {
            Err(_) => break Err("idle timeout".to_string()),
            Ok(None) => break Ok(()),
            Ok(Some(Err(e))) => break Err(e.to_string()),
            Ok(Some(Ok(m))) => m,
        };
        let now = Instant::now();
        tokens = (tokens + now.duration_since(last).as_secs_f64() * MSGS_PER_SEC).min(MSG_BURST);
        last = now;
        if tokens < 1.0 {
            strikes += 1;
            if strikes > 200 {
                break Err("flooding".into());
            }
            continue;
        }
        tokens -= 1.0;
        match msg {
            Message::Binary(b) => match parse_input(&b) {
                Ok(cmds) => {
                    if room_tx.send(RoomMsg::Input { cid, cmds }).await.is_err() {
                        break Ok(());
                    }
                }
                Err(_) => {
                    strikes += 10;
                    if strikes > 200 {
                        break Err("bad input".into());
                    }
                }
            },
            Message::Text(t) => {
                let v: Value = serde_json::from_str(&t).unwrap_or(Value::Null);
                match v["t"].as_str() {
                    Some("ready") => {
                        let _ = room_tx.send(RoomMsg::Ready { cid }).await;
                    }
                    Some("ping") => {
                        let c = v["c"].as_f64().unwrap_or(0.0);
                        let _ = pong_tx.try_send(Message::Text(serde_json::json!({ "t": "pong", "c": c }).to_string()));
                    }
                    Some("leave") => break Ok(()),
                    _ => {}
                }
            }
            Message::Close(_) => break Ok(()),
            _ => {}
        }
    };
    let _ = room_tx.send(RoomMsg::Leave { cid }).await;
    writer.abort();
    log(&format!("{} left room {}", name, code));
    result
}
