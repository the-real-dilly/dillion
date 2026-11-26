//! End-to-end ranked tests: start the real server binary, drive it with headless
//! WebSocket clients (raw RFC 6455 over TCP) and check ratings/persistence.
//!
//! - Always runs in-memory (no DATABASE_URL / REDIS_URL): one replica, MemStore + MemBackend.
//! - If TEST_REDIS_URL (and optionally TEST_DATABASE_URL) are set, also runs the same
//!   match across TWO replicas sharing Redis (+ PostgreSQL): player A on replica 1,
//!   player B on replica 2, the match hosted by whichever replica holds the lease.

use dilly_strike_server::auth::issue_token;
use dilly_strike_server::util::{decode_frame, encode_masked_frame, now_ms, Frame, Json};
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant};

const SECRET: &str = "e2e-test-secret-e2e-test-secret-0123456789";

struct Server {
    child: Child,
    port: u16,
}
impl Drop for Server {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

fn free_port() -> u16 {
    TcpListener::bind("127.0.0.1:0").unwrap().local_addr().unwrap().port()
}

fn start_server(pod: &str, extra: &[(&str, &str)]) -> Server {
    let port = free_port();
    let mut cmd = Command::new(env!("CARGO_BIN_EXE_dilly-strike-server"));
    cmd.arg(port.to_string())
        .env_remove("DATABASE_URL")
        .env_remove("REDIS_URL")
        .env("HOSTNAME", pod)
        .env("DILLY_SESSION_SECRET", SECRET)
        .env("RANKED_TEAM_SIZE", "1")
        .env("RANKED_ROUNDS_TO_WIN", "2")
        .env("RANKED_ACCEPT_SECS", "5")
        .env("RANKED_SELECT_SECS", "5")
        .env("RANKED_BUY_SECS", "0.4")
        .env("RANKED_ROUND_SECS", "30")
        .env("RANKED_ROUND_END_SECS", "0.4")
        .env("RANKED_RECONNECT_SECS", "2")
        .env("RANKED_DECLINE_COOLDOWN_SECS", "30")
        .env("RANKED_WINDOW_BASE", "2000") // low-population config: match anyone
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    for (k, v) in extra {
        cmd.env(k, v);
    }
    let child = cmd.spawn().expect("spawn server");
    let s = Server { child, port };
    let t0 = Instant::now();
    while TcpStream::connect(("127.0.0.1", port)).is_err() {
        assert!(t0.elapsed() < Duration::from_secs(10), "server did not start");
        std::thread::sleep(Duration::from_millis(50));
    }
    s
}

struct Client {
    s: TcpStream,
    acc: Vec<u8>,
    pub log: Vec<Json>,
}

impl Client {
    fn connect(port: u16) -> Client {
        Client::connect_path(port, "/strike/ranked")
    }
    fn connect_path(port: u16, path: &str) -> Client {
        let mut s = TcpStream::connect(("127.0.0.1", port)).unwrap();
        s.write_all(
            format!(
                "GET {} HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n",
                path
            )
            .as_bytes(),
        )
        .unwrap();
        let mut buf = [0u8; 1024];
        let mut hdr = Vec::new();
        while !hdr.windows(4).any(|w| w == b"\r\n\r\n") {
            let n = s.read(&mut buf).unwrap();
            assert!(n > 0);
            hdr.extend_from_slice(&buf[..n]);
        }
        let text = String::from_utf8_lossy(&hdr).to_string();
        assert!(text.starts_with("HTTP/1.1 101"), "{}", text);
        assert!(text.contains("s3pPLMBiTxaQ9kYGzzhZRbK+xOo="), "RFC 6455 accept key");
        let end = hdr.windows(4).position(|w| w == b"\r\n\r\n").unwrap() + 4;
        let acc = hdr[end..].to_vec();
        s.set_read_timeout(Some(Duration::from_millis(100))).unwrap();
        Client { s, acc, log: Vec::new() }
    }
    fn send(&mut self, json: &str) {
        let _ = self.s.write_all(&encode_masked_frame(1, json.as_bytes(), [7, 1, 9, 3]));
    }
    fn hello(port: u16, callsign: &str) -> Client {
        let mut c = Client::connect(port);
        let tok = issue_token(SECRET.as_bytes(), callsign, now_ms() / 1000 + 3600);
        c.send(&format!("{{\"type\":\"hello\",\"token\":\"{}\"}}", tok));
        let h = c.expect("hello_ok", 5);
        assert_eq!(h.str_of("name"), Some(callsign));
        c
    }
    /// Poll one message (None on timeout / closed).
    fn poll(&mut self) -> Option<Json> {
        let mut tmp = [0u8; 8192];
        loop {
            match decode_frame(&mut self.acc, 1 << 20, false) {
                Some(Frame::Msg(1, p)) => {
                    let v = Json::parse(&String::from_utf8_lossy(&p)).expect("server sent invalid JSON");
                    self.log.push(v.clone());
                    return Some(v);
                }
                Some(Frame::Msg(_, _)) => continue,
                Some(Frame::Bad) => return None,
                None => {}
            }
            match self.s.read(&mut tmp) {
                Ok(0) => return None,
                Ok(n) => self.acc.extend_from_slice(&tmp[..n]),
                Err(_) => return None,
            }
        }
    }
    fn expect(&mut self, ty: &str, secs: u64) -> Json {
        let t0 = Instant::now();
        while t0.elapsed() < Duration::from_secs(secs) {
            if let Some(v) = self.poll() {
                if v.str_of("type") == Some(ty) {
                    return v;
                }
            }
        }
        panic!("timed out waiting for {}; got {:?}", ty, self.log.iter().map(|v| v.str_of("type").unwrap_or("?").to_string()).collect::<Vec<_>>());
    }
    fn expect_where(&mut self, ty: &str, secs: u64, f: impl Fn(&Json) -> bool) -> Json {
        let t0 = Instant::now();
        while t0.elapsed() < Duration::from_secs(secs) {
            if let Some(v) = self.poll() {
                if v.str_of("type") == Some(ty) && f(&v) {
                    return v;
                }
            }
        }
        panic!("timed out waiting for {} (filtered)", ty);
    }
}

fn http_get(port: u16, path: &str) -> (u16, Json) {
    let mut s = TcpStream::connect(("127.0.0.1", port)).unwrap();
    s.write_all(format!("GET {} HTTP/1.1\r\nHost: localhost\r\n\r\n", path).as_bytes()).unwrap();
    let mut out = String::new();
    s.read_to_string(&mut out).unwrap();
    let code: u16 = out[9..12].parse().unwrap();
    let body = out.split_once("\r\n\r\n").map(|x| x.1).unwrap_or("");
    (code, Json::parse(body).unwrap_or(Json::Null))
}

fn num(v: &Json, path: &[&str]) -> f64 {
    let mut cur = v;
    for p in path {
        cur = cur.get(p).unwrap_or_else(|| panic!("missing {}", p));
    }
    match cur {
        Json::Num(n) => *n,
        Json::Bool(b) => *b as i32 as f64,
        _ => panic!("not a number at {:?}", path),
    }
}

/// Play a 1v1 first-to-2 where `a` wins both rounds; returns both match_end messages.
fn play_match(a: &mut Client, b: &mut Client, a_name: &str, b_name: &str) -> (Json, Json) {
    a.send("{\"type\":\"queue\"}");
    b.send("{\"type\":\"queue\"}");
    a.expect("match_found", 10);
    b.expect("match_found", 10);
    a.send("{\"type\":\"accept\"}");
    b.send("{\"type\":\"accept\"}");
    a.expect("agent_select", 5);
    b.expect("agent_select", 5);
    a.send("{\"type\":\"pick\",\"agent\":\"ember\"}");
    a.send("{\"type\":\"lock\"}");
    b.send("{\"type\":\"pick\",\"agent\":\"ember\"}"); // other team: same agent allowed
    b.send("{\"type\":\"lock\"}");
    let ms = a.expect("match_start", 5);
    let map = ms.str_of("map").expect("match_start carries the map");
    assert!(map == "dustline" || map == "brinepeak", "{}", map);
    assert_eq!(ms.str_of("map_code"), Some(format!("de_{}", map).as_str()));
    let players = match ms.get("players") {
        Some(Json::Arr(p)) => p.clone(),
        _ => panic!(),
    };
    assert_eq!(players.len(), 2);
    let b_id = b_name.to_lowercase();
    for round in 1..=2 {
        a.expect_where("round", 5, |v| v.str_of("phase") == Some("live") && num(v, &["round"]) as i32 == round);
        b.expect_where("round", 5, |v| v.str_of("phase") == Some("live"));
        // client-claimed damage is ignored: the server computes it from its weapon table
        a.send(&format!("{{\"type\":\"hit\",\"target\":\"{}\",\"weapon\":\"sheriff\",\"hs\":true,\"dmg\":1}}", b_id));
        let k = a.expect("kill", 5);
        assert_eq!(k.str_of("victim"), Some(b_name));
        let re = b.expect("round_end", 5);
        assert_eq!(num(&re, &["round"]) as i32, round);
        let _ = a_name;
    }
    let ea = a.expect("match_end", 10);
    let eb = b.expect("match_end", 10);
    (ea, eb)
}

#[test]
fn ranked_1v1_single_replica_in_memory() {
    let srv = start_server("solo-pod", &[]);
    let port = srv.port;

    // status endpoint
    let (code, st) = http_get(port, "/strike/ranked/status");
    assert_eq!(code, 200);
    assert_eq!(st.bool_of("enabled"), Some(true));
    assert_eq!(num(&st, &["team_size"]) as i32, 1);

    // forged / missing tokens are rejected
    let mut bad = Client::connect(port);
    bad.send("{\"type\":\"hello\",\"token\":\"v1.QQ.9999999999.AAAA\"}");
    let e = bad.expect("error", 5);
    assert_eq!(e.str_of("code"), Some("auth_failed"));
    let mut noauth = Client::connect(port);
    noauth.send("{\"type\":\"queue\"}");
    assert_eq!(noauth.expect("error", 5).str_of("code"), Some("auth_required"));

    let mut a = Client::hello(port, "PicklePro");
    let mut b = Client::hello(port, "BrineBot");
    let (ea, eb) = play_match(&mut a, &mut b, "PicklePro", "BrineBot");
    assert_eq!(ea.str_of("result"), Some("win"));
    assert_eq!(eb.str_of("result"), Some("loss"));
    assert_eq!(ea.get("score"), Some(&Json::Arr(vec![Json::Num(2.0), Json::Num(0.0)])));
    assert!(num(&ea, &["mmr_delta"]) > 0.0, "winner MMR up");
    assert!(num(&eb, &["mmr_delta"]) < 0.0, "loser MMR down");
    assert_eq!(num(&ea, &["rank_after", "placements"]) as i32, 1);
    assert_eq!(ea.bool_of("saved"), Some(true));

    // persisted (in-memory store) & visible over HTTP
    let (code, prof) = http_get(port, "/strike/ranked/profile/PicklePro");
    assert_eq!(code, 200);
    assert_eq!(num(&prof, &["player", "wins"]) as i32, 1);
    match prof.get("history") {
        Some(Json::Arr(h)) => {
            assert_eq!(h.len(), 1);
            assert_eq!(h[0].str_of("result"), Some("win"));
            assert_eq!(num(&h[0], &["kills"]) as i32, 2);
        }
        _ => panic!("history missing"),
    }
    let (_, prof_b) = http_get(port, "/strike/ranked/profile/brinebot");
    assert_eq!(num(&prof_b, &["player", "losses"]) as i32, 1);
    let (code, _) = http_get(port, "/strike/ranked/profile/%3Cscript%3E");
    assert_eq!(code, 400);

    // decline -> cooldown, the other player is re-queued with priority
    a.send("{\"type\":\"queue\"}");
    b.send("{\"type\":\"queue\"}");
    a.expect("match_found", 10);
    b.expect("match_found", 10);
    a.send("{\"type\":\"accept\"}");
    b.send("{\"type\":\"decline\"}");
    let cb = b.expect("match_cancelled", 5);
    assert_eq!(cb.bool_of("penalized"), Some(true));
    assert!(num(&cb, &["cooldown_ms"]) >= 29_000.0);
    let ca = a.expect("match_cancelled", 5);
    assert_eq!(ca.bool_of("requeued"), Some(true));
    b.send("{\"type\":\"queue\"}");
    assert_eq!(b.expect("cooldown", 5).str_of("reason"), Some("declined"));
    a.send("{\"type\":\"cancel\"}");
    a.expect_where("queue_status", 5, |v| v.bool_of("queued") == Some(false));

    // abandon mid-match = loss + leaver cooldown
    let mut c = Client::hello(port, "SproutSam");
    a.send("{\"type\":\"queue\"}");
    c.send("{\"type\":\"queue\"}");
    a.expect("match_found", 10);
    c.expect("match_found", 10);
    a.send("{\"type\":\"accept\"}");
    c.send("{\"type\":\"accept\"}");
    a.expect("agent_select", 5);
    a.send("{\"type\":\"lock\"}"); // no pick yet -> rejected
    assert_eq!(a.expect("error", 5).str_of("code"), Some("no_agent"));
    a.send("{\"type\":\"pick\",\"agent\":\"relay\"}");
    a.send("{\"type\":\"lock\"}");
    c.send("{\"type\":\"pick\",\"agent\":\"vanta\"}");
    c.send("{\"type\":\"lock\"}");
    c.expect_where("round", 5, |v| v.str_of("phase") == Some("live"));
    c.send("{\"type\":\"abandon\"}");
    let ab = c.expect("abandoned", 5);
    assert!(num(&ab, &["cooldown_ms"]) > 0.0);
    let ec = c.expect("match_end", 10);
    assert_eq!(ec.str_of("result"), Some("loss"));
    assert_eq!(ec.bool_of("abandoned"), Some(true));
    let ea2 = a.expect("match_end", 10);
    assert_eq!(ea2.str_of("result"), Some("win"));
    assert_eq!(ea2.bool_of("forfeit"), Some(true));
    c.send("{\"type\":\"queue\"}");
    assert_eq!(c.expect("cooldown", 5).str_of("reason"), Some("abandoned"));

    // not in a match -> in-match messages are refused, junk is rejected, nothing crashes
    a.send("{\"type\":\"hit\",\"target\":\"x\"}");
    assert_eq!(a.expect("error", 5).str_of("code"), Some("not_in_match"));
    a.send("{not json");
    assert_eq!(a.expect("error", 5).str_of("code"), Some("bad_json"));

    // leaderboard is readable (nobody placed yet after 1-2 matches)
    let (code, lb) = http_get(port, "/strike/ranked/leaderboard?limit=10");
    assert_eq!(code, 200);
    assert!(matches!(lb.get("players"), Some(Json::Arr(_))));
}

#[test]
fn ranked_rate_limit_closes_flooders() {
    let srv = start_server("flood-pod", &[("RANKED_MSG_RATE", "5"), ("RANKED_MSG_BURST", "5")]);
    let mut a = Client::hello(srv.port, "Flooder");
    for _ in 0..30 {
        a.send("{\"type\":\"ping\"}");
    }
    let e = a.expect("error", 5);
    assert_eq!(e.str_of("code"), Some("rate_limited"));
}

#[test]
fn ranked_two_replicas_shared_redis() {
    let Ok(redis) = std::env::var("TEST_REDIS_URL") else {
        eprintln!("TEST_REDIS_URL not set; skipping multi-replica test");
        return;
    };
    let db = std::env::var("TEST_DATABASE_URL").ok();
    // clean shared state from earlier runs
    let rb = dilly_strike_server::queue::RedisBackend::new(&redis);
    for k in ["dilly:ranked:queue", "dilly:ranked:queue_seen", "dilly:ranked:mm_lock"] {
        let _ = rb.cmd(&["DEL", k]);
    }
    for k in ["replica_a", "replica_b"] {
        let _ = rb.cmd(&["DEL", &format!("dilly:ranked:cooldown:{}", k), &format!("dilly:ranked:active:{}", k)]);
    }
    let mut env: Vec<(&str, &str)> = vec![("REDIS_URL", redis.as_str())];
    if let Some(d) = db.as_deref() {
        env.push(("DATABASE_URL", d));
    }
    let s1 = start_server("pod-one", &env);
    let s2 = start_server("pod-two", &env);
    std::thread::sleep(Duration::from_millis(600)); // let subscribers attach

    let before_a = http_get(s1.port, "/strike/ranked/profile/Replica_A").1;
    let mut a = Client::hello(s1.port, "Replica_A");
    let mut b = Client::hello(s2.port, "Replica_B");
    let (ea, eb) = play_match(&mut a, &mut b, "Replica_A", "Replica_B");
    assert_eq!(ea.str_of("result"), Some("win"));
    assert_eq!(eb.str_of("result"), Some("loss"));
    assert!(num(&ea, &["mmr_delta"]) > 0.0);
    assert_eq!(ea.bool_of("saved"), Some(true));
    if db.is_some() {
        // persisted in PostgreSQL: visible from the OTHER replica
        let after = http_get(s2.port, "/strike/ranked/profile/Replica_A").1;
        assert_eq!(num(&after, &["player", "wins"]) as i32, num(&before_a, &["player", "wins"]) as i32 + 1);
        assert_eq!(
            num(&after, &["player", "rank", "placements"]) as i32,
            (num(&before_a, &["player", "rank", "placements"]) as i32 + 1).min(5)
        );
        match after.get("history") {
            Some(Json::Arr(h)) => assert!(!h.is_empty()),
            _ => panic!(),
        }
    }
}

#[test]
fn ranked_match_on_brinepeak_from_map_pool() {
    let srv = start_server("brine-pod", &[("RANKED_MAPS", "brinepeak")]);
    let port = srv.port;
    let mut a = Client::hello(port, "MonkMira");
    let mut b = Client::hello(port, "GateKeeper");
    let (ea, _eb) = play_match(&mut a, &mut b, "MonkMira", "GateKeeper");
    assert_eq!(ea.str_of("map"), Some("brinepeak"));
    let found = a.log.iter().find(|v| v.str_of("type") == Some("match_found")).unwrap();
    assert_eq!(found.str_of("map"), Some("brinepeak"));
    let sel = a.log.iter().find(|v| v.str_of("type") == Some("agent_select")).unwrap();
    assert_eq!(sel.str_of("map_code"), Some("de_brinepeak"));
    let ms = a.log.iter().find(|v| v.str_of("type") == Some("match_start")).unwrap();
    assert_eq!(ms.str_of("map"), Some("brinepeak"));
    assert_eq!(num(ms, &["sites"]) as i32, 3);
    // round 1 spawns: team a defends from the upper cloister (z = -31), b attacks from the lower gate (z = 31)
    let r1a = a.log.iter().find(|v| v.str_of("type") == Some("round")).unwrap();
    let r1b = b.log.iter().find(|v| v.str_of("type") == Some("round")).unwrap();
    assert_eq!(num(r1a, &["you", "z"]), -31.0);
    assert_eq!(num(r1b, &["you", "z"]), 31.0);
    // history over HTTP carries the map
    let (_, prof) = http_get(port, "/strike/ranked/profile/MonkMira");
    match prof.get("history") {
        Some(Json::Arr(h)) => assert_eq!(h[0].str_of("map"), Some("brinepeak")),
        _ => panic!("history missing"),
    }
}

/// Casual (non-ranked) server: each map is its own room; missing/unknown map -> dustline.
#[test]
fn casual_map_rooms() {
    let srv = start_server("casual-pod", &[]);
    let port = srv.port;
    let mut brine1 = Client::connect_path(port, "/strike");
    brine1.send("{\"type\":\"join\",\"name\":\"Bellringer\",\"map\":\"brinepeak\"}");
    let w1 = brine1.expect("welcome", 5);
    assert_eq!(w1.str_of("map"), Some("brinepeak"));
    assert_eq!(w1.str_of("map_code"), Some("de_brinepeak"));
    assert_eq!(w1.str_of("team"), Some("alpha"));
    assert!(matches!(w1.get("maps"), Some(Json::Arr(m)) if m.len() == 2));

    let mut dust = Client::connect_path(port, "/strike");
    dust.send("{\"type\":\"join\",\"name\":\"OldClient\"}"); // no map field (older client)
    let wd = dust.expect("welcome", 5);
    assert_eq!(wd.str_of("map"), Some("dustline"));
    assert!(matches!(wd.get("players"), Some(Json::Arr(p)) if p.len() == 1), "rooms are separate");
    assert_eq!(wd.str_of("team"), Some("alpha"), "teams are balanced per room");

    let mut bogus = Client::connect_path(port, "/strike");
    bogus.send("{\"type\":\"join\",\"name\":\"Typo\",\"map\":\"de_nowhere\"}");
    assert_eq!(bogus.expect("welcome", 5).str_of("map"), Some("dustline"));

    let mut brine2 = Client::connect_path(port, "/strike");
    brine2.send("{\"type\":\"join\",\"name\":\"Lantern\",\"map\":\"de_brinepeak\"}");
    let w2 = brine2.expect("welcome", 5);
    assert_eq!(w2.str_of("map"), Some("brinepeak"));
    assert_eq!(w2.str_of("team"), Some("omega"));
    assert!(matches!(w2.get("players"), Some(Json::Arr(p)) if p.len() == 2));
    let pj = brine1.expect("player_join", 5);
    assert_eq!(pj.get("player").and_then(|p| p.str_of("name")), Some("Lantern"));

    // chat + kills stay inside a room
    brine2.send("{\"type\":\"chat\",\"text\":\"bell court clear\"}");
    assert_eq!(brine1.expect("chat", 5).str_of("text"), Some("bell court clear"));
    let id1 = w1.str_of("id").unwrap().to_string();
    brine2.send(&format!("{{\"type\":\"hit\",\"target\":\"{}\",\"dmg\":160}}", id1));
    let k = brine1.expect("kill", 5);
    assert_eq!(num(&k, &["omega"]) as i32, 1);
    // a dustline player cannot hit someone in the brinepeak room
    dust.send(&format!("{{\"type\":\"hit\",\"target\":\"{}\",\"dmg\":160}}", id1));
    let t0 = Instant::now();
    while t0.elapsed() < Duration::from_millis(600) {
        let _ = dust.poll();
        let _ = bogus.poll();
    }
    let leaked = |c: &Client| c.log.iter().any(|v| matches!(v.str_of("type"), Some("chat") | Some("kill")) || v.str_of("type") == Some("player_join") && v.get("player").and_then(|p| p.str_of("name")) == Some("Lantern"));
    assert!(!leaked(&dust), "brinepeak traffic leaked into the dustline room: {:?}", dust.log.len());
    assert!(!leaked(&bogus));
}
