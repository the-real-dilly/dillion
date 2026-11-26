/* ==========================================================================
   DILLY STRIKE RANKED — network layer
   ws(s)://<host>/strike/ranked   (any path containing "/ranked" on the strike server)
   HTTP GET /ranked/status | /ranked/leaderboard?limit=N | /ranked/profile/<callsign>

   Flow: hello(token) -> queue -> match_found -> accept -> agent_select -> rounds -> match_end
   - Identity comes only from a hub session token verified with DILLY_SESSION_SECRET.
   - Queue/leases/routing/cooldowns live in a QueueBackend (Redis when REDIS_URL is
     set, so replicas are interchangeable). The replica holding the matchmaker lease
     hosts the matches it forms; other replicas relay their players' messages to it
     over Redis pub/sub (channel dilly:strike:ranked:bus).
   - Finished matches are rated (Glicko-2 + RR), persisted (PostgreSQL when
     DATABASE_URL is set) and announced on dilly:strike:ranked.
   ========================================================================== */

use crate::auth::{valid_callsign, verify_token, Claims};
use crate::config::RankedConfig;
use crate::game::{Match, MatchSummary, Out, Team};
use crate::ha::HaContext;
use crate::matchmaker::{cooldown_ms, form_lobbies, Lobby, Offense, QueueEntry, WindowRules};
use crate::queue::{MemBackend, QueueBackend, RedisBackend};
use crate::rating::{apply_dodge, apply_result, composite, rank_of, Outcome, PlayerRank, RankChange, RrRules};
use crate::store::{MatchPlayerRow, MatchRow, MemStore, PgStore, PlayerRecord, RankedStore};
use crate::util::{compute_ws_accept, decode_frame, encode_frame, json_esc, now_ms, Frame, Json};
use std::collections::{HashMap, HashSet};
use std::io::{Read, Write};
use std::net::{IpAddr, Shutdown, TcpStream};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

pub const BUS_CHANNEL: &str = "dilly:strike:ranked:bus";
pub const EVENTS_CHANNEL: &str = "dilly:strike:ranked";
const MAX_FRAME: usize = 4096;
const ACTIVE_TTL_MS: u64 = 120_000;
const LEASE_MS: u64 = 4_000;
const QUEUE_STALE_MS: u64 = 15_000;

struct Conn {
    id: u64,
    stream: TcpStream,
}

#[derive(Default)]
struct Inner {
    conns: HashMap<String, Conn>,
    matches: HashMap<String, Match>,
    /// Local players currently queued (key -> joined_ms) for status pushes / heartbeats.
    queued: HashMap<String, u64>,
    ip_hits: HashMap<IpAddr, Vec<u64>>,
}

pub struct Ranked {
    pub cfg: RankedConfig,
    pub ha: HaContext,
    pub queue: Arc<dyn QueueBackend>,
    pub store: Arc<dyn RankedStore>,
    pub rules: RrRules,
    redis_bus: bool,
    trust_proxy: bool,
    inner: Mutex<Inner>,
    seq: AtomicU64,
}

fn send_ws(stream: &mut TcpStream, json: &str) -> bool {
    stream.write_all(&encode_frame(0x1, json.as_bytes())).is_ok()
}

fn err_json(code: &str, msg: &str) -> String {
    format!("{{\"type\":\"error\",\"code\":\"{}\",\"msg\":\"{}\"}}", code, json_esc(msg))
}

pub fn rank_json(r: &PlayerRank) -> String {
    let info = rank_of(r.rr);
    format!(
        "{{\"rr\":{},\"tier\":\"{}\",\"tier_index\":{},\"division\":{},\"label\":\"{}\",\"rr_in_div\":{},\"placements\":{},\"placements_total\":{},\"placed\":{}}}",
        r.rr,
        info.tier,
        info.tier_index,
        info.division,
        if r.placed() { info.label() } else { "Unranked".into() },
        info.rr_in_div,
        r.placements.min(crate::rating::PLACEMENT_MATCHES),
        crate::rating::PLACEMENT_MATCHES,
        r.placed()
    )
}

pub fn player_json(p: &PlayerRecord) -> String {
    format!(
        "{{\"name\":\"{}\",\"rank\":{},\"wins\":{},\"losses\":{},\"draws\":{},\"abandons\":{},\"peak_rr\":{},\"peak_label\":\"{}\"}}",
        json_esc(&p.name),
        rank_json(&p.rank),
        p.wins,
        p.losses,
        p.draws,
        p.abandons,
        p.peak_rr,
        if p.rank.placed() { rank_of(p.peak_rr).label() } else { "Unranked".into() }
    )
}

/// Pure rating step for a finished match (unit tested below).
pub fn rate_match(
    s: &MatchSummary,
    records: &HashMap<String, PlayerRecord>,
    rules: &RrRules,
) -> (Vec<MatchPlayerRow>, Vec<PlayerRecord>, HashMap<String, RankChange>) {
    let team_glicko = |t: Team| {
        composite(&s.players.iter().filter(|p| p.team == t).filter_map(|p| records.get(&p.key)).map(|r| r.rank.glicko).collect::<Vec<_>>())
    };
    let comp = [team_glicko(Team::A), team_glicko(Team::B)];
    let mut rows = Vec::new();
    let mut updated = Vec::new();
    let mut changes = HashMap::new();
    for p in &s.players {
        let Some(rec) = records.get(&p.key) else { continue };
        let outcome = match s.winner {
            None => Outcome::Draw,
            Some(w) if w == p.team => Outcome::Win,
            _ => Outcome::Loss,
        };
        let mate_left = s.players.iter().any(|q| q.team == p.team && q.key != p.key && q.abandoned);
        let ch = apply_result(&rec.rank, comp[p.team.other().idx()], outcome, p.abandoned, mate_left, rules);
        let eff = if p.abandoned { Outcome::Loss } else { outcome };
        let mut nr = rec.clone();
        nr.name = p.name.clone();
        nr.rank = ch.after.clone();
        match eff {
            Outcome::Win => nr.wins += 1,
            Outcome::Loss => nr.losses += 1,
            Outcome::Draw => nr.draws += 1,
        }
        if p.abandoned {
            nr.abandons += 1;
        }
        if nr.rank.placed() {
            nr.peak_rr = nr.peak_rr.max(nr.rank.rr);
        }
        rows.push(MatchPlayerRow {
            key: p.key.clone(),
            name: p.name.clone(),
            team: if p.team == Team::A { 'a' } else { 'b' },
            agent: p.agent.clone(),
            result: match eff {
                Outcome::Win => "win",
                Outcome::Loss => "loss",
                Outcome::Draw => "draw",
            },
            abandoned: p.abandoned,
            kills: p.kills,
            deaths: p.deaths,
            headshots: p.headshots,
            damage: p.damage,
            mvps: p.mvps,
            rating_before: rec.rank.glicko.rating,
            rating_after: ch.after.glicko.rating,
            rr_before: rec.rank.rr,
            rr_after: ch.after.rr,
            rr_delta: ch.rr_delta,
            placements_after: ch.after.placements,
        });
        updated.push(nr);
        changes.insert(p.key.clone(), ch);
    }
    (rows, updated, changes)
}

impl Ranked {
    pub fn from_env(ha: HaContext) -> Arc<Ranked> {
        let cfg = RankedConfig::from_env();
        let queue: Arc<dyn QueueBackend> = match &ha.redis_url {
            Some(u) => Arc::new(RedisBackend::new(u)),
            None => Arc::new(MemBackend::default()),
        };
        let store: Arc<dyn RankedStore> = if ha.database_url.is_some() { Arc::new(PgStore::new(ha.clone())) } else { Arc::new(MemStore::default()) };
        let r = Ranked::new(cfg, ha, queue, store);
        if r.cfg.secret.is_none() {
            println!("[Ranked] DISABLED: set DILLY_SESSION_SECRET (>= 32 chars, same value as the hub) to enable ranked play");
        } else {
            println!(
                "[Ranked] enabled: {}v{} first-to-{} overtime={} store={} queue={}",
                r.cfg.team_size,
                r.cfg.team_size,
                r.cfg.rounds_to_win,
                r.cfg.overtime,
                r.store.kind(),
                if r.redis_bus { "redis (multi-replica)" } else { "memory (single replica only)" }
            );
            if r.store.kind() == "memory" {
                println!("[Ranked] WARNING: no DATABASE_URL — ratings are kept in memory and lost on restart");
            }
        }
        if let Err(e) = r.store.migrate() {
            println!("[Ranked] migration failed: {}", e);
        }
        r.start();
        r
    }

    pub fn new(cfg: RankedConfig, ha: HaContext, queue: Arc<dyn QueueBackend>, store: Arc<dyn RankedStore>) -> Arc<Ranked> {
        let rules = RrRules { leaver_penalty: cfg.leaver_rr, ..RrRules::default() };
        let redis_bus = ha.redis_url.is_some();
        Arc::new(Ranked {
            cfg,
            redis_bus,
            trust_proxy: std::env::var("RANKED_TRUST_PROXY").map(|v| v == "1").unwrap_or(false),
            ha,
            queue,
            store,
            rules,
            inner: Mutex::new(Inner::default()),
            seq: AtomicU64::new(1),
        })
    }

    pub fn enabled(&self) -> bool {
        self.cfg.secret.is_some()
    }

    /// Spawns the Redis bus subscriber and the 10 Hz ticker.
    pub fn start(self: &Arc<Self>) {
        if self.redis_bus {
            let me = Arc::clone(self);
            self.ha.spawn_subscriber(BUS_CHANNEL.to_string(), move |payload| me.on_bus(payload));
        }
        let me = Arc::clone(self);
        thread::spawn(move || {
            let mut last_mm = 0u64;
            let mut last_refresh = 0u64;
            loop {
                thread::sleep(Duration::from_millis(100));
                let now = now_ms();
                me.tick_matches(now);
                if now - last_mm >= 1000 {
                    last_mm = now;
                    me.queue_heartbeat(now);
                    me.matchmake(now);
                }
                if now - last_refresh >= ACTIVE_TTL_MS / 4 {
                    last_refresh = now;
                    me.refresh_active();
                }
            }
        });
    }

    /* ---------------- delivery ---------------- */

    fn deliver_local(&self, key: &str, json: &str) -> bool {
        let mut g = self.inner.lock().unwrap();
        if let Some(c) = g.conns.get_mut(key) {
            if !send_ws(&mut c.stream, json) {
                let _ = c.stream.shutdown(Shutdown::Both);
            }
            return true;
        }
        false
    }

    fn deliver(&self, key: &str, json: &str) {
        if !self.deliver_local(key, json) && self.redis_bus {
            self.ha.publish(BUS_CHANNEL, &format!("{{\"k\":\"to\",\"u\":\"{}\",\"m\":{}}}", json_esc(key), json));
        }
    }

    fn on_bus(self: &Arc<Self>, payload: &str) {
        let Some(v) = Json::parse(payload) else { return };
        let k = v.str_of("k").unwrap_or("");
        let u = v.str_of("u").unwrap_or("").to_string();
        match k {
            "to" => {
                if let Some(m) = v.get("m") {
                    self.deliver_local(&u, &m.to_json());
                }
            }
            "in" => {
                let mid = v.str_of("mid").unwrap_or("").to_string();
                if let Some(m) = v.get("m") {
                    self.match_input(&mid, &u, m);
                }
            }
            "conn" => {
                let mid = v.str_of("mid").unwrap_or("").to_string();
                self.match_conn(&mid, &u, v.bool_of("up").unwrap_or(false));
            }
            "kick" => {
                let pod = v.str_of("pod").unwrap_or("");
                let cid = v.num_of("cid").unwrap_or(0.0) as u64;
                let mut g = self.inner.lock().unwrap();
                let drop_it = g.conns.get(&u).map(|c| !(pod == self.ha.pod_id && c.id == cid)).unwrap_or(false);
                if drop_it {
                    if let Some(mut c) = g.conns.remove(&u) {
                        send_ws(&mut c.stream, &err_json("replaced", "Signed in from another window"));
                        let _ = c.stream.shutdown(Shutdown::Both);
                    }
                }
            }
            _ => {}
        }
    }

    /* ---------------- matches hosted here ---------------- */

    fn match_input(self: &Arc<Self>, mid: &str, key: &str, msg: &Json) {
        let (outs, keys) = {
            let mut g = self.inner.lock().unwrap();
            let Some(m) = g.matches.get_mut(mid) else { return };
            (m.handle(key, msg, now_ms()), m.keys())
        };
        self.dispatch(mid, &keys, outs);
    }

    fn match_conn(self: &Arc<Self>, mid: &str, key: &str, up: bool) {
        let (outs, keys) = {
            let mut g = self.inner.lock().unwrap();
            let Some(m) = g.matches.get_mut(mid) else { return };
            (m.set_connected(key, up, now_ms()), m.keys())
        };
        self.dispatch(mid, &keys, outs);
    }

    /// Route a player's in-match message/connection change to the hosting replica.
    fn route(self: &Arc<Self>, key: &str, msg: Option<&Json>, conn_up: Option<bool>) -> bool {
        let Ok(Some((mid, pod))) = self.queue.get_active(key) else { return false };
        if pod == self.ha.pod_id || !self.redis_bus {
            if let Some(m) = msg {
                self.match_input(&mid, key, m);
            }
            if let Some(up) = conn_up {
                self.match_conn(&mid, key, up);
            }
        } else {
            if let Some(m) = msg {
                self.ha.publish(BUS_CHANNEL, &format!("{{\"k\":\"in\",\"mid\":\"{}\",\"u\":\"{}\",\"m\":{}}}", json_esc(&mid), json_esc(key), m.to_json()));
            }
            if let Some(up) = conn_up {
                self.ha.publish(BUS_CHANNEL, &format!("{{\"k\":\"conn\",\"mid\":\"{}\",\"u\":\"{}\",\"up\":{}}}", json_esc(&mid), json_esc(key), up));
            }
        }
        true
    }

    fn tick_matches(self: &Arc<Self>, now: u64) {
        let batches: Vec<(String, Vec<String>, Vec<Out>)> = {
            let mut g = self.inner.lock().unwrap();
            g.matches
                .iter_mut()
                .map(|(id, m)| (id.clone(), m.keys(), m.tick(now)))
                .filter(|(_, _, o)| !o.is_empty())
                .collect()
        };
        for (id, keys, outs) in batches {
            self.dispatch(&id, &keys, outs);
        }
    }

    fn refresh_active(&self) {
        let pairs: Vec<(String, String)> = {
            let g = self.inner.lock().unwrap();
            g.matches.iter().flat_map(|(id, m)| m.players.iter().filter(|p| !p.abandoned).map(move |p| (p.key.clone(), id.clone()))).collect()
        };
        for (k, id) in pairs {
            let _ = self.queue.set_active(&k, &id, &self.ha.pod_id, ACTIVE_TTL_MS);
        }
    }

    fn offend(&self, key: &str, off: Offense) -> u64 {
        let now = now_ms();
        let nth = self.queue.bump_offense(key).unwrap_or(1);
        let cd = cooldown_ms(off, nth, self.cfg.decline_cooldown_ms, self.cfg.leaver_cooldown_ms);
        let reason = match off {
            Offense::Decline => "declined",
            Offense::Dodge => "dodged",
            Offense::Abandon => "abandoned",
        };
        let _ = self.queue.set_cooldown(key, now + cd, reason, now);
        cd
    }

    fn dispatch(self: &Arc<Self>, mid: &str, keys: &[String], outs: Vec<Out>) {
        for o in outs {
            match o {
                Out::To(k, m) => self.deliver(&k, &m),
                Out::All(m) => {
                    for k in keys {
                        self.deliver(k, &m);
                    }
                }
                Out::Abandoned(k) => {
                    let cd = self.offend(&k, Offense::Abandon);
                    let _ = self.queue.clear_active(&k, mid);
                    self.deliver(&k, &format!("{{\"type\":\"abandoned\",\"cooldown_ms\":{},\"msg\":\"You left a ranked match: it counts as a loss with a leaver penalty.\"}}", cd));
                }
                Out::Cancelled(ci) => {
                    self.inner.lock().unwrap().matches.remove(mid);
                    for k in keys {
                        let _ = self.queue.clear_active(k, mid);
                    }
                    for (k, off) in &ci.offenders {
                        let cd = self.offend(k, *off);
                        if *off == Offense::Dodge {
                            if let Ok(mut rec) = self.store.load(k, k) {
                                rec.rank = apply_dodge(&rec.rank, self.cfg.dodge_rr);
                                let _ = self.store.save_player(&rec);
                            }
                        }
                        self.deliver(k, &format!("{{\"type\":\"match_cancelled\",\"reason\":\"{}\",\"requeued\":false,\"penalized\":true,\"cooldown_ms\":{}}}", ci.reason, cd));
                    }
                    for (k, name, mmr, joined) in &ci.requeue {
                        let _ = self.queue.enqueue(&QueueEntry { key: k.clone(), name: name.clone(), mmr: *mmr, joined_ms: *joined });
                        self.inner.lock().unwrap().queued.insert(k.clone(), *joined);
                        self.deliver(k, &format!("{{\"type\":\"match_cancelled\",\"reason\":\"{}\",\"requeued\":true,\"penalized\":false}}", ci.reason));
                    }
                }
                Out::Ended(summary) => {
                    self.inner.lock().unwrap().matches.remove(mid);
                    let me = Arc::clone(self);
                    // rating + DB I/O off the ticker thread
                    thread::spawn(move || me.finish_match(summary));
                }
            }
        }
    }

    fn finish_match(&self, s: MatchSummary) {
        let mut records = HashMap::new();
        for p in &s.players {
            match self.store.load(&p.key, &p.name) {
                Ok(r) => {
                    records.insert(p.key.clone(), r);
                }
                Err(e) => println!("[Ranked] load {} failed: {}", p.key, e),
            }
        }
        let (rows, updated, changes) = rate_match(&s, &records, &self.rules);
        let row = MatchRow {
            id: s.id.clone(),
            map: s.map.to_string(),
            team_size: s.team_size,
            score: s.score,
            winner: s.winner.map(|w| if w == Team::A { 'a' } else { 'b' }),
            rounds: s.rounds,
            overtime: s.overtime,
            forfeit: s.forfeit,
            pod: self.ha.pod_id.clone(),
            started_ms: s.started_ms,
            ended_ms: s.ended_ms,
        };
        let saved = self.store.record_match(&row, &rows, &updated);
        if let Err(e) = &saved {
            println!("[Ranked] FAILED to persist match {}: {}", s.id, e);
        }
        let scoreboard = s
            .players
            .iter()
            .map(|p| {
                format!(
                    "{{\"id\":\"{}\",\"name\":\"{}\",\"team\":\"{}\",\"agent\":\"{}\",\"kills\":{},\"deaths\":{},\"headshots\":{},\"damage\":{},\"mvps\":{},\"abandoned\":{}}}",
                    json_esc(&p.key),
                    json_esc(&p.name),
                    p.team.code(),
                    json_esc(&p.agent),
                    p.kills,
                    p.deaths,
                    p.headshots,
                    p.damage,
                    p.mvps,
                    p.abandoned
                )
            })
            .collect::<Vec<_>>()
            .join(",");
        for p in &s.players {
            let _ = self.queue.clear_active(&p.key, &s.id);
            let Some(ch) = changes.get(&p.key) else { continue };
            let result = rows.iter().find(|r| r.key == p.key).map(|r| r.result).unwrap_or("loss");
            let msg = format!(
                "{{\"type\":\"match_end\",\"match_id\":\"{}\",\"map\":\"{}\",\"result\":\"{}\",\"your_team\":\"{}\",\"score\":[{},{}],\"rounds\":{},\"overtime\":{},\"forfeit\":{},\"abandoned\":{},\
                 \"rank_before\":{},\"rank_after\":{},\"rr_delta\":{},\"mmr_delta\":{:.1},\"promoted\":{},\"demoted\":{},\"revealed\":{},\"saved\":{},\"players\":[{}]}}",
                json_esc(&s.id),
                s.map,
                result,
                p.team.code(),
                s.score[0],
                s.score[1],
                s.rounds,
                s.overtime,
                s.forfeit,
                p.abandoned,
                rank_json(&ch.before),
                rank_json(&ch.after),
                ch.rr_delta,
                ch.after.glicko.rating - ch.before.glicko.rating,
                ch.promoted,
                ch.demoted,
                ch.revealed,
                saved.is_ok(),
                scoreboard
            );
            self.deliver(&p.key, &msg);
        }
        let ev = format!(
            "{{\"type\":\"ranked_match_end\",\"match_id\":\"{}\",\"map\":\"{}\",\"score\":[{},{}],\"winner\":{},\"team_size\":{},\"players\":[{}]}}",
            json_esc(&s.id),
            s.map,
            s.score[0],
            s.score[1],
            s.winner.map(|w| format!("\"{}\"", w.code())).unwrap_or_else(|| "null".into()),
            s.team_size,
            rows.iter()
                .map(|r| format!("{{\"name\":\"{}\",\"team\":\"{}\",\"result\":\"{}\",\"rr_delta\":{}}}", json_esc(&r.name), r.team, r.result, r.rr_delta))
                .collect::<Vec<_>>()
                .join(",")
        );
        self.ha.publish(EVENTS_CHANNEL, &ev);
        println!("[Ranked] match {} ended {}-{} (saved={})", s.id, s.score[0], s.score[1], saved.is_ok());
    }

    /* ---------------- queue + matchmaker ---------------- */

    fn queue_heartbeat(&self, now: u64) {
        let local: Vec<(String, u64)> = self.inner.lock().unwrap().queued.iter().map(|(k, v)| (k.clone(), *v)).collect();
        if local.is_empty() {
            return;
        }
        let keys: Vec<String> = local.iter().map(|(k, _)| k.clone()).collect();
        let _ = self.queue.touch(&keys, now);
        let all = self.queue.all().unwrap_or_default();
        let present: HashSet<&str> = all.iter().map(|e| e.key.as_str()).collect();
        let rules = self.window_rules();
        for (k, joined) in local {
            if !present.contains(k.as_str()) {
                self.inner.lock().unwrap().queued.remove(&k);
                continue;
            }
            let msg = format!(
                "{{\"type\":\"queue_status\",\"queued\":true,\"elapsed_ms\":{},\"window\":{:.0},\"in_queue\":{},\"team_size\":{}}}",
                now.saturating_sub(joined),
                crate::matchmaker::window(&rules, joined, now),
                all.len(),
                self.cfg.team_size
            );
            self.deliver_local(&k, &msg);
        }
    }

    fn window_rules(&self) -> WindowRules {
        WindowRules { base: self.cfg.window_base, growth_per_sec: self.cfg.window_growth_per_sec, max: self.cfg.window_max }
    }

    fn matchmake(self: &Arc<Self>, now: u64) {
        if !self.enabled() || !self.queue.lead(&self.ha.pod_id, LEASE_MS).unwrap_or(false) {
            return;
        }
        let _ = self.queue.purge_stale(now, QUEUE_STALE_MS);
        let Ok(entries) = self.queue.all() else { return };
        if entries.len() < self.cfg.team_size * 2 {
            return;
        }
        let (lobbies, _) = form_lobbies(entries, self.cfg.team_size, &self.window_rules(), now);
        for lobby in lobbies {
            self.launch(lobby, now);
        }
    }

    fn launch(self: &Arc<Self>, lobby: Lobby, now: u64) {
        let all: Vec<&QueueEntry> = lobby.team_a.iter().chain(lobby.team_b.iter()).collect();
        // Claim every player; if someone cancelled in the meantime, give the others their spot back.
        let mut claimed = Vec::new();
        for e in &all {
            if self.queue.remove(&e.key).unwrap_or(false) {
                claimed.push(*e);
            }
        }
        if claimed.len() != all.len() {
            for e in claimed {
                let _ = self.queue.enqueue(e);
            }
            return;
        }
        let id = format!("rk-{:x}-{}", now, self.seq.fetch_add(1, Ordering::Relaxed));
        for e in &all {
            let _ = self.queue.set_active(&e.key, &id, &self.ha.pod_id, ACTIVE_TTL_MS);
        }
        let (m, outs) = Match::new(id.clone(), &lobby, self.cfg.clone(), now);
        let keys = m.keys();
        {
            let mut g = self.inner.lock().unwrap();
            for k in &keys {
                g.queued.remove(k);
            }
            g.matches.insert(id.clone(), m);
        }
        self.ha.publish(
            EVENTS_CHANNEL,
            &format!("{{\"type\":\"ranked_match_found\",\"match_id\":\"{}\",\"team_size\":{},\"pod\":\"{}\"}}", id, self.cfg.team_size, json_esc(&self.ha.pod_id)),
        );
        println!("[Ranked] match {} formed ({} players)", id, keys.len());
        self.dispatch(&id, &keys, outs);
    }

    /* ---------------- per-connection handling ---------------- */

    fn client_ip(&self, stream: &TcpStream, req: &str) -> Option<IpAddr> {
        if self.trust_proxy {
            for line in req.lines() {
                let l = line.to_ascii_lowercase();
                if l.starts_with("x-forwarded-for:") || l.starts_with("x-real-ip:") {
                    if let Some(ip) = line.split_once(':').and_then(|(_, v)| v.split(',').next()).and_then(|s| s.trim().parse().ok()) {
                        return Some(ip);
                    }
                }
            }
        }
        stream.peer_addr().ok().map(|a| a.ip())
    }

    fn ip_allowed(&self, ip: Option<IpAddr>, now: u64) -> bool {
        let Some(ip) = ip else { return true };
        let mut g = self.inner.lock().unwrap();
        if g.ip_hits.len() > 50_000 {
            g.ip_hits.clear();
        }
        let hits = g.ip_hits.entry(ip).or_default();
        hits.retain(|t| now.saturating_sub(*t) < 60_000);
        if hits.len() as u32 >= self.cfg.conn_per_ip_per_min {
            return false;
        }
        hits.push(now);
        true
    }

    /// Entry point from main.rs for any request whose path contains "/ranked".
    pub fn serve(self: &Arc<Self>, mut stream: TcpStream, req: &str) {
        let path = req.split_whitespace().nth(1).unwrap_or("/").to_string();
        let ip = self.client_ip(&stream, req);
        if !self.ip_allowed(ip, now_ms()) {
            http(&mut stream, 429, "{\"error\":\"rate_limited\"}");
            return;
        }
        let ws_key = req.lines().find_map(|line| {
            if line.to_ascii_lowercase().starts_with("sec-websocket-key:") {
                Some(line.split_once(':')?.1.trim().to_string())
            } else {
                None
            }
        });
        match ws_key {
            Some(k) => self.serve_ws(stream, &k),
            None => self.serve_http(&mut stream, &path),
        }
    }

    fn serve_http(&self, stream: &mut TcpStream, raw_path: &str) {
        let (path, query) = raw_path.split_once('?').unwrap_or((raw_path, ""));
        let tail = path.split("/ranked").nth(1).unwrap_or("");
        if tail == "/status" || tail.is_empty() || tail == "/" {
            let qn = self.queue.all().map(|v| v.len()).unwrap_or(0);
            let body = format!(
                "{{\"service\":\"dilly-strike-ranked\",\"enabled\":{},\"team_size\":{},\"rounds_to_win\":{},\"overtime\":{},\"in_queue\":{},\"store\":\"{}\",\"replicas\":\"{}\",\"pod\":\"{}\",\"tiers\":[{}]}}",
                self.enabled(),
                self.cfg.team_size,
                self.cfg.rounds_to_win,
                self.cfg.overtime,
                qn,
                self.store.kind(),
                if self.redis_bus { "redis" } else { "single" },
                json_esc(&self.ha.pod_id),
                crate::rating::TIERS.iter().map(|t| format!("\"{}\"", t)).collect::<Vec<_>>().join(",")
            );
            http(stream, 200, &body);
        } else if tail == "/leaderboard" {
            let limit = query.split('&').find_map(|kv| kv.strip_prefix("limit=")).and_then(|v| v.parse().ok()).unwrap_or(50usize).clamp(1, 100);
            match self.store.leaderboard(limit) {
                Ok(list) => http(stream, 200, &format!("{{\"players\":[{}]}}", list.iter().map(player_json).collect::<Vec<_>>().join(","))),
                Err(_) => http(stream, 503, "{\"error\":\"store_unavailable\"}"),
            }
        } else if let Some(name) = tail.strip_prefix("/profile/") {
            let name = pct_decode(name);
            if !valid_callsign(&name) {
                http(stream, 400, "{\"error\":\"bad_callsign\"}");
                return;
            }
            let key = name.to_lowercase();
            match (self.store.load(&key, &name), self.store.history(&key, 20)) {
                (Ok(p), Ok(h)) => {
                    let hist = h
                        .iter()
                        .map(|i| {
                            let my = if i.row.team == 'a' { 0 } else { 1 };
                            format!(
                                "{{\"match_id\":\"{}\",\"map\":\"{}\",\"ended_ms\":{},\"result\":\"{}\",\"score\":[{},{}],\"team_size\":{},\"agent\":\"{}\",\"kills\":{},\"deaths\":{},\"headshots\":{},\"damage\":{},\"mvps\":{},\"rr_delta\":{},\"rr_after\":{},\"placement\":{},\"abandoned\":{}}}",
                                json_esc(&i.match_id),
                                json_esc(&i.map),
                                i.ended_ms,
                                i.row.result,
                                i.score[my],
                                i.score[1 - my],
                                i.team_size,
                                json_esc(&i.row.agent),
                                i.row.kills,
                                i.row.deaths,
                                i.row.headshots,
                                i.row.damage,
                                i.row.mvps,
                                i.row.rr_delta,
                                i.row.rr_after,
                                i.row.placements_after <= crate::rating::PLACEMENT_MATCHES,
                                i.row.abandoned
                            )
                        })
                        .collect::<Vec<_>>()
                        .join(",");
                    http(stream, 200, &format!("{{\"player\":{},\"history\":[{}]}}", player_json(&p), hist));
                }
                _ => http(stream, 503, "{\"error\":\"store_unavailable\"}"),
            }
        } else {
            http(stream, 404, "{\"error\":\"not_found\"}");
        }
    }

    fn serve_ws(self: &Arc<Self>, mut stream: TcpStream, key: &str) {
        let hs = format!(
            "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: {}\r\n\r\n",
            compute_ws_accept(key)
        );
        if stream.write_all(hs.as_bytes()).is_err() {
            return;
        }
        let _ = stream.set_nodelay(true);
        let _ = stream.set_write_timeout(Some(Duration::from_secs(2)));
        if !self.enabled() {
            send_ws(&mut stream, &err_json("ranked_disabled", "Ranked is not configured on this server (DILLY_SESSION_SECRET missing)."));
            let _ = stream.write_all(&encode_frame(0x8, &[]));
            return;
        }
        // 1) authenticate: first message must be {"type":"hello","token":"..."} within 6s
        let _ = stream.set_read_timeout(Some(Duration::from_secs(6)));
        let mut acc: Vec<u8> = Vec::with_capacity(MAX_FRAME);
        let Some(first) = read_text(&mut stream, &mut acc) else { return };
        let claims = match Json::parse(&first).filter(|v| v.str_of("type") == Some("hello")).and_then(|v| v.str_of("token").map(|s| s.to_string())) {
            Some(tok) => verify_token(self.cfg.secret.as_ref().unwrap(), &tok, now_ms() / 1000),
            None => {
                send_ws(&mut stream, &err_json("auth_required", "Send hello with your Dilly Online Hub session token first."));
                return;
            }
        };
        let claims: Claims = match claims {
            Ok(c) => c,
            Err(e) => {
                send_ws(&mut stream, &err_json("auth_failed", &format!("Session token rejected ({:?}). Sign in again on the hub.", e)));
                return;
            }
        };
        let user = claims.key.clone();
        let cid = self.seq.fetch_add(1, Ordering::Relaxed);
        let Ok(writer) = stream.try_clone() else { return };
        {
            let mut g = self.inner.lock().unwrap();
            if let Some(mut old) = g.conns.insert(user.clone(), Conn { id: cid, stream: writer }) {
                send_ws(&mut old.stream, &err_json("replaced", "Signed in from another window"));
                let _ = old.stream.shutdown(Shutdown::Both);
            }
        }
        if self.redis_bus {
            self.ha.publish(BUS_CHANNEL, &format!("{{\"k\":\"kick\",\"u\":\"{}\",\"pod\":\"{}\",\"cid\":{}}}", json_esc(&user), json_esc(&self.ha.pod_id), cid));
        }
        let now = now_ms();
        let rec = self.store.load(&user, &claims.callsign).unwrap_or_else(|_| PlayerRecord::new(&user, &claims.callsign));
        let cooldown = self.queue.get_cooldown(&user, now).ok().flatten();
        let active = self.queue.get_active(&user).ok().flatten();
        self.deliver_local(
            &user,
            &format!(
                "{{\"type\":\"hello_ok\",\"user\":\"{}\",\"name\":\"{}\",\"profile\":{},\"cooldown_ms\":{},\"cooldown_reason\":\"{}\",\"in_match\":{},\"team_size\":{},\"rounds_to_win\":{}}}",
                json_esc(&user),
                json_esc(&claims.callsign),
                player_json(&rec),
                cooldown.as_ref().map(|c| c.0.saturating_sub(now)).unwrap_or(0),
                cooldown.as_ref().map(|c| c.1.as_str()).unwrap_or(""),
                active.is_some(),
                self.cfg.team_size,
                self.cfg.rounds_to_win
            ),
        );
        if active.is_some() {
            self.route(&user, None, Some(true));
        }

        // 2) message loop with a token-bucket rate limit
        let _ = stream.set_read_timeout(Some(Duration::from_secs(45)));
        let mut tokens = self.cfg.msg_burst;
        let mut last = now_ms();
        let mut strikes = 0u32;
        while let Some(text) = read_text(&mut stream, &mut acc) {
            let t = now_ms();
            tokens = (tokens + (t - last) as f64 / 1000.0 * self.cfg.msg_rate_per_sec).min(self.cfg.msg_burst);
            last = t;
            if tokens < 1.0 {
                strikes += 1;
                if strikes == 1 || strikes % 50 == 0 {
                    self.deliver_local(&user, &err_json("rate_limited", "Slow down"));
                }
                if strikes > 400 {
                    break;
                }
                continue;
            }
            tokens -= 1.0;
            let Some(v) = Json::parse(&text) else {
                self.deliver_local(&user, &err_json("bad_json", "Malformed message"));
                continue;
            };
            let ty = v.str_of("type").unwrap_or("").to_string();
            match ty.as_str() {
                "ping" => {
                    self.deliver_local(&user, "{\"type\":\"pong\"}");
                }
                "queue" => self.on_queue(&user, &claims.callsign),
                "cancel" => {
                    let removed = self.queue.remove(&user).unwrap_or(false);
                    self.inner.lock().unwrap().queued.remove(&user);
                    self.deliver_local(&user, &format!("{{\"type\":\"queue_status\",\"queued\":false,\"cancelled\":{}}}", removed));
                }
                "" => {
                    self.deliver_local(&user, &err_json("bad_type", "Missing type"));
                }
                _ if ty.len() > 16 => {}
                _ => {
                    if !self.route(&user, Some(&v), None) {
                        self.deliver_local(&user, &err_json("not_in_match", "You are not in a ranked match"));
                    }
                }
            }
        }

        // 3) disconnect: leave the queue, tell the match host (grace timer starts there)
        let still_mine = {
            let mut g = self.inner.lock().unwrap();
            let mine = g.conns.get(&user).map(|c| c.id == cid).unwrap_or(false);
            if mine {
                g.conns.remove(&user);
                g.queued.remove(&user);
            }
            mine
        };
        if still_mine {
            let _ = self.queue.remove(&user);
            self.route(&user, None, Some(false));
        }
    }

    fn on_queue(self: &Arc<Self>, user: &str, name: &str) {
        let now = now_ms();
        if let Ok(Some((u, why))) = self.queue.get_cooldown(user, now) {
            self.deliver_local(user, &format!("{{\"type\":\"cooldown\",\"cooldown_ms\":{},\"reason\":\"{}\"}}", u - now, json_esc(&why)));
            return;
        }
        if let Ok(Some(_)) = self.queue.get_active(user) {
            self.deliver_local(user, &err_json("in_match", "Finish your current ranked match first"));
            self.route(user, Some(&Json::parse("{\"type\":\"sync\"}").unwrap()), None);
            return;
        }
        if self.inner.lock().unwrap().queued.contains_key(user) {
            return;
        }
        let rec = match self.store.load(user, name) {
            Ok(r) => r,
            Err(_) => {
                self.deliver_local(user, &err_json("store_unavailable", "Ranked database unavailable, try again shortly"));
                return;
            }
        };
        let e = QueueEntry { key: user.to_string(), name: name.to_string(), mmr: rec.rank.glicko.rating, joined_ms: now };
        if self.queue.enqueue(&e).is_err() {
            self.deliver_local(user, &err_json("queue_unavailable", "Matchmaking backend unavailable"));
            return;
        }
        let _ = self.queue.touch(&[user.to_string()], now);
        self.inner.lock().unwrap().queued.insert(user.to_string(), now);
        self.deliver_local(
            user,
            &format!("{{\"type\":\"queue_status\",\"queued\":true,\"elapsed_ms\":0,\"window\":{:.0},\"in_queue\":0,\"team_size\":{}}}", self.cfg.window_base, self.cfg.team_size),
        );
    }

    /// Test/inspection helper.
    pub fn hosted_matches(&self) -> usize {
        self.inner.lock().unwrap().matches.len()
    }
}

fn read_text(stream: &mut TcpStream, acc: &mut Vec<u8>) -> Option<String> {
    let mut tmp = [0u8; 4096];
    loop {
        match decode_frame(acc, MAX_FRAME, true) {
            Some(Frame::Bad) => return None,
            Some(Frame::Msg(0x1, p)) => return String::from_utf8(p).ok(),
            Some(Frame::Msg(0x8, _)) => return None,
            Some(Frame::Msg(0x9, p)) => {
                let _ = stream.write_all(&encode_frame(0xA, &p));
                continue;
            }
            Some(Frame::Msg(_, _)) => continue,
            None => {}
        }
        if acc.len() > MAX_FRAME * 4 {
            return None;
        }
        match stream.read(&mut tmp) {
            Ok(0) | Err(_) => return None,
            Ok(n) => acc.extend_from_slice(&tmp[..n]),
        }
    }
}

fn pct_decode(s: &str) -> String {
    let b = s.as_bytes();
    let hex = |c: u8| (c as char).to_digit(16).map(|d| d as u8);
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            if let (Some(h), Some(l)) = (hex(b[i + 1]), hex(b[i + 2])) {
                out.push(h * 16 + l);
                i += 3;
                continue;
            }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).to_string()
}

pub fn http(stream: &mut TcpStream, status: u16, body: &str) {
    let reason = match status {
        200 => "OK",
        400 => "Bad Request",
        404 => "Not Found",
        429 => "Too Many Requests",
        _ => "Service Unavailable",
    };
    let resp = format!(
        "HTTP/1.1 {} {}\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: *\r\nCache-Control: no-store\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        status,
        reason,
        body.len(),
        body
    );
    let _ = stream.write_all(resp.as_bytes());
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::game::PlayerSummary;

    fn ps(key: &str, team: Team, abandoned: bool) -> PlayerSummary {
        PlayerSummary { key: key.into(), name: key.into(), team, agent: "sprig".into(), kills: 3, deaths: 2, headshots: 1, damage: 300, mvps: 1, abandoned }
    }

    #[test]
    fn rate_match_win_loss_and_leaver() {
        let s = MatchSummary {
            id: "m".into(),
            map: "brinepeak",
            team_size: 2,
            score: [13, 7],
            winner: Some(Team::A),
            rounds: 20,
            overtime: false,
            forfeit: false,
            started_ms: 0,
            ended_ms: 1,
            players: vec![ps("a1", Team::A, false), ps("a2", Team::A, true), ps("b1", Team::B, false), ps("b2", Team::B, false)],
        };
        let mut recs = HashMap::new();
        for k in ["a1", "a2", "b1", "b2"] {
            let mut r = PlayerRecord::new(k, k);
            r.rank.placements = 10;
            r.rank.rr = 1000;
            r.rank.glicko.rd = 80.0;
            recs.insert(k.to_string(), r);
        }
        let (rows, upd, ch) = rate_match(&s, &recs, &RrRules::default());
        assert_eq!(rows.len(), 4);
        assert!(ch["a1"].rr_delta > 0 && ch["b1"].rr_delta < 0);
        // a2 abandoned on the winning team: still a loss + penalty
        assert!(ch["a2"].rr_delta < ch["b1"].rr_delta);
        assert_eq!(rows.iter().find(|r| r.key == "a2").unwrap().result, "loss");
        let a2 = upd.iter().find(|p| p.key == "a2").unwrap();
        assert_eq!((a2.wins, a2.losses, a2.abandons), (0, 1, 1));
        let a1 = upd.iter().find(|p| p.key == "a1").unwrap();
        assert_eq!(a1.wins, 1);
        assert!(a1.peak_rr > 1000);
    }

    #[test]
    fn pct_decoding() {
        assert_eq!(pct_decode("Dilly%20Boss"), "Dilly Boss");
        assert_eq!(pct_decode("a%2"), "a%2");
        assert_eq!(pct_decode("%C3%A9"), "é");
    }
}
