/* ==========================================================================
   Ranked rating: Glicko-2 hidden MMR + visible Rank Rating (RR) and tiers.
   - Every player has a Glicko-2 (rating, RD, volatility). A ranked match is one
     rating period against a composite opponent = the enemy team (mean rating,
     RMS deviation). Abandoning always scores 0 (a loss) for the leaver.
   - Visible rank: `rr` points. Each division spans 100 RR; 7 tiers x 3
     divisions (0..2099) then Legend (2100+, uncapped).
   - First PLACEMENT_MATCHES matches are placements: rank hidden, RR is then
     seeded from MMR. Afterwards RR moves by a base step plus a convergence term
     that pulls RR towards the MMR-implied RR, so wins always gain RR and losses
     always lose RR, but by different amounts.
   ========================================================================== */

pub const PLACEMENT_MATCHES: u32 = 5;
pub const TIERS: [&str; 8] = ["Seedling", "Sprout", "Gherkin", "Dill", "Brine", "Kosher", "Pickle Master", "Legend"];
pub const LEGEND_RR: i32 = 2100;
const GLICKO_SCALE: f64 = 173.7178;
const TAU: f64 = 0.5;
pub const DEFAULT_RATING: f64 = 1500.0;
pub const DEFAULT_RD: f64 = 350.0;
pub const DEFAULT_VOL: f64 = 0.06;
pub const MIN_RD: f64 = 45.0;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Glicko {
    pub rating: f64,
    pub rd: f64,
    pub vol: f64,
}

impl Default for Glicko {
    fn default() -> Self {
        Glicko { rating: DEFAULT_RATING, rd: DEFAULT_RD, vol: DEFAULT_VOL }
    }
}

/// One Glicko-2 rating period with a list of (opponent, score in [0,1]).
pub fn glicko2_update(p: Glicko, games: &[(Glicko, f64)]) -> Glicko {
    let mu = (p.rating - 1500.0) / GLICKO_SCALE;
    let phi = p.rd / GLICKO_SCALE;
    if games.is_empty() {
        let phi_star = (phi * phi + p.vol * p.vol).sqrt();
        return Glicko { rating: p.rating, rd: (phi_star * GLICKO_SCALE).min(DEFAULT_RD), vol: p.vol };
    }
    let g = |phi_j: f64| 1.0 / (1.0 + 3.0 * phi_j * phi_j / (std::f64::consts::PI * std::f64::consts::PI)).sqrt();
    let mut v_inv = 0.0;
    let mut delta_sum = 0.0;
    for (o, s) in games {
        let mu_j = (o.rating - 1500.0) / GLICKO_SCALE;
        let phi_j = o.rd / GLICKO_SCALE;
        let gj = g(phi_j);
        let e = 1.0 / (1.0 + (-gj * (mu - mu_j)).exp());
        v_inv += gj * gj * e * (1.0 - e);
        delta_sum += gj * (s - e);
    }
    let v = 1.0 / v_inv;
    let delta = v * delta_sum;

    // volatility: Illinois algorithm (Glickman 2013, step 5)
    let a = (p.vol * p.vol).ln();
    let f = |x: f64| {
        let ex = x.exp();
        let num = ex * (delta * delta - phi * phi - v - ex);
        let den = 2.0 * (phi * phi + v + ex).powi(2);
        num / den - (x - a) / (TAU * TAU)
    };
    let eps = 1e-6;
    let mut big_a = a;
    let mut big_b = if delta * delta > phi * phi + v {
        (delta * delta - phi * phi - v).ln()
    } else {
        let mut k = 1.0;
        while f(a - k * TAU) < 0.0 {
            k += 1.0;
            if k > 100.0 {
                break;
            }
        }
        a - k * TAU
    };
    let mut fa = f(big_a);
    let mut fb = f(big_b);
    let mut iters = 0;
    while (big_b - big_a).abs() > eps && iters < 100 {
        let c = big_a + (big_a - big_b) * fa / (fb - fa);
        let fc = f(c);
        if fc * fb <= 0.0 {
            big_a = big_b;
            fa = fb;
        } else {
            fa /= 2.0;
        }
        big_b = c;
        fb = fc;
        iters += 1;
    }
    let new_vol = (big_a / 2.0).exp().clamp(0.03, 0.12);

    let phi_star = (phi * phi + new_vol * new_vol).sqrt();
    let new_phi = 1.0 / (1.0 / (phi_star * phi_star) + 1.0 / v).sqrt();
    let new_mu = mu + new_phi * new_phi * delta_sum;
    Glicko {
        rating: (new_mu * GLICKO_SCALE + 1500.0).clamp(100.0, 3500.0),
        rd: (new_phi * GLICKO_SCALE).clamp(MIN_RD, DEFAULT_RD),
        vol: new_vol,
    }
}

/// Composite opponent for team games: mean rating, root-mean-square RD.
pub fn composite(team: &[Glicko]) -> Glicko {
    if team.is_empty() {
        return Glicko::default();
    }
    let n = team.len() as f64;
    Glicko {
        rating: team.iter().map(|g| g.rating).sum::<f64>() / n,
        rd: (team.iter().map(|g| g.rd * g.rd).sum::<f64>() / n).sqrt(),
        vol: DEFAULT_VOL,
    }
}

/// RR implied by an MMR. 1500 MMR (new player) ~ Dill I.
pub fn rr_target(rating: f64) -> i32 {
    (((rating - 1500.0) * 1.5) + 900.0).max(0.0).round() as i32
}

#[derive(Debug, Clone, PartialEq)]
pub struct RankInfo {
    pub tier: &'static str,
    pub tier_index: u32,
    /// 1..=3 for divisioned tiers, 0 for Legend.
    pub division: u32,
    /// Points inside the current division (0..99; uncapped for Legend).
    pub rr_in_div: i32,
    /// Absolute ladder step (tier*3 + division-1); Legend = 21.
    pub step: u32,
}

impl RankInfo {
    pub fn label(&self) -> String {
        if self.division == 0 {
            self.tier.to_string()
        } else {
            format!("{} {}", self.tier, ["I", "II", "III"][(self.division - 1) as usize])
        }
    }
}

pub fn rank_of(rr: i32) -> RankInfo {
    let rr = rr.max(0);
    if rr >= LEGEND_RR {
        return RankInfo { tier: TIERS[7], tier_index: 7, division: 0, rr_in_div: rr - LEGEND_RR, step: 21 };
    }
    let step = (rr / 100) as u32;
    RankInfo { tier: TIERS[(step / 3) as usize], tier_index: step / 3, division: step % 3 + 1, rr_in_div: rr % 100, step }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Outcome {
    Win,
    Loss,
    Draw,
}

#[derive(Debug, Clone, PartialEq)]
pub struct PlayerRank {
    pub glicko: Glicko,
    pub rr: i32,
    pub placements: u32,
}

impl PlayerRank {
    pub fn placed(&self) -> bool {
        self.placements >= PLACEMENT_MATCHES
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct RankChange {
    pub before: PlayerRank,
    pub after: PlayerRank,
    /// Visible delta (0 during placements).
    pub rr_delta: i32,
    pub promoted: bool,
    pub demoted: bool,
    /// True on the match that completes placements (rank revealed).
    pub revealed: bool,
}

#[derive(Debug, Clone, Copy)]
pub struct RrRules {
    pub base_step: i32,
    pub leaver_penalty: i32,
    /// Teammates of a leaver lose only this fraction of their RR loss.
    pub leaver_forgiveness: f64,
}

impl Default for RrRules {
    fn default() -> Self {
        RrRules { base_step: 18, leaver_penalty: 15, leaver_forgiveness: 0.5 }
    }
}

/// Apply one finished match to a player. `opp` is the enemy composite.
pub fn apply_result(
    before: &PlayerRank,
    opp: Glicko,
    outcome: Outcome,
    abandoned: bool,
    teammate_abandoned: bool,
    rules: &RrRules,
) -> RankChange {
    let outcome = if abandoned { Outcome::Loss } else { outcome };
    let score = match outcome {
        Outcome::Win => 1.0,
        Outcome::Loss => 0.0,
        Outcome::Draw => 0.5,
    };
    let g = glicko2_update(before.glicko, &[(opp, score)]);
    let placements = before.placements + 1;
    let was_placed = before.placed();
    let mut rr;
    let mut delta = 0;
    let revealed = !was_placed && placements >= PLACEMENT_MATCHES;
    if !was_placed {
        // Hidden during placements; on reveal seed RR conservatively (rating - RD/2),
        // capped below Legend so nobody places straight into the top tier.
        rr = if revealed { rr_target(g.rating - g.rd * 0.5).min(LEGEND_RR - 100) } else { 0 };
        if abandoned && revealed {
            rr = (rr - rules.leaver_penalty).max(0);
        }
    } else {
        let conv = (((rr_target(g.rating) - before.rr) as f64) * 0.15).clamp(-12.0, 12.0).round() as i32;
        delta = match outcome {
            Outcome::Win => (rules.base_step + conv).clamp(8, 35),
            Outcome::Loss => (-rules.base_step + conv).clamp(-35, -8),
            Outcome::Draw => conv.clamp(-6, 6),
        };
        if outcome == Outcome::Loss && teammate_abandoned && !abandoned {
            delta = (delta as f64 * rules.leaver_forgiveness).round() as i32;
        }
        if abandoned {
            delta -= rules.leaver_penalty;
        }
        rr = (before.rr + delta).max(0);
        delta = rr - before.rr;
    }
    let after = PlayerRank { glicko: g, rr, placements };
    let (promoted, demoted) = if was_placed {
        let (a, b) = (rank_of(before.rr).step, rank_of(rr).step);
        (b > a, b < a)
    } else {
        (false, false)
    };
    RankChange { before: before.clone(), after, rr_delta: delta, promoted, demoted, revealed }
}

/// Extra RR removed for dodging (leaving during agent select) once placed.
pub fn apply_dodge(before: &PlayerRank, penalty: i32) -> PlayerRank {
    let mut p = before.clone();
    if p.placed() {
        p.rr = (p.rr - penalty).max(0);
    }
    p
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn glickman_paper_example() {
        // Glickman's worked example: 1500/200 vs 1400/30 (win), 1550/100 (loss), 1700/300 (loss)
        let p = Glicko { rating: 1500.0, rd: 200.0, vol: 0.06 };
        let games = [
            (Glicko { rating: 1400.0, rd: 30.0, vol: 0.06 }, 1.0),
            (Glicko { rating: 1550.0, rd: 100.0, vol: 0.06 }, 0.0),
            (Glicko { rating: 1700.0, rd: 300.0, vol: 0.06 }, 0.0),
        ];
        let r = glicko2_update(p, &games);
        assert!((r.rating - 1464.06).abs() < 0.1, "rating {}", r.rating);
        assert!((r.rd - 151.52).abs() < 0.1, "rd {}", r.rd);
        assert!((r.vol - 0.05999).abs() < 0.0001, "vol {}", r.vol);
    }

    #[test]
    fn win_raises_loss_lowers_and_rd_shrinks() {
        let p = Glicko::default();
        let o = Glicko::default();
        let w = glicko2_update(p, &[(o, 1.0)]);
        let l = glicko2_update(p, &[(o, 0.0)]);
        assert!(w.rating > 1500.0 && l.rating < 1500.0);
        assert!((w.rating - 1500.0 - (1500.0 - l.rating)).abs() < 1e-6, "symmetric");
        assert!(w.rd < 350.0);
        // upset win vs much stronger opponent is worth more
        let strong = Glicko { rating: 1900.0, rd: 80.0, vol: 0.06 };
        let up = glicko2_update(p, &[(strong, 1.0)]);
        assert!(up.rating - 1500.0 > w.rating - 1500.0);
    }

    #[test]
    fn composite_team() {
        let c = composite(&[Glicko { rating: 1400.0, rd: 100.0, vol: 0.06 }, Glicko { rating: 1600.0, rd: 200.0, vol: 0.06 }]);
        assert_eq!(c.rating, 1500.0);
        assert!((c.rd - (25000.0f64).sqrt()).abs() < 1e-9);
    }

    #[test]
    fn tiers_and_divisions() {
        assert_eq!(rank_of(0).label(), "Seedling I");
        assert_eq!(rank_of(99).label(), "Seedling I");
        assert_eq!(rank_of(100).label(), "Seedling II");
        assert_eq!(rank_of(300).label(), "Sprout I");
        assert_eq!(rank_of(950).label(), "Dill I");
        assert_eq!(rank_of(2099).label(), "Pickle Master III");
        assert_eq!(rank_of(2100).label(), "Legend");
        assert_eq!(rank_of(2350).rr_in_div, 250);
        assert_eq!(rank_of(-5).step, 0);
    }

    fn placed(rr: i32) -> PlayerRank {
        PlayerRank { glicko: Glicko { rating: 1500.0, rd: 80.0, vol: 0.06 }, rr, placements: 10 }
    }

    #[test]
    fn placements_hide_then_reveal() {
        let rules = RrRules::default();
        let mut p = PlayerRank { glicko: Glicko::default(), rr: 0, placements: 0 };
        for i in 0..PLACEMENT_MATCHES {
            let c = apply_result(&p, Glicko::default(), Outcome::Win, false, false, &rules);
            assert_eq!(c.rr_delta, 0);
            assert_eq!(c.revealed, i == PLACEMENT_MATCHES - 1);
            p = c.after;
        }
        assert!(p.placed());
        assert!(p.rr > 900, "5 wins should place above average, got {}", p.rr);
        assert!(p.rr < LEGEND_RR);
    }

    #[test]
    fn rr_steps_are_bounded_and_signed() {
        let rules = RrRules::default();
        let p = placed(1050);
        let w = apply_result(&p, Glicko::default(), Outcome::Win, false, false, &rules);
        let l = apply_result(&p, Glicko::default(), Outcome::Loss, false, false, &rules);
        assert!((8..=35).contains(&w.rr_delta), "{}", w.rr_delta);
        assert!((-35..=-8).contains(&l.rr_delta), "{}", l.rr_delta);
        // RR far above MMR -> wins worth less than losses cost
        let inflated = placed(1800);
        let w2 = apply_result(&inflated, Glicko::default(), Outcome::Win, false, false, &rules);
        let l2 = apply_result(&inflated, Glicko::default(), Outcome::Loss, false, false, &rules);
        assert!(w2.rr_delta < -l2.rr_delta);
    }

    #[test]
    fn leaver_penalty_and_forgiveness() {
        let rules = RrRules::default();
        let p = placed(1050);
        let normal_loss = apply_result(&p, Glicko::default(), Outcome::Loss, false, false, &rules);
        // leaver on the WINNING team still takes a loss + penalty
        let left = apply_result(&p, Glicko::default(), Outcome::Win, true, false, &rules);
        assert!(left.after.glicko.rating < 1500.0);
        assert_eq!(left.rr_delta, normal_loss.rr_delta - rules.leaver_penalty);
        // teammate of a leaver loses less
        let forgiven = apply_result(&p, Glicko::default(), Outcome::Loss, false, true, &rules);
        assert!(forgiven.rr_delta > normal_loss.rr_delta && forgiven.rr_delta < 0);
        // floor at zero
        let low = apply_result(&placed(5), Glicko::default(), Outcome::Loss, true, false, &rules);
        assert_eq!(low.after.rr, 0);
    }

    #[test]
    fn promotion_and_demotion_flags() {
        let rules = RrRules::default();
        let up = apply_result(&placed(295), Glicko::default(), Outcome::Win, false, false, &rules);
        assert!(up.promoted && !up.demoted);
        assert_eq!(rank_of(up.after.rr).tier, "Sprout");
        let down = apply_result(&placed(305), Glicko::default(), Outcome::Loss, false, false, &rules);
        assert!(down.demoted && !down.promoted);
    }

    #[test]
    fn dodge_penalty_only_when_placed() {
        assert_eq!(apply_dodge(&placed(500), 5).rr, 495);
        let unplaced = PlayerRank { glicko: Glicko::default(), rr: 0, placements: 2 };
        assert_eq!(apply_dodge(&unplaced, 5).rr, 0);
    }
}
