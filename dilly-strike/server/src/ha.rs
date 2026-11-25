/* ==========================================================================
   DILLY GAMING HA RUNTIME — Zero-Dependency Redis Pub/Sub + PostgreSQL v3.0
   Enables multi-replica Kubernetes Deployments (HPA + PDB) with:
   - Cross-pod real-time fanout via Redis RESP2 PUBLISH / SUBSCRIBE
   - Durable state persistence via PostgreSQL v3.0 wire protocol
   - Automatic pod identity (HOSTNAME) & /healthz + /readyz probe status
   ========================================================================== */

#![allow(dead_code)]

use std::env;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::TcpStream;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

#[derive(Clone)]
pub struct HaContext {
    pub pod_id: String,
    pub redis_url: Option<String>,
    pub database_url: Option<String>,
    pub redis_ok: Arc<AtomicBool>,
    pub pg_ok: Arc<AtomicBool>,
    redis_pub: Arc<Mutex<Option<TcpStream>>>,
}

impl HaContext {
    pub fn from_env(service_name: &str) -> Self {
        let pod_id = env::var("HOSTNAME")
            .or_else(|_| env::var("POD_NAME"))
            .unwrap_or_else(|_| format!("{}-local", service_name));
        let redis_url = env::var("REDIS_URL").ok().filter(|s| !s.trim().is_empty());
        let database_url = env::var("DATABASE_URL").ok().filter(|s| !s.trim().is_empty());
        println!(
            "[HA:{}] pod={} redis={} postgres={}",
            service_name,
            pod_id,
            if redis_url.is_some() { "configured" } else { "standalone" },
            if database_url.is_some() { "configured" } else { "standalone" }
        );
        Self {
            pod_id,
            redis_url,
            database_url,
            redis_ok: Arc::new(AtomicBool::new(false)),
            pg_ok: Arc::new(AtomicBool::new(false)),
            redis_pub: Arc::new(Mutex::new(None)),
        }
    }

    pub fn health_json(&self, service: &str, online_players: usize) -> String {
        format!(
            "{{\"service\":\"{}\",\"status\":\"ok\",\"pod_id\":\"{}\",\"ha\":true,\"redis_connected\":{},\"postgres_connected\":{},\"players\":{}}}",
            service,
            self.pod_id,
            self.redis_ok.load(Ordering::Relaxed),
            self.pg_ok.load(Ordering::Relaxed),
            online_players
        )
    }

    /// Publish a cross-pod event to Redis Pub/Sub tagged with this pod's ID.
    pub fn publish(&self, channel: &str, payload: &str) {
        let Some(ref url) = self.redis_url else { return };
        let tagged = format!("{}|{}", self.pod_id, payload);
        let cmd = resp_cmd(&["PUBLISH", channel, &tagged]);
        let mut guard = self.redis_pub.lock().unwrap();
        if guard.is_none() {
            if let Ok(s) = redis_connect(url) {
                self.redis_ok.store(true, Ordering::Relaxed);
                *guard = Some(s);
            } else {
                self.redis_ok.store(false, Ordering::Relaxed);
                return;
            }
        }
        if let Some(ref mut s) = *guard {
            if s.write_all(&cmd).is_err() {
                *guard = None;
                self.redis_ok.store(false, Ordering::Relaxed);
            } else {
                let mut discard = [0u8; 64];
                let _ = s.set_read_timeout(Some(Duration::from_millis(20)));
                let _ = s.read(&mut discard);
            }
        }
    }

    /// Spawn a resilient background thread subscribed to `channel` for cross-pod fanout.
    pub fn spawn_subscriber<F>(&self, channel: String, on_event: F)
    where
        F: Fn(&str) + Send + Sync + 'static,
    {
        let Some(url) = self.redis_url.clone() else { return };
        let pod_id = self.pod_id.clone();
        let redis_ok = Arc::clone(&self.redis_ok);
        thread::spawn(move || loop {
            match redis_connect(&url) {
                Ok(mut stream) => {
                    let _ = stream.set_read_timeout(None);
                    let sub = resp_cmd(&["SUBSCRIBE", &channel]);
                    if stream.write_all(&sub).is_err() {
                        redis_ok.store(false, Ordering::Relaxed);
                        thread::sleep(Duration::from_secs(2));
                        continue;
                    }
                    redis_ok.store(true, Ordering::Relaxed);
                    println!("[HA:Redis] Subscribed to channel {}", channel);
                    let mut reader = BufReader::new(stream);
                    while let Some(items) = read_resp_array(&mut reader) {
                        if items.len() >= 3 && items[0].eq_ignore_ascii_case("message") {
                            if let Some((src_pod, payload)) = items[2].split_once('|') {
                                if src_pod != pod_id {
                                    on_event(payload);
                                }
                            }
                        }
                    }
                    redis_ok.store(false, Ordering::Relaxed);
                }
                Err(_) => {
                    redis_ok.store(false, Ordering::Relaxed);
                }
            }
            thread::sleep(Duration::from_secs(2));
        });
    }

    /// Execute a SQL statement against PostgreSQL (non-blocking helper wrapper).
    pub fn pg_exec(&self, sql: &str) -> Result<(), String> {
        let Some(ref url) = self.database_url else { return Ok(()) };
        match pg_simple_query(url, sql) {
            Ok(_) => {
                self.pg_ok.store(true, Ordering::Relaxed);
                Ok(())
            }
            Err(e) => {
                self.pg_ok.store(false, Ordering::Relaxed);
                Err(e)
            }
        }
    }

    /// Execute a SQL SELECT query and return rows of string columns.
    pub fn pg_query(&self, sql: &str) -> Result<Vec<Vec<String>>, String> {
        let Some(ref url) = self.database_url else { return Ok(Vec::new()) };
        match pg_simple_query(url, sql) {
            Ok(rows) => {
                self.pg_ok.store(true, Ordering::Relaxed);
                Ok(rows)
            }
            Err(e) => {
                self.pg_ok.store(false, Ordering::Relaxed);
                Err(e)
            }
        }
    }

    /// Fire-and-forget async SQL execution so WebSocket frames never block on DB I/O.
    pub fn pg_exec_async(&self, sql: String) {
        if self.database_url.is_none() {
            return;
        }
        let ctx = self.clone();
        thread::spawn(move || {
            let _ = ctx.pg_exec(&sql);
        });
    }
}

pub fn pg_escape(s: &str) -> String {
    s.replace('\'', "''").replace('\0', "")
}

// ---------- Minimal Zero-Dependency Redis RESP2 Client ----------
fn parse_redis_url(url: &str) -> (String, Option<String>) {
    let trimmed = url.strip_prefix("redis://").unwrap_or(url);
    let (auth, host_part) = match trimmed.rsplit_once('@') {
        Some((a, h)) => {
            let pass = a.split_once(':').map(|(_, p)| p).unwrap_or(a);
            (if pass.is_empty() { None } else { Some(pass.to_string()) }, h)
        }
        None => (None, trimmed),
    };
    let host_port = host_part.split('/').next().unwrap_or("127.0.0.1:6379");
    let addr = if host_port.contains(':') {
        host_port.to_string()
    } else {
        format!("{}:6379", host_port)
    };
    (addr, auth)
}

pub fn resp_cmd(parts: &[&str]) -> Vec<u8> {
    let mut out = format!("*{}\r\n", parts.len()).into_bytes();
    for p in parts {
        out.extend_from_slice(format!("${}\r\n{}\r\n", p.len(), p).as_bytes());
    }
    out
}

pub fn redis_connect(url: &str) -> Result<TcpStream, String> {
    let (addr, pass) = parse_redis_url(url);
    let mut s = TcpStream::connect(&addr).map_err(|e| e.to_string())?;
    let _ = s.set_nodelay(true);
    let _ = s.set_read_timeout(Some(Duration::from_secs(3)));
    let _ = s.set_write_timeout(Some(Duration::from_secs(3)));
    if let Some(pw) = pass {
        let auth = resp_cmd(&["AUTH", &pw]);
        s.write_all(&auth).map_err(|e| e.to_string())?;
        let mut buf = [0u8; 64];
        let n = s.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 || !buf[..n].starts_with(b"+OK") {
            return Err("Redis AUTH failed".into());
        }
    }
    Ok(s)
}

fn read_resp_array(r: &mut BufReader<TcpStream>) -> Option<Vec<String>> {
    let mut line = String::new();
    if r.read_line(&mut line).ok()? == 0 {
        return None;
    }
    if !line.starts_with('*') {
        return Some(Vec::new());
    }
    let count: usize = line[1..].trim().parse().ok()?;
    let mut out = Vec::with_capacity(count);
    for _ in 0..count {
        line.clear();
        if r.read_line(&mut line).ok()? == 0 {
            return None;
        }
        if line.starts_with('$') {
            let len: isize = line[1..].trim().parse().ok()?;
            if len < 0 {
                out.push(String::new());
            } else {
                let mut buf = vec![0u8; len as usize + 2];
                r.read_exact(&mut buf).ok()?;
                out.push(String::from_utf8_lossy(&buf[..len as usize]).to_string());
            }
        } else if line.starts_with(':') || line.starts_with('+') {
            out.push(line[1..].trim().to_string());
        }
    }
    Some(out)
}

// ---------- Minimal Zero-Dependency PostgreSQL v3.0 Wire Client ----------
struct PgConfig {
    addr: String,
    user: String,
    pass: String,
    db: String,
}

fn parse_pg_url(url: &str) -> PgConfig {
    let rest = url
        .strip_prefix("postgres://")
        .or_else(|| url.strip_prefix("postgresql://"))
        .unwrap_or(url);
    let (creds, host_db) = rest.split_once('@').unwrap_or(("postgres:", rest));
    let (user, pass) = creds.split_once(':').unwrap_or((creds, ""));
    let (host_port, db_q) = host_db.split_once('/').unwrap_or((host_db, "postgres"));
    let db = db_q.split('?').next().unwrap_or("postgres");
    let addr = if host_port.contains(':') {
        host_port.to_string()
    } else {
        format!("{}:5432", host_port)
    };
    PgConfig {
        addr,
        user: user.to_string(),
        pass: pass.to_string(),
        db: db.to_string(),
    }
}

fn pg_simple_query(url: &str, sql: &str) -> Result<Vec<Vec<String>>, String> {
    let cfg = parse_pg_url(url);
    let mut s = TcpStream::connect(&cfg.addr).map_err(|e| e.to_string())?;
    let _ = s.set_read_timeout(Some(Duration::from_secs(4)));
    let _ = s.set_write_timeout(Some(Duration::from_secs(4)));

    // StartupMessage (Protocol 3.0 = 196608)
    let mut params = Vec::new();
    params.extend_from_slice(&196608u32.to_be_bytes());
    params.extend_from_slice(b"user\0");
    params.extend_from_slice(cfg.user.as_bytes());
    params.push(0);
    params.extend_from_slice(b"database\0");
    params.extend_from_slice(cfg.db.as_bytes());
    params.push(0);
    params.push(0);
    let mut startup = ((params.len() + 4) as u32).to_be_bytes().to_vec();
    startup.extend_from_slice(&params);
    s.write_all(&startup).map_err(|e| e.to_string())?;

    // Handshake & Auth loop until ReadyForQuery ('Z')
    loop {
        let (tag, body) = pg_read_msg(&mut s)?;
        match tag {
            b'R' => {
                if body.len() >= 4 {
                    let auth_type = u32::from_be_bytes([body[0], body[1], body[2], body[3]]);
                    if auth_type == 3 {
                        // CleartextPassword
                        let mut p = cfg.pass.as_bytes().to_vec();
                        p.push(0);
                        pg_send_msg(&mut s, b'p', &p)?;
                    } else if auth_type == 5 && body.len() >= 8 {
                        // MD5Password
                        let salt = &body[4..8];
                        let h1 = md5_hex(format!("{}{}", cfg.pass, cfg.user).as_bytes());
                        let mut comb = h1.into_bytes();
                        comb.extend_from_slice(salt);
                        let digest = format!("md5{}\0", md5_hex(&comb));
                        pg_send_msg(&mut s, b'p', digest.as_bytes())?;
                    } else if auth_type != 0 {
                        return Err(format!("Unsupported PG auth type {}", auth_type));
                    }
                }
            }
            b'Z' => break,
            b'E' => return Err("PostgreSQL startup/auth error".into()),
            _ => {}
        }
    }

    // Simple Query ('Q')
    let mut q = sql.as_bytes().to_vec();
    q.push(0);
    pg_send_msg(&mut s, b'Q', &q)?;

    let mut rows = Vec::new();
    loop {
        let (tag, body) = pg_read_msg(&mut s)?;
        match tag {
            b'D' => {
                if body.len() >= 2 {
                    let cols = u16::from_be_bytes([body[0], body[1]]) as usize;
                    let mut idx = 2;
                    let mut row = Vec::with_capacity(cols);
                    for _ in 0..cols {
                        if idx + 4 > body.len() { break; }
                        let len = i32::from_be_bytes([body[idx], body[idx + 1], body[idx + 2], body[idx + 3]]);
                        idx += 4;
                        if len < 0 {
                            row.push(String::new());
                        } else {
                            let end = (idx + len as usize).min(body.len());
                            row.push(String::from_utf8_lossy(&body[idx..end]).to_string());
                            idx = end;
                        }
                    }
                    rows.push(row);
                }
            }
            b'Z' => break,
            b'E' => return Err(format!("PostgreSQL query error: {}", pg_error_text(&body))),
            _ => {}
        }
    }

    let _ = pg_send_msg(&mut s, b'X', &[]);
    Ok(rows)
}

/// Human-readable message ('M' field) from an ErrorResponse body.
fn pg_error_text(body: &[u8]) -> String {
    for field in body.split(|b| *b == 0) {
        if field.first() == Some(&b'M') {
            return String::from_utf8_lossy(&field[1..]).to_string();
        }
    }
    "unknown".into()
}

fn pg_send_msg(s: &mut TcpStream, tag: u8, payload: &[u8]) -> Result<(), String> {
    let mut buf = Vec::with_capacity(5 + payload.len());
    buf.push(tag);
    buf.extend_from_slice(&((payload.len() + 4) as u32).to_be_bytes());
    buf.extend_from_slice(payload);
    s.write_all(&buf).map_err(|e| e.to_string())
}

fn pg_read_msg(s: &mut TcpStream) -> Result<(u8, Vec<u8>), String> {
    let mut hdr = [0u8; 5];
    s.read_exact(&mut hdr).map_err(|e| e.to_string())?;
    let len = u32::from_be_bytes([hdr[1], hdr[2], hdr[3], hdr[4]]) as usize;
    if len < 4 || len > 16 * 1024 * 1024 {
        return Err("Invalid PG frame length".into());
    }
    let mut body = vec![0u8; len - 4];
    s.read_exact(&mut body).map_err(|e| e.to_string())?;
    Ok((hdr[0], body))
}

// Pure-Rust RFC 1321 MD5 (for PostgreSQL MD5 authentication)
fn md5_hex(input: &[u8]) -> String {
    const S: [u32; 64] = [
        7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
        5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
        4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
        6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
    ];
    const K: [u32; 64] = [
        0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501,
        0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be, 0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821,
        0xf61e2562, 0xc040b340, 0x265e5a51, 0xe9b6c7aa, 0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
        0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed, 0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a,
        0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c, 0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70,
        0x289b7ec6, 0xeaa127fa, 0xd4ef3085, 0x04881d05, 0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
        0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92, 0xffeff47d, 0x85845dd1,
        0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1, 0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391,
    ];
    let mut msg = input.to_vec();
    let bit_len = (input.len() as u64).wrapping_mul(8);
    msg.push(0x80);
    while msg.len() % 64 != 56 { msg.push(0); }
    msg.extend_from_slice(&bit_len.to_le_bytes());

    let (mut a0, mut b0, mut c0, mut d0) = (0x67452301u32, 0xefcdab89u32, 0x98badcfeu32, 0x10325476u32);
    for chunk in msg.chunks_exact(64) {
        let mut m = [0u32; 16];
        for i in 0..16 {
            m[i] = u32::from_le_bytes([chunk[i * 4], chunk[i * 4 + 1], chunk[i * 4 + 2], chunk[i * 4 + 3]]);
        }
        let (mut a, mut b, mut c, mut d) = (a0, b0, c0, d0);
        for i in 0..64 {
            let (f, g) = match i {
                0..=15 => ((b & c) | (!b & d), i),
                16..=31 => ((d & b) | (!d & c), (5 * i + 1) % 16),
                32..=47 => (b ^ c ^ d, (3 * i + 5) % 16),
                _ => (c ^ (b | !d), (7 * i) % 16),
            };
            let tmp = d;
            d = c;
            c = b;
            b = b.wrapping_add(a.wrapping_add(f).wrapping_add(K[i]).wrapping_add(m[g]).rotate_left(S[i]));
            a = tmp;
        }
        a0 = a0.wrapping_add(a); b0 = b0.wrapping_add(b); c0 = c0.wrapping_add(c); d0 = d0.wrapping_add(d);
    }
    let mut out = String::with_capacity(32);
    for word in [a0, b0, c0, d0] {
        for byte in word.to_le_bytes() {
            out.push_str(&format!("{:02x}", byte));
        }
    }
    out
}
