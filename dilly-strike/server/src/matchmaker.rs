/* ==========================================================================
   Matchmaker (pure functions, unit tested).
   - Each queued player has an acceptable MMR window that widens with wait time:
       window = min(base + growth * wait_secs, max)
   - The longest-waiting player anchors a lobby; candidates must sit inside the
     anchor's window AND the anchor must sit inside theirs (so a fresh player is
     never dragged into a wildly uneven game just because someone else waited).
   - The 2*team_size closest candidates form the lobby, split into the two teams
     with the smallest summed-MMR difference (exhaustive for <= 10 players).
   - Escalating cooldowns for declines / dodges / abandons live here too.
   ========================================================================== */

#[derive(Debug, Clone, PartialEq)]
pub struct QueueEntry {
    pub key: String,
    pub name: String,
    pub mmr: f64,
    pub joined_ms: u64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Lobby {
    pub team_a: Vec<QueueEntry>,
    pub team_b: Vec<QueueEntry>,
}

#[derive(Debug, Clone, Copy)]
pub struct WindowRules {
    pub base: f64,
    pub growth_per_sec: f64,
    pub max: f64,
}

pub fn window(rules: &WindowRules, joined_ms: u64, now_ms: u64) -> f64 {
    let waited = now_ms.saturating_sub(joined_ms) as f64 / 1000.0;
    (rules.base + rules.growth_per_sec * waited).min(rules.max.max(rules.base))
}

/// Form as many lobbies as possible. Returns (lobbies, players left in queue).
pub fn form_lobbies(mut queue: Vec<QueueEntry>, team_size: usize, rules: &WindowRules, now_ms: u64) -> (Vec<Lobby>, Vec<QueueEntry>) {
    let need = team_size * 2;
    let mut lobbies = Vec::new();
    queue.sort_by(|a, b| a.joined_ms.cmp(&b.joined_ms).then(a.key.cmp(&b.key)));
    let mut i = 0;
    while i < queue.len() {
        if queue.len() < need {
            break;
        }
        let anchor = queue[i].clone();
        let wa = window(rules, anchor.joined_ms, now_ms);
        let mut cands: Vec<(f64, usize)> = queue
            .iter()
            .enumerate()
            .filter(|(j, c)| {
                if *j == i {
                    return false;
                }
                let d = (c.mmr - anchor.mmr).abs();
                d <= wa && d <= window(rules, c.joined_ms, now_ms)
            })
            .map(|(j, c)| ((c.mmr - anchor.mmr).abs(), j))
            .collect();
        if cands.len() + 1 < need {
            i += 1;
            continue;
        }
        cands.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal).then(a.1.cmp(&b.1)));
        let mut picked: Vec<usize> = cands.iter().take(need - 1).map(|c| c.1).collect();
        picked.push(i);
        let players: Vec<QueueEntry> = picked.iter().map(|&j| queue[j].clone()).collect();
        lobbies.push(balance(players, team_size));
        picked.sort_unstable_by(|a, b| b.cmp(a));
        for j in picked {
            queue.remove(j);
        }
        i = 0;
    }
    (lobbies, queue)
}

/// Split 2*team_size players into the two teams with the closest MMR sums.
pub fn balance(mut players: Vec<QueueEntry>, team_size: usize) -> Lobby {
    players.sort_by(|a, b| b.mmr.partial_cmp(&a.mmr).unwrap_or(std::cmp::Ordering::Equal));
    let n = players.len();
    let total: f64 = players.iter().map(|p| p.mmr).sum();
    let mut best_mask = 0u32;
    let mut best = f64::INFINITY;
    // Player 0 is always on team A: halves the search and makes output deterministic.
    for mask in 0u32..(1 << n) {
        if mask & 1 == 0 || mask.count_ones() as usize != team_size {
            continue;
        }
        let sa: f64 = (0..n).filter(|b| mask & (1 << b) != 0).map(|b| players[b].mmr).sum();
        let diff = (total - 2.0 * sa).abs();
        if diff < best - 1e-9 {
            best = diff;
            best_mask = mask;
        }
    }
    let mut lobby = Lobby { team_a: Vec::new(), team_b: Vec::new() };
    for (b, p) in players.into_iter().enumerate() {
        if best_mask & (1 << b) != 0 {
            lobby.team_a.push(p);
        } else {
            lobby.team_b.push(p);
        }
    }
    lobby
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Offense {
    /// Declined / ignored the ready check.
    Decline,
    /// Left during agent select.
    Dodge,
    /// Left / AFK / disconnected past the grace period mid-match.
    Abandon,
}

/// Cooldown for the n-th offense (1-based) within the rolling 24h offense window.
/// Declines escalate 1x, 3x, 10x; dodges/abandons start at the leaver cooldown and double.
pub fn cooldown_ms(off: Offense, nth: u32, decline_base: u64, leaver_base: u64) -> u64 {
    let n = nth.max(1);
    match off {
        Offense::Decline => decline_base * [1u64, 3, 10, 30][(n as usize - 1).min(3)],
        Offense::Dodge => (decline_base * 5).max(leaver_base / 2) * (1u64 << (n - 1).min(4)),
        Offense::Abandon => leaver_base * (1u64 << (n - 1).min(4)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn e(k: &str, mmr: f64, joined: u64) -> QueueEntry {
        QueueEntry { key: k.into(), name: k.into(), mmr, joined_ms: joined }
    }
    const R: WindowRules = WindowRules { base: 100.0, growth_per_sec: 10.0, max: 500.0 };

    #[test]
    fn window_widens_then_caps() {
        assert_eq!(window(&R, 0, 0), 100.0);
        assert_eq!(window(&R, 0, 10_000), 200.0);
        assert_eq!(window(&R, 0, 1_000_000), 500.0);
        assert_eq!(window(&R, 5_000, 1_000), 100.0, "clock skew never shrinks below base");
    }

    #[test]
    fn far_apart_players_wait_until_windows_cover_gap() {
        let q = vec![e("a", 1500.0, 0), e("b", 1800.0, 0)];
        let (l, rest) = form_lobbies(q.clone(), 1, &R, 1_000);
        assert!(l.is_empty() && rest.len() == 2);
        // gap 300 => both windows need 300 => 20s
        let (l, rest) = form_lobbies(q.clone(), 1, &R, 19_000);
        assert!(l.is_empty() && rest.len() == 2);
        let (l, rest) = form_lobbies(q, 1, &R, 20_000);
        assert_eq!(l.len(), 1);
        assert!(rest.is_empty());
    }

    #[test]
    fn fresh_player_window_also_respected() {
        // anchor waited long (huge window) but newcomer just joined (window 100)
        let q = vec![e("old", 1500.0, 0), e("new", 1800.0, 100_000)];
        let (l, _) = form_lobbies(q, 1, &R, 100_500);
        assert!(l.is_empty());
    }

    #[test]
    fn picks_closest_and_balances_5v5() {
        let mut q = Vec::new();
        for i in 0..10 {
            q.push(e(&format!("p{}", i), 1400.0 + i as f64 * 20.0, i as u64));
        }
        q.push(e("outlier", 2600.0, 0));
        let (l, rest) = form_lobbies(q, 5, &R, 60_000);
        assert_eq!(l.len(), 1);
        assert_eq!(rest.len(), 1);
        assert_eq!(rest[0].key, "outlier");
        let lob = &l[0];
        assert_eq!(lob.team_a.len(), 5);
        assert_eq!(lob.team_b.len(), 5);
        let sa: f64 = lob.team_a.iter().map(|p| p.mmr).sum();
        let sb: f64 = lob.team_b.iter().map(|p| p.mmr).sum();
        assert!((sa - sb).abs() <= 20.0, "diff {}", sa - sb);
    }

    #[test]
    fn multiple_lobbies_and_priority_by_wait() {
        let q: Vec<_> = (0..5).map(|i| e(&format!("p{}", i), 1500.0, i as u64 * 1000)).collect();
        let (l, rest) = form_lobbies(q, 1, &R, 10_000);
        assert_eq!(l.len(), 2);
        assert_eq!(rest.len(), 1);
        assert_eq!(rest[0].key, "p4", "latest joiner waits");
    }

    #[test]
    fn cooldowns_escalate() {
        let d = 60_000;
        let lv = 600_000;
        assert_eq!(cooldown_ms(Offense::Decline, 1, d, lv), 60_000);
        assert_eq!(cooldown_ms(Offense::Decline, 2, d, lv), 180_000);
        assert_eq!(cooldown_ms(Offense::Decline, 9, d, lv), 1_800_000);
        assert_eq!(cooldown_ms(Offense::Abandon, 1, d, lv), 600_000);
        assert_eq!(cooldown_ms(Offense::Abandon, 2, d, lv), 1_200_000);
        assert_eq!(cooldown_ms(Offense::Abandon, 50, d, lv), 9_600_000);
        assert!(cooldown_ms(Offense::Dodge, 1, d, lv) >= 300_000);
    }
}
