/* ==========================================================================
   Ranked persistence behind a trait:
   - PgStore: PostgreSQL (migrations in server/migrations, applied at boot).
   - MemStore: in-process maps for tests / a server started without DATABASE_URL
     (ratings then live only as long as the process — logged loudly at boot).
   All SQL values are either numbers formatted by us or strings passed through
   pg_escape after callsign validation (the PG client only speaks the simple
   query protocol, so there are no bind parameters).
   ========================================================================== */

use crate::ha::{pg_escape, HaContext};
use crate::rating::{Glicko, PlayerRank};
use std::collections::HashMap;
use std::sync::Mutex;

pub const MIGRATIONS: [(i32, &str); 1] = [(1, include_str!("../migrations/001_ranked.sql"))];

#[derive(Debug, Clone, PartialEq)]
pub struct PlayerRecord {
    pub key: String,
    pub name: String,
    pub rank: PlayerRank,
    pub wins: u32,
    pub losses: u32,
    pub draws: u32,
    pub abandons: u32,
    pub peak_rr: i32,
}

impl PlayerRecord {
    pub fn new(key: &str, name: &str) -> Self {
        PlayerRecord {
            key: key.into(),
            name: name.into(),
            rank: PlayerRank { glicko: Glicko::default(), rr: 0, placements: 0 },
            wins: 0,
            losses: 0,
            draws: 0,
            abandons: 0,
            peak_rr: 0,
        }
    }
}

#[derive(Debug, Clone)]
pub struct MatchRow {
    pub id: String,
    pub team_size: usize,
    pub score: [u32; 2],
    pub winner: Option<char>,
    pub rounds: u32,
    pub overtime: bool,
    pub forfeit: bool,
    pub pod: String,
    pub started_ms: u64,
    pub ended_ms: u64,
}

#[derive(Debug, Clone)]
pub struct MatchPlayerRow {
    pub key: String,
    pub name: String,
    pub team: char,
    pub agent: String,
    pub result: &'static str,
    pub abandoned: bool,
    pub kills: u32,
    pub deaths: u32,
    pub headshots: u32,
    pub damage: u32,
    pub mvps: u32,
    pub rating_before: f64,
    pub rating_after: f64,
    pub rr_before: i32,
    pub rr_after: i32,
    pub rr_delta: i32,
    pub placements_after: u32,
}

#[derive(Debug, Clone)]
pub struct HistoryItem {
    pub match_id: String,
    pub ended_ms: u64,
    pub score: [u32; 2],
    pub team_size: u32,
    pub row: MatchPlayerRow,
}

pub trait RankedStore: Send + Sync {
    fn migrate(&self) -> Result<(), String>;
    fn load(&self, key: &str, name: &str) -> Result<PlayerRecord, String>;
    fn save_player(&self, p: &PlayerRecord) -> Result<(), String>;
    /// Persist a finished match + every participant's new rating atomically.
    fn record_match(&self, m: &MatchRow, rows: &[MatchPlayerRow], players: &[PlayerRecord]) -> Result<(), String>;
    fn leaderboard(&self, limit: usize) -> Result<Vec<PlayerRecord>, String>;
    fn history(&self, key: &str, limit: usize) -> Result<Vec<HistoryItem>, String>;
    fn kind(&self) -> &'static str;
}

/* ---------------- memory ---------------- */

#[derive(Default)]
pub struct MemStore {
    players: Mutex<HashMap<String, PlayerRecord>>,
    history: Mutex<Vec<HistoryItem>>,
}

impl RankedStore for MemStore {
    fn migrate(&self) -> Result<(), String> {
        Ok(())
    }
    fn load(&self, key: &str, name: &str) -> Result<PlayerRecord, String> {
        Ok(self.players.lock().unwrap().get(key).cloned().unwrap_or_else(|| PlayerRecord::new(key, name)))
    }
    fn save_player(&self, p: &PlayerRecord) -> Result<(), String> {
        self.players.lock().unwrap().insert(p.key.clone(), p.clone());
        Ok(())
    }
    fn record_match(&self, m: &MatchRow, rows: &[MatchPlayerRow], players: &[PlayerRecord]) -> Result<(), String> {
        let mut g = self.players.lock().unwrap();
        for p in players {
            g.insert(p.key.clone(), p.clone());
        }
        let mut h = self.history.lock().unwrap();
        for r in rows {
            h.push(HistoryItem { match_id: m.id.clone(), ended_ms: m.ended_ms, score: m.score, team_size: m.team_size as u32, row: r.clone() });
        }
        Ok(())
    }
    fn leaderboard(&self, limit: usize) -> Result<Vec<PlayerRecord>, String> {
        let mut v: Vec<PlayerRecord> = self.players.lock().unwrap().values().filter(|p| p.rank.placed()).cloned().collect();
        v.sort_by(|a, b| b.rank.rr.cmp(&a.rank.rr).then(a.key.cmp(&b.key)));
        v.truncate(limit);
        Ok(v)
    }
    fn history(&self, key: &str, limit: usize) -> Result<Vec<HistoryItem>, String> {
        let h = self.history.lock().unwrap();
        Ok(h.iter().rev().filter(|i| i.row.key == key).take(limit).cloned().collect())
    }
    fn kind(&self) -> &'static str {
        "memory"
    }
}

/* ---------------- PostgreSQL ---------------- */

pub struct PgStore {
    ha: HaContext,
}

impl PgStore {
    pub fn new(ha: HaContext) -> Self {
        PgStore { ha }
    }
}

fn b(s: &str) -> bool {
    s == "t" || s == "true"
}
fn n<T: std::str::FromStr + Default>(s: &str) -> T {
    s.parse().unwrap_or_default()
}

const PLAYER_COLS: &str = "player_key, display_name, rating, rd, vol, rr, placements, wins, losses, draws, abandons, peak_rr";

fn player_from_row(r: &[String]) -> Option<PlayerRecord> {
    if r.len() < 12 {
        return None;
    }
    Some(PlayerRecord {
        key: r[0].clone(),
        name: r[1].clone(),
        rank: PlayerRank { glicko: Glicko { rating: n(&r[2]), rd: n(&r[3]), vol: n(&r[4]) }, rr: n(&r[5]), placements: n(&r[6]) },
        wins: n(&r[7]),
        losses: n(&r[8]),
        draws: n(&r[9]),
        abandons: n(&r[10]),
        peak_rr: n(&r[11]),
    })
}

fn upsert_player_sql(p: &PlayerRecord) -> String {
    format!(
        "INSERT INTO ranked_players ({}, updated_at) VALUES ('{}','{}',{:.4},{:.4},{:.6},{},{},{},{},{},{},{},NOW()) \
         ON CONFLICT (player_key) DO UPDATE SET display_name=EXCLUDED.display_name, rating=EXCLUDED.rating, rd=EXCLUDED.rd, vol=EXCLUDED.vol, \
         rr=EXCLUDED.rr, placements=EXCLUDED.placements, wins=EXCLUDED.wins, losses=EXCLUDED.losses, draws=EXCLUDED.draws, \
         abandons=EXCLUDED.abandons, peak_rr=EXCLUDED.peak_rr, updated_at=NOW();",
        PLAYER_COLS,
        pg_escape(&p.key),
        pg_escape(&p.name),
        p.rank.glicko.rating,
        p.rank.glicko.rd,
        p.rank.glicko.vol,
        p.rank.rr,
        p.rank.placements,
        p.wins,
        p.losses,
        p.draws,
        p.abandons,
        p.peak_rr
    )
}

impl RankedStore for PgStore {
    fn migrate(&self) -> Result<(), String> {
        self.ha.pg_exec(
            "CREATE TABLE IF NOT EXISTS dilly_schema_migrations (service TEXT NOT NULL, version INTEGER NOT NULL, \
             applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (service, version));",
        )?;
        for (ver, sql) in MIGRATIONS {
            // advisory lock serialises concurrent replicas booting at once
            self.ha.pg_exec(&format!(
                "BEGIN; SELECT pg_advisory_xact_lock(74210); \
                 DO $mig$ BEGIN IF NOT EXISTS (SELECT 1 FROM dilly_schema_migrations WHERE service='dilly-strike' AND version={v}) THEN \
                 EXECUTE $sql${sql}$sql$; \
                 INSERT INTO dilly_schema_migrations (service, version) VALUES ('dilly-strike', {v}); END IF; END $mig$; COMMIT;",
                v = ver,
                sql = sql
            ))?;
        }
        Ok(())
    }
    fn load(&self, key: &str, name: &str) -> Result<PlayerRecord, String> {
        let rows = self.ha.pg_query(&format!("SELECT {} FROM ranked_players WHERE player_key='{}';", PLAYER_COLS, pg_escape(key)))?;
        Ok(rows.first().and_then(|r| player_from_row(r)).unwrap_or_else(|| PlayerRecord::new(key, name)))
    }
    fn save_player(&self, p: &PlayerRecord) -> Result<(), String> {
        self.ha.pg_exec(&upsert_player_sql(p))
    }
    fn record_match(&self, m: &MatchRow, rows: &[MatchPlayerRow], players: &[PlayerRecord]) -> Result<(), String> {
        let mut sql = String::from("BEGIN;");
        sql.push_str(&format!(
            "INSERT INTO ranked_matches (id, team_size, score_a, score_b, winner, rounds, overtime, forfeit, pod, started_at, ended_at) \
             VALUES ('{}',{},{},{},{},{},{},{},'{}',to_timestamp({:.3}),to_timestamp({:.3}));",
            pg_escape(&m.id),
            m.team_size,
            m.score[0],
            m.score[1],
            m.winner.map(|w| format!("'{}'", w)).unwrap_or_else(|| "NULL".into()),
            m.rounds,
            m.overtime,
            m.forfeit,
            pg_escape(&m.pod),
            m.started_ms as f64 / 1000.0,
            m.ended_ms as f64 / 1000.0
        ));
        for r in rows {
            sql.push_str(&format!(
                "INSERT INTO ranked_match_players (match_id, player_key, display_name, team, agent, result, abandoned, kills, deaths, headshots, damage, mvps, \
                 rating_before, rating_after, rr_before, rr_after, rr_delta, placements_after) VALUES \
                 ('{}','{}','{}','{}','{}','{}',{},{},{},{},{},{},{:.4},{:.4},{},{},{},{});",
                pg_escape(&m.id),
                pg_escape(&r.key),
                pg_escape(&r.name),
                r.team,
                pg_escape(&r.agent),
                r.result,
                r.abandoned,
                r.kills,
                r.deaths,
                r.headshots,
                r.damage,
                r.mvps,
                r.rating_before,
                r.rating_after,
                r.rr_before,
                r.rr_after,
                r.rr_delta,
                r.placements_after
            ));
        }
        for p in players {
            sql.push_str(&upsert_player_sql(p));
        }
        sql.push_str("COMMIT;");
        self.ha.pg_exec(&sql)
    }
    fn leaderboard(&self, limit: usize) -> Result<Vec<PlayerRecord>, String> {
        let rows = self.ha.pg_query(&format!(
            "SELECT {} FROM ranked_players WHERE placements >= {} ORDER BY rr DESC, player_key ASC LIMIT {};",
            PLAYER_COLS,
            crate::rating::PLACEMENT_MATCHES,
            limit.min(200)
        ))?;
        Ok(rows.iter().filter_map(|r| player_from_row(r)).collect())
    }
    fn history(&self, key: &str, limit: usize) -> Result<Vec<HistoryItem>, String> {
        let rows = self.ha.pg_query(&format!(
            "SELECT mp.match_id, (EXTRACT(EPOCH FROM m.ended_at) * 1000)::BIGINT, m.score_a, m.score_b, m.team_size, \
             mp.player_key, mp.display_name, mp.team, mp.agent, mp.result, mp.abandoned, mp.kills, mp.deaths, mp.headshots, mp.damage, mp.mvps, \
             mp.rating_before, mp.rating_after, mp.rr_before, mp.rr_after, mp.rr_delta, mp.placements_after \
             FROM ranked_match_players mp JOIN ranked_matches m ON m.id = mp.match_id \
             WHERE mp.player_key = '{}' ORDER BY m.ended_at DESC LIMIT {};",
            pg_escape(key),
            limit.min(100)
        ))?;
        Ok(rows
            .iter()
            .filter(|r| r.len() >= 22)
            .map(|r| HistoryItem {
                match_id: r[0].clone(),
                ended_ms: n(&r[1]),
                score: [n(&r[2]), n(&r[3])],
                team_size: n(&r[4]),
                row: MatchPlayerRow {
                    key: r[5].clone(),
                    name: r[6].clone(),
                    team: r[7].chars().next().unwrap_or('a'),
                    agent: r[8].clone(),
                    result: match r[9].as_str() {
                        "win" => "win",
                        "draw" => "draw",
                        _ => "loss",
                    },
                    abandoned: b(&r[10]),
                    kills: n(&r[11]),
                    deaths: n(&r[12]),
                    headshots: n(&r[13]),
                    damage: n(&r[14]),
                    mvps: n(&r[15]),
                    rating_before: n(&r[16]),
                    rating_after: n(&r[17]),
                    rr_before: n(&r[18]),
                    rr_after: n(&r[19]),
                    rr_delta: n(&r[20]),
                    placements_after: n(&r[21]),
                },
            })
            .collect())
    }
    fn kind(&self) -> &'static str {
        "postgres"
    }
}
