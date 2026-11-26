/* Ranked configuration, all from environment variables (see server/README.md). */

use crate::maps::{self, MapDef};
use std::env;

#[derive(Debug, Clone)]
pub struct RankedConfig {
    /// HMAC secret shared with the hub (DILLY_SESSION_SECRET). Ranked is disabled without it.
    pub secret: Option<Vec<u8>>,
    pub team_size: usize,
    pub rounds_to_win: u32,
    pub overtime: bool,
    pub max_ot_rounds: u32,
    pub accept_ms: u64,
    pub select_ms: u64,
    pub buy_ms: u64,
    pub round_ms: u64,
    pub round_end_ms: u64,
    pub reconnect_ms: u64,
    pub afk_ms: u64,
    pub start_credits: i32,
    pub ot_credits: i32,
    pub window_base: f64,
    pub window_growth_per_sec: f64,
    pub window_max: f64,
    pub decline_cooldown_ms: u64,
    pub leaver_cooldown_ms: u64,
    pub leaver_rr: i32,
    pub dodge_rr: i32,
    pub msg_rate_per_sec: f64,
    pub msg_burst: f64,
    pub conn_per_ip_per_min: u32,
    /// Maps ranked matches are drawn from (RANKED_MAPS, comma separated ids; default: every map).
    pub map_pool: Vec<&'static MapDef>,
}

fn num<T: std::str::FromStr>(k: &str, d: T) -> T {
    env::var(k).ok().and_then(|v| v.trim().parse().ok()).unwrap_or(d)
}

impl RankedConfig {
    pub fn defaults() -> Self {
        RankedConfig {
            secret: None,
            team_size: 5,
            rounds_to_win: 13,
            overtime: true,
            max_ot_rounds: 6,
            accept_ms: 15_000,
            select_ms: 30_000,
            buy_ms: 20_000,
            round_ms: 100_000,
            round_end_ms: 6_000,
            reconnect_ms: 90_000,
            afk_ms: 75_000,
            start_credits: 800,
            ot_credits: 5000,
            window_base: 100.0,
            window_growth_per_sec: 8.0,
            window_max: 600.0,
            decline_cooldown_ms: 60_000,
            leaver_cooldown_ms: 600_000,
            leaver_rr: 15,
            dodge_rr: 5,
            msg_rate_per_sec: 40.0,
            msg_burst: 80.0,
            conn_per_ip_per_min: 30,
            map_pool: maps::MAPS.to_vec(),
        }
    }

    pub fn from_env() -> Self {
        let d = Self::defaults();
        let secret = env::var("DILLY_SESSION_SECRET").ok().filter(|s| s.len() >= crate::auth::MIN_SECRET_LEN).map(|s| s.into_bytes());
        let secs = |k: &str, dflt: u64| (num::<f64>(k, dflt as f64 / 1000.0) * 1000.0).max(0.0) as u64;
        RankedConfig {
            secret,
            team_size: num("RANKED_TEAM_SIZE", d.team_size).clamp(1, 5),
            rounds_to_win: num("RANKED_ROUNDS_TO_WIN", d.rounds_to_win).clamp(1, 13),
            overtime: num("RANKED_OVERTIME", 1u8) != 0,
            max_ot_rounds: num("RANKED_MAX_OT_ROUNDS", d.max_ot_rounds).clamp(2, 24),
            accept_ms: secs("RANKED_ACCEPT_SECS", d.accept_ms),
            select_ms: secs("RANKED_SELECT_SECS", d.select_ms),
            buy_ms: secs("RANKED_BUY_SECS", d.buy_ms),
            round_ms: secs("RANKED_ROUND_SECS", d.round_ms),
            round_end_ms: secs("RANKED_ROUND_END_SECS", d.round_end_ms),
            reconnect_ms: secs("RANKED_RECONNECT_SECS", d.reconnect_ms),
            afk_ms: secs("RANKED_AFK_SECS", d.afk_ms),
            start_credits: num("RANKED_START_CREDITS", d.start_credits).clamp(0, 9000),
            ot_credits: num("RANKED_OT_CREDITS", d.ot_credits).clamp(0, 9000),
            window_base: num("RANKED_WINDOW_BASE", d.window_base).max(0.0),
            window_growth_per_sec: num("RANKED_WINDOW_GROWTH", d.window_growth_per_sec).max(0.0),
            window_max: num("RANKED_WINDOW_MAX", d.window_max).max(0.0),
            decline_cooldown_ms: secs("RANKED_DECLINE_COOLDOWN_SECS", d.decline_cooldown_ms),
            leaver_cooldown_ms: secs("RANKED_LEAVER_COOLDOWN_SECS", d.leaver_cooldown_ms),
            leaver_rr: num("RANKED_LEAVER_RR", d.leaver_rr).clamp(0, 100),
            dodge_rr: num("RANKED_DODGE_RR", d.dodge_rr).clamp(0, 100),
            msg_rate_per_sec: num("RANKED_MSG_RATE", d.msg_rate_per_sec).max(1.0),
            msg_burst: num("RANKED_MSG_BURST", d.msg_burst).max(1.0),
            conn_per_ip_per_min: num("RANKED_CONN_PER_IP_PER_MIN", d.conn_per_ip_per_min).max(1),
            map_pool: env::var("RANKED_MAPS").map(|v| maps::parse_pool(&v)).unwrap_or(d.map_pool),
        }
    }

    /// Rounds played before the half-time side swap (12 for first-to-13).
    pub fn half_rounds(&self) -> u32 {
        self.rounds_to_win.saturating_sub(1).max(1)
    }
}
