//! `cargo run --release` - starts the Last Zone match server.
//! Environment: PORT (8080), BIND (0.0.0.0), LOBBY_SECONDS (30), MAX_PLAYERS (25), MAX_HUMANS (16),
//! BOT_DIFFICULTY (easy|normal|hard), SIM_SPEED (1; >1 fast-forwards matches, for testing only).
use last_zone_server::room::Config;
use last_zone_server::world::{build_world, MAP_SEED};
use std::net::SocketAddr;

fn env<T: std::str::FromStr>(k: &str, d: T) -> T {
    std::env::var(k).ok().and_then(|v| v.parse().ok()).unwrap_or(d)
}

#[tokio::main]
async fn main() {
    let port: u16 = env("PORT", 8080);
    let bind: String = env("BIND", "0.0.0.0".to_string());
    let mut cfg = Config::default();
    cfg.lobby_seconds = env("LOBBY_SECONDS", cfg.lobby_seconds).clamp(1.0, 600.0);
    cfg.max_players = env("MAX_PLAYERS", cfg.max_players).clamp(2, 25);
    cfg.max_humans = env("MAX_HUMANS", cfg.max_humans).clamp(1, 25);
    cfg.sim_speed = env("SIM_SPEED", 1u32).clamp(1, 32);
    cfg.bot_difficulty = match env("BOT_DIFFICULTY", "normal".to_string()).as_str() {
        "easy" => 0,
        "hard" => 2,
        _ => 1,
    };
    let t0 = std::time::Instant::now();
    let world = build_world(MAP_SEED);
    eprintln!("[last-zone] island built in {} ms ({} colliders)", t0.elapsed().as_millis(), world.boxes.len());
    let addr: SocketAddr = format!("{}:{}", bind, port).parse().expect("BIND/PORT");
    eprintln!("[last-zone] listening on ws://{} (health: http://{}/health)", addr, addr);
    if let Err(e) = last_zone_server::server::run(addr, cfg, world).await {
        eprintln!("[last-zone] server error: {}", e);
        std::process::exit(1);
    }
}
