//! Bot contractors, ported from last-zone/bots.js. Bots write the same `Input` a human sends.
use crate::data::*;
use crate::rng::{clamp, hypot2, wrap_a, Rng};
use crate::sim::*;
use crate::world::{Poi, POIS, SEA};

fn cls_val(cls: &str) -> f64 {
    match cls {
        "Assault rifle" => 50.0,
        "SMG" => 46.0,
        "Shotgun" => 40.0,
        "Sniper" => 34.0,
        "Revolver" => 24.0,
        _ => 14.0,
    }
}
fn ideal(cls: &str) -> (f64, f64) {
    match cls {
        "Assault rifle" => (12.0, 55.0),
        "SMG" => (4.0, 20.0),
        "Shotgun" => (2.0, 9.0),
        "Sniper" => (35.0, 160.0),
        "Revolver" => (6.0, 28.0),
        _ => (5.0, 22.0),
    }
}
pub fn w_score(w: Option<WeaponInst>) -> f64 {
    match w {
        Some(w) => cls_val(WEAPONS[w.id].cls) + w.r as f64 * 7.0,
        None => -1.0,
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Mode {
    Drop,
    Fight,
    Heal,
    Rotate,
    Loot,
    Investigate,
}
#[derive(Clone, Copy, Debug)]
pub struct Goal {
    pub x: f64,
    pub z: f64,
    pub target: Option<Target>,
}
#[derive(Clone, Debug)]
pub struct BotAi {
    pub poi: Poi,
    pub tx: f64,
    pub tz: f64,
    pub jump_s: f64,
    pub mode: Mode,
    pub think: f64,
    pub goal: Option<Goal>,
    pub enemy: Option<usize>,
    pub seen_t: f64,
    pub last_seen: [f64; 3],
    pub react: f64,
    pub aim_y: f64,
    pub aim_p: f64,
    pub err_y: f64,
    pub err_p: f64,
    pub track_t: f64,
    pub burst: f64,
    pub burst_cd: f64,
    pub strafe: f64,
    pub strafe_t: f64,
    pub crouch_t: f64,
    pub stuck_t: f64,
    pub last_x: f64,
    pub last_z: f64,
    pub det_t: f64,
    pub det_a: f64,
    pub wander_t: f64,
    pub cover_t: f64,
    pub gren_t: f64,
    pub rng: Rng,
    pub stuck_n: u32,
    pub diff: usize,
    pub heard: Option<(f64, f64)>,
    pub heard_t: f64,
    pub semi: bool,
    pub look_y: f64,
    pub gas_goal: bool,
    pub rot_goal: Option<Goal>,
    pub rot_st: usize,
}
impl BotAi {
    pub fn new(poi: Poi, tx: f64, tz: f64, jump_s: f64, seed: u32, diff: usize) -> Self {
        BotAi {
            poi, tx, tz, jump_s, mode: Mode::Drop, think: 0.0, goal: None, enemy: None, seen_t: -99.0, last_seen: [0.0; 3], react: 0.0, aim_y: 0.0, aim_p: 0.0, err_y: 0.0, err_p: 0.0, track_t: 0.0, burst: 0.0, burst_cd: 0.0, strafe: 1.0, strafe_t: 0.0, crouch_t: 0.0,
            stuck_t: 0.0, last_x: 0.0, last_z: 0.0, det_t: 0.0, det_a: 0.0, wander_t: 0.0, cover_t: 0.0, gren_t: 5.0, rng: Rng::new(seed), stuck_n: 0, diff, heard: None, heard_t: -99.0, semi: false, look_y: 0.0, gas_goal: false, rot_goal: None, rot_st: 99,
        }
    }
}

/// add `n` bots (names, landing targets and jump points from the match seed)
pub fn init_bots(m: &mut Match, n: usize, diff: usize) {
    let mut r = Rng::new(m.seed ^ 0xb075);
    let mut names: Vec<&str> = CALLSIGNS.to_vec();
    for i in (1..names.len()).rev() {
        let j = (r.next() * (i as f64 + 1.0)).floor() as usize;
        names.swap(i, j);
    }
    let plane = m.plane.clone().expect("plane");
    let weights: Vec<(usize, f64)> = POIS.iter().enumerate().map(|(i, p)| (i, p.w)).collect();
    for i in 0..n {
        let name = if i >= names.len() { format!("{}-{}", names[i % names.len()], i + 1) } else { names[i].to_string() };
        let pi = m.add_player(&name, true, false);
        let poi = POIS[r.weighted(&weights)];
        let spots: Vec<(f64, f64)> = m.w.loot.iter().filter(|s| hypot2(s.x - poi.x, s.z - poi.z) < poi.r).map(|s| (s.x, s.z)).collect();
        let sp = if !spots.is_empty() && r.next() < 0.8 {
            spots[r.idx(spots.len())]
        } else {
            let x = poi.x + (r.next() - 0.5) * poi.r;
            let z = poi.z + (r.next() - 0.5) * poi.r;
            (x, z)
        };
        let tx = sp.0 + (r.next() - 0.5) * 6.0;
        let tz = sp.1 + (r.next() - 0.5) * 6.0;
        let s_star = (tx - plane.ax) * plane.dx + (tz - plane.az) * plane.dz;
        let jump_s = clamp(s_star - 120.0 - r.next() * 160.0, 160.0, plane.eject - 10.0);
        let mut ai = BotAi::new(poi, tx, tz, jump_s, m.seed.wrapping_add(i as u32 * 977), diff);
        ai.think = r.next() * 0.3;
        ai.strafe = if r.next() < 0.5 { 1.0 } else { -1.0 };
        ai.gren_t = 5.0 + r.next() * 10.0;
        m.ai[pi] = Some(ai);
    }
}

/// hand a disconnected human over to the bot brain
pub fn make_ai_for(m: &mut Match, pi: usize, diff: usize) {
    let p = &m.players[pi];
    let poi = crate::world::poi_at(p.x, p.z).unwrap_or(POIS[0]);
    let mut ai = BotAi::new(poi, p.x, p.z, 0.0, m.seed ^ p.id.wrapping_mul(7919), diff);
    ai.mode = Mode::Rotate;
    ai.last_x = p.x;
    ai.last_z = p.z;
    m.ai[pi] = Some(ai);
    m.players[pi].bot = true;
}

pub fn update_bots(m: &mut Match, dt: f64) {
    for i in 0..m.players.len() {
        if !m.players[i].bot || m.players[i].st == St::Dead || m.ai[i].is_none() {
            continue;
        }
        let mut b = m.ai[i].take().unwrap();
        match m.players[i].st {
            St::Plane => {
                if let Some(pl) = &m.plane {
                    let inp = &mut m.players[i].inp;
                    inp.yaw = (-pl.dx).atan2(-pl.dz);
                    if pl.s >= b.jump_s {
                        inp.jump = true;
                    }
                }
            }
            St::Fall | St::Chute => drop_steer(m, i, &b),
            _ => {
                b.think -= dt;
                if b.think <= 0.0 {
                    b.think = 0.18 + b.rng.next() * 0.14;
                    think(m, i, &mut b);
                }
                act(m, i, &mut b, dt);
            }
        }
        m.ai[i] = Some(b);
    }
}

fn drop_steer(m: &mut Match, i: usize, b: &BotAi) {
    let p = &m.players[i];
    let (dx, dz) = (b.tx - p.x, b.tz - p.z);
    let d = hypot2(dx, dz);
    let agl = p.y - m.w.terrain_h(p.x, p.z).max(SEA);
    let st = p.st;
    let inp = &mut m.players[i].inp;
    inp.yaw = (-dx).atan2(-dz);
    inp.pitch = -0.6;
    inp.mx = 0.0;
    if st == St::Fall {
        inp.mz = if d > agl * 0.25 { 1.0 } else { 0.0 };
        inp.sprint = d < agl * 0.5;
    } else {
        inp.mz = if d > 12.0 { 1.0 } else if d > 4.0 { 0.0 } else { -1.0 };
    }
}

fn think(m: &mut Match, i: usize, b: &mut BotAi) {
    let d = &DIFFICULTY[b.diff];
    let t = m.t;
    let (ex, ey, ez, pid, last_atk, last_atk_t) = {
        let p = &m.players[i];
        (p.x, p.eye_y(), p.z, p.id, p.last_atk, p.last_atk_t)
    };
    let mut best = None;
    let mut bs = 1e9;
    for (qi, q) in m.players.iter().enumerate() {
        if qi == i || q.st == St::Dead || q.st == St::Plane {
            continue;
        }
        let (dx, dz) = (q.x - ex, q.z - ez);
        let dd = hypot2(dx, dz);
        let mut range = d.spot * if t - q.last_shot_t < 1.2 { 1.6 } else { 1.0 } * if q.crouch { 0.75 } else { 1.0 } * if q.st != St::Ground { 0.6 } else { 1.0 };
        let attacker = Some(q.id) == last_atk && t - last_atk_t < 4.0;
        if attacker {
            range = range.max(160.0);
        }
        if dd > range {
            continue;
        }
        let ang = wrap_a((-dx).atan2(-dz) - b.look_y).abs();
        if ang > 1.35 && dd > 14.0 && !attacker {
            continue;
        }
        let ty = q.y + if q.crouch { 1.0 } else { 1.35 };
        if !m.w.los_clear(ex, ey, ez, q.x, ty, q.z) || m.smoke_blocks(ex, ey, ez, q.x, ty, q.z) {
            continue;
        }
        let sc = dd - if Some(q.id) == last_atk { 40.0 } else { 0.0 } - if b.enemy == Some(qi) { 15.0 } else { 0.0 };
        if sc < bs {
            bs = sc;
            best = Some(qi);
        }
    }
    if let Some(qi) = best {
        if b.enemy != Some(qi) || t - b.seen_t > 2.5 {
            b.react = d.react * (0.7 + b.rng.next() * 0.7);
            b.track_t = 0.0;
            new_error(m, i, qi, b);
        }
        b.enemy = Some(qi);
        b.seen_t = t;
        let q = &m.players[qi];
        b.last_seen = [q.x, q.y, q.z];
    } else if let Some(e) = b.enemy {
        if m.players[e].st == St::Dead || t - b.seen_t > 6.0 {
            b.enemy = None;
        }
    }
    if b.enemy.is_none() {
        for s in &m.sounds {
            if s.pid == pid || t - s.t > 1.0 {
                continue;
            }
            let dd = hypot2(s.x - ex, s.z - ez);
            if dd < 130.0 * s.loud && dd > 8.0 {
                b.heard = Some((s.x, s.z));
                b.heard_t = t;
            }
        }
    }
    let (w0, w1, slot) = {
        let p = &m.players[i];
        (p.inv.w[0], p.inv.w[1], p.inv.slot)
    };
    if slot == 2 && (w0.is_some() || w1.is_some()) {
        m.players[i].inp.slot = if w0.is_some() { 0 } else { 1 };
    }
    let mut gas_urgent = false;
    let (gst, gdps) = match &m.gas {
        Some(g) => {
            let (px, pz) = (m.players[i].x, m.players[i].z);
            let dnow = hypot2(px - g.cx, pz - g.cz);
            let dnext = hypot2(px - g.nx, pz - g.nz);
            if dnow > g.r - 6.0 || (g.ph != GasPh::Done && dnext > g.nr * 0.9 && (g.ph == GasPh::Shrink || g.t < 30.0)) {
                gas_urgent = true;
            }
            (g.st, g.dps)
        }
        None => (0, 0.0),
    };
    let p = &m.players[i];
    let fighting = b.enemy.is_some() && t - b.seen_t < 3.0 && (w0.is_some() || w1.is_some());
    let hp_low = p.hp < 65.0 && (p.inv.medkit > 0 || p.inv.bandage > 0);
    let arm_low = !p.plate_max() && p.inv.plate > 0;
    let in_gas = p.in_gas;
    if in_gas && p.hp < 30.0 && gdps <= 2.0 && (p.inv.medkit > 0 || p.inv.bandage > 0) {
        b.mode = Mode::Heal;
        return;
    }
    if fighting {
        let e = &m.players[b.enemy.unwrap()];
        if !(in_gas && hypot2(e.x - p.x, e.z - p.z) > 15.0) {
            b.mode = Mode::Fight;
            return;
        }
    }
    if in_gas {
        b.mode = Mode::Rotate;
        if b.goal.is_none() || !b.gas_goal {
            b.goal = Some(rotate_goal(m, b));
        }
        b.gas_goal = true;
        return;
    }
    b.gas_goal = false;
    if (hp_low || arm_low) && t - b.seen_t > 2.0 && t - p.last_atk_t > 2.5 {
        b.mode = Mode::Heal;
        return;
    }
    if gas_urgent {
        b.mode = Mode::Rotate;
        if b.rot_goal.is_none() || b.rot_st != gst {
            b.rot_goal = Some(rotate_goal(m, b));
            b.rot_st = gst;
        }
        b.goal = b.rot_goal;
        return;
    }
    if let Some(g) = loot_target(m, i, b) {
        b.mode = Mode::Loot;
        b.goal = Some(g);
        return;
    }
    if w0.is_none() && w1.is_none() {
        b.mode = Mode::Rotate;
        if b.goal.is_none() || b.wander_t < t {
            b.goal = Some(wander_goal(m, i, b));
            b.wander_t = t + 20.0;
        }
        return;
    }
    if let Some((hx, hz)) = b.heard {
        if t - b.heard_t < 6.0 {
            b.mode = Mode::Investigate;
            b.goal = Some(Goal { x: hx, z: hz, target: None });
            return;
        }
    }
    b.mode = Mode::Rotate;
    let p = &m.players[i];
    if b.goal.map_or(true, |g| b.wander_t < t || hypot2(g.x - p.x, g.z - p.z) < 4.0) {
        b.goal = Some(wander_goal(m, i, b));
        b.wander_t = t + 15.0 + b.rng.next() * 25.0;
    }
}
fn new_error(m: &Match, i: usize, qi: usize, b: &mut BotAi) {
    let d = &DIFFICULTY[b.diff];
    let (p, q) = (&m.players[i], &m.players[qi]);
    let dist = hypot2(q.x - p.x, q.z - p.z);
    let mut g = || (b.rng.next() + b.rng.next() + b.rng.next() - 1.5) / 1.5;
    let k = d.aim_err * (std::f64::consts::PI / 180.0) * (0.5 + dist / 45.0) * if q.move_spd > 3.0 { 1.3 } else { 1.0 } * if p.move_spd > 3.0 { 1.15 } else { 1.0 } * if q.st != St::Ground { 1.6 } else { 1.0 };
    let ey = g() * k * 1.6;
    let ep = g() * k;
    b.err_y = ey;
    b.err_p = ep;
}
fn rotate_goal(m: &Match, b: &mut BotAi) -> Goal {
    let g = m.gas.as_ref().unwrap();
    let done = g.ph == GasPh::Done;
    let (tx, tz, tr) = if done { (g.cx, g.cz, g.r) } else { (g.nx, g.nz, g.nr) };
    let a = b.rng.next() * std::f64::consts::PI * 2.0;
    let d = b.rng.next().sqrt() * tr * 0.55;
    let (mut x, mut z) = (tx + a.cos() * d, tz + a.sin() * d);
    if m.w.terrain_h(x, z) < 0.5 {
        x = tx;
        z = tz;
    }
    Goal { x, z, target: None }
}
fn wander_goal(m: &Match, i: usize, b: &mut BotAi) -> Goal {
    let p = &m.players[i];
    let (cx, cz, cr) = match &m.gas {
        Some(g) => (g.nx, g.nz, (if g.nr != 0.0 { g.nr } else { g.r }).min(g.r) * 0.75),
        None => (p.x, p.z, 200.0),
    };
    for _ in 0..12 {
        let pois: Vec<&Poi> = POIS.iter().filter(|q| hypot2(q.x - cx, q.z - cz) < cr).collect();
        let (x, z);
        if !pois.is_empty() && b.rng.next() < 0.6 {
            let q = pois[b.rng.idx(pois.len())];
            x = q.x + (b.rng.next() - 0.5) * q.r;
            z = q.z + (b.rng.next() - 0.5) * q.r;
        } else {
            let a = b.rng.next() * std::f64::consts::PI * 2.0;
            let d = b.rng.next().sqrt() * cr;
            x = cx + a.cos() * d;
            z = cz + a.sin() * d;
        }
        if m.w.terrain_h(x, z) > 0.8 {
            return Goal { x, z, target: None };
        }
    }
    Goal { x: cx, z: cz, target: None }
}
fn claim_key(t: Target) -> i64 {
    match t {
        Target::Item(id) => id as i64,
        Target::Crate(c) => -(c as i64) - 1,
    }
}
fn loot_target(m: &mut Match, i: usize, b: &mut BotAi) -> Option<Goal> {
    let t = m.t;
    let p = &m.players[i];
    let pid = p.id as i64;
    let cur = [p.inv.w[0], p.inv.w[1]];
    let worst = w_score(cur[0]).min(w_score(cur[1]));
    let ammo_for: Vec<usize> = cur.iter().flatten().map(|w| WEAPONS[w.id].ammo).collect();
    let mut best: Option<(Target, f64, f64, bool)> = None;
    let mut bs = 0.0;
    for id in m.items_near(p.x, p.z, 42.0) {
        let it = m.item(id).unwrap();
        if it.gone || (it.y - p.y).abs() > 6.0 {
            continue;
        }
        if let Some(&(cid, ct)) = m.claims.get(&(id as i64)) {
            if cid != pid && t - ct < 8.0 {
                continue;
            }
        }
        let mut v = 0.0;
        match it.k {
            K_WEAPON => {
                let s = cls_val(WEAPONS[it.w as usize].cls) + it.r as f64 * 7.0;
                if s > worst + 6.0 {
                    v = 40.0 + (s - worst);
                }
            }
            K_AMMO => {
                if ammo_for.contains(&(it.a as usize)) && (p.inv.ammo[it.a as usize] as f64) < AMMO[it.a as usize].max as f64 * 0.6 {
                    v = 22.0;
                }
            }
            K_PLATE => {
                if p.inv.plate < 5 {
                    v = 18.0;
                }
            }
            K_BANDAGE | K_MEDKIT | K_FRAG | K_SMOKE => {
                if p.inv.get(it.k) < ITEM_MAX[it.k as usize] {
                    v = if it.k == K_MEDKIT { 14.0 } else { 8.0 };
                }
            }
            K_PICKLE => v = 5.0,
            _ => {}
        }
        if v == 0.0 {
            continue;
        }
        let d = hypot2(it.x - p.x, it.z - p.z);
        let sc = v / (d + 6.0);
        if sc > bs {
            bs = sc;
            best = Some((Target::Item(id), it.x, it.z, it.k == K_WEAPON));
        }
    }
    for c in &m.crates {
        if c.open {
            continue;
        }
        let d = hypot2(c.x - p.x, c.z - p.z);
        if d > 55.0 || (c.y - p.y).abs() > 6.0 {
            continue;
        }
        if let Some(&(cid, ct)) = m.claims.get(&claim_key(Target::Crate(c.id))) {
            if cid != pid && t - ct < 10.0 {
                continue;
            }
        }
        let sc = 45.0 / (d + 6.0);
        if sc > bs {
            bs = sc;
            best = Some((Target::Crate(c.id), c.x, c.z, false));
        }
    }
    let (tg, x, z, is_weapon) = best?;
    m.claims.insert(claim_key(tg), (pid, t));
    if is_weapon && cur[0].is_some() && cur[1].is_some() {
        let ws = if w_score(cur[0]) <= w_score(cur[1]) { 0 } else { 1 };
        if m.players[i].inv.slot != ws {
            m.players[i].inp.slot = ws as i8;
        }
    }
    let _ = b;
    Some(Goal { x, z, target: Some(tg) })
}

fn act(m: &mut Match, i: usize, b: &mut BotAi, dt: f64) {
    let d = &DIFFICULTY[b.diff];
    let t = m.t;
    {
        let inp = &mut m.players[i].inp;
        inp.fire = false;
        inp.ads = false;
        inp.sprint = false;
        inp.mx = 0.0;
        inp.mz = 0.0;
    }
    let mut wish: Option<(f64, f64)> = None;
    let mut face = false;
    let mut sprint = false;
    if b.mode == Mode::Fight && b.enemy.is_some() {
        let qi = b.enemy.unwrap();
        let vis = t - b.seen_t < 0.35;
        let (qx, qy, qz, qcrouch) = {
            let q = &m.players[qi];
            (q.x, q.y, q.z, q.crouch)
        };
        let (tx, tz) = if vis { (qx, qz) } else { (b.last_seen[0], b.last_seen[2]) };
        let ty = (if vis { qy } else { b.last_seen[1] }) + if qcrouch { 0.95 } else { 1.3 };
        let (px, pz, pey) = (m.players[i].x, m.players[i].z, m.players[i].eye_y());
        let (dx, dz) = (tx - px, tz - pz);
        let dist = hypot2(dx, dz);
        let dy = ty - pey;
        let want_y = (-dx).atan2(-dz);
        let want_p = dy.atan2(dist);
        b.track_t += dt;
        let turn = d.track * 7.0 * dt;
        b.aim_y += clamp(wrap_a(want_y - b.aim_y), -turn, turn);
        b.aim_p += clamp(want_p - b.aim_p, -turn, turn);
        let settle = clamp(1.4 - b.track_t * 0.45 * d.track, 0.35, 1.4);
        let comp = 0.55 * d.acc;
        {
            let p = &mut m.players[i];
            p.inp.yaw = b.aim_y + b.err_y * settle - p.rec_y * comp;
            p.inp.pitch = b.aim_p + b.err_p * settle - p.rec_p * comp;
        }
        face = true;
        let (w, other, slot) = {
            let p = &m.players[i];
            let other = if p.inv.slot == 0 { p.inv.w[1] } else { p.inv.w[0] };
            (p.cur_weapon(), other, p.inv.slot)
        };
        if let (Some(o), Some(cw)) = (other, w) {
            let (a0, a1) = ideal(WEAPONS[cw.id].cls);
            let (o0, o1) = ideal(WEAPONS[o.id].cls);
            if (dist < a0 * 0.7 && dist >= o0) || (dist > a1 * 1.6 && dist <= o1 * 1.3) || (cw.mag == 0 && o.mag > 0) {
                if b.rng.next() < 0.03 {
                    m.players[i].inp.slot = if slot == 0 { 1 } else { 0 };
                }
            }
        } else if w.is_none() && other.is_some() {
            m.players[i].inp.slot = if slot == 0 { 1 } else { 0 };
        }
        if let Some(cw) = w {
            let wd = &WEAPONS[cw.id];
            let (i0, i1) = ideal(wd.cls);
            if cw.mag == 0 {
                m.players[i].inp.reload = true;
                b.cover_t = t + 1.5;
            }
            m.players[i].inp.ads = dist > 12.0 && wd.cls != "Shotgun";
            let aimed = wrap_a(want_y - b.aim_y).abs() < 0.12 + 1.5 / dist.max(1.0);
            b.react -= dt;
            if vis && b.react <= 0.0 && aimed && cw.mag > 0 && dist < wd.r1 * 1.8 + 20.0 {
                if b.burst_cd > 0.0 {
                    b.burst_cd -= dt;
                } else if wd.auto {
                    m.players[i].inp.fire = true;
                    if t - m.players[i].fire_t < 0.02 {
                        b.burst += 1.0;
                    }
                    if b.burst >= d.burst + if dist < 15.0 { 4.0 } else { 0.0 } {
                        b.burst = 0.0;
                        b.burst_cd = 0.18 + b.rng.next() * 0.35 + dist / 200.0;
                        new_error(m, i, qi, b);
                    }
                } else {
                    b.semi = !b.semi;
                    let fire = b.semi && m.players[i].cd <= 0.0;
                    m.players[i].inp.fire = fire;
                    if fire {
                        b.burst_cd = (if wd.cls == "Sniper" { 0.6 } else { 0.12 }) + b.rng.next() * 0.3 / d.acc;
                        new_error(m, i, qi, b);
                    }
                }
            }
            b.strafe_t -= dt;
            if b.strafe_t <= 0.0 {
                b.strafe_t = 0.5 + b.rng.next() * 1.0;
                if b.rng.next() < 0.7 {
                    b.strafe = -b.strafe;
                }
                b.crouch_t = if b.rng.next() < 0.25 { t + 1.2 } else { 0.0 };
            }
            let (fx, fz) = (dx / dist.max(0.01), dz / dist.max(0.01));
            let (mut ax, mut az) = (0.0, 0.0);
            if dist > i1 {
                ax = fx;
                az = fz;
            } else if dist < i0 {
                ax = -fx;
                az = -fz;
            }
            ax += -fz * b.strafe * 0.8;
            az += fx * b.strafe * 0.8;
            let (hp, arm) = (m.players[i].hp, m.players[i].armor());
            if (hp + arm < 55.0 || t < b.cover_t) && dist > 8.0 {
                if let Some(c) = cover_point(m, i, tx, tz) {
                    wish = Some((c.0 - px, c.1 - pz));
                }
            }
            if wish.is_none() {
                wish = Some((ax, az));
            }
            m.players[i].inp.crouch = t < b.crouch_t && dist > 20.0;
            if !vis && m.players[i].inv.frag > 0 && dist > 10.0 && dist < 32.0 && t > b.gren_t {
                b.gren_t = t + 8.0 + b.rng.next() * 8.0;
                m.players[i].inp.throw = Throw::Frag;
                m.players[i].inp.pitch = 0.18 + dist * 0.006;
            }
            if !vis && t - b.seen_t > 1.2 {
                wish = Some((tx - px, tz - pz));
            }
        } else {
            wish = Some((-dx, -dz));
        }
    } else if b.mode == Mode::Heal {
        let p = &mut m.players[i];
        p.inp.crouch = true;
        if p.act.is_none() {
            if !p.plate_max() && p.inv.plate > 0 {
                p.inp.heal = Heal::Plate;
                p.inp.plate_hold = true;
            } else if p.hp < 100.0 && (p.inv.medkit > 0 || p.inv.bandage > 0) {
                p.inp.heal = Heal::Auto;
            } else {
                b.mode = Mode::Rotate;
            }
        }
        if p.in_gas {
            if let Some(g) = &m.gas {
                wish = Some((g.cx - p.x, g.cz - p.z));
            }
        }
        if let Some(w) = p.cur_weapon() {
            if (w.mag as f64) < WEAPONS[w.id].mag as f64 * 0.5 && p.act.is_none() {
                p.inp.reload = true;
            }
        }
    } else {
        {
            let p = &mut m.players[i];
            p.inp.crouch = false;
            if let Some(w) = p.cur_weapon() {
                if (w.mag as f64) < WEAPONS[w.id].mag as f64 * 0.4 && p.act.is_none() {
                    p.inp.reload = true;
                }
            }
        }
        if let Some(g) = b.goal {
            let (nx, nz) = nav_point(m, i, g.x, g.z);
            let p = &m.players[i];
            wish = Some((nx - p.x, nz - p.z));
            let dd = hypot2(g.x - p.x, g.z - p.z);
            sprint = dd > 18.0 && p.act.is_none();
            if b.mode == Mode::Loot && dd < 1.7 {
                let p = &mut m.players[i];
                p.inp.interact = true;
                p.inp.target = g.target;
                b.goal = None;
                b.think = b.think.min(0.05);
            }
            if b.mode == Mode::Investigate {
                sprint = dd > 30.0;
            }
        }
    }
    if let Some((mut wx, mut wz)) = wish {
        let wl = hypot2(wx, wz);
        if wl > 0.01 {
            wx /= wl;
            wz /= wl;
            let mut a = wx.atan2(wz);
            if t < b.det_t {
                a += b.det_a;
            } else if blocked(m, i, a) {
                for da in [0.6, -0.6, 1.2, -1.2, 1.8, -1.8] {
                    if !blocked(m, i, a + da) {
                        b.det_a = da;
                        b.det_t = t + 0.5;
                        a += da;
                        break;
                    }
                }
            }
            wx = a.sin();
            wz = a.cos();
            let p = &mut m.players[i];
            if !face {
                p.inp.yaw = (-wx).atan2(-wz);
                p.inp.pitch = 0.0;
                b.aim_y = p.inp.yaw;
                b.aim_p = 0.0;
            }
            let y = p.inp.yaw;
            let (fx, fz, rx, rz) = (-y.sin(), -y.cos(), y.cos(), -y.sin());
            p.inp.mz = wx * fx + wz * fz;
            p.inp.mx = wx * rx + wz * rz;
            p.inp.sprint = sprint && p.inp.mz > 0.7;
            b.stuck_t += dt;
            if b.stuck_t > 1.2 {
                let moved = hypot2(p.x - b.last_x, p.z - b.last_z);
                b.stuck_t = 0.0;
                b.last_x = p.x;
                b.last_z = p.z;
                if moved < 0.8 {
                    b.stuck_n += 1;
                    p.inp.jump = true;
                    b.det_a = (if b.rng.next() < 0.5 { 1.0 } else { -1.0 }) * (1.0 + b.rng.next());
                    b.det_t = t + 1.0;
                    if b.stuck_n > 4 {
                        if let Some(tg) = b.goal.and_then(|g| g.target) {
                            m.claims.insert(claim_key(tg), (-1, t + 60.0));
                        }
                        b.goal = None;
                        b.stuck_n = 0;
                        b.wander_t = 0.0;
                    }
                } else {
                    b.stuck_n = 0;
                }
            }
        }
    }
    b.look_y = m.players[i].inp.yaw;
}
fn blocked(m: &Match, i: usize, a: f64) -> bool {
    let p = &m.players[i];
    let (px, pz) = (p.x + a.sin() * 1.1, p.z + a.cos() * 1.1);
    let mut near = vec![];
    m.w.boxes_near(px, pz, 0.35, &mut near);
    for id in near {
        let bx = &m.w.boxes[id as usize];
        if bx.y1 > p.y + 0.6 && bx.y0 < p.y + 1.7 {
            return true;
        }
    }
    if m.w.terrain_h(px, pz) < -1.0 && m.w.terrain_h(p.x, p.z) > -1.0 {
        return true;
    }
    if m.w.ground(px, pz, p.y + 0.5) < p.y - 9.0 {
        return true;
    }
    false
}
fn nav_point(m: &Match, i: usize, gx: f64, gz: f64) -> (f64, f64) {
    let p = &m.players[i];
    let cb = m.w.building_at(p.x, p.z);
    let gb = m.w.building_at(gx, gz);
    if cb == gb {
        return (gx, gz);
    }
    let bi = cb.or(gb).unwrap();
    let leaving = cb.is_some() && cb != gb;
    let bld = &m.w.buildings[bi];
    if bld.doors.is_empty() {
        return (gx, gz);
    }
    let mut best = &bld.doors[0];
    let mut bd = 1e9;
    for d in &bld.doors {
        let dd = hypot2(d.x - p.x, d.z - p.z) + hypot2(d.x - gx, d.z - gz) * 0.5;
        if dd < bd {
            bd = dd;
            best = d;
        }
    }
    let out = (best.x + best.ox * 1.8, best.z + best.oz * 1.8);
    let inn = (best.x - best.ox * 1.4, best.z - best.oz * 1.4);
    if leaving {
        let d_in = hypot2(inn.0 - p.x, inn.1 - p.z);
        return if d_in > 0.9 && hypot2(best.x - p.x, best.z - p.z) > 0.8 { inn } else { out };
    }
    let d_out = hypot2(out.0 - p.x, out.1 - p.z);
    if d_out > 1.0 && hypot2(best.x - p.x, best.z - p.z) > 0.8 { out } else { inn }
}
fn cover_point(m: &Match, i: usize, ex: f64, ez: f64) -> Option<(f64, f64)> {
    let p = &m.players[i];
    let mut near = vec![];
    m.w.boxes_near(p.x, p.z, 16.0, &mut near);
    let mut best = None;
    let mut bd = 1e9;
    for id in near {
        let bx = &m.w.boxes[id as usize];
        if bx.y1 - bx.y0 < 1.2 || bx.y1 < p.y + 1.2 || bx.y0 > p.y + 0.5 || bx.floor || bx.roof {
            continue;
        }
        let (cx, cz) = ((bx.x0 + bx.x1) / 2.0, (bx.z0 + bx.z1) / 2.0);
        let (mut dx, mut dz) = (cx - ex, cz - ez);
        let mut l = hypot2(dx, dz);
        if l == 0.0 {
            l = 1.0;
        }
        dx /= l;
        dz /= l;
        let ext = (bx.x1 - bx.x0).max(bx.z1 - bx.z0) * 0.5 + 0.9;
        if ext > 12.0 {
            continue;
        }
        let (x, z) = (cx + dx * ext, cz + dz * ext);
        let dd = hypot2(x - p.x, z - p.z);
        if dd < bd {
            bd = dd;
            best = Some((x, z));
        }
    }
    best
}
