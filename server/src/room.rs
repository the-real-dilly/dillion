//! A room: lobby with countdown, then one authoritative match at 60 Hz with bots filling the slots.
use crate::bots::{init_bots, make_ai_for, update_bots};
use crate::proto::*;
use crate::sim::*;
use crate::world::World;
use serde_json::{json, Value};
use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tokio::sync::mpsc;
use tokio_tungstenite::tungstenite::Message;

#[derive(Clone, Debug)]
pub struct Config {
    pub lobby_seconds: f64,
    pub max_players: usize,
    pub max_humans: usize,
    pub sim_speed: u32,
    pub snapshot_every: u32,
    pub bot_difficulty: usize,
    pub results_seconds: f64,
}
impl Default for Config {
    fn default() -> Self {
        Config { lobby_seconds: 30.0, max_players: 25, max_humans: 16, sim_speed: 1, snapshot_every: 3, bot_difficulty: 1, results_seconds: 12.0 }
    }
}

pub type ClientId = u64;
pub enum RoomMsg {
    Join { cid: ClientId, name: String, tx: mpsc::Sender<Message> },
    Leave { cid: ClientId },
    Input { cid: ClientId, cmds: Vec<Cmd> },
    Ready { cid: ClientId },
}
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Phase {
    Lobby,
    Playing,
    Results,
}
/// shared, read-mostly info the matchmaker uses to place new clients
#[derive(Clone, Debug)]
pub struct RoomInfo {
    pub phase: Phase,
    pub humans: usize,
    pub closed: bool,
}

struct Client {
    name: String,
    tx: mpsc::Sender<Message>,
    pi: Option<usize>,
    cmds: VecDeque<Cmd>,
    last: Option<Cmd>,
    ack: u32,
    rt: u32,
    ready: bool,
    sent_rows: HashMap<u32, Vec<i64>>,
    snaps: u32,
}

const HISTORY_TICKS: usize = 30;
const MAX_REWIND_TICKS: u32 = 15; // 250 ms

pub struct Room {
    pub code: String,
    cfg: Config,
    world: World,
    info: Arc<Mutex<RoomInfo>>,
    clients: HashMap<ClientId, Client>,
    order: Vec<ClientId>,
    phase: Phase,
    countdown: Option<f64>,
    m: Option<Match>,
    tick: u32,
    history: VecDeque<(u32, Vec<PosRec>)>,
    results_t: f64,
    empty_since: Option<Instant>,
}

impl Room {
    pub fn new(code: String, cfg: Config, world: World, info: Arc<Mutex<RoomInfo>>) -> Self {
        Room { code, cfg, world, info, clients: HashMap::new(), order: vec![], phase: Phase::Lobby, countdown: None, m: None, tick: 0, history: VecDeque::new(), results_t: 0.0, empty_since: Some(Instant::now()) }
    }
    fn sync_info(&self) {
        if let Ok(mut i) = self.info.lock() {
            i.phase = self.phase.clone();
            i.humans = self.clients.len();
        }
    }
    fn send(c: &Client, msg: Message) {
        // a client that can't keep up loses messages rather than stalling the room
        let _ = c.tx.try_send(msg);
    }
    fn send_json(c: &Client, v: Value) {
        Self::send(c, Message::Text(v.to_string()));
    }
    fn broadcast_lobby(&self) {
        let names: Vec<&str> = self.order.iter().filter_map(|id| self.clients.get(id)).map(|c| c.name.as_str()).collect();
        let v = json!({ "t": "lobby", "room": self.code, "players": names, "humans": names.len(), "max": self.cfg.max_players, "countdown": self.countdown.map(|c| c.ceil()), "phase": format!("{:?}", self.phase).to_lowercase() });
        for c in self.clients.values() {
            Self::send_json(c, v.clone());
        }
    }

    pub fn handle(&mut self, msg: RoomMsg) {
        match msg {
            RoomMsg::Join { cid, name, tx } => {
                let c = Client { name, tx, pi: None, cmds: VecDeque::new(), last: None, ack: 0, rt: 0, ready: false, sent_rows: HashMap::new(), snaps: 0 };
                Self::send_json(&c, json!({ "t": "welcome", "v": PROTOCOL_VERSION, "room": self.code, "tick": 60, "rate": 60 / self.cfg.snapshot_every }));
                self.clients.insert(cid, c);
                self.order.push(cid);
                self.empty_since = None;
                if self.phase == Phase::Lobby && self.countdown.is_none() {
                    self.countdown = Some(self.cfg.lobby_seconds);
                }
                self.sync_info();
                self.broadcast_lobby();
            }
            RoomMsg::Leave { cid } => {
                if let Some(c) = self.clients.remove(&cid) {
                    self.order.retain(|&x| x != cid);
                    if let (Some(pi), Some(m)) = (c.pi, self.m.as_mut()) {
                        if m.players[pi].st != St::Dead {
                            make_ai_for(m, pi, self.cfg.bot_difficulty);
                        }
                    }
                }
                if self.clients.is_empty() {
                    self.empty_since = Some(Instant::now());
                    if self.phase == Phase::Lobby {
                        self.countdown = None;
                    }
                }
                self.sync_info();
                self.broadcast_lobby();
            }
            RoomMsg::Input { cid, cmds } => {
                let tick = self.tick;
                if let Some(c) = self.clients.get_mut(&cid) {
                    for cmd in cmds {
                        if cmd.seq <= c.ack || c.cmds.back().map_or(false, |b| cmd.seq <= b.seq) {
                            continue; // stale or duplicate
                        }
                        let mut cmd = cmd;
                        cmd.rt = cmd.rt.min(tick).max(tick.saturating_sub(MAX_REWIND_TICKS));
                        c.cmds.push_back(cmd);
                    }
                    // never let a client bank more than ~0.5 s of commands
                    while c.cmds.len() > 30 {
                        c.cmds.pop_front();
                    }
                }
            }
            RoomMsg::Ready { cid } => {
                if let Some(c) = self.clients.get_mut(&cid) {
                    c.ready = true;
                }
                if self.phase == Phase::Lobby && !self.clients.is_empty() && self.clients.values().all(|c| c.ready) {
                    self.countdown = Some(self.countdown.unwrap_or(3.0).min(3.0));
                    self.broadcast_lobby();
                }
            }
        }
    }

    /// true while the room should keep running
    pub fn alive(&self) -> bool {
        !(self.clients.is_empty() && self.empty_since.map_or(false, |t| t.elapsed() > Duration::from_secs(30)))
    }

    /// one 60 Hz room tick (runs `sim_speed` sim steps)
    pub fn update(&mut self) {
        match self.phase {
            Phase::Lobby => {
                if let Some(cd) = self.countdown.as_mut() {
                    let before = cd.ceil();
                    *cd -= DT * self.cfg.sim_speed as f64;
                    let now = cd.ceil();
                    if *cd <= 0.0 {
                        self.start_match();
                    } else if now != before {
                        self.broadcast_lobby();
                    }
                }
            }
            Phase::Playing => {
                for _ in 0..self.cfg.sim_speed {
                    self.sim_tick();
                    if self.phase != Phase::Playing {
                        break;
                    }
                }
            }
            Phase::Results => {
                self.results_t -= DT * self.cfg.sim_speed as f64;
                if self.results_t <= 0.0 {
                    self.phase = Phase::Lobby;
                    self.m = None;
                    for c in self.clients.values_mut() {
                        c.pi = None;
                        c.ready = false;
                        c.cmds.clear();
                        c.last = None;
                        c.ack = 0;
                        c.sent_rows.clear();
                    }
                    self.countdown = if self.clients.is_empty() { None } else { Some(self.cfg.lobby_seconds) };
                    self.sync_info();
                    self.broadcast_lobby();
                }
            }
        }
    }

    fn start_match(&mut self) {
        let seed = rand_seed();
        let mut m = Match::new(self.world.clone(), seed, true);
        m.diff = self.cfg.bot_difficulty;
        let humans: Vec<ClientId> = self.order.iter().copied().take(self.cfg.max_players).collect();
        for cid in &humans {
            let name = self.clients[cid].name.clone();
            let pi = m.add_player(&name, false, true);
            self.clients.get_mut(cid).unwrap().pi = Some(pi);
        }
        let bots = self.cfg.max_players.saturating_sub(humans.len());
        init_bots(&mut m, bots, self.cfg.bot_difficulty);
        m.events.clear();
        self.tick = 0;
        self.history.clear();
        let pl = m.plane.as_ref().unwrap();
        let players: Vec<Value> = m.players.iter().map(|p| json!([p.id, p.name, p.bot as u8])).collect();
        let items: Vec<Value> = m.items.iter().filter(|i| !i.gone).map(item_row).collect();
        let crates: Vec<Value> = m.crates.iter().map(|c| json!([c.id, c.open as u8])).collect();
        for cid in &humans {
            let c = &self.clients[cid];
            let pid = m.players[c.pi.unwrap()].id;
            let start = json!([MSG_START, {
                "seed": seed, "map": self.world.seed, "you": pid, "tick": 0,
                "plane": [pl.ax, pl.az, pl.dx, pl.dz, pl.len, pl.speed, pl.y, pl.eject],
                "players": players, "items": items, "crates": crates
            }]);
            Self::send(c, Message::Binary(encode(&start)));
        }
        self.m = Some(m);
        self.phase = Phase::Playing;
        self.countdown = None;
        self.sync_info();
    }

    fn sim_tick(&mut self) {
        let m = match self.m.as_mut() {
            Some(m) => m,
            None => return,
        };
        let crates = m.crates.len();
        // apply one command per human; merge a backlog so edges (jump, reload...) are not lost
        m.rewind.clear();
        for c in self.clients.values_mut() {
            let pi = match c.pi {
                Some(pi) => pi,
                None => continue,
            };
            if m.players[pi].bot {
                continue;
            }
            let mut merged: Option<Cmd> = None;
            let mut took = 0;
            while let Some(cmd) = c.cmds.pop_front() {
                took += 1;
                if let Some(prev) = merged.as_ref() {
                    let mut cm = cmd.clone();
                    cm.bits |= prev.bits & (B_JUMP | B_RELOAD | B_INTERACT | B_MELEE);
                    if cm.slot < 0 {
                        cm.slot = prev.slot;
                    }
                    if cm.heal == 0 {
                        cm.heal = prev.heal;
                    }
                    if cm.throw == 0 {
                        cm.throw = prev.throw;
                    }
                    if cm.target == 0 {
                        cm.target = prev.target;
                    }
                    merged = Some(cm);
                } else {
                    merged = Some(cmd);
                }
                if c.cmds.len() <= 2 || took >= 4 {
                    break;
                }
            }
            let cmd = match merged {
                Some(cmd) => {
                    c.ack = cmd.seq;
                    c.rt = cmd.rt;
                    c.last = Some(cmd.clone());
                    cmd
                }
                None => match c.last.as_ref() {
                    // no fresh input: hold the continuous controls, drop the one-shot edges
                    Some(l) => Cmd { bits: l.bits & (B_FIRE | B_ADS | B_SPRINT | B_CROUCH | B_PLATE_HOLD), slot: -1, heal: 0, throw: 0, target: 0, ..l.clone() },
                    None => continue,
                },
            };
            apply_cmd(&mut m.players[pi].inp, &cmd, crates);
            // lag compensation: this shooter sees the others where they were at its render tick
            if cmd.bits & B_FIRE != 0 {
                if let Some((_, recs)) = self.history.iter().rev().find(|(t, _)| *t <= cmd.rt) {
                    m.rewind.insert(m.players[pi].id, recs.clone());
                }
            }
        }
        update_bots(m, DT);
        m.step(DT);
        self.tick += 1;
        self.history.push_back((self.tick, m.players.iter().map(|p| PosRec { id: p.id, x: p.x, y: p.y, z: p.z, crouch: p.crouch, st: p.st }).collect()));
        while self.history.len() > HISTORY_TICKS {
            self.history.pop_front();
        }
        let over = m.over;
        if self.tick % self.cfg.snapshot_every == 0 || over {
            self.send_snapshots();
        }
        if over {
            self.finish();
        }
    }

    fn send_snapshots(&mut self) {
        let m = match self.m.as_mut() {
            Some(m) => m,
            None => return,
        };
        let events: Vec<Value> = m.events.iter().filter_map(|e| event_row(m, e)).collect();
        m.events.clear();
        let rows: Vec<Vec<i64>> = m.players.iter().map(player_row).collect();
        let plane_s = m.plane.as_ref().map(|p| if p.gone { -1.0 } else { p.s }).unwrap_or(-1.0);
        let proj: Vec<Value> = m.proj.iter().map(|g| json!([g.id, if g.k == Throw::Frag { 1 } else { 2 }, (g.x * 100.0).round() / 100.0, (g.y * 100.0).round() / 100.0, (g.z * 100.0).round() / 100.0])).collect();
        let smokes: Vec<Value> = m.smokes.iter().map(|s| json!([s.id, s.x, s.y, s.z, s.r, s.t])).collect();
        let gas = gas_row(m);
        let t = m.t;
        for c in self.clients.values_mut() {
            let pi = match c.pi {
                Some(pi) => pi,
                None => continue,
            };
            // delta: only rows that changed since the last snapshot this client received (TCP keeps order),
            // with a full keyframe every 2 s
            let key = c.snaps % 40 == 0;
            c.snaps += 1;
            let mut delta = vec![];
            for r in &rows {
                let id = r[0] as u32;
                if key || c.sent_rows.get(&id).map_or(true, |old| old != r) {
                    delta.push(r.clone());
                    c.sent_rows.insert(id, r.clone());
                }
            }
            let me = me_row(&m.players[pi], t);
            let snap = json!([MSG_SNAP, self.tick, c.ack, m.alive, (plane_s * 100.0f64).round() / 100.0, gas, delta, me, proj, smokes, events, key as u8]);
            Self::send(c, Message::Binary(encode(&snap)));
        }
    }

    fn finish(&mut self) {
        let m = self.m.as_ref().unwrap();
        let winner = m.winner.and_then(|w| m.pidx(w)).map(|i| &m.players[i]);
        for c in self.clients.values() {
            let you = c.pi.map(|pi| {
                let p = &m.players[pi];
                json!({ "id": p.id, "place": p.place, "kills": p.kills, "dmg": p.dmg.round(), "time": if p.st == St::Dead { p.death_t } else { m.t }, "pickles": p.inv.pickle, "killedBy": p.killed_by, "killWid": wid_name(p.kill_wid) })
            });
            Self::send_json(c, json!({ "t": "results", "winner": winner.map(|w| w.id), "winnerName": winner.map(|w| w.name.clone()), "humanWin": winner.map_or(false, |w| w.human && !w.bot), "you": you, "duration": m.t, "next": self.cfg.results_seconds }));
        }
        self.phase = Phase::Results;
        self.results_t = self.cfg.results_seconds;
        self.sync_info();
    }
}

fn rand_seed() -> u32 {
    let n = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(1);
    ((n ^ (n >> 32) ^ (n >> 64)) as u32).max(1)
}
