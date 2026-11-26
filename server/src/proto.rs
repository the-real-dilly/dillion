//! Wire protocol helpers (see PROTOCOL.md). Control messages are JSON text frames; the match start,
//! snapshots and input batches are MessagePack binary frames built from arrays of numbers.
use crate::sim::*;
use serde_json::{json, Value};

pub const PROTOCOL_VERSION: u32 = 1;
pub const MSG_INPUT: u64 = 1;
pub const MSG_START: u64 = 2;
pub const MSG_SNAP: u64 = 3;

pub const B_FIRE: u32 = 1;
pub const B_ADS: u32 = 2;
pub const B_SPRINT: u32 = 4;
pub const B_CROUCH: u32 = 8;
pub const B_JUMP: u32 = 16;
pub const B_RELOAD: u32 = 32;
pub const B_INTERACT: u32 = 64;
pub const B_MELEE: u32 = 128;
pub const B_PLATE_HOLD: u32 = 256;

/// one client input command (one 60 Hz client tick)
#[derive(Clone, Debug, Default)]
pub struct Cmd {
    pub seq: u32,
    pub mx: f64,
    pub mz: f64,
    pub yaw: f64,
    pub pitch: f64,
    pub bits: u32,
    pub slot: i8,
    pub heal: u8,
    pub throw: u8,
    /// server tick the client was rendering (for lag compensation)
    pub rt: u32,
    /// interact target: item id (>0), crate -(index+1) (<0), or 0 for "best nearby"
    pub target: i64,
}

fn num(v: &rmpv_lite::V) -> Option<f64> {
    v.as_f64()
}

/// parse + validate an input batch: [1, [[seq, mx, mz, yaw, pitch, bits, slot, heal, throw, rt, target], ...]]
pub fn parse_input(bytes: &[u8]) -> Result<Vec<Cmd>, &'static str> {
    let v: rmpv_lite::V = rmp_serde::from_slice(bytes).map_err(|_| "bad msgpack")?;
    let a = v.as_array().ok_or("not an array")?;
    if a.len() != 2 || num(&a[0]) != Some(MSG_INPUT as f64) {
        return Err("not an input batch");
    }
    let list = a[1].as_array().ok_or("bad batch")?;
    if list.is_empty() || list.len() > 16 {
        return Err("batch size");
    }
    let mut out = Vec::with_capacity(list.len());
    for c in list {
        let f = c.as_array().ok_or("bad cmd")?;
        if f.len() != 11 {
            return Err("bad cmd length");
        }
        let n: Vec<f64> = f.iter().map(|x| num(x).unwrap_or(f64::NAN)).collect();
        if n.iter().any(|x| !x.is_finite()) {
            return Err("non-finite value");
        }
        let seq = n[0];
        if seq < 0.0 || seq > u32::MAX as f64 {
            return Err("seq");
        }
        out.push(Cmd {
            seq: seq as u32,
            mx: (n[1] / 100.0).clamp(-1.0, 1.0),
            mz: (n[2] / 100.0).clamp(-1.0, 1.0),
            yaw: crate::rng::wrap_a(n[3]),
            pitch: n[4].clamp(-1.45, 1.45),
            bits: (n[5] as i64).clamp(0, 511) as u32,
            slot: (n[6] as i64).clamp(-1, 2) as i8,
            heal: (n[7] as i64).clamp(0, 4) as u8,
            throw: (n[8] as i64).clamp(0, 2) as u8,
            rt: n[9].max(0.0).min(u32::MAX as f64) as u32,
            target: (n[10] as i64).clamp(-10_000, 100_000_000),
        });
    }
    Ok(out)
}

/// apply a command to a player's sim input (edges are OR-ed so a merged command keeps them)
pub fn apply_cmd(inp: &mut Input, c: &Cmd, crates: usize) {
    inp.mx = c.mx;
    inp.mz = c.mz;
    inp.yaw = c.yaw;
    inp.pitch = c.pitch;
    inp.fire = c.bits & B_FIRE != 0;
    inp.ads = c.bits & B_ADS != 0;
    inp.sprint = c.bits & B_SPRINT != 0;
    inp.crouch = c.bits & B_CROUCH != 0;
    inp.plate_hold = c.bits & B_PLATE_HOLD != 0;
    inp.jump |= c.bits & B_JUMP != 0;
    inp.reload |= c.bits & B_RELOAD != 0;
    inp.melee |= c.bits & B_MELEE != 0;
    if c.bits & B_INTERACT != 0 {
        inp.interact = true;
        inp.target = if c.target > 0 {
            Some(Target::Item(c.target as u32))
        } else if c.target < 0 && ((-c.target - 1) as usize) < crates {
            Some(Target::Crate((-c.target - 1) as usize))
        } else {
            None
        };
    }
    if c.slot >= 0 {
        inp.slot = c.slot;
    }
    match c.heal {
        1 => inp.heal = Heal::Plate,
        2 => inp.heal = Heal::Bandage,
        3 => inp.heal = Heal::Medkit,
        4 => inp.heal = Heal::Auto,
        _ => {}
    }
    match c.throw {
        1 => inp.throw = Throw::Frag,
        2 => inp.throw = Throw::Smoke,
        _ => {}
    }
}

#[inline]
fn r2(v: f64) -> f64 {
    (v * 100.0).round() / 100.0
}
fn ci(v: f64) -> i64 {
    (v * 100.0).round() as i64
}
pub fn item_row(it: &Item) -> Value {
    json!([it.id, it.k, it.w, it.r, it.a, it.n, it.mag, r2(it.x), r2(it.y), r2(it.z)])
}
pub fn wid_of(p: &Player) -> i64 {
    p.cur_weapon().map(|w| w.id as i64).unwrap_or(if p.inv.slot == 2 { 9 } else { -1 })
}
/// quantised per-player row: [id, x cm, y cm, z cm, yaw mrad, pitch mrad, st, flags, hp, armor, adsT%, speed dm/s, weapon, act]
pub fn player_row(p: &Player) -> Vec<i64> {
    let flags = (p.on_ground as i64) | (p.crouch as i64) << 1 | (p.swim as i64) << 2 | (p.opened as i64) << 3 | (p.ads as i64) << 4 | (p.sprint as i64) << 5;
    vec![
        p.id as i64,
        ci(p.x),
        ci(p.y),
        ci(p.z),
        (p.yaw * 1000.0).round() as i64,
        (p.pitch * 1000.0).round() as i64,
        p.st as i64,
        flags,
        p.hp.ceil().max(0.0) as i64,
        p.armor().ceil() as i64,
        (p.ads_t * 100.0).round() as i64,
        (p.move_spd * 10.0).round() as i64,
        wid_of(p),
        p.act.map(|a| a.k as i64).unwrap_or(0),
    ]
}
/// full-precision state of the receiving player (for prediction + HUD)
pub fn me_row(p: &Player, t: f64) -> Value {
    let flags = (p.on_ground as i64) | (p.crouch as i64) << 1 | (p.swim as i64) << 2 | (p.opened as i64) << 3 | (p.ads as i64) << 4 | (p.sprint as i64) << 5;
    let w = |s: usize| p.inv.w[s].map(|w| json!([w.id, w.r, w.mag])).unwrap_or(Value::Null);
    let act = p.act.map(|a| json!([a.k as u8, a.t, a.dur])).unwrap_or(Value::Null);
    json!([
        p.x, p.y, p.z, p.vx, p.vy, p.vz, p.st as u8, flags, p.fall_t, p.chute_t, p.ads_t, (t - p.last_shot_t).min(99.0), act,
        p.hp, p.pl[0], p.pl[1], p.pl[2], p.inv.slot, w(0), w(1), p.inv.ammo, p.inv.plate, p.inv.bandage, p.inv.medkit, p.inv.frag, p.inv.smoke, p.inv.pickle,
        p.kills, r2(p.dmg), p.place, p.cd, p.swap_t, p.rec_p, p.rec_y, p.bloom, p.in_gas, p.killed_by, p.kill_wid
    ])
}
pub fn event_row(m: &Match, e: &Event) -> Option<Value> {
    Some(match e {
        Event::Shot { pid, wid, k, o, e, hp, s, n } => json!([1, pid, wid, k, r2(o[0]), r2(o[1]), r2(o[2]), r2(e[0]), r2(e[1]), r2(e[2]), hp, s, r2(n[0]), r2(n[1]), r2(n[2])]),
        Event::Fire { pid, wid, x, y, z } => json!([2, pid, wid, r2(*x), r2(*y), r2(*z)]),
        Event::Hit { pid, by, dmg, zone, armor, broke, kill, x, y, z, wid, ax, az } => json!([3, pid, by, r2(*dmg), *zone as u8, *armor as u8, *broke as u8, *kill as u8, r2(*x), r2(*y), r2(*z), wid, r2(*ax), r2(*az)]),
        Event::Kill { pid, by, wid, head, x, y, z, alive } => json!([4, pid, by, wid, *head as u8, r2(*x), r2(*y), r2(*z), alive]),
        Event::Win { pid } => json!([5, pid]),
        Event::Item { id } => {
            let it = m.item(*id)?;
            let mut row = item_row(it);
            row.as_array_mut()?.insert(0, json!(6));
            row
        }
        Event::ItemGone { id } => json!([7, id]),
        Event::ItemChanged { id, n } => json!([8, id, n]),
        Event::Crate { id, pid } => json!([9, id, pid]),
        Event::Pickup { pid, k, w, r } => json!([10, pid, k, w, r]),
        Event::Pickle { pid } => json!([11, pid]),
        Event::Jump { pid, plane } => json!([12, pid, *plane as u8]),
        Event::Chute { pid, open } => json!([13, pid, *open as u8]),
        Event::Landed { pid, x, y, z } => json!([14, pid, r2(*x), r2(*y), r2(*z)]),
        Event::Land { pid, hard } => json!([15, pid, *hard as u8]),
        Event::Splash { pid, x, z } => json!([16, pid, r2(*x), r2(*z)]),
        Event::Act { pid, k } => json!([17, pid, *k as u8]),
        Event::Reloaded { pid } => json!([18, pid]),
        Event::Plated { pid } => json!([19, pid]),
        Event::Healed { pid } => json!([20, pid]),
        Event::Swap { pid, slot } => json!([21, pid, slot]),
        Event::Dry { pid } => json!([22, pid]),
        Event::Melee { pid, hit } => json!([23, pid, hit]),
        Event::Throw { pid, k } => json!([24, pid, if *k == Throw::Frag { 1 } else { 2 }]),
        Event::Bounce { x, y, z } => json!([25, r2(*x), r2(*y), r2(*z)]),
        Event::Explode { x, y, z } => json!([26, r2(*x), r2(*y), r2(*z)]),
        Event::Smoke { x, y, z, id } => json!([27, r2(*x), r2(*y), r2(*z), id]),
        Event::GasShrink { st } => json!([28, st]),
        Event::GasStage { st } => json!([29, st]),
    })
}
pub fn gas_row(m: &Match) -> Value {
    match &m.gas {
        Some(g) => json!([g.st, match g.ph { GasPh::Wait => 0, GasPh::Shrink => 1, GasPh::Done => 2 }, r2(g.t), r2(g.dur), r2(g.cx), r2(g.cz), r2(g.r), r2(g.nx), r2(g.nz), r2(g.nr), g.dps]),
        None => Value::Null,
    }
}
pub fn encode(v: &Value) -> Vec<u8> {
    rmp_serde::to_vec(v).unwrap_or_default()
}

/// Minimal dynamic MessagePack value used for decoding client input (numbers and arrays only).
pub mod rmpv_lite {
    use serde::de::{Deserialize, Deserializer, SeqAccess, Visitor};
    use std::fmt;
    #[derive(Debug, Clone)]
    pub enum V {
        N(f64),
        A(Vec<V>),
        Other,
    }
    impl V {
        pub fn as_f64(&self) -> Option<f64> {
            if let V::N(n) = self { Some(*n) } else { None }
        }
        pub fn as_array(&self) -> Option<&Vec<V>> {
            if let V::A(a) = self { Some(a) } else { None }
        }
    }
    struct Vis;
    impl<'de> Visitor<'de> for Vis {
        type Value = V;
        fn expecting(&self, f: &mut fmt::Formatter) -> fmt::Result {
            f.write_str("numbers or arrays")
        }
        fn visit_bool<E>(self, v: bool) -> Result<V, E> {
            Ok(V::N(v as u8 as f64))
        }
        fn visit_i64<E>(self, v: i64) -> Result<V, E> {
            Ok(V::N(v as f64))
        }
        fn visit_u64<E>(self, v: u64) -> Result<V, E> {
            Ok(V::N(v as f64))
        }
        fn visit_f64<E>(self, v: f64) -> Result<V, E> {
            Ok(V::N(v))
        }
        fn visit_f32<E>(self, v: f32) -> Result<V, E> {
            Ok(V::N(v as f64))
        }
        fn visit_unit<E>(self) -> Result<V, E> {
            Ok(V::Other)
        }
        fn visit_none<E>(self) -> Result<V, E> {
            Ok(V::Other)
        }
        fn visit_str<E>(self, _v: &str) -> Result<V, E> {
            Ok(V::Other)
        }
        fn visit_bytes<E>(self, _v: &[u8]) -> Result<V, E> {
            Ok(V::Other)
        }
        fn visit_seq<A: SeqAccess<'de>>(self, mut seq: A) -> Result<V, A::Error> {
            let mut out = Vec::new();
            while let Some(v) = seq.next_element::<V>()? {
                if out.len() > 64 {
                    return Err(serde::de::Error::custom("array too long"));
                }
                out.push(v);
            }
            Ok(V::A(out))
        }
        fn visit_map<A: serde::de::MapAccess<'de>>(self, mut map: A) -> Result<V, A::Error> {
            while map.next_entry::<serde::de::IgnoredAny, serde::de::IgnoredAny>()?.is_some() {}
            Ok(V::Other)
        }
    }
    impl<'de> Deserialize<'de> for V {
        fn deserialize<D: Deserializer<'de>>(d: D) -> Result<V, D::Error> {
            d.deserialize_any(Vis)
        }
    }
}
