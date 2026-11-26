/* ==========================================================================
   Ranked match engine — a pure, server-authoritative state machine.
   No sockets here: `handle`/`tick`/`set_connected` return `Out` messages that the
   network layer delivers. Phases:
     Ready (accept prompt) -> Select (agent pick) -> [Buy -> Live -> RoundEnd]* -> Ended
   Rules: first to `rounds_to_win` (13), sides swap after `half_rounds` (12),
   optional overtime at 12-12 (win by two, sides swap every round, capped -> draw),
   server-side economy (credits, kill/round rewards, loss streak bonus), buy
   validation, damage computed from the server weapon table, fire-rate / range /
   movement sanity checks, ability charges, AFK + disconnect handling.
   ========================================================================== */

use crate::config::RankedConfig;
use crate::maps::{self, MapDef};
use crate::matchmaker::{Lobby, Offense};
use crate::util::{json_esc, Json};

pub const AGENTS: [&str; 5] = ["sprig", "brine", "vanta", "ember", "relay"];
const CREDIT_CAP: i32 = 9000;
const KILL_REWARD: i32 = 200;
const WIN_REWARD: i32 = 3000;
const LOSS_BASE: i32 = 1900;
const LOSS_STEP: i32 = 500;
const MAX_SPEED: f64 = 30.0;

pub struct Weapon {
    pub id: &'static str,
    pub cost: i32,
    pub dmg: f64,
    pub hs_mult: f64,
    pub rpm: f64,
    pub range: f64,
}

/// Mirrors WEAPONS in dilly-strike/src/main.js (damage is computed here, not on the client).
pub const WEAPONS: [Weapon; 5] = [
    Weapon { id: "vandal", cost: 2700, dmg: 36.0, hs_mult: 4.0, rpm: 600.0, range: 140.0 },
    Weapon { id: "phantom", cost: 2900, dmg: 33.0, hs_mult: 3.6, rpm: 660.0, range: 140.0 },
    Weapon { id: "operator", cost: 4750, dmg: 150.0, hs_mult: 2.5, rpm: 42.0, range: 140.0 },
    Weapon { id: "sheriff", cost: 700, dmg: 53.0, hs_mult: 3.2, rpm: 250.0, range: 140.0 },
    Weapon { id: "knife", cost: 0, dmg: 65.0, hs_mult: 1.5, rpm: 145.0, range: 3.5 },
];
pub const DEFAULT_KIT: [&str; 2] = ["knife", "sheriff"];
pub const ARMOR_COST: i32 = 1000;
pub const UTIL_COST: i32 = 500;

pub fn weapon(id: &str) -> Option<&'static Weapon> {
    WEAPONS.iter().find(|w| w.id == id)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Team {
    A,
    B,
}
impl Team {
    pub fn idx(self) -> usize {
        match self {
            Team::A => 0,
            Team::B => 1,
        }
    }
    pub fn other(self) -> Team {
        match self {
            Team::A => Team::B,
            Team::B => Team::A,
        }
    }
    pub fn code(self) -> &'static str {
        match self {
            Team::A => "a",
            Team::B => "b",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Side {
    Atk,
    Def,
}
impl Side {
    fn code(self) -> &'static str {
        match self {
            Side::Atk => "atk",
            Side::Def => "def",
        }
    }
    fn flip(self) -> Side {
        match self {
            Side::Atk => Side::Def,
            Side::Def => Side::Atk,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Phase {
    Ready,
    Select,
    Buy,
    Live,
    RoundEnd,
    Ended,
    Cancelled,
}
impl Phase {
    pub fn code(self) -> &'static str {
        match self {
            Phase::Ready => "ready",
            Phase::Select => "select",
            Phase::Buy => "buy",
            Phase::Live => "live",
            Phase::RoundEnd => "round_end",
            Phase::Ended => "ended",
            Phase::Cancelled => "cancelled",
        }
    }
    pub fn in_game(self) -> bool {
        matches!(self, Phase::Buy | Phase::Live | Phase::RoundEnd)
    }
}

#[derive(Debug, Clone)]
pub struct MPlayer {
    pub key: String,
    pub name: String,
    pub mmr: f64,
    pub joined_ms: u64,
    pub team: Team,
    pub accepted: bool,
    pub agent: Option<&'static str>,
    pub locked: bool,
    pub connected: bool,
    pub disconnected_at: Option<u64>,
    pub last_input_ms: u64,
    pub abandoned: bool,
    pub hp: i32,
    pub armor: i32,
    pub alive: bool,
    pub cash: i32,
    pub weapons: Vec<&'static str>,
    pub pos: [f64; 3],
    pub yaw: f64,
    pub pitch: f64,
    pub weapon: &'static str,
    pub last_pos_ms: u64,
    pub last_hit_ms: u64,
    pub used_abilities: u8,
    pub kills: u32,
    pub deaths: u32,
    pub headshots: u32,
    pub damage: u32,
    pub round_kills: u32,
    pub round_damage: u32,
    pub mvps: u32,
}

#[derive(Debug, Clone)]
pub struct PlayerSummary {
    pub key: String,
    pub name: String,
    pub team: Team,
    pub agent: String,
    pub kills: u32,
    pub deaths: u32,
    pub headshots: u32,
    pub damage: u32,
    pub mvps: u32,
    pub abandoned: bool,
}

#[derive(Debug, Clone)]
pub struct MatchSummary {
    pub id: String,
    /// map id ("dustline" / "brinepeak")
    pub map: &'static str,
    pub team_size: usize,
    pub score: [u32; 2],
    pub winner: Option<Team>,
    pub rounds: u32,
    pub overtime: bool,
    pub forfeit: bool,
    pub started_ms: u64,
    pub ended_ms: u64,
    pub players: Vec<PlayerSummary>,
}

#[derive(Debug, Clone)]
pub struct CancelInfo {
    pub reason: &'static str,
    pub offenders: Vec<(String, Offense)>,
    /// (key, name, mmr, original joined_ms) — put back in the queue keeping priority.
    pub requeue: Vec<(String, String, f64, u64)>,
}

#[derive(Debug, Clone)]
pub enum Out {
    To(String, String),
    All(String),
    /// Player left mid-match for good (abandon / AFK / grace expired).
    Abandoned(String),
    Ended(MatchSummary),
    Cancelled(CancelInfo),
}

pub struct Match {
    pub id: String,
    pub cfg: RankedConfig,
    pub phase: Phase,
    pub phase_end_ms: u64,
    pub round: u32,
    pub score: [u32; 2],
    pub side_a: Side,
    pub players: Vec<MPlayer>,
    pub loss_streak: [u32; 2],
    pub ot: bool,
    pub ot_rounds: u32,
    pub created_ms: u64,
    pub started_ms: u64,
    pub forfeit: bool,
    pub winner: Option<Team>,
    /// Map for the whole match: drawn from `cfg.map_pool` (seeded by the match id) when the
    /// match is formed, announced in match_found / agent_select / match_start / match_state.
    pub map: &'static MapDef,
    last_round_winner: Option<Team>,
}

impl Match {
    pub fn new(id: String, lobby: &Lobby, cfg: RankedConfig, now: u64) -> (Match, Vec<Out>) {
        let mut players = Vec::new();
        for (team, list) in [(Team::A, &lobby.team_a), (Team::B, &lobby.team_b)] {
            for e in list.iter() {
                players.push(MPlayer {
                    key: e.key.clone(),
                    name: e.name.clone(),
                    mmr: e.mmr,
                    joined_ms: e.joined_ms,
                    team,
                    accepted: false,
                    agent: None,
                    locked: false,
                    connected: true,
                    disconnected_at: None,
                    last_input_ms: now,
                    abandoned: false,
                    hp: 100,
                    armor: 0,
                    alive: true,
                    cash: cfg.start_credits,
                    weapons: DEFAULT_KIT.to_vec(),
                    pos: [0.0; 3],
                    yaw: 0.0,
                    pitch: 0.0,
                    weapon: "sheriff",
                    last_pos_ms: now,
                    last_hit_ms: 0,
                    used_abilities: 0,
                    kills: 0,
                    deaths: 0,
                    headshots: 0,
                    damage: 0,
                    round_kills: 0,
                    round_damage: 0,
                    mvps: 0,
                });
            }
        }
        let map = maps::pick(&cfg.map_pool, &id);
        let m = Match {
            id,
            map,
            phase: Phase::Ready,
            phase_end_ms: now + cfg.accept_ms,
            round: 0,
            score: [0, 0],
            side_a: Side::Def,
            players,
            loss_streak: [0, 0],
            ot: false,
            ot_rounds: 0,
            created_ms: now,
            started_ms: 0,
            forfeit: false,
            winner: None,
            last_round_winner: None,
            cfg,
        };
        let msg = format!(
            "{{\"type\":\"match_found\",\"match_id\":\"{}\",\"map\":\"{}\",\"map_code\":\"{}\",\"team_size\":{},\"accept_ms\":{},\"total\":{}}}",
            json_esc(&m.id),
            m.map.id,
            m.map.code,
            m.cfg.team_size,
            m.cfg.accept_ms,
            m.players.len()
        );
        (m, vec![Out::All(msg)])
    }

    pub fn keys(&self) -> Vec<String> {
        self.players.iter().map(|p| p.key.clone()).collect()
    }
    fn pi(&self, key: &str) -> Option<usize> {
        self.players.iter().position(|p| p.key == key)
    }
    pub fn side_of(&self, t: Team) -> Side {
        if t == Team::A {
            self.side_a
        } else {
            self.side_a.flip()
        }
    }
    fn left_ms(&self, now: u64) -> u64 {
        self.phase_end_ms.saturating_sub(now)
    }

    /* ---------------- inputs ---------------- */

    pub fn handle(&mut self, key: &str, msg: &Json, now: u64) -> Vec<Out> {
        let Some(i) = self.pi(key) else { return vec![] };
        if self.players[i].abandoned {
            return vec![];
        }
        let t = msg.str_of("type").unwrap_or("");
        match (self.phase, t) {
            (Phase::Ready, "accept") => {
                self.players[i].accepted = true;
                let mut out = vec![self.ready_update()];
                if self.players.iter().all(|p| p.accepted) {
                    out.extend(self.enter_select(now));
                }
                out
            }
            (Phase::Ready, "decline") => self.cancel_ready(vec![key.to_string()], "declined"),
            (Phase::Select, "pick") | (Phase::Select, "lock") => {
                let mut out = Vec::new();
                if t == "pick" {
                    let Some(a) = msg.str_of("agent").and_then(|a| AGENTS.iter().find(|x| **x == a)) else {
                        return vec![self.err(key, "bad_agent", "Unknown agent")];
                    };
                    if self.players[i].locked {
                        return vec![];
                    }
                    if self.agent_taken(self.players[i].team, a, i) {
                        return vec![self.err(key, "agent_taken", "A teammate already locked that agent")];
                    }
                    self.players[i].agent = Some(a);
                } else {
                    let Some(a) = self.players[i].agent else {
                        return vec![self.err(key, "no_agent", "Pick an agent first")];
                    };
                    if self.agent_taken(self.players[i].team, a, i) {
                        return vec![self.err(key, "agent_taken", "A teammate already locked that agent")];
                    }
                    self.players[i].locked = true;
                }
                out.extend(self.select_update(now));
                if self.players.iter().all(|p| p.locked) {
                    out.extend(self.start_match(now));
                }
                out
            }
            (Phase::Select, "abandon") => self.cancel_dodge(key),
            (p, "abandon") if p.in_game() => self.abandon(i, now, "left"),
            (p, "state") if p.in_game() => self.on_state(i, msg, now),
            (Phase::Buy, "buy") => self.on_buy(i, msg, now),
            (Phase::Live, "hit") => self.on_hit(i, msg, now),
            (Phase::Live, "ability") | (Phase::Buy, "ability") => self.on_ability(i, msg, now),
            (p, "chat") if p.in_game() || p == Phase::Select => self.on_chat(i, msg),
            (_, "sync") => vec![Out::To(key.to_string(), self.snapshot(key, now))],
            _ => vec![],
        }
    }

    fn err(&self, key: &str, code: &str, text: &str) -> Out {
        Out::To(key.to_string(), format!("{{\"type\":\"error\",\"code\":\"{}\",\"msg\":\"{}\"}}", code, json_esc(text)))
    }

    fn agent_taken(&self, team: Team, a: &str, except: usize) -> bool {
        self.players.iter().enumerate().any(|(j, p)| j != except && p.team == team && p.locked && p.agent == Some(a))
    }

    pub fn set_connected(&mut self, key: &str, up: bool, now: u64) -> Vec<Out> {
        let Some(i) = self.pi(key) else { return vec![] };
        if self.players[i].abandoned {
            return vec![];
        }
        if up {
            self.players[i].connected = true;
            self.players[i].disconnected_at = None;
            self.players[i].last_input_ms = now;
            let mut out = vec![Out::To(key.to_string(), self.snapshot(key, now))];
            if self.phase.in_game() {
                out.push(Out::All(format!("{{\"type\":\"player_conn\",\"id\":\"{}\",\"up\":true}}", json_esc(key))));
            }
            return out;
        }
        self.players[i].connected = false;
        self.players[i].disconnected_at = Some(now);
        match self.phase {
            // Closing the client during the accept prompt == not accepting.
            Phase::Ready => self.cancel_ready(vec![key.to_string()], "declined"),
            // Leaving agent select is a dodge.
            Phase::Select => self.cancel_dodge(key),
            p if p.in_game() => {
                let mut out = vec![Out::All(format!("{{\"type\":\"player_conn\",\"id\":\"{}\",\"up\":false}}", json_esc(key)))];
                if self.phase == Phase::Live && self.players[i].alive {
                    self.players[i].alive = false;
                    out.extend(self.check_round_over(now));
                }
                out
            }
            _ => vec![],
        }
    }

    /* ---------------- ready check / select ---------------- */

    fn ready_update(&self) -> Out {
        let acc = self.players.iter().filter(|p| p.accepted).count();
        Out::All(format!("{{\"type\":\"ready_update\",\"accepted\":{},\"total\":{}}}", acc, self.players.len()))
    }

    fn requeue_list(&self, except: &[String]) -> Vec<(String, String, f64, u64)> {
        self.players
            .iter()
            .filter(|p| !except.contains(&p.key) && p.connected)
            .map(|p| (p.key.clone(), p.name.clone(), p.mmr, p.joined_ms))
            .collect()
    }

    fn cancel_ready(&mut self, offenders: Vec<String>, reason: &'static str) -> Vec<Out> {
        if self.phase != Phase::Ready {
            return vec![];
        }
        self.phase = Phase::Cancelled;
        let requeue = self.requeue_list(&offenders);
        vec![Out::Cancelled(CancelInfo {
            reason,
            offenders: offenders.into_iter().map(|k| (k, Offense::Decline)).collect(),
            requeue,
        })]
    }

    fn cancel_dodge(&mut self, key: &str) -> Vec<Out> {
        if self.phase != Phase::Select {
            return vec![];
        }
        self.phase = Phase::Cancelled;
        let requeue = self.requeue_list(&[key.to_string()]);
        vec![Out::Cancelled(CancelInfo { reason: "dodged", offenders: vec![(key.to_string(), Offense::Dodge)], requeue })]
    }

    fn enter_select(&mut self, now: u64) -> Vec<Out> {
        self.phase = Phase::Select;
        self.phase_end_ms = now + self.cfg.select_ms;
        self.select_update(now)
    }

    fn select_update(&self, now: u64) -> Vec<Out> {
        let team_json = |t: Team| {
            self.players
                .iter()
                .filter(|p| p.team == t)
                .map(|p| {
                    format!(
                        "{{\"id\":\"{}\",\"name\":\"{}\",\"agent\":{},\"locked\":{}}}",
                        json_esc(&p.key),
                        json_esc(&p.name),
                        p.agent.map(|a| format!("\"{}\"", a)).unwrap_or_else(|| "null".into()),
                        p.locked
                    )
                })
                .collect::<Vec<_>>()
                .join(",")
        };
        // Each player only sees their own team's picks (no counter-pick info leak).
        self.players
            .iter()
            .map(|p| {
                Out::To(
                    p.key.clone(),
                    format!(
                        "{{\"type\":\"agent_select\",\"match_id\":\"{}\",\"map\":\"{}\",\"map_code\":\"{}\",\"left_ms\":{},\"team\":\"{}\",\"side\":\"{}\",\"allies\":[{}],\"enemies\":{}}}",
                        json_esc(&self.id),
                        self.map.id,
                        self.map.code,
                        self.left_ms(now),
                        p.team.code(),
                        self.side_of(p.team).code(),
                        team_json(p.team),
                        self.players.iter().filter(|q| q.team != p.team).count()
                    ),
                )
            })
            .collect()
    }

    fn start_match(&mut self, now: u64) -> Vec<Out> {
        // auto-assign anyone who did not lock: their pick if still free, else first free agent
        for i in 0..self.players.len() {
            if self.players[i].locked {
                continue;
            }
            let team = self.players[i].team;
            let want = self.players[i].agent.filter(|a| !self.agent_taken(team, a, i));
            let a = want.or_else(|| AGENTS.iter().copied().find(|a| !self.agent_taken(team, a, i))).unwrap_or(AGENTS[0]);
            self.players[i].agent = Some(a);
            self.players[i].locked = true;
        }
        self.started_ms = now;
        let roster = self
            .players
            .iter()
            .map(|p| {
                format!(
                    "{{\"id\":\"{}\",\"name\":\"{}\",\"team\":\"{}\",\"agent\":\"{}\"}}",
                    json_esc(&p.key),
                    json_esc(&p.name),
                    p.team.code(),
                    p.agent.unwrap_or("sprig")
                )
            })
            .collect::<Vec<_>>()
            .join(",");
        let mut out = vec![Out::All(format!(
            "{{\"type\":\"match_start\",\"match_id\":\"{}\",\"map\":\"{}\",\"map_code\":\"{}\",\"sites\":{},\"rounds_to_win\":{},\"half\":{},\"overtime\":{},\"players\":[{}]}}",
            json_esc(&self.id),
            self.map.id,
            self.map.code,
            self.map.sites,
            self.cfg.rounds_to_win,
            self.cfg.half_rounds(),
            self.cfg.overtime,
            roster
        ))];
        out.extend(self.start_round(now));
        out
    }

    /* ---------------- rounds ---------------- */

    fn start_round(&mut self, now: u64) -> Vec<Out> {
        self.round += 1;
        let played = self.round - 1;
        let half = self.cfg.half_rounds();
        let mut reset_econ = false;
        let mut out = Vec::new();
        if self.ot {
            self.side_a = self.side_a.flip();
            reset_econ = true;
        } else if played == half {
            self.side_a = self.side_a.flip();
            reset_econ = true;
            self.loss_streak = [0, 0];
            out.push(Out::All("{\"type\":\"halftime\"}".into()));
        }
        let credits = if self.ot { self.cfg.ot_credits } else { self.cfg.start_credits };
        let mut idx = [0usize; 2];
        let side_a = self.side_a;
        let map = self.map;
        for p in self.players.iter_mut() {
            let side = if p.team == Team::A { side_a } else { side_a.flip() };
            let (pos, yaw) = map.spawn(side == Side::Def, idx[p.team.idx()]);
            idx[p.team.idx()] += 1;
            let survivor = p.alive && played > 0;
            if reset_econ {
                p.cash = credits;
            }
            if reset_econ || !survivor {
                p.weapons = DEFAULT_KIT.to_vec();
                p.armor = 0;
            }
            p.weapon = if p.weapons.contains(&"vandal") {
                "vandal"
            } else if p.weapons.contains(&"phantom") {
                "phantom"
            } else {
                "sheriff"
            };
            p.hp = 100;
            p.alive = p.connected && !p.abandoned;
            p.pos = pos;
            p.yaw = yaw;
            p.pitch = 0.0;
            p.last_pos_ms = now;
            p.last_input_ms = now;
            p.used_abilities = 0;
            p.round_kills = 0;
            p.round_damage = 0;
        }
        self.phase = Phase::Buy;
        self.phase_end_ms = now + self.cfg.buy_ms;
        out.extend(self.round_msgs(now));
        out
    }

    fn round_msgs(&self, now: u64) -> Vec<Out> {
        self.players.iter().map(|p| Out::To(p.key.clone(), self.round_msg(p, now))).collect()
    }

    fn you_json(&self, p: &MPlayer) -> String {
        format!(
            "{{\"team\":\"{}\",\"side\":\"{}\",\"hp\":{},\"armor\":{},\"cash\":{},\"alive\":{},\"weapons\":[{}],\"weapon\":\"{}\",\"x\":{:.2},\"y\":{:.2},\"z\":{:.2},\"yaw\":{:.3},\"abilities\":{}}}",
            p.team.code(),
            self.side_of(p.team).code(),
            p.hp,
            p.armor,
            p.cash,
            p.alive,
            p.weapons.iter().map(|w| format!("\"{}\"", w)).collect::<Vec<_>>().join(","),
            p.weapon,
            p.pos[0],
            p.pos[1],
            p.pos[2],
            p.yaw,
            p.used_abilities
        )
    }

    fn round_msg(&self, p: &MPlayer, now: u64) -> String {
        format!(
            "{{\"type\":\"round\",\"phase\":\"{}\",\"round\":{},\"left_ms\":{},\"score\":[{},{}],\"side_a\":\"{}\",\"ot\":{},\"you\":{},\"alive\":[{}]}}",
            self.phase.code(),
            self.round,
            self.left_ms(now),
            self.score[0],
            self.score[1],
            self.side_a.code(),
            self.ot,
            self.you_json(p),
            self.players.iter().filter(|q| q.alive).map(|q| format!("\"{}\"", json_esc(&q.key))).collect::<Vec<_>>().join(",")
        )
    }

    /// Full state for (re)connecting clients.
    pub fn snapshot(&self, key: &str, now: u64) -> String {
        let Some(i) = self.pi(key) else { return "{\"type\":\"error\",\"code\":\"not_in_match\"}".into() };
        let me = &self.players[i];
        let roster = self
            .players
            .iter()
            .map(|p| {
                format!(
                    "{{\"id\":\"{}\",\"name\":\"{}\",\"team\":\"{}\",\"agent\":{},\"alive\":{},\"x\":{:.2},\"y\":{:.2},\"z\":{:.2},\"yaw\":{:.3},\"kills\":{},\"deaths\":{},\"connected\":{},\"abandoned\":{}}}",
                    json_esc(&p.key),
                    json_esc(&p.name),
                    p.team.code(),
                    p.agent.map(|a| format!("\"{}\"", a)).unwrap_or_else(|| "null".into()),
                    p.alive,
                    p.pos[0],
                    p.pos[1],
                    p.pos[2],
                    p.yaw,
                    p.kills,
                    p.deaths,
                    p.connected,
                    p.abandoned
                )
            })
            .collect::<Vec<_>>()
            .join(",");
        format!(
            "{{\"type\":\"match_state\",\"match_id\":\"{}\",\"map\":\"{}\",\"map_code\":\"{}\",\"phase\":\"{}\",\"round\":{},\"left_ms\":{},\"score\":[{},{}],\"side_a\":\"{}\",\"rounds_to_win\":{},\"ot\":{},\"accepted\":{},\"you\":{},\"players\":[{}]}}",
            json_esc(&self.id),
            self.map.id,
            self.map.code,
            self.phase.code(),
            self.round,
            self.left_ms(now),
            self.score[0],
            self.score[1],
            self.side_a.code(),
            self.cfg.rounds_to_win,
            self.ot,
            me.accepted,
            self.you_json(me),
            roster
        )
    }

    fn on_state(&mut self, i: usize, msg: &Json, now: u64) -> Vec<Out> {
        let map = self.map;
        let p = &mut self.players[i];
        p.last_input_ms = now;
        if !p.alive {
            return vec![];
        }
        if let Some(y) = msg.num_of("yaw") {
            p.yaw = y.clamp(-1000.0, 1000.0);
        }
        if let Some(pt) = msg.num_of("pitch") {
            p.pitch = pt.clamp(-1.6, 1.6);
        }
        if let Some(w) = msg.str_of("weapon").and_then(weapon) {
            if p.weapons.contains(&w.id) {
                p.weapon = w.id;
            }
        }
        let mut out = Vec::new();
        if self.phase == Phase::Live {
            if let (Some(x), Some(y), Some(z)) = (msg.num_of("x"), msg.num_of("y"), msg.num_of("z")) {
                let dt = (now.saturating_sub(p.last_pos_ms)) as f64 / 1000.0;
                let d = ((x - p.pos[0]).powi(2) + (z - p.pos[2]).powi(2)).sqrt();
                let in_bounds = map.in_bounds(x, y, z);
                if in_bounds && d <= 2.5 + MAX_SPEED * dt {
                    p.pos = [x, y, z];
                    p.last_pos_ms = now;
                } else {
                    out.push(Out::To(
                        p.key.clone(),
                        format!("{{\"type\":\"correct\",\"x\":{:.2},\"y\":{:.2},\"z\":{:.2}}}", p.pos[0], p.pos[1], p.pos[2]),
                    ));
                }
            }
        }
        let p = &self.players[i];
        let relay = format!(
            "{{\"type\":\"state\",\"id\":\"{}\",\"x\":{:.2},\"y\":{:.2},\"z\":{:.2},\"yaw\":{:.2},\"pitch\":{:.2},\"weapon\":\"{}\"}}",
            json_esc(&p.key),
            p.pos[0],
            p.pos[1],
            p.pos[2],
            p.yaw,
            p.pitch,
            p.weapon
        );
        for q in self.players.iter() {
            if q.key != p.key && q.connected {
                out.push(Out::To(q.key.clone(), relay.clone()));
            }
        }
        out
    }

    fn econ_msg(&self, i: usize) -> Out {
        let p = &self.players[i];
        Out::To(
            p.key.clone(),
            format!(
                "{{\"type\":\"econ\",\"cash\":{},\"armor\":{},\"weapons\":[{}],\"weapon\":\"{}\",\"abilities\":{}}}",
                p.cash,
                p.armor,
                p.weapons.iter().map(|w| format!("\"{}\"", w)).collect::<Vec<_>>().join(","),
                p.weapon,
                p.used_abilities
            ),
        )
    }

    fn on_buy(&mut self, i: usize, msg: &Json, now: u64) -> Vec<Out> {
        let key = self.players[i].key.clone();
        self.players[i].last_input_ms = now;
        if !self.players[i].alive {
            return vec![self.err(&key, "dead", "You can't buy while eliminated")];
        }
        let item = msg.str_of("item").unwrap_or("");
        let p = &mut self.players[i];
        let res: Result<(), &str> = match item {
            "armor" => {
                if p.armor >= 100 {
                    Err("Armor already full")
                } else if p.cash < ARMOR_COST {
                    Err("Not enough credits")
                } else {
                    p.cash -= ARMOR_COST;
                    p.armor = 100;
                    Ok(())
                }
            }
            "util" => {
                if p.used_abilities == 0 {
                    Err("Abilities already charged")
                } else if p.cash < UTIL_COST {
                    Err("Not enough credits")
                } else {
                    p.cash -= UTIL_COST;
                    p.used_abilities = 0;
                    Ok(())
                }
            }
            id => match weapon(id) {
                None => Err("Unknown item"),
                Some(w) if p.weapons.contains(&w.id) => {
                    p.weapon = w.id;
                    Ok(())
                }
                Some(w) if p.cash < w.cost => Err("Not enough credits"),
                Some(w) => {
                    p.cash -= w.cost;
                    p.weapons.push(w.id);
                    p.weapon = w.id;
                    Ok(())
                }
            },
        };
        match res {
            Ok(()) => vec![self.econ_msg(i)],
            Err(e) => vec![self.err(&key, "buy_rejected", e), self.econ_msg(i)],
        }
    }

    fn on_hit(&mut self, i: usize, msg: &Json, now: u64) -> Vec<Out> {
        self.players[i].last_input_ms = now;
        let akey = self.players[i].key.clone();
        let Some(tkey) = msg.str_of("target") else { return vec![] };
        let Some(t) = self.pi(tkey) else { return vec![] };
        let a = &self.players[i];
        let tg = &self.players[t];
        if !a.alive || !tg.alive || a.team == tg.team || t == i {
            return vec![];
        }
        let Some(w) = msg.str_of("weapon").and_then(weapon) else { return vec![] };
        if !a.weapons.contains(&w.id) {
            return vec![self.err(&akey, "hit_rejected", "Weapon not owned")];
        }
        let min_gap = (60_000.0 / w.rpm * 0.7) as u64;
        if a.last_hit_ms != 0 && now.saturating_sub(a.last_hit_ms) < min_gap {
            return vec![];
        }
        let dist = ((a.pos[0] - tg.pos[0]).powi(2) + (a.pos[1] - tg.pos[1]).powi(2) + (a.pos[2] - tg.pos[2]).powi(2)).sqrt();
        if dist > w.range + 2.0 {
            return vec![self.err(&akey, "hit_rejected", "Target out of range")];
        }
        let hs = msg.bool_of("hs").unwrap_or(false);
        let dmg = (w.dmg * if hs { w.hs_mult } else { 1.0 }).round() as i32;
        self.players[i].last_hit_ms = now;
        let tg = &mut self.players[t];
        let absorb = (dmg / 2).min(tg.armor);
        tg.armor -= absorb;
        let before = tg.hp;
        tg.hp = (tg.hp - (dmg - absorb)).max(0);
        let dealt = (before - tg.hp) as u32;
        let killed = tg.hp == 0;
        let (thp, tarmor) = (tg.hp, tg.armor);
        let aname = self.players[i].name.clone();
        let a = &mut self.players[i];
        a.damage += dealt;
        a.round_damage += dealt;
        let mut out = vec![Out::To(
            tkey.to_string(),
            format!(
                "{{\"type\":\"damaged\",\"id\":\"{}\",\"hp\":{},\"armor\":{},\"by\":\"{}\",\"hs\":{}}}",
                json_esc(tkey),
                thp,
                tarmor,
                json_esc(&aname),
                hs
            ),
        )];
        out.push(Out::To(akey.clone(), format!("{{\"type\":\"hit_ok\",\"target\":\"{}\",\"dmg\":{},\"hp\":{}}}", json_esc(tkey), dealt, thp)));
        if killed {
            let a = &mut self.players[i];
            a.kills += 1;
            a.round_kills += 1;
            if hs {
                a.headshots += 1;
            }
            a.cash = (a.cash + KILL_REWARD).min(CREDIT_CAP);
            let ateam = a.team;
            let tg = &mut self.players[t];
            tg.alive = false;
            tg.deaths += 1;
            let (vname, vteam) = (tg.name.clone(), tg.team);
            out.push(Out::All(format!(
                "{{\"type\":\"kill\",\"killer\":\"{}\",\"killer_id\":\"{}\",\"victim\":\"{}\",\"victim_id\":\"{}\",\"weapon\":\"{}\",\"hs\":{},\"killer_team\":\"{}\",\"victim_team\":\"{}\"}}",
                json_esc(&aname),
                json_esc(&akey),
                json_esc(&vname),
                json_esc(tkey),
                w.id,
                hs,
                ateam.code(),
                vteam.code()
            )));
            out.push(self.econ_msg(i));
            out.extend(self.check_round_over(now));
        }
        out
    }

    fn on_ability(&mut self, i: usize, msg: &Json, now: u64) -> Vec<Out> {
        let p = &mut self.players[i];
        p.last_input_ms = now;
        if !p.alive {
            return vec![];
        }
        let (bit, kind) = match msg.str_of("kind") {
            Some("smoke") => (1u8, "smoke"),
            Some("flash") => (2u8, "flash"),
            Some("dash") => (4u8, "dash"),
            _ => return vec![],
        };
        if p.used_abilities & bit != 0 {
            let k = p.key.clone();
            return vec![self.err(&k, "ability_used", "Ability already used this round")];
        }
        p.used_abilities |= bit;
        let x = msg.num_of("x").unwrap_or(p.pos[0]);
        let z = msg.num_of("z").unwrap_or(p.pos[2]);
        // utility can't be thrown further than 25m from the thrower
        let (dx, dz) = (x - p.pos[0], z - p.pos[2]);
        let d = (dx * dx + dz * dz).sqrt();
        let (x, z) = if d > 25.0 { (p.pos[0] + dx / d * 25.0, p.pos[2] + dz / d * 25.0) } else { (x, z) };
        let key = p.key.clone();
        let mut out = vec![self.econ_msg(i)];
        if kind != "dash" {
            out.push(Out::All(format!(
                "{{\"type\":\"{}\",\"by\":\"{}\",\"x\":{:.2},\"y\":1.80,\"z\":{:.2}}}",
                kind,
                json_esc(&key),
                x,
                z
            )));
        }
        out
    }

    fn on_chat(&mut self, i: usize, msg: &Json) -> Vec<Out> {
        let raw = msg.str_of("text").unwrap_or("");
        let clean: String = raw.trim().chars().filter(|c| !c.is_control()).take(160).collect();
        if clean.is_empty() {
            return vec![];
        }
        let team_only = msg.bool_of("team").unwrap_or(false) || self.phase == Phase::Select;
        let p = &self.players[i];
        let m = format!(
            "{{\"type\":\"chat\",\"name\":\"{}\",\"text\":\"{}\",\"team\":{}}}",
            json_esc(&p.name),
            json_esc(&clean),
            team_only
        );
        if team_only {
            let t = p.team;
            self.players.iter().filter(|q| q.team == t).map(|q| Out::To(q.key.clone(), m.clone())).collect()
        } else {
            vec![Out::All(m)]
        }
    }

    fn team_alive(&self, t: Team) -> usize {
        self.players.iter().filter(|p| p.team == t && p.alive).count()
    }

    fn check_round_over(&mut self, now: u64) -> Vec<Out> {
        if self.phase != Phase::Live {
            return vec![];
        }
        let (a, b) = (self.team_alive(Team::A), self.team_alive(Team::B));
        if a == 0 && b == 0 {
            // both wiped (e.g. last two players disconnected): defenders hold
            let def = if self.side_a == Side::Def { Team::A } else { Team::B };
            return self.end_round(def, "elimination", now);
        }
        if a == 0 {
            return self.end_round(Team::B, "elimination", now);
        }
        if b == 0 {
            return self.end_round(Team::A, "elimination", now);
        }
        vec![]
    }

    fn end_round(&mut self, winner: Team, reason: &str, now: u64) -> Vec<Out> {
        self.score[winner.idx()] += 1;
        self.last_round_winner = Some(winner);
        let loser = winner.other();
        self.loss_streak[winner.idx()] = 0;
        let streak = self.loss_streak[loser.idx()].min(2) as i32;
        self.loss_streak[loser.idx()] += 1;
        for p in self.players.iter_mut() {
            let reward = if p.team == winner { WIN_REWARD } else { LOSS_BASE + LOSS_STEP * streak };
            p.cash = (p.cash + reward).min(CREDIT_CAP);
        }
        let mvp = self
            .players
            .iter()
            .enumerate()
            .filter(|(_, p)| p.team == winner)
            .max_by(|(_, x), (_, y)| (x.round_kills, x.round_damage).cmp(&(y.round_kills, y.round_damage)))
            .map(|(j, _)| j);
        let mvp_name = mvp.map(|j| self.players[j].name.clone()).unwrap_or_default();
        let mvp_kills = mvp.map(|j| self.players[j].round_kills).unwrap_or(0);
        if let Some(j) = mvp {
            self.players[j].mvps += 1;
        }
        self.phase = Phase::RoundEnd;
        self.phase_end_ms = now + self.cfg.round_end_ms;
        let rtw = self.cfg.rounds_to_win;
        if self.ot {
            self.ot_rounds += 1;
        }
        let (sa, sb) = (self.score[0], self.score[1]);
        let mut done = false;
        if !self.ot && (sa >= rtw || sb >= rtw) {
            done = true;
            self.winner = Some(if sa > sb { Team::A } else { Team::B });
        } else if !self.ot && sa == rtw - 1 && sb == rtw - 1 && rtw > 1 {
            if self.cfg.overtime {
                self.ot = true;
            } else {
                done = true;
                self.winner = None;
            }
        } else if self.ot {
            if sa.abs_diff(sb) >= 2 {
                done = true;
                self.winner = Some(if sa > sb { Team::A } else { Team::B });
            } else if self.ot_rounds >= self.cfg.max_ot_rounds && self.ot_rounds % 2 == 0 {
                done = true;
                self.winner = None;
            }
        }
        if done {
            // the Ended transition happens after the round-end banner in tick()
            self.phase_end_ms = now + self.cfg.round_end_ms;
        }
        let mut out = vec![Out::All(format!(
            "{{\"type\":\"round_end\",\"round\":{},\"winner\":\"{}\",\"reason\":\"{}\",\"score\":[{},{}],\"mvp\":\"{}\",\"mvp_kills\":{},\"match_point\":{},\"final\":{},\"ot\":{}}}",
            self.round,
            winner.code(),
            reason,
            sa,
            sb,
            json_esc(&mvp_name),
            mvp_kills,
            !done && (sa == rtw - 1 || sb == rtw - 1),
            done,
            self.ot
        ))];
        for j in 0..self.players.len() {
            out.push(self.econ_msg(j));
        }
        out
    }

    fn abandon(&mut self, i: usize, now: u64, why: &str) -> Vec<Out> {
        if self.players[i].abandoned {
            return vec![];
        }
        let p = &mut self.players[i];
        p.abandoned = true;
        p.alive = false;
        p.connected = false;
        let key = p.key.clone();
        let team = p.team;
        let mut out = vec![
            Out::Abandoned(key.clone()),
            Out::All(format!("{{\"type\":\"player_left\",\"id\":\"{}\",\"reason\":\"{}\"}}", json_esc(&key), why)),
        ];
        // Whole team gone -> forfeit.
        if self.players.iter().filter(|p| p.team == team).all(|p| p.abandoned) {
            self.forfeit = true;
            self.winner = Some(team.other());
            out.extend(self.finish(now));
            return out;
        }
        out.extend(self.check_round_over(now));
        out
    }

    fn finish(&mut self, now: u64) -> Vec<Out> {
        self.phase = Phase::Ended;
        let players = self
            .players
            .iter()
            .map(|p| PlayerSummary {
                key: p.key.clone(),
                name: p.name.clone(),
                team: p.team,
                agent: p.agent.unwrap_or("sprig").to_string(),
                kills: p.kills,
                deaths: p.deaths,
                headshots: p.headshots,
                damage: p.damage,
                mvps: p.mvps,
                abandoned: p.abandoned,
            })
            .collect();
        vec![Out::Ended(MatchSummary {
            id: self.id.clone(),
            map: self.map.id,
            team_size: self.cfg.team_size,
            score: self.score,
            winner: self.winner,
            rounds: self.round,
            overtime: self.ot,
            forfeit: self.forfeit,
            started_ms: self.started_ms,
            ended_ms: now,
            players,
        })]
    }

    /* ---------------- clock ---------------- */

    pub fn tick(&mut self, now: u64) -> Vec<Out> {
        let mut out = Vec::new();
        // disconnect grace + AFK -> abandon
        if self.phase.in_game() {
            for i in 0..self.players.len() {
                let p = &self.players[i];
                if p.abandoned {
                    continue;
                }
                let gone = p.disconnected_at.map(|t| now.saturating_sub(t) >= self.cfg.reconnect_ms).unwrap_or(false);
                let afk = self.phase == Phase::Live && p.alive && p.connected && now.saturating_sub(p.last_input_ms) >= self.cfg.afk_ms;
                if gone || afk {
                    out.extend(self.abandon(i, now, if afk { "afk" } else { "disconnected" }));
                    if self.phase == Phase::Ended {
                        return out;
                    }
                }
            }
        }
        if now < self.phase_end_ms {
            return out;
        }
        match self.phase {
            Phase::Ready => {
                let late: Vec<String> = self.players.iter().filter(|p| !p.accepted).map(|p| p.key.clone()).collect();
                out.extend(self.cancel_ready(late, "not_accepted"));
            }
            Phase::Select => out.extend(self.start_match(now)),
            Phase::Buy => {
                self.phase = Phase::Live;
                self.phase_end_ms = now + self.cfg.round_ms;
                for p in self.players.iter_mut() {
                    p.last_input_ms = now;
                    p.last_pos_ms = now;
                }
                out.extend(self.round_msgs(now));
                out.extend(self.check_round_over(now));
            }
            Phase::Live => {
                let def = if self.side_a == Side::Def { Team::A } else { Team::B };
                out.extend(self.end_round(def, "time", now));
            }
            Phase::RoundEnd => {
                let rtw = self.cfg.rounds_to_win;
                let (sa, sb) = (self.score[0], self.score[1]);
                let over = (!self.ot && (sa >= rtw || sb >= rtw))
                    || (!self.ot && !self.cfg.overtime && rtw > 1 && sa == rtw - 1 && sb == rtw - 1)
                    || (self.ot && (sa.abs_diff(sb) >= 2 || (self.ot_rounds >= self.cfg.max_ot_rounds && self.ot_rounds % 2 == 0)));
                if over {
                    out.extend(self.finish(now));
                } else {
                    out.extend(self.start_round(now));
                }
            }
            _ => {}
        }
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::matchmaker::QueueEntry;

    fn cfg(team: usize, rtw: u32, ot: bool) -> RankedConfig {
        let mut c = RankedConfig::defaults();
        c.team_size = team;
        c.rounds_to_win = rtw;
        c.overtime = ot;
        c.accept_ms = 1000;
        c.select_ms = 1000;
        c.buy_ms = 1000;
        c.round_ms = 5000;
        c.round_end_ms = 500;
        c.reconnect_ms = 3000;
        c.afk_ms = 4000;
        c.max_ot_rounds = 4;
        c
    }
    fn lobby(n: usize) -> Lobby {
        let mk = |p: &str, i: usize| QueueEntry { key: format!("{}{}", p, i), name: format!("{}{}", p.to_uppercase(), i), mmr: 1500.0, joined_ms: 0 };
        Lobby { team_a: (0..n).map(|i| mk("a", i)).collect(), team_b: (0..n).map(|i| mk("b", i)).collect() }
    }
    fn j(s: &str) -> Json {
        Json::parse(s).unwrap()
    }
    fn to_live(m: &mut Match, now: &mut u64) {
        for k in m.keys() {
            m.handle(&k, &j(r#"{"type":"accept"}"#), *now);
        }
        assert_eq!(m.phase, Phase::Select);
        *now += 1001;
        m.tick(*now);
        assert_eq!(m.phase, Phase::Buy);
        *now += 1001;
        m.tick(*now);
        assert_eq!(m.phase, Phase::Live);
    }
    fn kill_team(m: &mut Match, killer: &str, team: Team, now: &mut u64) -> Vec<Out> {
        let mut all = Vec::new();
        let victims: Vec<String> = m.players.iter().filter(|p| p.team == team && p.alive).map(|p| p.key.clone()).collect();
        let ki = m.pi(killer).unwrap();
        for v in victims {
            // stand next to the target so range checks pass
            let vi = m.pi(&v).unwrap();
            m.players[ki].pos = m.players[vi].pos;
            m.players[ki].pos[0] += 1.0;
            for _ in 0..10 {
                *now += 500;
                all.extend(m.handle(killer, &j(&format!(r#"{{"type":"hit","target":"{}","weapon":"sheriff","hs":true}}"#, v)), *now));
                if !m.players[vi].alive {
                    break;
                }
            }
        }
        all
    }
    fn play_round(m: &mut Match, winner: Team, now: &mut u64) {
        assert_eq!(m.phase, Phase::Live, "round {}", m.round);
        let killer = m.players.iter().find(|p| p.team == winner && p.alive).unwrap().key.clone();
        kill_team(m, &killer, winner.other(), now);
        assert_eq!(m.phase, Phase::RoundEnd);
        *now += 501;
        m.tick(*now);
        if m.phase == Phase::Buy {
            *now += 1001;
            m.tick(*now);
        }
    }

    #[test]
    fn decline_cancels_and_requeues_others() {
        let (mut m, _) = Match::new("m1".into(), &lobby(2), cfg(2, 13, true), 0);
        m.handle("a0", &j(r#"{"type":"accept"}"#), 10);
        let out = m.handle("b1", &j(r#"{"type":"decline"}"#), 20);
        let Some(Out::Cancelled(ci)) = out.into_iter().find(|o| matches!(o, Out::Cancelled(_))) else { panic!() };
        assert_eq!(ci.offenders, vec![("b1".to_string(), Offense::Decline)]);
        assert_eq!(ci.requeue.len(), 3);
        assert_eq!(m.phase, Phase::Cancelled);
    }

    #[test]
    fn ready_timeout_penalises_non_accepters_only() {
        let (mut m, _) = Match::new("m1".into(), &lobby(1), cfg(1, 13, true), 0);
        m.handle("a0", &j(r#"{"type":"accept"}"#), 10);
        let out = m.tick(1001);
        let Some(Out::Cancelled(ci)) = out.into_iter().next() else { panic!() };
        assert_eq!(ci.offenders, vec![("b0".to_string(), Offense::Decline)]);
        assert_eq!(ci.requeue[0].0, "a0");
    }

    #[test]
    fn leaving_agent_select_is_a_dodge() {
        let (mut m, _) = Match::new("m1".into(), &lobby(1), cfg(1, 13, true), 0);
        for k in m.keys() {
            m.handle(&k, &j(r#"{"type":"accept"}"#), 1);
        }
        let out = m.set_connected("a0", false, 5);
        let Some(Out::Cancelled(ci)) = out.into_iter().next() else { panic!() };
        assert_eq!(ci.offenders, vec![("a0".to_string(), Offense::Dodge)]);
        assert_eq!(ci.reason, "dodged");
    }

    #[test]
    fn unique_agents_per_team_and_autolock() {
        let (mut m, _) = Match::new("m1".into(), &lobby(2), cfg(2, 13, true), 0);
        for k in m.keys() {
            m.handle(&k, &j(r#"{"type":"accept"}"#), 1);
        }
        m.handle("a0", &j(r#"{"type":"pick","agent":"brine"}"#), 2);
        m.handle("a0", &j(r#"{"type":"lock"}"#), 2);
        let out = m.handle("a1", &j(r#"{"type":"pick","agent":"brine"}"#), 3);
        assert!(matches!(&out[0], Out::To(_, s) if s.contains("agent_taken")));
        // enemy can still take the same agent
        m.handle("b0", &j(r#"{"type":"pick","agent":"brine"}"#), 3);
        m.handle("b0", &j(r#"{"type":"lock"}"#), 3);
        let bad = m.handle("b1", &j(r#"{"type":"pick","agent":"<script>"}"#), 3);
        assert!(matches!(&bad[0], Out::To(_, s) if s.contains("bad_agent")));
        m.tick(1001);
        assert_eq!(m.phase, Phase::Buy);
        assert_eq!(m.players[1].agent, Some("sprig"), "a1 auto-assigned first free agent");
    }

    #[test]
    fn economy_buy_validation() {
        let (mut m, _) = Match::new("m1".into(), &lobby(1), cfg(1, 13, true), 0);
        for k in m.keys() {
            m.handle(&k, &j(r#"{"type":"accept"}"#), 1);
        }
        m.tick(1001);
        assert_eq!(m.players[0].cash, 800);
        let out = m.handle("a0", &j(r#"{"type":"buy","item":"vandal"}"#), 1002);
        assert!(matches!(&out[0], Out::To(_, s) if s.contains("Not enough credits")));
        m.handle("a0", &j(r#"{"type":"buy","item":"armor"}"#), 1003);
        assert_eq!(m.players[0].armor, 0, "800 < 1000");
        assert_eq!(m.players[0].weapons, vec!["knife", "sheriff"]);
        // can't buy once the round is live
        m.tick(2002);
        assert_eq!(m.phase, Phase::Live);
        assert!(m.handle("a0", &j(r#"{"type":"buy","item":"sheriff"}"#), 2003).is_empty());
    }

    #[test]
    fn damage_is_server_computed_and_validated() {
        let (mut m, _) = Match::new("m1".into(), &lobby(1), cfg(1, 13, true), 0);
        let mut now = 0;
        to_live(&mut m, &mut now);
        // out of range (spawns are 46m apart) with the knife
        now += 1000;
        m.players[0].weapons.push("knife");
        let out = m.handle("a0", &j(r#"{"type":"hit","target":"b0","weapon":"knife","dmg":9999}"#), now);
        assert!(matches!(&out[0], Out::To(_, s) if s.contains("out of range")));
        // unowned weapon
        let out = m.handle("a0", &j(r#"{"type":"hit","target":"b0","weapon":"operator"}"#), now);
        assert!(matches!(&out[0], Out::To(_, s) if s.contains("not owned")));
        // friendly / self ignored
        assert!(m.handle("a0", &j(r#"{"type":"hit","target":"a0","weapon":"sheriff"}"#), now).is_empty());
        // valid body shot: sheriff 53, client "dmg" ignored
        m.handle("a0", &j(r#"{"type":"hit","target":"b0","weapon":"sheriff","dmg":9999}"#), now);
        assert_eq!(m.players[1].hp, 47);
        // fire-rate limit: immediate second hit dropped
        m.handle("a0", &j(r#"{"type":"hit","target":"b0","weapon":"sheriff"}"#), now + 10);
        assert_eq!(m.players[1].hp, 47);
    }

    #[test]
    fn movement_sanity() {
        let (mut m, _) = Match::new("m1".into(), &lobby(1), cfg(1, 13, true), 0);
        let mut now = 0;
        to_live(&mut m, &mut now);
        let start = m.players[0].pos;
        now += 100;
        let out = m.handle("a0", &j(r#"{"type":"state","x":40,"y":0,"z":0,"yaw":0}"#), now);
        assert!(out.iter().any(|o| matches!(o, Out::To(k, s) if k == "a0" && s.contains("correct"))));
        assert_eq!(m.players[0].pos, start);
        now += 100;
        m.handle("a0", &j(&format!(r#"{{"type":"state","x":{},"y":0,"z":{},"yaw":0}}"#, start[0] + 0.6, start[2])), now);
        assert!((m.players[0].pos[0] - start[0] - 0.6).abs() < 1e-9);
    }

    #[test]
    fn halftime_swaps_sides_and_resets_economy_first_to_13() {
        let (mut m, _) = Match::new("m1".into(), &lobby(1), cfg(1, 13, true), 0);
        let mut now = 0;
        to_live(&mut m, &mut now);
        assert_eq!(m.side_a, Side::Def);
        for _ in 0..12 {
            play_round(&mut m, Team::A, &mut now);
        }
        // 12-0 after the first half; round 13 is on swapped sides with reset credits
        assert_eq!(m.score, [12, 0]);
        assert_eq!(m.round, 13);
        assert_eq!(m.side_a, Side::Atk);
        assert!(m.players.iter().all(|p| p.weapons == DEFAULT_KIT.to_vec()));
        play_round(&mut m, Team::A, &mut now);
        assert_eq!(m.phase, Phase::Ended);
        assert_eq!(m.winner, Some(Team::A));
    }

    #[test]
    fn time_expiry_goes_to_defenders() {
        let mut c = cfg(1, 13, true);
        c.afk_ms = 60_000;
        let (mut m, _) = Match::new("m1".into(), &lobby(1), c, 0);
        let mut now = 0;
        to_live(&mut m, &mut now);
        now += 5001;
        m.tick(now);
        assert_eq!(m.score, [1, 0], "team A defends first half");
    }

    #[test]
    fn overtime_win_by_two_and_draw_cap() {
        let (mut m, _) = Match::new("m1".into(), &lobby(1), cfg(1, 3, true), 0);
        let mut now = 0;
        to_live(&mut m, &mut now);
        play_round(&mut m, Team::A, &mut now);
        play_round(&mut m, Team::B, &mut now);
        assert_eq!(m.score, [1, 1]);
        play_round(&mut m, Team::A, &mut now);
        play_round(&mut m, Team::B, &mut now);
        assert_eq!(m.score, [2, 2]);
        assert!(m.ot);
        assert_eq!(m.players[0].cash, 5000, "OT credits");
        play_round(&mut m, Team::A, &mut now);
        play_round(&mut m, Team::B, &mut now);
        play_round(&mut m, Team::A, &mut now);
        play_round(&mut m, Team::B, &mut now);
        assert_eq!(m.phase, Phase::Ended);
        assert_eq!(m.winner, None, "draw after OT cap");

        let (mut m, _) = Match::new("m2".into(), &lobby(1), cfg(1, 3, true), 0);
        let mut now = 0;
        to_live(&mut m, &mut now);
        for w in [Team::A, Team::B, Team::A, Team::B, Team::B, Team::B] {
            play_round(&mut m, w, &mut now);
        }
        assert_eq!(m.phase, Phase::Ended);
        assert_eq!(m.winner, Some(Team::B));
        assert_eq!(m.score, [2, 4]);
    }

    #[test]
    fn no_overtime_draw() {
        let (mut m, _) = Match::new("m1".into(), &lobby(1), cfg(1, 2, false), 0);
        let mut now = 0;
        to_live(&mut m, &mut now);
        play_round(&mut m, Team::A, &mut now);
        play_round(&mut m, Team::B, &mut now);
        assert_eq!(m.phase, Phase::Ended);
        assert_eq!(m.winner, None);
    }

    #[test]
    fn disconnect_grace_then_abandon_forfeits() {
        let (mut m, _) = Match::new("m1".into(), &lobby(1), cfg(1, 13, true), 0);
        let mut now = 0;
        to_live(&mut m, &mut now);
        m.set_connected("b0", false, now);
        // b0 was the only player alive on B -> round lost
        assert_eq!(m.score, [1, 0]);
        now += 1000;
        let out = m.tick(now);
        assert!(!out.iter().any(|o| matches!(o, Out::Abandoned(_))), "still inside grace");
        // reconnect resets the grace timer
        m.set_connected("b0", true, now);
        m.set_connected("b0", false, now + 1);
        now += 3002;
        let out = m.tick(now);
        assert!(out.iter().any(|o| matches!(o, Out::Abandoned(k) if k == "b0")));
        let ended = out.iter().find_map(|o| if let Out::Ended(s) = o { Some(s.clone()) } else { None }).unwrap();
        assert!(ended.forfeit);
        assert_eq!(ended.winner, Some(Team::A));
        assert!(ended.players.iter().find(|p| p.key == "b0").unwrap().abandoned);
    }

    #[test]
    fn afk_is_abandon_and_team_plays_on() {
        let (mut m, _) = Match::new("m1".into(), &lobby(2), cfg(2, 13, true), 0);
        let mut now = 0;
        to_live(&mut m, &mut now);
        now += 2000;
        m.handle("a0", &j(r#"{"type":"state","yaw":1}"#), now);
        m.handle("b0", &j(r#"{"type":"state","yaw":1}"#), now);
        m.handle("b1", &j(r#"{"type":"state","yaw":1}"#), now);
        now += 2100; // a1 idle 4.1s > afk 4s
        let out = m.tick(now);
        assert!(out.iter().any(|o| matches!(o, Out::Abandoned(k) if k == "a1")));
        assert_ne!(m.phase, Phase::Ended, "team A still has a0");
    }

    #[test]
    fn economy_rewards() {
        let (mut m, _) = Match::new("m1".into(), &lobby(1), cfg(1, 13, true), 0);
        let mut now = 0;
        to_live(&mut m, &mut now);
        play_round(&mut m, Team::A, &mut now);
        // A: 800 + 200 kill + 3000 win; B: 800 + 1900
        assert_eq!(m.players[0].cash, 4000);
        assert_eq!(m.players[1].cash, 2700);
        play_round(&mut m, Team::A, &mut now);
        // B second loss in a row: +2400
        assert_eq!(m.players[1].cash, 5100);
    }

    fn msg_of<'a>(out: &'a [Out], ty: &str) -> Option<&'a String> {
        out.iter().find_map(|o| match o {
            Out::All(s) | Out::To(_, s) if s.contains(&format!("\"type\":\"{}\"", ty)) => Some(s),
            _ => None,
        })
    }

    #[test]
    fn map_comes_from_pool_and_is_announced() {
        let mut c = cfg(1, 13, true);
        c.map_pool = crate::maps::parse_pool("brinepeak");
        let (mut m, out) = Match::new("m-brine".into(), &lobby(1), c, 0);
        assert_eq!(m.map.id, "brinepeak");
        assert!(msg_of(&out, "match_found").unwrap().contains("\"map\":\"brinepeak\""));
        let mut out = Vec::new();
        for k in m.keys() {
            out.extend(m.handle(&k, &j(r#"{"type":"accept"}"#), 0));
        }
        assert!(msg_of(&out, "agent_select").unwrap().contains("\"map_code\":\"de_brinepeak\""));
        let out = m.tick(1001);
        let start = msg_of(&out, "match_start").unwrap();
        assert!(start.contains("\"map\":\"brinepeak\",\"map_code\":\"de_brinepeak\",\"sites\":3"), "{}", start);
        assert!(m.snapshot("a0", 1001).contains("\"map\":\"brinepeak\""));
        // default pool: deterministic per id, both maps reachable
        let mut seen = std::collections::HashSet::new();
        for i in 0..40 {
            let (m, _) = Match::new(format!("rk-{:x}-{}", 1_700_000_000_000u64 + i * 31, i), &lobby(1), cfg(1, 13, true), 0);
            seen.insert(m.map.id);
        }
        assert_eq!(seen.len(), 2);
    }

    #[test]
    fn brinepeak_spawns_and_bounds() {
        let mut c = cfg(5, 13, true);
        c.map_pool = crate::maps::parse_pool("brinepeak");
        let (mut m, _) = Match::new("m-b5".into(), &lobby(5), c, 0);
        let mut now = 0;
        to_live(&mut m, &mut now);
        let map = crate::maps::BRINEPEAK;
        for p in &m.players {
            assert!(map.in_bounds(p.pos[0], p.pos[1], p.pos[2]));
            // team A starts on defence (north, z = -31), team B on attack (south, z = 31)
            assert_eq!(p.pos[2], if p.team == Team::A { -31.0 } else { 31.0 });
        }
        let xs: std::collections::HashSet<i64> = m.players.iter().filter(|p| p.team == Team::A).map(|p| p.pos[0] as i64).collect();
        assert_eq!(xs.len(), 5, "distinct spawn slots");
        // x = 45 is out of bounds on dustline but a legal spot (cart road) on brinepeak:
        // walk there in small steps without a correction
        let a0 = m.players[0].pos;
        let mut x = a0[0];
        let mut z = a0[2];
        let mut corrected = false;
        while x < 45.0 || z < -10.0 {
            now += 100;
            x = (x + 2.0).min(45.0);
            z = (z + 1.5).min(-10.0);
            let out = m.handle("a0", &j(&format!(r#"{{"type":"state","x":{},"y":0,"z":{},"yaw":0}}"#, x, z)), now);
            corrected |= msg_of(&out, "correct").is_some();
        }
        assert!(!corrected);
        assert_eq!((m.players[0].pos[0], m.players[0].pos[2]), (45.0, -10.0));
        // ... but outside the 104 x 80 grid is corrected
        now += 100;
        let out = m.handle("a0", &j(r#"{"type":"state","x":46.5,"y":0,"z":-41,"yaw":0}"#), now);
        assert!(msg_of(&out, "correct").is_some());
    }

    #[test]
    fn dustline_bounds_still_enforced() {
        let mut c = cfg(1, 13, true);
        c.map_pool = crate::maps::parse_pool("dustline");
        let (mut m, _) = Match::new("m-d".into(), &lobby(1), c, 0);
        let mut now = 0;
        to_live(&mut m, &mut now);
        assert_eq!(m.players[0].pos, [-23.0, 0.0, -8.0]);
        m.players[0].pos = [37.5, 0.0, 0.0];
        now += 100;
        let out = m.handle("a0", &j(r#"{"type":"state","x":38.5,"y":0,"z":0,"yaw":0}"#), now);
        assert!(msg_of(&out, "correct").is_some());
    }

}
