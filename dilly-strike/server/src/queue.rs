/* ==========================================================================
   Shared ranked state backend: queue, matchmaker leadership, player -> match
   routing, cooldowns and offense counters.
   - MemBackend: single replica / tests.
   - RedisBackend: all of the above in Redis so any number of replicas can
     accept ranked sockets. One replica at a time holds the matchmaker lease
     (SET NX PX + compare-and-renew) and hosts the matches it forms; players on
     other replicas are relayed over Redis pub/sub (see ranked.rs).
   Keys (prefix dilly:ranked:):
     queue            HASH  key -> "mmr|joined_ms|name"
     mm_lock          STR   pod id holding the matchmaker lease
     active:<key>     STR   "<match_id>|<host_pod>" (TTL, refreshed by host)
     cooldown:<key>   STR   "<until_ms>|<reason>" (PX TTL)
     offenses:<key>   INT   offense counter, 24h TTL
   ========================================================================== */

use crate::ha::{redis_connect, resp_cmd};
use crate::matchmaker::QueueEntry;
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::TcpStream;
use std::sync::Mutex;

pub trait QueueBackend: Send + Sync {
    fn enqueue(&self, e: &QueueEntry) -> Result<(), String>;
    /// Remove; returns true if the entry existed (lets the matchmaker detect races).
    fn remove(&self, key: &str) -> Result<bool, String>;
    fn contains(&self, key: &str) -> Result<bool, String>;
    fn all(&self) -> Result<Vec<QueueEntry>, String>;
    /// Acquire or renew the matchmaker lease. True if `pod` is the leader.
    fn lead(&self, pod: &str, ttl_ms: u64) -> Result<bool, String>;
    fn set_active(&self, key: &str, match_id: &str, pod: &str, ttl_ms: u64) -> Result<(), String>;
    fn get_active(&self, key: &str) -> Result<Option<(String, String)>, String>;
    fn clear_active(&self, key: &str, match_id: &str) -> Result<(), String>;
    fn set_cooldown(&self, key: &str, until_ms: u64, reason: &str, now_ms: u64) -> Result<(), String>;
    fn get_cooldown(&self, key: &str, now_ms: u64) -> Result<Option<(u64, String)>, String>;
    /// Increment the rolling 24h offense counter and return the new count.
    fn bump_offense(&self, key: &str) -> Result<u32, String>;
    /// Heartbeat for queued players held by this replica.
    fn touch(&self, _keys: &[String], _now_ms: u64) -> Result<(), String> {
        Ok(())
    }
    /// Drop queue entries whose owning replica stopped heart-beating (crashed pod).
    fn purge_stale(&self, _now_ms: u64, _max_age_ms: u64) -> Result<Vec<String>, String> {
        Ok(Vec::new())
    }
}

fn enc_entry(e: &QueueEntry) -> String {
    format!("{:.1}|{}|{}", e.mmr, e.joined_ms, e.name)
}
fn dec_entry(key: &str, v: &str) -> Option<QueueEntry> {
    let mut it = v.splitn(3, '|');
    Some(QueueEntry { key: key.to_string(), mmr: it.next()?.parse().ok()?, joined_ms: it.next()?.parse().ok()?, name: it.next()?.to_string() })
}

/* ---------------- in-memory ---------------- */

#[derive(Default)]
struct Mem {
    queue: HashMap<String, QueueEntry>,
    active: HashMap<String, (String, String)>,
    cooldown: HashMap<String, (u64, String)>,
    offenses: HashMap<String, u32>,
}

#[derive(Default)]
pub struct MemBackend {
    m: Mutex<Mem>,
}

impl QueueBackend for MemBackend {
    fn enqueue(&self, e: &QueueEntry) -> Result<(), String> {
        self.m.lock().unwrap().queue.insert(e.key.clone(), e.clone());
        Ok(())
    }
    fn remove(&self, key: &str) -> Result<bool, String> {
        Ok(self.m.lock().unwrap().queue.remove(key).is_some())
    }
    fn contains(&self, key: &str) -> Result<bool, String> {
        Ok(self.m.lock().unwrap().queue.contains_key(key))
    }
    fn all(&self) -> Result<Vec<QueueEntry>, String> {
        Ok(self.m.lock().unwrap().queue.values().cloned().collect())
    }
    fn lead(&self, _pod: &str, _ttl: u64) -> Result<bool, String> {
        Ok(true)
    }
    fn set_active(&self, key: &str, mid: &str, pod: &str, _ttl: u64) -> Result<(), String> {
        self.m.lock().unwrap().active.insert(key.into(), (mid.into(), pod.into()));
        Ok(())
    }
    fn get_active(&self, key: &str) -> Result<Option<(String, String)>, String> {
        Ok(self.m.lock().unwrap().active.get(key).cloned())
    }
    fn clear_active(&self, key: &str, mid: &str) -> Result<(), String> {
        let mut g = self.m.lock().unwrap();
        if g.active.get(key).map(|a| a.0 == mid).unwrap_or(false) {
            g.active.remove(key);
        }
        Ok(())
    }
    fn set_cooldown(&self, key: &str, until: u64, reason: &str, _now: u64) -> Result<(), String> {
        self.m.lock().unwrap().cooldown.insert(key.into(), (until, reason.into()));
        Ok(())
    }
    fn get_cooldown(&self, key: &str, now: u64) -> Result<Option<(u64, String)>, String> {
        Ok(self.m.lock().unwrap().cooldown.get(key).filter(|c| c.0 > now).cloned())
    }
    fn bump_offense(&self, key: &str) -> Result<u32, String> {
        let mut g = self.m.lock().unwrap();
        let c = g.offenses.entry(key.into()).or_insert(0);
        *c += 1;
        Ok(*c)
    }
}

/* ---------------- Redis ---------------- */

#[derive(Debug, Clone, PartialEq)]
pub enum Resp {
    Nil,
    Int(i64),
    Str(String),
    Arr(Vec<Resp>),
}

impl Resp {
    fn as_str(&self) -> Option<&str> {
        match self {
            Resp::Str(s) => Some(s),
            _ => None,
        }
    }
    fn as_int(&self) -> i64 {
        match self {
            Resp::Int(i) => *i,
            Resp::Str(s) => s.parse().unwrap_or(0),
            _ => 0,
        }
    }
}

fn read_resp(r: &mut BufReader<TcpStream>, depth: u32) -> Result<Resp, String> {
    if depth > 4 {
        return Err("resp nesting".into());
    }
    let mut line = String::new();
    if r.read_line(&mut line).map_err(|e| e.to_string())? == 0 {
        return Err("redis closed".into());
    }
    let body = line.trim_end_matches(['\r', '\n']);
    let (t, rest) = body.split_at(1.min(body.len()));
    match t {
        "+" => Ok(Resp::Str(rest.to_string())),
        "-" => Err(format!("redis error: {}", rest)),
        ":" => Ok(Resp::Int(rest.parse().unwrap_or(0))),
        "$" => {
            let n: i64 = rest.parse().map_err(|_| "bad bulk len")?;
            if n < 0 {
                return Ok(Resp::Nil);
            }
            if n > 1 << 20 {
                return Err("bulk too large".into());
            }
            let mut buf = vec![0u8; n as usize + 2];
            r.read_exact(&mut buf).map_err(|e| e.to_string())?;
            Ok(Resp::Str(String::from_utf8_lossy(&buf[..n as usize]).to_string()))
        }
        "*" => {
            let n: i64 = rest.parse().map_err(|_| "bad array len")?;
            if n < 0 {
                return Ok(Resp::Nil);
            }
            let mut v = Vec::with_capacity(n.min(100_000) as usize);
            for _ in 0..n {
                v.push(read_resp(r, depth + 1)?);
            }
            Ok(Resp::Arr(v))
        }
        _ => Err("bad resp type".into()),
    }
}

pub struct RedisBackend {
    url: String,
    conn: Mutex<Option<BufReader<TcpStream>>>,
}

const P: &str = "dilly:ranked:";
const OFFENSE_TTL_SECS: &str = "86400";

impl RedisBackend {
    pub fn new(url: &str) -> Self {
        RedisBackend { url: url.to_string(), conn: Mutex::new(None) }
    }

    pub fn cmd(&self, parts: &[&str]) -> Result<Resp, String> {
        let mut g = self.conn.lock().unwrap();
        for attempt in 0..2 {
            if g.is_none() {
                let s = redis_connect(&self.url)?;
                *g = Some(BufReader::new(s));
            }
            let r = g.as_mut().unwrap();
            let res = r.get_mut().write_all(&resp_cmd(parts)).map_err(|e| e.to_string()).and_then(|_| read_resp(r, 0));
            match res {
                Ok(v) => return Ok(v),
                Err(e) if e.starts_with("redis error") => return Err(e),
                Err(e) => {
                    *g = None;
                    if attempt == 1 {
                        return Err(e);
                    }
                }
            }
        }
        Err("unreachable".into())
    }
}

impl QueueBackend for RedisBackend {
    fn enqueue(&self, e: &QueueEntry) -> Result<(), String> {
        self.cmd(&["HSET", &format!("{}queue", P), &e.key, &enc_entry(e)]).map(|_| ())
    }
    fn remove(&self, key: &str) -> Result<bool, String> {
        Ok(self.cmd(&["HDEL", &format!("{}queue", P), key])?.as_int() > 0)
    }
    fn contains(&self, key: &str) -> Result<bool, String> {
        Ok(self.cmd(&["HEXISTS", &format!("{}queue", P), key])?.as_int() > 0)
    }
    fn all(&self) -> Result<Vec<QueueEntry>, String> {
        let r = self.cmd(&["HGETALL", &format!("{}queue", P)])?;
        let mut out = Vec::new();
        if let Resp::Arr(items) = r {
            for kv in items.chunks(2) {
                if let [Resp::Str(k), Resp::Str(v)] = kv {
                    if let Some(e) = dec_entry(k, v) {
                        out.push(e);
                    }
                }
            }
        }
        Ok(out)
    }
    fn lead(&self, pod: &str, ttl_ms: u64) -> Result<bool, String> {
        let k = format!("{}mm_lock", P);
        let ttl = ttl_ms.to_string();
        if self.cmd(&["SET", &k, pod, "NX", "PX", &ttl])?.as_str() == Some("OK") {
            return Ok(true);
        }
        // compare-and-renew so a stale leader can't extend someone else's lease
        let lua = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('pexpire', KEYS[1], ARGV[2]) else return 0 end";
        Ok(self.cmd(&["EVAL", lua, "1", &k, pod, &ttl])?.as_int() == 1)
    }
    fn set_active(&self, key: &str, mid: &str, pod: &str, ttl_ms: u64) -> Result<(), String> {
        self.cmd(&["SET", &format!("{}active:{}", P, key), &format!("{}|{}", mid, pod), "PX", &ttl_ms.to_string()]).map(|_| ())
    }
    fn get_active(&self, key: &str) -> Result<Option<(String, String)>, String> {
        let r = self.cmd(&["GET", &format!("{}active:{}", P, key)])?;
        Ok(r.as_str().and_then(|s| s.split_once('|')).map(|(a, b)| (a.to_string(), b.to_string())))
    }
    fn clear_active(&self, key: &str, mid: &str) -> Result<(), String> {
        let lua = "local v = redis.call('get', KEYS[1]) if v and string.sub(v, 1, string.len(ARGV[1]) + 1) == ARGV[1] .. '|' then return redis.call('del', KEYS[1]) else return 0 end";
        self.cmd(&["EVAL", lua, "1", &format!("{}active:{}", P, key), mid]).map(|_| ())
    }
    fn set_cooldown(&self, key: &str, until: u64, reason: &str, now: u64) -> Result<(), String> {
        let ttl = until.saturating_sub(now).max(1).to_string();
        self.cmd(&["SET", &format!("{}cooldown:{}", P, key), &format!("{}|{}", until, reason), "PX", &ttl]).map(|_| ())
    }
    fn get_cooldown(&self, key: &str, now: u64) -> Result<Option<(u64, String)>, String> {
        let r = self.cmd(&["GET", &format!("{}cooldown:{}", P, key)])?;
        Ok(r
            .as_str()
            .and_then(|s| s.split_once('|'))
            .and_then(|(u, why)| u.parse::<u64>().ok().map(|u| (u, why.to_string())))
            .filter(|c| c.0 > now))
    }
    fn touch(&self, keys: &[String], now: u64) -> Result<(), String> {
        if keys.is_empty() {
            return Ok(());
        }
        let k = format!("{}queue_seen", P);
        let ts = now.to_string();
        let mut parts: Vec<&str> = vec!["HSET", &k];
        for key in keys {
            parts.push(key);
            parts.push(&ts);
        }
        self.cmd(&parts).map(|_| ())
    }
    fn purge_stale(&self, now: u64, max_age: u64) -> Result<Vec<String>, String> {
        let queued = self.all()?;
        let seen_key = format!("{}queue_seen", P);
        let seen = self.cmd(&["HGETALL", &seen_key])?;
        let mut seen_map = HashMap::new();
        if let Resp::Arr(items) = seen {
            for kv in items.chunks(2) {
                if let [Resp::Str(k), Resp::Str(v)] = kv {
                    seen_map.insert(k.clone(), v.parse::<u64>().unwrap_or(0));
                }
            }
        }
        let mut purged = Vec::new();
        for e in queued {
            let last = seen_map.get(&e.key).copied().unwrap_or(e.joined_ms);
            if now.saturating_sub(last) > max_age {
                self.cmd(&["HDEL", &format!("{}queue", P), &e.key])?;
                purged.push(e.key.clone());
            }
            seen_map.remove(&e.key);
        }
        // forget heartbeats of players no longer queued
        for k in seen_map.keys() {
            self.cmd(&["HDEL", &seen_key, k])?;
        }
        Ok(purged)
    }
    fn bump_offense(&self, key: &str) -> Result<u32, String> {
        let k = format!("{}offenses:{}", P, key);
        let n = self.cmd(&["INCR", &k])?.as_int();
        if n == 1 {
            self.cmd(&["EXPIRE", &k, OFFENSE_TTL_SECS])?;
        }
        Ok(n.max(0) as u32)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn entry_codec() {
        let e = QueueEntry { key: "k".into(), name: "Na|me".into(), mmr: 1523.4, joined_ms: 99 };
        assert_eq!(dec_entry("k", &enc_entry(&e)).unwrap(), e);
    }

    fn exercise(b: &dyn QueueBackend) {
        let e = QueueEntry { key: "unit_a".into(), name: "A".into(), mmr: 1500.0, joined_ms: 5 };
        let _ = b.remove("unit_a");
        b.enqueue(&e).unwrap();
        assert!(b.contains("unit_a").unwrap());
        assert!(b.all().unwrap().iter().any(|x| x == &e));
        assert!(b.remove("unit_a").unwrap());
        assert!(!b.remove("unit_a").unwrap());
        b.set_active("unit_a", "m1", "pod1", 10_000).unwrap();
        assert_eq!(b.get_active("unit_a").unwrap(), Some(("m1".into(), "pod1".into())));
        b.clear_active("unit_a", "other").unwrap();
        assert!(b.get_active("unit_a").unwrap().is_some(), "only the owning match clears");
        b.clear_active("unit_a", "m1").unwrap();
        assert!(b.get_active("unit_a").unwrap().is_none());
        let now = crate::util::now_ms();
        b.set_cooldown("unit_a", now + 60_000, "declined", now).unwrap();
        assert_eq!(b.get_cooldown("unit_a", now).unwrap().unwrap().1, "declined");
        assert!(b.get_cooldown("unit_a", now + 61_000).unwrap().is_none());
        let n1 = b.bump_offense("unit_a").unwrap();
        assert_eq!(b.bump_offense("unit_a").unwrap(), n1 + 1);
    }

    #[test]
    fn mem_backend() {
        exercise(&MemBackend::default());
    }

    /// Runs against a real Redis when TEST_REDIS_URL is set (skipped otherwise).
    #[test]
    fn redis_backend() {
        let Ok(url) = std::env::var("TEST_REDIS_URL") else {
            eprintln!("TEST_REDIS_URL not set; skipping Redis backend test");
            return;
        };
        let b = RedisBackend::new(&url);
        let _ = b.cmd(&["DEL", "dilly:ranked:offenses:unit_a", "dilly:ranked:mm_lock"]);
        exercise(&b);
        assert!(b.lead("podA", 2000).unwrap());
        assert!(b.lead("podA", 2000).unwrap(), "renew");
        assert!(!b.lead("podB", 2000).unwrap(), "lease is exclusive");
        let _ = b.cmd(&["DEL", "dilly:ranked:mm_lock"]);
    }
}
