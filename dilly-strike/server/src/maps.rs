/* ==========================================================================
   Map table shared by the casual server (main.rs) and ranked (game.rs).
   Every value mirrors the client map modules in dilly-strike/src/maps/ (dustline.js, brinepeak.js):
   - bounds = the map's `bounds` (outer perimeter, so anything a client can
     legally reach is inside),
   - spawns are rows of points inside the client spawn zones (dustline: the
     original CT/T spawn lines; brinepeak: the 'D' / 'T' cells of its grid).
   Unit tests below parse the client JS files and check both.
   Unknown / missing map ids always fall back to dustline (old clients).
   ========================================================================== */

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct SpawnRow {
    /// position of slot 0
    pub x: f64,
    pub z: f64,
    /// offset per slot (5 slots per side)
    pub dx: f64,
    pub dz: f64,
    /// yaw the client should face on spawn (same convention as playerSpawn() in the JS map)
    pub yaw: f64,
}

#[derive(Debug, PartialEq)]
pub struct MapDef {
    /// registry id used on the wire ("dustline")
    pub id: &'static str,
    /// display code ("de_dustline")
    pub code: &'static str,
    pub name: &'static str,
    pub min_x: f64,
    pub max_x: f64,
    pub min_z: f64,
    pub max_z: f64,
    pub min_y: f64,
    pub max_y: f64,
    pub sites: u8,
    /// defender spawn row (client team "alpha" / ranked side "def")
    pub def_spawn: SpawnRow,
    /// attacker spawn row (client team "omega" / ranked side "atk")
    pub atk_spawn: SpawnRow,
}

pub const SPAWN_SLOTS: usize = 5;

pub const DUSTLINE: MapDef = MapDef {
    id: "dustline",
    code: "de_dustline",
    name: "Dustline",
    min_x: -38.0,
    max_x: 38.0,
    min_z: -28.0,
    max_z: 28.0,
    min_y: -2.0,
    max_y: 15.0,
    sites: 2,
    def_spawn: SpawnRow { x: -23.0, z: -8.0, dx: 0.0, dz: 4.0, yaw: -1.18 },
    atk_spawn: SpawnRow { x: 23.0, z: -8.0, dx: 0.0, dz: 4.0, yaw: 1.95 },
};

/// Brinepeak grid: 52 x 40 cells of 2 m, centred on the origin (X0 = -52, Z0 = -40).
/// Defender row = grid row 4 (z = -31, all 'D' for x in -15..15),
/// attacker row = grid row 35 (z = 31, all 'T' for x in -23..23).
pub const BRINEPEAK: MapDef = MapDef {
    id: "brinepeak",
    code: "de_brinepeak",
    name: "Brinepeak",
    min_x: -52.0,
    max_x: 52.0,
    min_z: -40.0,
    max_z: 40.0,
    min_y: -2.0,
    max_y: 15.0,
    sites: 3,
    def_spawn: SpawnRow { x: -8.0, z: -31.0, dx: 4.0, dz: 0.0, yaw: std::f64::consts::PI },
    atk_spawn: SpawnRow { x: -8.0, z: 31.0, dx: 4.0, dz: 0.0, yaw: 0.0 },
};

pub static MAPS: [&MapDef; 2] = [&DUSTLINE, &BRINEPEAK];
pub static DEFAULT_MAP: &MapDef = &DUSTLINE;

/// Look a map up by id ("brinepeak") or code ("de_brinepeak"), case-insensitively.
pub fn by_id(id: &str) -> Option<&'static MapDef> {
    let id = id.trim();
    MAPS.iter().copied().find(|m| m.id.eq_ignore_ascii_case(id) || m.code.eq_ignore_ascii_case(id))
}

/// Client-supplied map → known map, defaulting to dustline for missing/unknown values.
pub fn resolve(id: Option<&str>) -> &'static MapDef {
    id.and_then(by_id).unwrap_or(DEFAULT_MAP)
}

/// Parse a comma separated pool ("dustline,brinepeak"); unknown ids are dropped,
/// duplicates removed, an empty result becomes every map.
pub fn parse_pool(s: &str) -> Vec<&'static MapDef> {
    let mut out: Vec<&'static MapDef> = Vec::new();
    for part in s.split(',') {
        if let Some(m) = by_id(part) {
            if !out.iter().any(|o| o.id == m.id) {
                out.push(m);
            }
        }
    }
    if out.is_empty() {
        MAPS.to_vec()
    } else {
        out
    }
}

/// Deterministic pick from a pool, seeded by e.g. a match id (FNV-1a).
pub fn pick(pool: &[&'static MapDef], seed: &str) -> &'static MapDef {
    if pool.is_empty() {
        return DEFAULT_MAP;
    }
    let mut h: u64 = 0xcbf29ce484222325;
    for b in seed.bytes() {
        h ^= b as u64;
        h = h.wrapping_mul(0x100000001b3);
    }
    pool[(h % pool.len() as u64) as usize]
}

impl MapDef {
    /// Spawn point + yaw for slot `idx` of a side (slots wrap after SPAWN_SLOTS).
    pub fn spawn(&self, defender: bool, idx: usize) -> ([f64; 3], f64) {
        let r = if defender { self.def_spawn } else { self.atk_spawn };
        let i = (idx % SPAWN_SLOTS) as f64;
        ([r.x + r.dx * i, 0.0, r.z + r.dz * i], r.yaw)
    }
    pub fn in_bounds(&self, x: f64, y: f64, z: f64) -> bool {
        (self.min_x..=self.max_x).contains(&x) && (self.min_z..=self.max_z).contains(&z) && (self.min_y..=self.max_y).contains(&y)
    }
    pub fn json_list() -> String {
        MAPS.iter().map(|m| format!("\"{}\"", m.id)).collect::<Vec<_>>().join(",")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const BRINE_JS: &str = include_str!("../../src/maps/brinepeak.js");
    const DUST_JS: &str = include_str!("../../src/maps/dustline.js");

    fn grid() -> Vec<Vec<char>> {
        let start = BRINE_JS.find("const GRID = `").expect("GRID") + "const GRID = `".len();
        let end = start + BRINE_JS[start..].find('`').unwrap();
        BRINE_JS[start..end].lines().map(|l| l.chars().collect()).collect()
    }

    fn num_after(src: &str, key: &str) -> f64 {
        let i = src.find(key).unwrap_or_else(|| panic!("{} not found", key)) + key.len();
        let s: String = src[i..].trim_start().chars().take_while(|c| c.is_ascii_digit() || *c == '-' || *c == '.').collect();
        s.parse().unwrap()
    }

    #[test]
    fn lookup_and_fallback() {
        assert_eq!(by_id("brinepeak").unwrap().code, "de_brinepeak");
        assert_eq!(by_id("DE_BRINEPEAK").unwrap().id, "brinepeak");
        assert_eq!(by_id(" dustline ").unwrap().id, "dustline");
        assert!(by_id("de_nowhere").is_none());
        assert_eq!(resolve(None).id, "dustline");
        assert_eq!(resolve(Some("")).id, "dustline");
        assert_eq!(resolve(Some("<script>")).id, "dustline");
        assert_eq!(resolve(Some("brinepeak")).id, "brinepeak");
        assert_eq!(MapDef::json_list(), "\"dustline\",\"brinepeak\"");
    }

    #[test]
    fn pool_parsing_and_pick() {
        assert_eq!(parse_pool("brinepeak").iter().map(|m| m.id).collect::<Vec<_>>(), ["brinepeak"]);
        assert_eq!(parse_pool("dustline, de_brinepeak ,dustline").len(), 2);
        assert_eq!(parse_pool("bogus").len(), MAPS.len());
        assert_eq!(parse_pool("").len(), MAPS.len());
        let pool = parse_pool("");
        // deterministic for a seed, and both maps come up over many seeds
        assert_eq!(pick(&pool, "rk-1").id, pick(&pool, "rk-1").id);
        let n_brine = (0..200).filter(|i| pick(&pool, &format!("rk-{:x}-{}", 1_700_000_000_000u64 + i * 977, i)).id == "brinepeak").count();
        assert!(n_brine > 40 && n_brine < 160, "brinepeak picked {} / 200", n_brine);
        assert_eq!(pick(&[], "x").id, "dustline");
    }

    #[test]
    fn dustline_matches_client_module() {
        assert!(DUST_JS.contains("code: 'de_dustline'"));
        assert_eq!(num_after(DUST_JS, "minX:"), DUSTLINE.min_x);
        assert_eq!(num_after(DUST_JS, "maxX:"), DUSTLINE.max_x);
        assert_eq!(num_after(DUST_JS, "minZ:"), DUSTLINE.min_z);
        assert_eq!(num_after(DUST_JS, "maxZ:"), DUSTLINE.max_z);
        // spawns stay inside the playable area (inside the perimeter walls, which are 2 m thick)
        for def in [true, false] {
            for i in 0..SPAWN_SLOTS {
                let (p, _) = DUSTLINE.spawn(def, i);
                assert!(p[0].abs() < 37.0 - 0.5 && p[2].abs() < 27.0 - 0.5, "{:?}", p);
                // the spawn barriers sit at x = +-28 (2 wide), z -6..6
                assert!((p[0].abs() - 28.0).abs() > 1.5);
            }
        }
    }

    #[test]
    fn brinepeak_bounds_match_client_grid() {
        let g = grid();
        let (gw, gh) = (g[0].len(), g.len());
        assert!(g.iter().all(|r| r.len() == gw), "ragged grid");
        assert_eq!((gw, gh), (52, 40));
        // client: CELL = 2, X0 = -GW, Z0 = -GH, bounds { minX: X0, maxX: -X0, minZ: Z0, maxZ: -Z0 }
        assert!(BRINE_JS.contains("CELL = 2, X0 = -GW, Z0 = -GH"));
        assert!(BRINE_JS.contains("bounds: { minX: X0, maxX: -X0, minZ: Z0, maxZ: -Z0 }"));
        assert!(BRINE_JS.contains("code: 'de_brinepeak'"));
        assert_eq!(BRINEPEAK.min_x, -(gw as f64));
        assert_eq!(BRINEPEAK.max_x, gw as f64);
        assert_eq!(BRINEPEAK.min_z, -(gh as f64));
        assert_eq!(BRINEPEAK.max_z, gh as f64);
        // the client marks three sites with '1' '2' '3'
        let sites = ['1', '2', '3'].iter().filter(|c| g.iter().any(|r| r.contains(c))).count();
        assert_eq!(sites as u8, BRINEPEAK.sites);
    }

    #[test]
    fn brinepeak_spawns_inside_client_spawn_zones() {
        let g = grid();
        let (x0, z0) = (-(g[0].len() as f64), -(g.len() as f64));
        let cell = |x: f64, z: f64| {
            let c = ((x - x0) / 2.0).floor() as usize;
            let r = ((z - z0) / 2.0).floor() as usize;
            g[r][c]
        };
        for (def, want) in [(true, 'D'), (false, 'T')] {
            for i in 0..SPAWN_SLOTS {
                let (p, yaw) = BRINEPEAK.spawn(def, i);
                assert!(BRINEPEAK.in_bounds(p[0], p[1], p[2]));
                // the whole player footprint (0.6 m around the point) is on spawn cells, clear of crates/walls
                for (ox, oz) in [(0.6, 0.6), (-0.6, 0.6), (0.6, -0.6), (-0.6, -0.6), (0.0, 0.0)] {
                    assert_eq!(cell(p[0] + ox, p[2] + oz), want, "slot {} {:?}", i, p);
                }
                // defenders (north) face +z (yaw PI), attackers (south) face -z (yaw 0), as playerSpawn() does
                assert_eq!(yaw, if def { std::f64::consts::PI } else { 0.0 });
            }
        }
        assert!(BRINE_JS.contains("yaw: team === 'alpha' ? Math.PI : 0"));
        assert!(BRINE_JS.contains("pickCell(team === 'alpha' ? D_CELLS : T_CELLS)"));
    }

    #[test]
    fn bounds_checks() {
        assert!(BRINEPEAK.in_bounds(45.0, 0.0, 35.0));
        assert!(!DUSTLINE.in_bounds(45.0, 0.0, 0.0));
        assert!(!BRINEPEAK.in_bounds(53.0, 0.0, 0.0));
        assert!(!BRINEPEAK.in_bounds(0.0, 20.0, 0.0));
        assert!(!BRINEPEAK.in_bounds(0.0, 0.0, -41.0));
    }
}
