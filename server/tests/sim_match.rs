//! Full bot matches through the Rust sim: they must finish with a winner, bots must fight, and the
//! same seed must replay bit-for-bit (determinism).
use last_zone_server::bots::{init_bots, update_bots};
use last_zone_server::sim::{Event, Match, DT};
use last_zone_server::world::{build_world, MAP_SEED};

fn run(seed: u32) -> (f64, u32, u32, u64, u32) {
    let w = build_world(MAP_SEED);
    let mut m = Match::new(w, seed, true);
    init_bots(&mut m, 25, 1);
    let (mut kills, mut shots) = (0u32, 0u64);
    while !m.over && m.t < 1500.0 {
        update_bots(&mut m, DT);
        m.step(DT);
        for e in m.events.drain(..) {
            match e {
                Event::Kill { by, .. } if by != 0 => kills += 1,
                Event::Fire { .. } => shots += 1,
                _ => {}
            }
        }
    }
    let hash = m.players.iter().fold(0f64, |a, p| a + p.x * 3.0 + p.z * 7.0 + p.hp + p.kills as f64);
    (m.t, m.winner.unwrap_or(0), kills, shots, (hash * 1000.0) as u32)
}

#[test]
fn bot_match_finishes_and_is_deterministic() {
    for seed in [3u32, 77] {
        let a = run(seed);
        println!("seed {}: t={:.0}s winner={} gun kills={} shots={}", seed, a.0, a.1, a.2, a.3);
        assert!(a.0 < 1500.0, "match did not end");
        assert!(a.1 != 0, "no winner");
        assert!(a.2 >= 3, "bots barely fought ({} kills)", a.2);
        let b = run(seed);
        assert_eq!(a, b, "same seed must replay identically");
    }
}
