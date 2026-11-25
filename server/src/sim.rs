//! Match simulation, ported from last-zone/sim.js. Fixed 60 Hz step; inputs in, state + events out.
//! Movement (`move_ground`, `move_air`, plane follow) must stay identical to the JS client prediction
//! (see tests/movement.rs, which replays a trace recorded from the JS sim).
use crate::data::*;
use crate::rng::{clamp, hypot2, hypot3, js_round, lerp, Rng};
use crate::world::{surf, World, SEA};
use std::collections::HashMap;

pub const DT: f64 = 1.0 / 60.0;
const D2R: f64 = std::f64::consts::PI / 180.0;
const GRAV: f64 = 22.0;
const JUMP_V: f64 = 6.2;
const RAD: f64 = 0.36;
pub const STAND_H: f64 = 1.8;
pub const CROUCH_H: f64 = 1.25;

// item kinds (index into data::ITEM_KEYS)
pub const K_WEAPON: u8 = 0;
pub const K_AMMO: u8 = 1;
pub const K_PLATE: u8 = 2;
pub const K_BANDAGE: u8 = 3;
pub const K_MEDKIT: u8 = 4;
pub const K_FRAG: u8 = 5;
pub const K_SMOKE: u8 = 6;
pub const K_PICKLE: u8 = 7;
// special damage sources (after the 8 weapons)
pub const WID_GAS: u8 = 100;
pub const WID_FALL: u8 = 101;
pub const WID_KNIFE: u8 = 102;
pub const WID_FRAG: u8 = 103;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u8)]
pub enum St {
    Plane = 0,
    Fall = 1,
    Chute = 2,
    Ground = 3,
    Dead = 4,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Heal {
    None,
    Plate,
    Bandage,
    Medkit,
    Auto,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Throw {
    None,
    Frag,
    Smoke,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Target {
    Item(u32),
    Crate(usize),
}
#[derive(Clone, Debug)]
pub struct Input {
    pub mx: f64,
    pub mz: f64,
    pub yaw: f64,
    pub pitch: f64,
    pub fire: bool,
    pub ads: bool,
    pub sprint: bool,
    pub crouch: bool,
    pub jump: bool,
    pub reload: bool,
    pub interact: bool,
    pub melee: bool,
    pub slot: i8,
    pub heal: Heal,
    pub throw: Throw,
    pub plate_hold: bool,
    pub target: Option<Target>,
}
impl Default for Input {
    fn default() -> Self {
        Input { mx: 0.0, mz: 0.0, yaw: 0.0, pitch: 0.0, fire: false, ads: false, sprint: false, crouch: false, jump: false, reload: false, interact: false, melee: false, slot: -1, heal: Heal::None, throw: Throw::None, plate_hold: false, target: None }
    }
}
impl Input {
    fn clear_edges(&mut self) {
        self.target = None;
        self.jump = false;
        self.reload = false;
        self.interact = false;
        self.melee = false;
        self.slot = -1;
        self.heal = Heal::None;
        self.throw = Throw::None;
    }
}
#[derive(Clone, Copy, Debug)]
pub struct WeaponInst {
    pub id: usize,
    pub r: u8,
    pub mag: i32,
}
#[derive(Clone, Debug, Default)]
pub struct Inv {
    pub w: [Option<WeaponInst>; 2],
    pub slot: u8,
    pub ammo: [i32; 4],
    pub plate: i32,
    pub bandage: i32,
    pub medkit: i32,
    pub frag: i32,
    pub smoke: i32,
    pub pickle: i32,
}
impl Inv {
    pub fn get(&self, k: u8) -> i32 {
        match k {
            K_PLATE => self.plate,
            K_BANDAGE => self.bandage,
            K_MEDKIT => self.medkit,
            K_FRAG => self.frag,
            K_SMOKE => self.smoke,
            K_PICKLE => self.pickle,
            _ => 0,
        }
    }
    pub fn get_mut(&mut self, k: u8) -> &mut i32 {
        match k {
            K_PLATE => &mut self.plate,
            K_BANDAGE => &mut self.bandage,
            K_MEDKIT => &mut self.medkit,
            K_FRAG => &mut self.frag,
            K_SMOKE => &mut self.smoke,
            _ => &mut self.pickle,
        }
    }
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u8)]
pub enum ActK {
    Reload = 1,
    Plate = 2,
    Bandage = 3,
    Medkit = 4,
}
#[derive(Clone, Copy, Debug)]
pub struct Act {
    pub k: ActK,
    pub t: f64,
    pub dur: f64,
}

#[derive(Clone, Debug)]
pub struct Player {
    pub id: u32,
    pub name: String,
    pub bot: bool,
    pub human: bool,
    pub x: f64,
    pub y: f64,
    pub z: f64,
    pub vx: f64,
    pub vy: f64,
    pub vz: f64,
    pub yaw: f64,
    pub pitch: f64,
    pub st: St,
    pub on_ground: bool,
    pub crouch: bool,
    pub sprint: bool,
    pub ads: bool,
    pub ads_t: f64,
    pub swim: bool,
    pub move_spd: f64,
    pub hp: f64,
    pub pl: [f64; 3],
    pub inv: Inv,
    pub cd: f64,
    pub bloom: f64,
    pub rec_p: f64,
    pub rec_y: f64,
    pub shot_n: u32,
    pub trig: bool,
    pub act: Option<Act>,
    pub melee_cd: f64,
    pub throw_cd: f64,
    pub swap_t: f64,
    pub kills: u32,
    pub dmg: f64,
    pub place: u32,
    pub death_t: f64,
    pub last_atk: Option<u32>,
    pub last_atk_t: f64,
    pub fall_t: f64,
    pub chute_t: f64,
    pub opened: bool,
    pub land_t: f64,
    pub last_shot_t: f64,
    pub last_hit_t: f64,
    pub auto_t: f64,
    pub gas_t: f64,
    pub in_gas: bool,
    pub god: bool,
    pub inp: Input,
    pub hurt_t: f64,
    pub fire_t: f64,
    pub killed_by: u32,
    pub kill_wid: u8,
}
impl Player {
    pub fn new(id: u32, name: &str, bot: bool, human: bool) -> Self {
        Player {
            id, name: name.to_string(), bot, human, x: 0.0, y: 0.0, z: 0.0, vx: 0.0, vy: 0.0, vz: 0.0, yaw: 0.0, pitch: 0.0, st: St::Plane, on_ground: false, crouch: false, sprint: false, ads: false, ads_t: 0.0, swim: false, move_spd: 0.0,
            hp: MAX_HP, pl: [0.0; 3], inv: Inv::default(), cd: 0.0, bloom: 0.0, rec_p: 0.0, rec_y: 0.0, shot_n: 0, trig: false, act: None, melee_cd: 0.0, throw_cd: 0.0, swap_t: 0.0,
            kills: 0, dmg: 0.0, place: 0, death_t: 0.0, last_atk: None, last_atk_t: -99.0, fall_t: 0.0, chute_t: 0.0, opened: false, land_t: -9.0, last_shot_t: -99.0, last_hit_t: -99.0, auto_t: 0.0, gas_t: 0.0, in_gas: false,
            god: false, inp: Input::default(), hurt_t: -9.0, fire_t: -9.0, killed_by: 0, kill_wid: 0,
        }
    }
    pub fn eye_y(&self) -> f64 {
        self.y + if self.st == St::Ground { if self.crouch { 1.15 } else { 1.62 } } else { 1.5 }
    }
    pub fn cur_weapon(&self) -> Option<WeaponInst> {
        if self.inv.slot < 2 { self.inv.w[self.inv.slot as usize] } else { None }
    }
    pub fn armor(&self) -> f64 {
        self.pl[0] + self.pl[1] + self.pl[2]
    }
    pub fn plate_max(&self) -> bool {
        self.pl.iter().all(|&v| v >= PLATE_HP)
    }
    pub fn alive(&self) -> bool {
        self.st != St::Dead
    }
}

#[derive(Clone, Debug)]
pub struct Item {
    pub id: u32,
    pub k: u8,
    pub w: u8,
    pub r: u8,
    pub a: u8,
    pub n: i32,
    pub mag: i32,
    pub x: f64,
    pub y: f64,
    pub z: f64,
    pub gone: bool,
}
impl Item {
    fn new(k: u8) -> Self {
        Item { id: 0, k, w: 0, r: 0, a: 0, n: 1, mag: 0, x: 0.0, y: 0.0, z: 0.0, gone: false }
    }
}
#[derive(Clone, Debug)]
pub struct Crate {
    pub id: usize,
    pub x: f64,
    pub y: f64,
    pub z: f64,
    pub tier: u8,
    pub open: bool,
    pub pickle: bool,
}
#[derive(Clone, Debug)]
pub struct Proj {
    pub k: Throw,
    pub x: f64,
    pub y: f64,
    pub z: f64,
    pub vx: f64,
    pub vy: f64,
    pub vz: f64,
    pub fuse: f64,
    pub owner: u32,
    pub id: u32,
}
#[derive(Clone, Debug)]
pub struct Smoke {
    pub x: f64,
    pub y: f64,
    pub z: f64,
    pub r: f64,
    pub t: f64,
    pub life: f64,
    pub id: u32,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum GasPh {
    Wait,
    Shrink,
    Done,
}
#[derive(Clone, Debug)]
pub struct Gas {
    pub st: usize,
    pub ph: GasPh,
    pub t: f64,
    pub dur: f64,
    pub cx: f64,
    pub cz: f64,
    pub r: f64,
    pub ox: f64,
    pub oz: f64,
    pub or: f64,
    pub nx: f64,
    pub nz: f64,
    pub nr: f64,
    pub dps: f64,
}
#[derive(Clone, Debug)]
pub struct Plane {
    pub ax: f64,
    pub az: f64,
    pub dx: f64,
    pub dz: f64,
    pub len: f64,
    pub s: f64,
    pub speed: f64,
    pub y: f64,
    pub x: f64,
    pub z: f64,
    pub gone: bool,
    pub eject: f64,
}
#[derive(Clone, Debug)]
pub struct Sound {
    pub x: f64,
    pub z: f64,
    pub t: f64,
    pub pid: u32,
    pub loud: f64,
}
/// head/body/legs
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u8)]
pub enum Zone {
    Head = 0,
    Body = 1,
    Legs = 2,
}

/// Events emitted by a step; the server forwards a subset to clients.
#[derive(Clone, Debug)]
pub enum Event {
    Item { id: u32 },
    ItemGone { id: u32 },
    ItemChanged { id: u32, n: i32 },
    Crate { id: usize, pid: u32 },
    Pickup { pid: u32, k: u8, w: u8, r: u8 },
    Pickle { pid: u32 },
    Shot { pid: u32, wid: u8, k: u32, o: [f64; 3], e: [f64; 3], hp: u32, s: i16, n: [f64; 3] },
    Fire { pid: u32, wid: u8, x: f64, y: f64, z: f64 },
    Hit { pid: u32, by: u32, dmg: f64, zone: Zone, armor: bool, broke: bool, kill: bool, x: f64, y: f64, z: f64, wid: u8, ax: f64, az: f64 },
    Kill { pid: u32, by: u32, wid: u8, head: bool, x: f64, y: f64, z: f64, alive: u32 },
    Win { pid: u32 },
    Jump { pid: u32, plane: bool },
    Chute { pid: u32, open: bool },
    Landed { pid: u32, x: f64, y: f64, z: f64 },
    Land { pid: u32, hard: bool },
    Splash { pid: u32, x: f64, z: f64 },
    Act { pid: u32, k: ActK },
    Reloaded { pid: u32 },
    Plated { pid: u32 },
    Healed { pid: u32 },
    Swap { pid: u32, slot: u8 },
    Dry { pid: u32 },
    Melee { pid: u32, hit: u32 },
    Throw { pid: u32, k: Throw },
    Bounce { x: f64, y: f64, z: f64 },
    Explode { x: f64, y: f64, z: f64 },
    Smoke { x: f64, y: f64, z: f64, id: u32 },
    GasShrink { st: usize },
    GasStage { st: usize },
}

/// lag compensation: positions of other players to use while one shooter fires
#[derive(Clone, Copy, Debug)]
pub struct PosRec {
    pub id: u32,
    pub x: f64,
    pub y: f64,
    pub z: f64,
    pub crouch: bool,
    pub st: St,
}

pub struct Match {
    pub w: World,
    pub seed: u32,
    pub rng: Rng,
    pub lrng: Rng,
    pub t: f64,
    pub players: Vec<Player>,
    pub items: Vec<Item>,
    item_idx: HashMap<u32, usize>,
    igrid: HashMap<(i32, i32), Vec<u32>>,
    pub crates: Vec<Crate>,
    pub proj: Vec<Proj>,
    pub smokes: Vec<Smoke>,
    pub sounds: Vec<Sound>,
    pub events: Vec<Event>,
    pub next_id: u32,
    pub alive: u32,
    pub over: bool,
    pub winner: Option<u32>,
    pub gas: Option<Gas>,
    pub plane: Option<Plane>,
    pub diff: usize,
    pub ai: Vec<Option<crate::bots::BotAi>>,
    /// per shooter id: historical positions of everyone else (set by the server before a step)
    pub rewind: HashMap<u32, Vec<PosRec>>,
    pub claims: HashMap<i64, (i64, f64)>,
}

pub fn wid_name(w: u8) -> &'static str {
    match w {
        WID_GAS => "gas",
        WID_FALL => "fall",
        WID_KNIFE => "knife",
        WID_FRAG => "frag",
        _ => WEAPONS.get(w as usize).map(|x| x.key).unwrap_or("?"),
    }
}

impl Match {
    pub fn new(w: World, seed: u32, br: bool) -> Self {
        let mut m = Match {
            w, seed, rng: Rng::new(seed), lrng: Rng::new(seed ^ 0x51ed), t: 0.0, players: vec![], items: vec![], item_idx: HashMap::new(), igrid: HashMap::new(), crates: vec![], proj: vec![], smokes: vec![], sounds: vec![], events: vec![], next_id: 1, alive: 0, over: false,
            winner: None, gas: None, plane: None, diff: 1, ai: vec![], rewind: HashMap::new(), claims: HashMap::new(),
        };
        let spawns: Vec<_> = m.w.crates.iter().map(|c| (c.x, c.y, c.z, c.tier)).collect();
        for (i, (x, y, z, tier)) in spawns.into_iter().enumerate() {
            m.crates.push(Crate { id: i, x, y, z, tier, open: false, pickle: false });
        }
        if br {
            let pc = m.lrng.int(0, m.crates.len() as i64 - 1) as usize;
            m.crates[pc].pickle = true;
            let loot: Vec<_> = m.w.loot.iter().map(|s| (s.x, s.y, s.z, s.tier)).collect();
            for (x, y, z, tier) in loot {
                if m.lrng.next() < 0.78 {
                    m.spawn_loot_at(x, y, z, tier);
                }
            }
            m.make_plane();
            m.init_gas();
        }
        m
    }
    pub fn add_player(&mut self, name: &str, bot: bool, human: bool) -> usize {
        let id = self.next_id;
        self.next_id += 1;
        self.players.push(Player::new(id, name, bot, human));
        self.ai.push(None);
        self.alive += 1;
        self.players.len() - 1
    }
    pub fn pidx(&self, id: u32) -> Option<usize> {
        self.players.iter().position(|p| p.id == id)
    }
    pub fn item(&self, id: u32) -> Option<&Item> {
        self.item_idx.get(&id).map(|&i| &self.items[i])
    }
    fn make_plane(&mut self) {
        let ang = self.rng.next() * std::f64::consts::PI * 2.0;
        let rr = self.rng.next().sqrt() * 260.0;
        let (ca, sa) = (ang.cos(), ang.sin());
        let px = (ang + 1.3).cos() * rr;
        let pz = (ang + 1.3).sin() * rr;
        let mut p = Plane { ax: px - ca * 1350.0, az: pz - sa * 1350.0, dx: ca, dz: sa, len: 2700.0, s: 0.0, speed: 72.0, y: 470.0, x: 0.0, z: 0.0, gone: false, eject: 2700.0 - 330.0 };
        p.x = p.ax + p.dx * p.s;
        p.z = p.az + p.dz * p.s;
        self.plane = Some(p);
    }

    // ------------------------------------------------------------------------------------- loot
    fn icell(x: f64, z: f64) -> (i32, i32) {
        ((x / 8.0).floor() as i32, (z / 8.0).floor() as i32)
    }
    fn add_item(&mut self, mut it: Item) -> u32 {
        it.id = self.next_id;
        self.next_id += 1;
        it.gone = false;
        let id = it.id;
        self.igrid.entry(Self::icell(it.x, it.z)).or_default().push(id);
        self.item_idx.insert(id, self.items.len());
        self.items.push(it);
        self.events.push(Event::Item { id });
        id
    }
    fn remove_item(&mut self, id: u32) {
        let i = self.item_idx[&id];
        self.items[i].gone = true;
        let c = Self::icell(self.items[i].x, self.items[i].z);
        if let Some(l) = self.igrid.get_mut(&c) {
            if let Some(k) = l.iter().position(|&q| q == id) {
                l.remove(k);
            }
        }
        self.events.push(Event::ItemGone { id });
    }
    pub fn items_near(&self, x: f64, z: f64, rad: f64) -> Vec<u32> {
        let mut out = vec![];
        for i in ((x - rad) / 8.0).floor() as i32..=((x + rad) / 8.0).floor() as i32 {
            for j in ((z - rad) / 8.0).floor() as i32..=((z + rad) / 8.0).floor() as i32 {
                if let Some(l) = self.igrid.get(&(i, j)) {
                    for &id in l {
                        let it = &self.items[self.item_idx[&id]];
                        if (it.x - x).powi(2) + (it.z - z).powi(2) < rad * rad {
                            out.push(id);
                        }
                    }
                }
            }
        }
        out
    }
    fn make_loot(rng: &mut Rng, tier: u8, force: Option<u8>) -> Item {
        let t = &LOOT_TIERS[(tier.clamp(1, 4) - 1) as usize];
        let k = force.unwrap_or_else(|| rng.weighted(&t.kind));
        let mut it = Item::new(k);
        match k {
            K_WEAPON => {
                let w = rng.weighted(&WEAPON_WEIGHTS);
                it.w = w as u8;
                it.r = rng.weighted(&t.rarity);
                it.mag = WEAPONS[w].mag;
            }
            K_AMMO => {
                let a = rng.idx(AMMO.len());
                it.a = a as u8;
                it.n = AMMO[a].pickup;
            }
            K_PLATE => it.n = if rng.next() < 0.4 { 2 } else { 1 },
            _ => it.n = 1,
        }
        it
    }
    fn spawn_loot_at(&mut self, x: f64, y: f64, z: f64, tier: u8) {
        let mut it = Self::make_loot(&mut self.lrng, tier, None);
        it.x = x;
        it.y = y;
        it.z = z;
        let (k, w) = (it.k, it.w);
        self.add_item(it);
        if k == K_WEAPON {
            let a = WEAPONS[w as usize].ammo;
            let mut am = Item::new(K_AMMO);
            am.a = a as u8;
            am.n = AMMO[a].pickup;
            am.x = x + 0.7;
            am.y = y;
            am.z = z + 0.4;
            self.add_item(am);
        }
    }
    fn open_crate(&mut self, ci: usize, pid: u32) {
        self.crates[ci].open = true;
        let c = self.crates[ci].clone();
        let n = 3 + if c.tier >= 3 { 1 } else { 0 };
        let tier = (c.tier + 1).min(4);
        let mut list = vec![Self::make_loot(&mut self.lrng, tier, Some(K_WEAPON)), Self::make_loot(&mut self.lrng, tier, Some(K_PLATE)), Self::make_loot(&mut self.lrng, tier, None)];
        if n > 3 {
            let f = if self.lrng.next() < 0.5 { K_MEDKIT } else { K_FRAG };
            list.push(Self::make_loot(&mut self.lrng, tier, Some(f)));
        }
        let a = WEAPONS[list[0].w as usize].ammo;
        let mut am = Item::new(K_AMMO);
        am.a = a as u8;
        am.n = AMMO[a].pickup * 2;
        list.insert(1, am);
        if c.pickle {
            list.push(Item::new(K_PICKLE));
        }
        for (k, mut it) in list.into_iter().enumerate() {
            let ang = k as f64 / (n as f64 + 1.0) * std::f64::consts::PI * 2.0 + 0.4;
            let x = c.x + ang.cos() * 1.3;
            let z = c.z + ang.sin() * 1.3;
            it.x = x;
            it.y = self.w.ground(x, z, c.y + 1.0);
            it.z = z;
            self.add_item(it);
        }
        self.events.push(Event::Crate { id: ci, pid });
    }
    fn give_weapon(&mut self, pi: usize, it: &Item) {
        let (s, old) = {
            let inv = &self.players[pi].inv;
            let s = if inv.w[0].is_none() { 0 } else if inv.w[1].is_none() { 1 } else if inv.slot < 2 { inv.slot as usize } else { 0 };
            (s, inv.w[s])
        };
        if let Some(o) = old {
            let mut d = Item::new(K_WEAPON);
            d.w = o.id as u8;
            d.r = o.r;
            d.mag = o.mag;
            self.drop_item(pi, d);
        }
        let p = &mut self.players[pi];
        p.inv.w[s] = Some(WeaponInst { id: it.w as usize, r: it.r, mag: it.mag });
        p.inv.slot = s as u8;
        p.act = None;
        p.swap_t = 0.5;
        p.cd = p.cd.max(0.35);
    }
    fn drop_item(&mut self, pi: usize, mut it: Item) {
        let p = &self.players[pi];
        let a = p.yaw + 2.2;
        let x = p.x - a.sin() * 1.2;
        let z = p.z - a.cos() * 1.2;
        it.x = x;
        it.y = self.w.ground(x, z, p.y + 1.0);
        it.z = z;
        self.add_item(it);
    }
    fn take_item(&mut self, pi: usize, id: u32) -> bool {
        let ii = self.item_idx[&id];
        let it = self.items[ii].clone();
        let pid = self.players[pi].id;
        if it.k == K_WEAPON {
            self.give_weapon(pi, &it);
            self.remove_item(id);
            self.events.push(Event::Pickup { pid, k: it.k, w: it.w, r: it.r });
            return true;
        }
        let taken;
        {
            let inv = &mut self.players[pi].inv;
            if it.k == K_AMMO {
                let a = it.a as usize;
                let room = AMMO[a].max - inv.ammo[a];
                if room <= 0 {
                    return false;
                }
                taken = room.min(it.n);
                inv.ammo[a] += taken;
            } else {
                let room = ITEM_MAX[it.k as usize] - inv.get(it.k);
                if room <= 0 {
                    return false;
                }
                taken = room.min(it.n);
                *inv.get_mut(it.k) += taken;
            }
        }
        self.items[ii].n -= taken;
        self.events.push(Event::Pickup { pid, k: it.k, w: it.w, r: it.r });
        if it.k == K_PICKLE {
            self.events.push(Event::Pickle { pid });
        }
        if self.items[ii].n <= 0 {
            self.remove_item(id);
        } else {
            self.events.push(Event::ItemChanged { id, n: self.items[ii].n });
        }
        true
    }
    pub fn best_interact(&self, pi: usize) -> Option<Target> {
        let p = &self.players[pi];
        let mut best = None;
        let mut bs = 1e9;
        for c in &self.crates {
            if c.open {
                continue;
            }
            let d = hypot2(c.x - p.x, c.z - p.z);
            if d < 2.6 && (c.y - p.y).abs() < 2.0 && d < bs {
                bs = d;
                best = Some(Target::Crate(c.id));
            }
        }
        if best.is_some() {
            return best;
        }
        let fx = -p.yaw.sin();
        let fz = -p.yaw.cos();
        for id in self.items_near(p.x, p.z, 2.6) {
            let it = &self.items[self.item_idx[&id]];
            if (it.y - p.y).abs() > 2.2 {
                continue;
            }
            let dx = it.x - p.x;
            let dz = it.z - p.z;
            let d = hypot2(dx, dz);
            let sc = d - (dx * fx + dz * fz) / d.max(0.01) * 0.8 + if it.k == K_WEAPON { -0.3 } else { 0.0 };
            if sc < bs {
                bs = sc;
                best = Some(Target::Item(id));
            }
        }
        best
    }
    fn drop_all(&mut self, pi: usize) {
        let mut list: Vec<Item> = vec![];
        {
            let p = &self.players[pi];
            for w in p.inv.w.iter().flatten() {
                let mut it = Item::new(K_WEAPON);
                it.w = w.id as u8;
                it.r = w.r;
                it.mag = w.mag;
                list.push(it);
            }
            for a in 0..4 {
                if p.inv.ammo[a] > 0 {
                    let mut it = Item::new(K_AMMO);
                    it.a = a as u8;
                    it.n = p.inv.ammo[a];
                    list.push(it);
                }
            }
            for k in [K_PLATE, K_BANDAGE, K_MEDKIT, K_FRAG, K_SMOKE] {
                if p.inv.get(k) > 0 {
                    let mut it = Item::new(k);
                    it.n = p.inv.get(k);
                    list.push(it);
                }
            }
            if p.bot && list.len() < 3 {
                list.push(Item::new(K_PLATE));
            }
        }
        let (px, py, pz) = (self.players[pi].x, self.players[pi].y, self.players[pi].z);
        let n = list.len();
        for (k, mut it) in list.into_iter().enumerate() {
            let a = k as f64 / n as f64 * std::f64::consts::PI * 2.0;
            let rr = 1.0 + (k % 2) as f64 * 0.6;
            let x = px + a.cos() * rr;
            let z = pz + a.sin() * rr;
            it.x = x;
            it.y = self.w.ground(x, z, py + 1.5);
            it.z = z;
            self.add_item(it);
        }
        let inv = &mut self.players[pi].inv;
        inv.w = [None, None];
        inv.ammo = [0; 4];
        inv.plate = 0;
        inv.bandage = 0;
        inv.medkit = 0;
        inv.frag = 0;
        inv.smoke = 0;
    }

    // ------------------------------------------------------------------------------------- gas
    fn init_gas(&mut self) {
        self.gas = Some(Gas { st: 0, ph: GasPh::Wait, t: GAS_STAGES[0].wait, dur: GAS_STAGES[0].wait, cx: 0.0, cz: 0.0, r: GAS_START_R, ox: 0.0, oz: 0.0, or: GAS_START_R, nx: 0.0, nz: 0.0, nr: 0.0, dps: 1.0 });
        self.choose_next();
    }
    fn choose_next(&mut self) {
        let g = self.gas.as_mut().unwrap();
        let s = &GAS_STAGES[g.st];
        let mut best = (0.0, 0.0);
        for _ in 0..40 {
            let a = self.rng.next() * std::f64::consts::PI * 2.0;
            let d = self.rng.next().sqrt() * (g.r - s.r).max(0.0) * if g.st == 0 { 0.55 } else { 0.92 };
            let x = g.cx + a.cos() * d;
            let z = g.cz + a.sin() * d;
            best = (x, z);
            if self.w.terrain_h(x, z) > 1.5 && hypot2(x, z) < 700.0 {
                break;
            }
        }
        g.nx = best.0;
        g.nz = best.1;
        g.nr = s.r;
    }
    fn update_gas(&mut self, dt: f64) {
        if self.gas.is_none() || self.over {
            return;
        }
        {
            let g = self.gas.as_mut().unwrap();
            g.t -= dt;
            if g.ph == GasPh::Wait && g.t <= 0.0 {
                let s = &GAS_STAGES[g.st];
                g.ph = GasPh::Shrink;
                g.t = s.shrink;
                g.dur = s.shrink;
                g.ox = g.cx;
                g.oz = g.cz;
                g.or = g.r;
                g.dps = s.dps;
                let st = g.st;
                self.events.push(Event::GasShrink { st });
            }
        }
        let mut next = false;
        {
            let g = self.gas.as_mut().unwrap();
            if g.ph == GasPh::Shrink {
                let k = clamp(1.0 - g.t / g.dur, 0.0, 1.0);
                g.cx = lerp(g.ox, g.nx, k);
                g.cz = lerp(g.oz, g.nz, k);
                g.r = lerp(g.or, g.nr, k);
                if g.t <= 0.0 {
                    g.st += 1;
                    if g.st < GAS_STAGES.len() {
                        let s = &GAS_STAGES[g.st];
                        g.ph = GasPh::Wait;
                        g.t = s.wait;
                        g.dur = s.wait;
                        next = true;
                    } else {
                        g.ph = GasPh::Done;
                        g.t = 0.0;
                        g.dps = GAS_STAGES[GAS_STAGES.len() - 1].dps * 1.5;
                    }
                }
            }
        }
        if next {
            self.choose_next();
            let st = self.gas.as_ref().unwrap().st;
            self.events.push(Event::GasStage { st });
        }
        let (cx, cz, r, dps) = {
            let g = self.gas.as_ref().unwrap();
            (g.cx, g.cz, g.r, g.dps)
        };
        for i in 0..self.players.len() {
            let p = &mut self.players[i];
            if p.st == St::Dead || p.st == St::Plane {
                continue;
            }
            let out = hypot2(p.x - cx, p.z - cz) > r;
            p.in_gas = out;
            if out {
                p.gas_t += dt;
                if p.gas_t >= 0.5 {
                    p.gas_t -= 0.5;
                    self.damage(i, dps.max(1.0) * 0.5, None, WID_GAS, Zone::Body, None);
                }
            } else {
                p.gas_t = 0.0;
            }
        }
    }
    pub fn force_gas_stage(&mut self, st: usize) {
        loop {
            let g = match &mut self.gas {
                Some(g) => g,
                None => return,
            };
            if g.st >= st || g.ph == GasPh::Done {
                return;
            }
            g.t = 0.0;
            self.update_gas(0.0001);
            self.update_gas(0.0001);
        }
    }

    // ------------------------------------------------------------------------------------- damage
    pub fn damage(&mut self, pi: usize, amt: f64, atk: Option<usize>, wid: u8, zone: Zone, at: Option<[f64; 3]>) -> f64 {
        if self.players[pi].st == St::Dead || amt <= 0.0 {
            return 0.0;
        }
        let pos = at.unwrap_or([self.players[pi].x, self.players[pi].y + 1.2, self.players[pi].z]);
        let by = atk.map(|a| self.players[a].id).unwrap_or(0);
        let (ax, az) = atk.map(|a| (self.players[a].x, self.players[a].z)).unwrap_or((self.players[pi].x, self.players[pi].z));
        if self.players[pi].god {
            let pid = self.players[pi].id;
            self.events.push(Event::Hit { pid, by, dmg: amt, zone, armor: false, broke: false, kill: false, x: pos[0], y: pos[1], z: pos[2], wid, ax, az });
            return 0.0;
        }
        let t = self.t;
        let mut rem = amt;
        let mut broke = false;
        let mut armor_hit = false;
        {
            let p = &mut self.players[pi];
            if wid != WID_GAS {
                let mut i = 3;
                while i > 0 && rem > 0.0 {
                    i -= 1;
                    if p.pl[i] > 0.0 {
                        armor_hit = true;
                        let take = p.pl[i].min(rem);
                        p.pl[i] -= take;
                        rem -= take;
                        if p.pl[i] <= 0.0 {
                            broke = true;
                        }
                    }
                }
            }
            p.hp -= rem;
            p.hurt_t = t;
        }
        if let Some(a) = atk {
            if a != pi {
                let aid = self.players[a].id;
                self.players[pi].last_atk = Some(aid);
                self.players[pi].last_atk_t = t;
                self.players[a].dmg += amt;
                self.players[a].last_hit_t = t;
            }
        }
        let kill = self.players[pi].hp <= 0.0;
        let pid = self.players[pi].id;
        self.events.push(Event::Hit { pid, by, dmg: amt, zone, armor: armor_hit, broke, kill, x: pos[0], y: pos[1], z: pos[2], wid, ax, az });
        if let Some(a) = self.players[pi].act {
            if a.k != ActK::Reload && wid != WID_GAS {
                self.players[pi].act = None;
            }
        }
        if kill {
            self.kill_player(pi, atk, wid, zone == Zone::Head);
        }
        amt
    }
    fn kill_player(&mut self, pi: usize, mut atk: Option<usize>, wid: u8, head: bool) {
        let t = self.t;
        {
            let p = &mut self.players[pi];
            p.hp = 0.0;
            p.st = St::Dead;
            p.death_t = t;
            p.act = None;
            p.ads = false;
        }
        if atk.is_none() {
            if let Some(la) = self.players[pi].last_atk {
                if t - self.players[pi].last_atk_t < 10.0 {
                    atk = self.pidx(la);
                }
            }
        }
        if let Some(a) = atk {
            if a != pi {
                self.players[a].kills += 1;
            }
        }
        self.players[pi].place = self.alive;
        self.alive -= 1;
        self.drop_all(pi);
        let p = &self.players[pi];
        let by = atk.map(|a| self.players[a].id).unwrap_or(0);
        let (pid, x, y, z) = (p.id, p.x, p.y, p.z);
        self.players[pi].killed_by = by;
        self.players[pi].kill_wid = wid;
        self.events.push(Event::Kill { pid, by, wid, head, x, y, z, alive: self.alive });
        if !self.over && self.alive <= 1 {
            self.over = true;
            let w = self.players.iter().find(|q| q.st != St::Dead).map(|q| q.id).unwrap_or(pid);
            self.winner = Some(w);
            if let Some(wi) = self.pidx(w) {
                self.players[wi].place = 1;
            }
            self.events.push(Event::Win { pid: w });
        }
    }

    // ------------------------------------------------------------------------------------- hitscan
    fn ray_player(ox: f64, oy: f64, oz: f64, dx: f64, dy: f64, dz: f64, x: f64, y: f64, z: f64, crouch: bool, st: St, max_t: f64) -> Option<(f64, Zone)> {
        let h = if st == St::Ground && crouch { CROUCH_H } else { STAND_H };
        let (cx, cz, by) = (x, z, y);
        let tx = cx - ox;
        let tz = cz - oz;
        let ty = by + h * 0.5 - oy;
        let tc = tx * dx + ty * dy + tz * dz;
        if tc < -1.0 || tc > max_t + 1.0 {
            return None;
        }
        let px = ox + dx * tc - cx;
        let py = oy + dy * tc - (by + h * 0.5);
        let pz = oz + dz * tc - cz;
        if px * px + pz * pz > 1.2 || py.abs() > h {
            return None;
        }
        let mut best: Option<(f64, Zone)> = None;
        if let Some(t) = ray_sphere(ox, oy, oz, dx, dy, dz, cx, by + h * 0.91, cz, 0.15) {
            if t < max_t {
                best = Some((t, Zone::Head));
            }
        }
        if let Some(t) = ray_capsule(ox, oy, oz, dx, dy, dz, cx, by + h * 0.5, cz, by + h * 0.78, 0.27) {
            if t < max_t && best.map_or(true, |b| t < b.0) {
                best = Some((t, Zone::Body));
            }
        }
        if let Some(t) = ray_capsule(ox, oy, oz, dx, dy, dz, cx, by + 0.12, cz, by + h * 0.48, 0.2) {
            if t < max_t && best.map_or(true, |b| t < b.0) {
                best = Some((t, Zone::Legs));
            }
        }
        best
    }
    /// returns (t, hit player index, zone, world hit)
    pub fn trace_shot(&self, shooter: usize, ox: f64, oy: f64, oz: f64, dx: f64, dy: f64, dz: f64, range: f64, rewind: Option<&Vec<PosRec>>) -> (f64, Option<(usize, Zone)>, Option<crate::world::Hit>) {
        let w = self.w.raycast(ox, oy, oz, dx, dy, dz, range);
        let mut max_t = w.map(|h| h.t).unwrap_or(range);
        let mut hit = None;
        for (qi, q) in self.players.iter().enumerate() {
            if qi == shooter {
                continue;
            }
            // lag compensation: use where the shooter saw this player
            let (x, y, z, crouch, st) = match rewind.and_then(|r| r.iter().find(|r| r.id == q.id)) {
                Some(r) => (r.x, r.y, r.z, r.crouch, r.st),
                None => (q.x, q.y, q.z, q.crouch, q.st),
            };
            if q.st == St::Dead || st == St::Dead || st == St::Plane || q.st == St::Plane {
                continue;
            }
            if let Some((t, zone)) = Self::ray_player(ox, oy, oz, dx, dy, dz, x, y, z, crouch, st, max_t) {
                if t < max_t {
                    max_t = t;
                    hit = Some((qi, zone));
                }
            }
        }
        (max_t, hit, if hit.is_some() { None } else { w })
    }

    // ------------------------------------------------------------------------------------- weapons
    fn spread_deg(p: &Player, wd: &Weapon) -> f64 {
        let r = &RARITY[p.inv.w[p.inv.slot as usize].unwrap().r as usize];
        let mut s = lerp(wd.hip, wd.ads, p.ads_t);
        if p.move_spd > 1.0 {
            s += if p.ads_t > 0.5 { 0.5 } else { wd.hip * 0.45 };
        }
        if !p.on_ground {
            s += 2.5;
        }
        if p.crouch {
            s *= 0.8;
        }
        s * r.ctl + p.bloom * (1.0 - 0.55 * p.ads_t)
    }
    fn fire(&mut self, pi: usize) {
        let wi = self.players[pi].cur_weapon().unwrap();
        let wd = &WEAPONS[wi.id];
        let r = &RARITY[wi.r as usize];
        let t = self.t;
        let (yaw, pitch, ex, ey, ez, sp, pid) = {
            let p = &mut self.players[pi];
            p.cd = 60.0 / wd.rpm;
            if let Some(w) = p.inv.w[p.inv.slot as usize].as_mut() {
                w.mag -= 1;
            }
            p.shot_n += 1;
            p.last_shot_t = t;
            p.fire_t = t;
            (p.yaw + p.rec_y, p.pitch + p.rec_p, p.x, p.eye_y(), p.z, Self::spread_deg(p, wd) * D2R, p.id)
        };
        let rewind = self.rewind.get(&pid).cloned();
        for k in 0..wd.pellets {
            let a = self.rng.next() * std::f64::consts::PI * 2.0;
            let rr = sp * self.rng.next().sqrt();
            let yy = yaw + a.cos() * rr;
            let pp = pitch + a.sin() * rr;
            let cp = pp.cos();
            let (dx, dy, dz) = (-yy.sin() * cp, pp.sin(), -yy.cos() * cp);
            let (ht, hp, hw) = self.trace_shot(pi, ex, ey, ez, dx, dy, dz, 650.0, rewind.as_ref());
            let (hx, hy, hz) = (ex + dx * ht, ey + dy * ht, ez + dz * ht);
            let mut hit_id = 0;
            if let Some((qi, zone)) = hp {
                let fall = if ht <= wd.r0 { 1.0 } else if ht >= wd.r1 { wd.min_mul } else { lerp(1.0, wd.min_mul, (ht - wd.r0) / (wd.r1 - wd.r0)) };
                let zm = match zone {
                    Zone::Head => wd.hs,
                    Zone::Legs => 0.85,
                    Zone::Body => 1.0,
                };
                let dmg = js_round(wd.dmg * r.dmg * fall * zm * 10.0) / 10.0;
                hit_id = self.players[qi].id;
                self.damage(qi, dmg, Some(pi), wi.id as u8, zone, Some([hx, hy, hz]));
            }
            let (s, n) = match hw {
                Some(h) => (h.s as i16, [h.nx, h.ny, h.nz]),
                None => (-1, [0.0, 1.0, 0.0]),
            };
            self.events.push(Event::Shot { pid, wid: wi.id as u8, k, o: [ex, ey, ez], e: [hx, hy, hz], hp: hit_id, s, n });
        }
        self.events.push(Event::Fire { pid, wid: wi.id as u8, x: ex, y: ey, z: ez });
        let loud = if wd.cls == "Sniper" || wd.cls == "Shotgun" { 1.4 } else { 1.0 };
        self.sounds.push(Sound { x: ex, z: ez, t, pid, loud });
        let p = &mut self.players[pi];
        let ctl = r.ctl * if p.ads_t > 0.5 { 0.8 } else { 1.0 } * if p.crouch { 0.85 } else { 1.0 };
        p.rec_p += wd.rec[0] * ctl * (0.85 + self.rng.next() * 0.3) * D2R;
        p.rec_y += wd.rec[1 + (p.shot_n as usize % (wd.rec.len() - 1))] * ctl * D2R;
        p.bloom = wd.bloom_max.min(p.bloom + wd.bloom);
    }
    fn start_act(&mut self, pi: usize, k: ActK, dur: Option<f64>) {
        let d = dur.unwrap_or(match k {
            ActK::Plate => PLATE_TIME,
            ActK::Bandage => BANDAGE_TIME,
            ActK::Medkit => MEDKIT_TIME,
            ActK::Reload => 2.0,
        });
        self.players[pi].act = Some(Act { k, t: 0.0, dur: d });
        let pid = self.players[pi].id;
        self.events.push(Event::Act { pid, k });
    }
    fn update_weapon(&mut self, pi: usize, dt: f64) {
        let t = self.t;
        let inp = self.players[pi].inp.clone();
        let pid = self.players[pi].id;
        {
            let p = &mut self.players[pi];
            p.cd -= dt;
            p.melee_cd -= dt;
            p.throw_cd -= dt;
            p.swap_t -= dt;
            let firing_recently = t - p.last_shot_t < 0.25;
            p.bloom = (p.bloom - dt * if firing_recently { 1.2 } else { 5.0 }).max(0.0);
            let rk = (-dt * if firing_recently { 3.2 } else { 6.5 }).exp();
            p.rec_p *= rk;
            p.rec_y *= rk;
        }
        if inp.slot >= 0 && inp.slot <= 2 && inp.slot as u8 != self.players[pi].inv.slot {
            let p = &mut self.players[pi];
            p.inv.slot = inp.slot as u8;
            if p.act.map_or(false, |a| a.k == ActK::Reload) {
                p.act = None;
            }
            p.swap_t = 0.45;
            p.cd = p.cd.max(0.35);
            p.shot_n = 0;
            self.events.push(Event::Swap { pid, slot: inp.slot as u8 });
        }
        let (has_w, can_use) = {
            let p = &mut self.players[pi];
            let w = p.cur_weapon();
            let can_use = p.st == St::Ground && !p.swim;
            p.ads = inp.ads && can_use && (w.is_some() || p.inv.slot == 2) && p.act.map_or(true, |a| a.k == ActK::Reload) && p.inv.slot != 2;
            p.ads_t = clamp(p.ads_t + if p.ads { dt / 0.2 } else { -dt / 0.15 }, 0.0, 1.0);
            (w.is_some(), can_use)
        };
        // actions in progress
        if let Some(mut a) = self.players[pi].act {
            a.t += dt;
            self.players[pi].act = Some(a);
            if a.t >= a.dur {
                self.players[pi].act = None;
                match a.k {
                    ActK::Reload => {
                        let p = &mut self.players[pi];
                        let slot = p.inv.slot as usize;
                        if slot < 2 {
                            if let Some(w) = p.inv.w[slot].as_mut() {
                                let wd = &WEAPONS[w.id];
                                let need = wd.mag - w.mag;
                                let have = p.inv.ammo[wd.ammo];
                                let n = need.min(have);
                                w.mag += n;
                                p.inv.ammo[wd.ammo] -= n;
                                self.events.push(Event::Reloaded { pid });
                            }
                        }
                    }
                    ActK::Plate => {
                        let p = &mut self.players[pi];
                        if let Some(i) = p.pl.iter().position(|&v| v < PLATE_HP) {
                            if p.inv.plate > 0 {
                                p.pl[i] = PLATE_HP;
                                p.inv.plate -= 1;
                                self.events.push(Event::Plated { pid });
                            }
                        }
                        let p = &self.players[pi];
                        if inp.plate_hold && p.inv.plate > 0 && !p.plate_max() {
                            self.start_act(pi, ActK::Plate, None);
                        }
                    }
                    ActK::Bandage => {
                        let p = &mut self.players[pi];
                        p.inv.bandage -= 1;
                        p.hp = MAX_HP.min(p.hp + BANDAGE_HEAL);
                        self.events.push(Event::Healed { pid });
                    }
                    ActK::Medkit => {
                        let p = &mut self.players[pi];
                        p.inv.medkit -= 1;
                        p.hp = MAX_HP;
                        self.events.push(Event::Healed { pid });
                    }
                }
            }
        }
        if !can_use {
            self.players[pi].trig = inp.fire;
            return;
        }
        // heal / plate requests
        if inp.heal != Heal::None {
            let p = &self.players[pi];
            let (plates, band, med, hp, pmax) = (p.inv.plate, p.inv.bandage, p.inv.medkit, p.hp, p.plate_max());
            match inp.heal {
                Heal::Plate => {
                    if plates > 0 && !pmax {
                        self.start_act(pi, ActK::Plate, None)
                    }
                }
                Heal::Bandage => {
                    if band > 0 && hp < MAX_HP {
                        self.start_act(pi, ActK::Bandage, None)
                    }
                }
                Heal::Medkit => {
                    if med > 0 && hp < MAX_HP {
                        self.start_act(pi, ActK::Medkit, None)
                    }
                }
                Heal::Auto => {
                    if med > 0 && hp < 60.0 && hp < MAX_HP {
                        self.start_act(pi, ActK::Medkit, None)
                    } else if band > 0 && hp < MAX_HP {
                        self.start_act(pi, ActK::Bandage, None)
                    } else if med > 0 && hp < MAX_HP {
                        self.start_act(pi, ActK::Medkit, None)
                    }
                }
                Heal::None => {}
            }
        }
        if has_w {
            let wi = self.players[pi].cur_weapon().unwrap();
            let wd = &WEAPONS[wi.id];
            let p = &self.players[pi];
            let reserve = p.inv.ammo[wd.ammo];
            let want_reload = inp.reload || (inp.fire && wi.mag <= 0 && p.cd <= 0.0);
            if want_reload && wi.mag < wd.mag && reserve > 0 && p.act.map_or(true, |a| a.k != ActK::Reload) {
                self.start_act(pi, ActK::Reload, Some(wd.reload * if wi.r >= 3 { 0.88 } else { 1.0 }));
            } else if inp.fire && !p.trig && wi.mag <= 0 && reserve <= 0 {
                self.events.push(Event::Dry { pid });
            }
            let p = &self.players[pi];
            let wi = p.cur_weapon().unwrap();
            if inp.fire && p.cd <= 0.0 && wi.mag > 0 && p.swap_t <= 0.0 && (wd.auto || !p.trig) {
                let p = &mut self.players[pi];
                p.act = None;
                p.sprint = false;
                self.fire(pi);
            }
        }
        let p = &self.players[pi];
        if (inp.melee || (p.inv.slot == 2 && inp.fire && !p.trig)) && p.melee_cd <= 0.0 {
            self.melee(pi);
        }
        if inp.throw != Throw::None {
            let k = if inp.throw == Throw::Frag { K_FRAG } else { K_SMOKE };
            let p = &self.players[pi];
            if p.throw_cd <= 0.0 && p.inv.get(k) > 0 {
                let id = self.next_id;
                self.next_id += 1;
                let p = &mut self.players[pi];
                *p.inv.get_mut(k) -= 1;
                p.throw_cd = 0.9;
                let cp = (p.pitch + 0.12).cos();
                let (dx, dy, dz) = (-p.yaw.sin() * cp, (p.pitch + 0.12).sin(), -p.yaw.cos() * cp);
                let sp = 19.0;
                let pr = Proj { k: inp.throw, x: p.x + dx * 0.6, y: p.eye_y() - 0.1, z: p.z + dz * 0.6, vx: dx * sp + p.vx * 0.5, vy: dy * sp + 3.5, vz: dz * sp + p.vz * 0.5, fuse: if inp.throw == Throw::Frag { 3.0 } else { 1.4 }, owner: pid, id };
                self.proj.push(pr);
                self.events.push(Event::Throw { pid, k: inp.throw });
            }
        }
        self.players[pi].trig = inp.fire;
    }
    fn melee(&mut self, pi: usize) {
        self.players[pi].melee_cd = 0.75;
        let p = &self.players[pi];
        let (fx, fz) = (-p.yaw.sin(), -p.yaw.cos());
        let mut best = None;
        let mut bd = 2.4;
        for (qi, q) in self.players.iter().enumerate() {
            if qi == pi || q.st == St::Dead || q.st == St::Plane {
                continue;
            }
            let dx = q.x - p.x;
            let dz = q.z - p.z;
            let d = hypot2(dx, dz);
            if d > bd || (q.y - p.y).abs() > 1.5 {
                continue;
            }
            if (dx * fx + dz * fz) / d.max(0.01) < 0.5 {
                continue;
            }
            bd = d;
            best = Some(qi);
        }
        let pid = p.id;
        self.events.push(Event::Melee { pid, hit: best.map(|b| self.players[b].id).unwrap_or(0) });
        if let Some(b) = best {
            let q = &self.players[b];
            let at = [q.x, q.y + 1.2, q.z];
            self.damage(b, 45.0, Some(pi), WID_KNIFE, Zone::Body, Some(at));
        }
    }

    // ------------------------------------------------------------------------------------- projectiles
    fn update_proj(&mut self, dt: f64) {
        let mut i = self.proj.len();
        while i > 0 {
            i -= 1;
            let mut g = self.proj[i].clone();
            g.fuse -= dt;
            g.vy -= 18.0 * dt;
            let (nx, ny, nz) = (g.x + g.vx * dt, g.y + g.vy * dt, g.z + g.vz * dt);
            let (dx, dy, dz) = (nx - g.x, ny - g.y, nz - g.z);
            let d = hypot3(dx, dy, dz);
            let h = if d > 1e-4 { self.w.raycast(g.x, g.y, g.z, dx / d, dy / d, dz / d, d + 0.08) } else { None };
            if let Some(h) = h {
                let vn = g.vx * h.nx + g.vy * h.ny + g.vz * h.nz;
                g.vx = (g.vx - 2.0 * vn * h.nx) * 0.45;
                g.vy = (g.vy - 2.0 * vn * h.ny) * 0.38;
                g.vz = (g.vz - 2.0 * vn * h.nz) * 0.45;
                g.x = h.x + h.nx * 0.06;
                g.y = h.y + h.ny * 0.06;
                g.z = h.z + h.nz * 0.06;
                if vn.abs() > 2.0 {
                    self.events.push(Event::Bounce { x: g.x, y: g.y, z: g.z });
                }
            } else {
                g.x = nx;
                g.y = ny;
                g.z = nz;
            }
            if g.y < SEA - 3.0 {
                g.fuse = g.fuse.min(0.0);
            }
            if g.fuse <= 0.0 {
                self.proj.remove(i);
                if g.k == Throw::Frag {
                    self.explode(&g);
                } else {
                    self.smokes.push(Smoke { x: g.x, y: g.y, z: g.z, r: 1.0, t: 0.0, life: 20.0, id: g.id });
                    self.events.push(Event::Smoke { x: g.x, y: g.y, z: g.z, id: g.id });
                }
            } else {
                self.proj[i] = g;
            }
        }
        let mut i = self.smokes.len();
        while i > 0 {
            i -= 1;
            let s = &mut self.smokes[i];
            s.t += dt;
            s.r = (1.0 + s.t * 3.5).min(8.5);
            if s.t > s.life {
                self.smokes.remove(i);
            }
        }
    }
    fn explode(&mut self, g: &Proj) {
        let owner = self.pidx(g.owner);
        self.events.push(Event::Explode { x: g.x, y: g.y, z: g.z });
        self.sounds.push(Sound { x: g.x, z: g.z, t: self.t, pid: g.owner, loud: 2.0 });
        for qi in 0..self.players.len() {
            let q = &self.players[qi];
            if q.st == St::Dead || q.st == St::Plane {
                continue;
            }
            let d = hypot3(q.x - g.x, q.y + 1.0 - g.y, q.z - g.z);
            if d > 9.0 {
                continue;
            }
            if !self.w.los_clear(g.x, g.y + 0.3, g.z, q.x, q.y + 1.2, q.z) {
                continue;
            }
            let at = [q.x, q.y + 1.2, q.z];
            self.damage(qi, js_round(150.0 * (1.0 - d / 9.0).powf(1.15)), owner, WID_FRAG, Zone::Body, Some(at));
        }
    }
    pub fn smoke_blocks(&self, ax: f64, ay: f64, az: f64, bx: f64, by: f64, bz: f64) -> bool {
        for s in &self.smokes {
            if s.r < 3.0 {
                continue;
            }
            let (dx, dy, dz) = (bx - ax, by - ay, bz - az);
            let l2 = dx * dx + dy * dy + dz * dz;
            let t = clamp(((s.x - ax) * dx + (s.y + 1.5 - ay) * dy + (s.z - az) * dz) / l2, 0.0, 1.0);
            let (px, py, pz) = (ax + dx * t - s.x, ay + dy * t - s.y - 1.5, az + dz * t - s.z);
            if px * px + py * py * 2.0 + pz * pz < s.r * s.r * 0.8 {
                return true;
            }
        }
        false
    }

    // ------------------------------------------------------------------------------------- step
    pub fn step(&mut self, dt: f64) {
        self.t += dt;
        if let Some(p) = self.plane.as_mut() {
            if !p.gone {
                p.s += p.speed * dt;
                p.x = p.ax + p.dx * p.s;
                p.z = p.az + p.dz * p.s;
                if p.s > p.len {
                    p.gone = true;
                }
            }
        }
        for i in 0..self.players.len() {
            if self.players[i].st == St::Dead {
                self.players[i].inp.clear_edges();
                continue;
            }
            {
                let p = &mut self.players[i];
                p.yaw = p.inp.yaw;
                p.pitch = clamp(p.inp.pitch, -1.45, 1.45);
            }
            match self.players[i].st {
                St::Plane => {
                    let plane = self.plane.clone();
                    let p = &mut self.players[i];
                    if let Some(pl) = plane.as_ref() {
                        p.x = pl.x;
                        p.z = pl.z;
                        p.y = pl.y - 3.0;
                        p.vx = pl.dx * pl.speed;
                        p.vz = pl.dz * pl.speed;
                        p.vy = 0.0;
                    }
                    let can = plane.as_ref().map_or(false, |pl| pl.s > 140.0);
                    if let Some(pl) = plane.as_ref() {
                        if (p.inp.jump && can) || pl.s >= pl.eject {
                            p.st = St::Fall;
                            p.fall_t = 0.0;
                            p.opened = false;
                            p.vx = pl.dx * 30.0;
                            p.vz = pl.dz * 30.0;
                            p.vy = -5.0;
                            p.y = pl.y - 6.0;
                            p.inp.jump = false;
                            let pid = p.id;
                            self.events.push(Event::Jump { pid, plane: true });
                        }
                    }
                }
                St::Fall | St::Chute => {
                    let t = self.t;
                    let inp = self.players[i].inp.clone();
                    let r = move_air(&self.w, &mut self.players[i], &inp, dt, t, &mut self.events);
                    if let Some(d) = r {
                        self.damage(i, d, None, WID_FALL, Zone::Legs, None);
                    }
                }
                _ => {
                    let t = self.t;
                    let inp = self.players[i].inp.clone();
                    let r = move_ground(&self.w, &mut self.players[i], &inp, dt, t, &mut self.events);
                    if let Some(d) = r {
                        self.damage(i, d, None, WID_FALL, Zone::Legs, None);
                    }
                    if self.players[i].st == St::Ground {
                        self.update_weapon(i, dt);
                    }
                }
            }
            if self.players[i].st == St::Ground {
                let inp = self.players[i].inp.clone();
                if inp.interact {
                    let p = &self.players[i];
                    let b = match inp.target {
                        Some(Target::Crate(ci)) => self.crates.get(ci).filter(|c| !c.open && hypot2(c.x - p.x, c.z - p.z) < 2.8).map(|_| Target::Crate(ci)),
                        Some(Target::Item(id)) => self.item(id).filter(|it| !it.gone && hypot2(it.x - p.x, it.z - p.z) < 2.8).map(|_| Target::Item(id)),
                        None => self.best_interact(i),
                    };
                    let pid = p.id;
                    match b {
                        Some(Target::Crate(ci)) => self.open_crate(ci, pid),
                        Some(Target::Item(id)) => {
                            self.take_item(i, id);
                        }
                        None => {}
                    }
                }
                self.players[i].auto_t -= dt;
                if self.players[i].auto_t <= 0.0 {
                    self.players[i].auto_t = 0.15;
                    let p = &self.players[i];
                    let (px, py, pz) = (p.x, p.y, p.z);
                    for id in self.items_near(px, pz, 1.5) {
                        let it = self.item(id).unwrap();
                        if it.k != K_WEAPON && !it.gone && (it.y - py).abs() < 1.6 && self.players[i].st == St::Ground {
                            self.take_item(i, id);
                        }
                    }
                }
            }
            self.players[i].inp.clear_edges();
        }
        self.update_proj(dt);
        self.update_gas(dt);
        if !self.sounds.is_empty() && self.t - self.sounds[0].t > 2.0 {
            let t = self.t;
            self.sounds.retain(|s| t - s.t < 2.0);
        }
    }
}

fn ray_sphere(ox: f64, oy: f64, oz: f64, dx: f64, dy: f64, dz: f64, cx: f64, cy: f64, cz: f64, r: f64) -> Option<f64> {
    let (lx, ly, lz) = (ox - cx, oy - cy, oz - cz);
    let b = lx * dx + ly * dy + lz * dz;
    let c = lx * lx + ly * ly + lz * lz - r * r;
    let disc = b * b - c;
    if disc < 0.0 {
        return None;
    }
    let t = -b - disc.sqrt();
    if t > 0.0 { Some(t) } else { None }
}
fn ray_capsule(ox: f64, oy: f64, oz: f64, dx: f64, dy: f64, dz: f64, cx: f64, y0: f64, cz: f64, y1: f64, r: f64) -> Option<f64> {
    let (lx, lz) = (ox - cx, oz - cz);
    let a = dx * dx + dz * dz;
    let mut best: Option<f64> = None;
    if a > 1e-9 {
        let b = lx * dx + lz * dz;
        let c = lx * lx + lz * lz - r * r;
        let disc = b * b - a * c;
        if disc >= 0.0 {
            let t = (-b - disc.sqrt()) / a;
            let y = oy + dy * t;
            if t > 0.0 && y >= y0 && y <= y1 {
                best = Some(t);
            }
        }
    }
    for yy in [y0, y1] {
        if let Some(t) = ray_sphere(ox, oy, oz, dx, dy, dz, cx, yy, cz, r) {
            if best.map_or(true, |b| t < b) {
                best = Some(t);
            }
        }
    }
    best
}

// ---------------------------------------------------------------------------------------------
// movement (shared with the JS client prediction - keep identical to sim.js)
/// returns fall damage to apply, if any
pub fn move_ground(w: &World, p: &mut Player, inp: &Input, dt: f64, t: f64, ev: &mut Vec<Event>) -> Option<f64> {
    let wpn = p.cur_weapon();
    p.crouch = inp.crouch && !p.swim;
    let (fx, fz, rx, rz) = (-p.yaw.sin(), -p.yaw.cos(), p.yaw.cos(), -p.yaw.sin());
    let mut wx = fx * inp.mz + rx * inp.mx;
    let mut wz = fz * inp.mz + rz * inp.mx;
    let wl = hypot2(wx, wz);
    if wl > 1.0 {
        wx /= wl;
        wz /= wl;
    }
    p.sprint = inp.sprint && inp.mz > 0.3 && !p.ads && !p.crouch && !p.swim && t - p.last_shot_t > 0.3 && p.act.map_or(true, |a| a.k == ActK::Reload);
    let mut spd: f64 = if p.swim { 2.8 } else if p.crouch { 2.5 } else if p.sprint { 7.0 } else { 4.6 };
    if p.ads_t > 0.3 {
        spd *= 0.62;
    }
    if p.act.map_or(false, |a| a.k != ActK::Reload) {
        spd = spd.min(2.4);
    }
    if let Some(wi) = wpn {
        spd *= WEAPONS[wi.id].mv;
    }
    if inp.mz < -0.1 && !p.swim {
        spd *= 0.85;
    }
    let acc = if p.on_ground { 14.0 } else { 2.5 };
    p.vx += (wx * spd - p.vx) * (acc * dt).min(1.0);
    p.vz += (wz * spd - p.vz) * (acc * dt).min(1.0);
    if p.swim {
        p.vy = 0.0;
    } else if p.on_ground && inp.jump {
        p.vy = JUMP_V;
        p.on_ground = false;
        ev.push(Event::Jump { pid: p.id, plane: false });
    } else if !p.on_ground {
        p.vy -= GRAV * dt;
    }
    let h = if p.crouch { CROUCH_H } else { STAND_H };
    let mut steps = (hypot2(p.vx, p.vz) * dt / 0.3).ceil() as i64;
    if steps == 0 {
        steps = 1;
    }
    for _ in 0..steps {
        p.x += p.vx * dt / steps as f64;
        p.z += p.vz * dt / steps as f64;
        w.collide_cyl(&mut p.x, &mut p.z, p.y, RAD, h, 0.45);
    }
    p.x = clamp(p.x, -985.0, 985.0);
    p.z = clamp(p.z, -985.0, 985.0);
    p.y += p.vy * dt;
    if p.vy > 0.0 {
        let c = w.ceiling_at(p.x, p.z, p.y + h - p.vy * dt, 0.3);
        if p.y + h > c {
            p.y = c - h;
            p.vy = 0.0;
        }
    }
    let g = w.ground_at(p.x, p.z, p.y, 0.6, 0.18, false);
    let th = w.terrain_h(p.x, p.z);
    let mut fall = None;
    if th < -1.1 && p.y <= SEA - 1.2 + 0.05 && g == th {
        if !p.swim {
            ev.push(Event::Splash { pid: p.id, x: p.x, z: p.z });
        }
        p.swim = true;
        p.y = SEA - 1.25;
        p.vy = 0.0;
        p.on_ground = true;
    } else {
        if p.swim && th >= -1.1 {
            p.swim = false;
        }
        if p.y <= g {
            if !p.on_ground && p.vy < -14.0 {
                fall = Some((-p.vy - 14.0) * 5.0);
            }
            if !p.on_ground && p.vy < -3.0 {
                ev.push(Event::Land { pid: p.id, hard: p.vy < -9.0 });
            }
            p.y = g;
            p.vy = 0.0;
            p.on_ground = true;
        } else if p.on_ground && p.vy <= 0.0 && p.y - g < 0.65 {
            p.y = g;
        } else {
            p.on_ground = false;
        }
        if p.swim {
            p.swim = false;
        }
    }
    p.move_spd = hypot2(p.vx, p.vz);
    fall
}
/// free-fall / parachute; returns hard-landing damage if any
pub fn move_air(w: &World, p: &mut Player, inp: &Input, dt: f64, t: f64, ev: &mut Vec<Event>) -> Option<f64> {
    let (fx, fz, rx, rz) = (-p.yaw.sin(), -p.yaw.cos(), p.yaw.cos(), -p.yaw.sin());
    let (tvx, tvz, tvy, rate);
    if p.st == St::Fall {
        p.fall_t += dt;
        let dive = if inp.sprint { 1.0 } else if inp.mz > 0.0 { 0.45 } else { 0.0 };
        let hs = if inp.mz > 0.0 { 24.0 + dive * 14.0 } else if inp.mz < 0.0 { 7.0 } else { 13.0 };
        tvx = fx * hs + rx * inp.mx * 11.0;
        tvz = fz * hs + rz * inp.mx * 11.0;
        tvy = if inp.mz < 0.0 { -42.0 } else { -(50.0 + dive * 26.0) };
        rate = 1.4;
    } else {
        p.chute_t += dt;
        let hs = if inp.mz > 0.0 { 17.0 } else if inp.mz < 0.0 { 6.0 } else { 11.0 };
        tvx = fx * hs + rx * inp.mx * 6.0;
        tvz = fz * hs + rz * inp.mx * 6.0;
        tvy = if inp.mz > 0.0 { -7.2 } else if inp.mz < 0.0 { -3.8 } else { -5.2 };
        rate = 1.1;
    }
    p.vx += (tvx - p.vx) * (rate * dt).min(1.0);
    p.vz += (tvz - p.vz) * (rate * dt).min(1.0);
    p.vy += (tvy - p.vy) * ((if p.st == St::Chute { 2.2 } else { 0.9 }) * dt).min(1.0);
    let mut steps = (hypot3(p.vx, p.vz, p.vy) * dt / 0.4).ceil() as i64;
    if steps == 0 {
        steps = 1;
    }
    let mut landed = false;
    let mut s = 0;
    while s < steps && !landed {
        p.x += p.vx * dt / steps as f64;
        p.z += p.vz * dt / steps as f64;
        p.y += p.vy * dt / steps as f64;
        w.collide_cyl(&mut p.x, &mut p.z, p.y, RAD, STAND_H, 0.2);
        let g = w.ground_at(p.x, p.z, p.y, 0.3, 0.2, true);
        let th = w.terrain_h(p.x, p.z);
        let surf = g.max(if th < SEA { SEA - 1.25 } else { g });
        if p.y <= surf + 0.02 {
            p.y = surf;
            landed = true;
        }
        s += 1;
    }
    p.x = clamp(p.x, -990.0, 990.0);
    p.z = clamp(p.z, -990.0, 990.0);
    let agl = p.y - w.ground_at(p.x, p.z, p.y, 0.3, 0.0, true).max(SEA);
    if landed {
        let hard = p.st == St::Fall && p.vy < -14.0;
        let dmg = if hard { Some(clamp((-p.vy - 14.0) * 4.0, 0.0, 200.0)) } else { None };
        p.st = St::Ground;
        p.on_ground = true;
        p.vy = 0.0;
        p.vx *= 0.3;
        p.vz *= 0.3;
        p.land_t = t;
        ev.push(Event::Landed { pid: p.id, x: p.x, y: p.y, z: p.z });
        return dmg;
    }
    if p.st == St::Fall {
        if (!p.opened && agl < 110.0) || (inp.jump && p.fall_t > 0.8 && agl > 8.0) {
            p.st = St::Chute;
            p.chute_t = 0.0;
            p.opened = true;
            ev.push(Event::Chute { pid: p.id, open: true });
        }
    } else if p.st == St::Chute {
        if inp.jump && p.chute_t > 0.8 {
            p.st = St::Fall;
            p.fall_t = 0.0;
            ev.push(Event::Chute { pid: p.id, open: false });
        } else if agl < 1.6 {
            p.st = St::Ground;
            p.on_ground = true;
            p.vy = 0.0;
            p.land_t = t;
            ev.push(Event::Chute { pid: p.id, open: false });
            ev.push(Event::Landed { pid: p.id, x: p.x, y: p.y, z: p.z });
        }
    }
    None
}

/// surface name helper for logs
pub fn surf_name(s: u8) -> &'static str {
    ["water", "sand", "grass", "rock", "farm", "road", "concrete", "dirt", "wood", "metal"].get(s as usize).copied().unwrap_or("?")
}
#[allow(dead_code)]
fn _unused() -> u8 {
    surf::GRASS
}
