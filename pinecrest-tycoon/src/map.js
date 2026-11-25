(function () {
  const PT = (window.PT = window.PT || {});

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hash2D(x, y, seed) {
    let n = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041)) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  }

  function smoothNoise(x, y, scale, seed) {
    const sx = x / scale;
    const sy = y / scale;
    const x0 = Math.floor(sx), y0 = Math.floor(sy);
    const fx = sx - x0, fy = sy - y0;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    const v00 = hash2D(x0, y0, seed);
    const v10 = hash2D(x0 + 1, y0, seed);
    const v01 = hash2D(x0, y0 + 1, seed);
    const v11 = hash2D(x0 + 1, y0 + 1, seed);
    const top = v00 + (v10 - v00) * ux;
    const bot = v01 + (v11 - v01) * ux;
    return top + (bot - top) * uy;
  }

  const CARDINAL_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const WALK_DIRS = [[0, 1], [1, 0], [-1, 0], [0, -1]];

  class FarmMap {
    constructor(size = PT.MAP_SIZE) {
      this.size = size;
      this.tiles = [];
      this.seed = 0;
      this.revision = 0;
      this.roadY = size - 1;
      // Starting farm gate is set back 6 tiles from the country road via a gravel entry lane!
      this.roadSetback = 6;
      this.entrance = { x: Math.floor(size / 2) - 1, y: this.roadY - this.roadSetback - 1 };

      // Pre-allocated zero-GC scratch buffers for A* pathfinding & BFS floods
      const total = size * size;
      this._pfDist = new Float32Array(total);
      this._pfPrev = new Int32Array(total);
      this._pfStamp = new Uint32Array(total);
      this._pfStampVal = 0;
      this._pfHeapKey = new Int32Array(total * 4);
      this._pfHeapF = new Float32Array(total * 4);
      this._pfHeapLen = 0;
      this._bfsQueue = new Int32Array(total);
      this._waterPoolCache = new Map();

      this.initFresh();
    }

    bumpRevision() {
      this.revision++;
      if (this._waterPoolCache) this._waterPoolCache.clear();
    }

    _pfBeginSearch() {
      this._pfStampVal += 2;
      if (this._pfStampVal >= 0x7ffffff0) {
        this._pfStamp.fill(0);
        this._pfStampVal = 2;
      }
      this._pfHeapLen = 0;
      return this._pfStampVal;
    }

    _pfHeapPush(key, f) {
      const hKey = this._pfHeapKey;
      const hF = this._pfHeapF;
      let i = this._pfHeapLen;
      if (i >= hKey.length) return; // Guard against extreme pathological overflow
      this._pfHeapLen = i + 1;
      while (i > 0) {
        const parent = (i - 1) >> 1;
        if (hF[parent] <= f) break;
        hKey[i] = hKey[parent];
        hF[i] = hF[parent];
        i = parent;
      }
      hKey[i] = key;
      hF[i] = f;
    }

    _pfHeapPop() {
      const hKey = this._pfHeapKey;
      const hF = this._pfHeapF;
      const top = hKey[0];
      const len = --this._pfHeapLen;
      if (len > 0) {
        const lastKey = hKey[len];
        const lastF = hF[len];
        let i = 0;
        const half = len >> 1;
        while (i < half) {
          let child = (i << 1) + 1;
          const right = child + 1;
          if (right < len && hF[right] < hF[child]) child = right;
          if (lastF <= hF[child]) break;
          hKey[i] = hKey[child];
          hF[i] = hF[child];
          i = child;
        }
        hKey[i] = lastKey;
        hF[i] = lastF;
      }
      return top;
    }

    initFresh(customSeed = null) {
      const N = this.size;
      const ex = this.entrance.x;
      const ey = this.entrance.y;

      // Fresh random seed for every new map & playthrough!
      this.seed = customSeed !== null ? (customSeed >>> 0) : (Math.floor(Math.random() * 0x7fffffff) ^ Date.now()) >>> 0;
      this.bumpRevision();
      const rng = mulberry32(this.seed);
      const sA = Math.floor(rng() * 1e6);
      const sB = Math.floor(rng() * 1e6);
      const tiltX = (rng() - 0.5) * 0.45;
      const ridgeBias = 0.75 + rng() * 0.45;
      const hillCount = 4 + Math.floor(rng() * 4);
      const hills = [];
      for (let i = 0; i < hillCount; i++) {
        hills.push({
          x: Math.floor(rng() * N),
          y: Math.floor(rng() * (ey - 10)),
          r: 8 + rng() * 12,
          amp: 0.7 + rng() * 1.15
        });
      }

      // 1. Procedurally randomized multi-tiered alpine valley elevation (0..3)
      const elevGrid = Array.from({ length: N }, () => new Int8Array(N));
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          const dxCenter = Math.abs(x - ex);
          const northFrac = Math.max(0, (ey - y) / Math.max(1, ey));
          const n1 = smoothNoise(x, y, 14, sA);
          const n2 = smoothNoise(x, y, 6.5, sB);
          let h = northFrac * 2.05 * ridgeBias + (dxCenter / (N * 0.5)) * 0.95 + (x / N - 0.5) * tiltX + (n1 - 0.5) * 1.35 + (n2 - 0.5) * 0.55;

          for (const hill of hills) {
            const d = Math.hypot(x - hill.x, y - hill.y);
            if (d < hill.r) {
              const falloff = 1 - d / hill.r;
              h += falloff * falloff * hill.amp;
            }
          }

          let elev = Math.max(0, Math.min(3, Math.floor(h)));

          // Keep road, approach driveway, and lower basin accessible
          if (y >= this.roadY - this.roadSetback - 1) elev = 0;

          // Keep 18x16 starter area clean: lower valley (elev 0) + scenic upper terrace (elev 1)
          if (x >= ex - 8 && x <= ex + 9 && y >= ey - 15 && y <= ey - 11) {
            elev = 1;
          }
          if (x >= ex - 8 && x <= ex + 9 && y >= ey - 10 && y <= ey) {
            elev = 0;
          }

          elevGrid[y][x] = elev;
        }
      }

      // 2. Carve random water features (a winding valley creek + scenic ponds!) before slope smoothing
      const waterGrid = Array.from({ length: N }, () => new Uint8Array(N));
      const isProtectedForWater = (x, y) => {
        if (y >= this.roadY - 1) return true; // road & immediate shoulder
        if (Math.abs(x - ex) <= 1 && y >= ey - 1) return true; // driveway & entrance gate
        // Keep core starter paths, buildings, and primary groves dry
        if (x >= ex - 7 && x <= ex + 7 && y >= ey - 14 && y <= ey) return true;
        return false;
      };

      // 2a. Meandering Valley Creek flowing across the farm valley (randomized path & direction)
      const creekNorthOfStarter = rng() < 0.65;
      if (creekNorthOfStarter) {
        // Flows West <-> East across the mid-valley north of the starter terrace
        let cy = Math.max(10, Math.min(ey - 18, ey - 20 - Math.floor(rng() * 14)));
        const waveAmp = 3 + rng() * 4;
        const waveFreq = 0.08 + rng() * 0.07;
        const wavePhase = rng() * Math.PI * 2;
        const creekElev = elevGrid[Math.round(cy)][ex] <= 1 ? 1 : 0;
        for (let x = 0; x < N; x++) {
          const yCenter = Math.round(cy + Math.sin(x * waveFreq + wavePhase) * waveAmp + (smoothNoise(x, 0, 10, sB) - 0.5) * 4);
          const halfWidth = (x % 9 < 4) ? 1 : 0;
          for (let dy = -halfWidth; dy <= 1; dy++) {
            const wy = yCenter + dy;
            if (wy >= 3 && wy < this.roadY - 2 && !isProtectedForWater(x, wy)) {
              waterGrid[wy][x] = 1;
              elevGrid[wy][x] = creekElev;
            }
          }
        }
      } else {
        // Flows North -> South curving down the West or East side of the starter farm!
        const side = rng() < 0.5 ? -1 : 1;
        const baseX = ex + side * (12 + Math.floor(rng() * 5));
        const waveAmp = 2.5 + rng() * 3.5;
        const waveFreq = 0.09 + rng() * 0.06;
        const wavePhase = rng() * Math.PI * 2;
        for (let y = 4; y < this.roadY - 2; y++) {
          const xCenter = Math.round(baseX + Math.sin(y * waveFreq + wavePhase) * waveAmp);
          for (let dx = 0; dx <= 1; dx++) {
            const wx = xCenter + dx;
            if (wx >= 2 && wx < N - 2 && !isProtectedForWater(wx, y)) {
              waterGrid[y][wx] = 1;
              elevGrid[y][wx] = 0;
            }
          }
        }
      }

      // 2b. One charming starter-edge farm pond on either the far-west or far-east wing of the starter farm!
      const starterPondSide = rng() < 0.5 ? -1 : 1;
      const spx = starterPondSide < 0 ? (ex - 8) : (ex + 8);
      const spy = ey - 8 - Math.floor(rng() * 2);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const px = spx + dx;
          const py = spy + dy;
          if (px >= 1 && px < N - 1 && py >= 1 && py < this.roadY - 1 && !isProtectedForWater(px, py)) {
            if (Math.abs(dx) + Math.abs(dy) <= 2) {
              waterGrid[py][px] = 1;
              elevGrid[py][px] = 0;
            }
          }
        }
      }

      // 2c. 3-5 Random Scenic Valley Ponds / Lakes scattered around the expandable map
      const pondCount = 3 + Math.floor(rng() * 3);
      for (let p = 0; p < pondCount; p++) {
        const px0 = 5 + Math.floor(rng() * (N - 10));
        const py0 = 5 + Math.floor(rng() * (this.roadY - 10));
        if (isProtectedForWater(px0, py0)) continue;
        const rx = 2 + rng() * 2.8;
        const ry = 1.8 + rng() * 2.5;
        const pondElev = Math.min(2, elevGrid[py0][px0]);
        for (let y = Math.floor(py0 - ry - 1); y <= Math.ceil(py0 + ry + 1); y++) {
          for (let x = Math.floor(px0 - rx - 1); x <= Math.ceil(px0 + rx + 1); x++) {
            if (x < 2 || y < 2 || x >= N - 2 || y >= this.roadY - 2) continue;
            if (isProtectedForWater(x, y)) continue;
            const d = ((x - px0) * (x - px0)) / (rx * rx) + ((y - py0) * (y - py0)) / (ry * ry);
            if (d <= 0.92 + (hash2D(x, y, sA + p) - 0.5) * 0.35) {
              waterGrid[y][x] = 1;
              elevGrid[y][x] = pondElev;
            }
          }
        }
      }

      // 3. Enforce max 1-level step between any orthogonal neighbors & keep connected water flat!
      for (let pass = 0; pass < 10; pass++) {
        let changed = false;
        for (let y = 0; y < N; y++) {
          for (let x = 0; x < N; x++) {
            const e = elevGrid[y][x];
            const isW = waterGrid[y][x] === 1;
            const nbs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
            for (const [dx, dy] of nbs) {
              const nx = x + dx, ny = y + dy;
              if (nx >= 0 && ny >= 0 && nx < N && ny < N) {
                if (isW && waterGrid[ny][nx] === 1 && elevGrid[ny][nx] > e) {
                  elevGrid[ny][nx] = e;
                  changed = true;
                } else if (elevGrid[ny][nx] > e + 1) {
                  elevGrid[ny][nx] = e + 1;
                  changed = true;
                }
              }
            }
          }
        }
        if (!changed) break;
      }

      // 4. Build tile grid (Starter owned plot: 18x16 = 288 tiles, 2x larger & set back from the road!)
      this.tiles = [];
      for (let y = 0; y < N; y++) {
        const row = [];
        for (let x = 0; x < N; x++) {
          const isMainRoad = (y === this.roadY);
          const isDriveway = (x === ex && y > ey && y < this.roadY);
          const isRoad = isMainRoad || isDriveway;
          const owned = !isRoad && x >= ex - 8 && x <= ex + 9 && y >= ey - 15 && y <= ey;
          const water = !isRoad && waterGrid[y][x] === 1;

          row.push({
            x,
            y,
            elev: elevGrid[y][x],
            owned,
            isRoad,
            water,
            variant: (x * 7 + y * 13 + (this.seed & 7)) % 3,
            path: isDriveway ? 'path_gravel' : null, // 'path_gravel' | 'path_boardwalk' | 'path_bridge' | null
            decor: null,      // scenery id | 'gate' | null
            tree: null,       // { type, growth, trimmed, reservedBy }
            plot: null,       // plant species id (see PT.TREES) | null
            plotManaged: false, // true when marked as a Forester Management Plot (auto-harvestable)
            stump: false,     // true after tree is cut until cleared/replanted
            building: null    // { id, type, price, open, revenue, served }
          });
        }
        this.tiles.push(row);
      }

      // Starter entrance gate & country approach
      this.get(this.entrance.x, this.entrance.y).path = 'path_gravel';
      this.get(this.entrance.x, this.entrance.y).decor = 'gate';
    }

    inBounds(x, y) {
      return x >= 0 && y >= 0 && x < this.size && y < this.size;
    }

    get(x, y) {
      const ix = Math.floor(x);
      const iy = Math.floor(y);
      if (!this.inBounds(ix, iy)) return null;
      return this.tiles[iy][ix];
    }

    /**
     * Returns logical stair direction { dx, dy, dirIdx } if this path tile transitions up
     * to an orthogonally adjacent higher path tile (elev + 1), otherwise null.
     * dirIdx: 0 = N (0,-1), 1 = E (1,0), 2 = S (0,1), 3 = W (-1,0)
     */
    getStairInfo(t) {
      if (!t || !t.path || t.path === 'path_bridge') return null;
      const dirs = [
        { dx: 0, dy: -1, dirIdx: 0 }, // N
        { dx: 1, dy: 0,  dirIdx: 1 }, // E
        { dx: 0, dy: 1,  dirIdx: 2 }, // S
        { dx: -1, dy: 0, dirIdx: 3 }  // W
      ];
      let fallback = null;
      for (const d of dirs) {
        const hi = this.get(t.x + d.dx, t.y + d.dy);
        if (hi && hi.path && hi.elev === t.elev + 1) {
          // Prefer a direction whose opposite side also has a flat/lower path (straight staircase run!)
          const opp = this.get(t.x - d.dx, t.y - d.dy);
          if (opp && (opp.path || opp.isRoad) && opp.elev <= t.elev) {
            return d;
          }
          if (!fallback) fallback = d;
        }
      }
      return fallback;
    }

    // Rotate logical (x, y) into camera-space (rx, ry)
    toView(x, y, rot) {
      const N = this.size;
      switch (rot & 3) {
        case 0: return { rx: x, ry: y };
        case 1: return { rx: y, ry: N - 1 - x };
        case 2: return { rx: N - 1 - x, ry: N - 1 - y };
        case 3: return { rx: N - 1 - y, ry: x };
      }
    }

    // World pixel coordinates of tile center diamond
    tileToWorld(x, y, rot, elev = null) {
      const t = this.get(x, y);
      const e = elev !== null ? elev : (t ? t.elev : 0);
      const { rx, ry } = this.toView(x, y, rot);
      return {
        wx: (rx - ry) * (PT.TILE_W / 2),
        wy: (rx + ry) * (PT.TILE_H / 2) - e * PT.ELEV_PX
      };
    }

    // Fractional entity position (fx, fy) to world coords with smooth stair/ledge height interpolation
    posToWorld(fx, fy, rot) {
      const N = this.size;
      const ix = Math.max(0, Math.min(N - 1, Math.round(fx)));
      const iy = Math.max(0, Math.min(N - 1, Math.round(fy)));
      const t = this.tiles[iy][ix];
      let e = t ? t.elev : 0;

      // Smooth vertical ascent when walking across a staircase tile!
      if (t) {
        const stair = this.getStairInfo(t);
        if (stair) {
          // Local coordinate in [-0.5, 0.5] along stair climb axis -> progress in [0, 1]
          const localAxis = (fx - ix) * stair.dx + (fy - iy) * stair.dy;
          const prog = Math.max(0, Math.min(1, localAxis + 0.5));
          e = t.elev + prog;
        } else {
          // Smooth gentle step when crossing between non-stair ledges
          const dx = fx - ix;
          const dy = fy - iy;
          if (Math.abs(dx) > 0.15) {
            const nb = this.get(ix + Math.sign(dx), iy);
            if (nb && nb.elev !== t.elev) {
              const blend = Math.max(0, (Math.abs(dx) - 0.15) / 0.7);
              e += (nb.elev - t.elev) * blend * 0.5;
            }
          }
          if (Math.abs(dy) > 0.15) {
            const nb = this.get(ix, iy + Math.sign(dy));
            if (nb && nb.elev !== t.elev) {
              const blend = Math.max(0, (Math.abs(dy) - 0.15) / 0.7);
              e += (nb.elev - t.elev) * blend * 0.5;
            }
          }
        }
      }

      let rx, ry;
      switch (rot & 3) {
        case 0: rx = fx; ry = fy; break;
        case 1: rx = fy; ry = N - 1 - fx; break;
        case 2: rx = N - 1 - fx; ry = N - 1 - fy; break;
        case 3: rx = N - 1 - fy; ry = fx; break;
      }
      return {
        wx: (rx - ry) * (PT.TILE_W / 2),
        wy: (rx + ry) * (PT.TILE_H / 2) - e * PT.ELEV_PX
      };
    }

    // Fast elevated diamond hit-testing from front to back (bounded sum window for large maps)
    worldToTile(wx, wy, rot) {
      const hw = PT.TILE_W / 2;
      const hh = PT.TILE_H / 2;
      const N = this.size;

      // Tight vertical bound: wy = sum * hh - elev * ELEV_PX with elev in [0..4]
      const minSum = Math.max(0, Math.floor((wy - hh) / hh));
      const maxSum = Math.min((N - 1) * 2, Math.ceil((wy + hh + 5 * PT.ELEV_PX) / hh));

      for (let sum = maxSum; sum >= minSum; sum--) {
        const rxMin = Math.max(0, sum - (N - 1));
        const rxMax = Math.min(N - 1, sum);
        // Tight horizontal bound: wx = (2*rx - sum) * hw => rx ≈ (wx / hw + sum) / 2
        const estRx = (wx / hw + sum) * 0.5;
        const rStart = Math.max(rxMin, Math.floor(estRx) - 1);
        const rEnd = Math.min(rxMax, Math.ceil(estRx) + 1);

        for (let rx = rStart; rx <= rEnd; rx++) {
          const ry = sum - rx;
          let x, y;
          switch (rot & 3) {
            case 0: x = rx; y = ry; break;
            case 1: x = N - 1 - ry; y = rx; break;
            case 2: x = N - 1 - rx; y = N - 1 - ry; break;
            case 3: x = ry; y = N - 1 - rx; break;
          }
          const t = this.tiles[y][x];
          const cx = (rx - ry) * hw;
          const cy = (rx + ry) * hh - t.elev * PT.ELEV_PX;
          const dx = Math.abs(wx - cx) / hw;
          const dy = Math.abs(wy - cy) / hh;
          if (dx + dy <= 1.0) {
            return t;
          }
        }
      }
      return null;
    }

    getOwnedCount() {
      let count = 0;
      for (let y = 0; y < this.size; y++) {
        for (let x = 0; x < this.size; x++) {
          if (this.tiles[y][x].owned) count++;
        }
      }
      return count;
    }

    canBuyTile(x, y) {
      const t = this.get(x, y);
      if (!t || t.owned || t.isRoad) return false;
      for (let i = 0; i < 4; i++) {
        const d = CARDINAL_DIRS[i];
        const n = this.get(x + d[0], y + d[1]);
        if (n && n.owned) return true;
      }
      return false;
    }

    getTileLandPrice(x, y) {
      const t = this.get(x, y);
      if (!t) return 999;
      const dist = Math.hypot(x - this.entrance.x, y - (this.entrance.y - 6));
      const base = 40 + Math.round(dist * 1.9) + t.elev * 12;
      return Math.round(base / 5) * 5;
    }

    isWalkable(x, y, allowUnowned = false) {
      const t = this.get(x, y);
      if (!t) return false;
      if (t.isRoad) return true;
      if (!allowUnowned && !t.owned) return false;
      if (t.water && t.path !== 'path_bridge') return false;
      if (t.building && t.building.type !== 'firepit') return false;
      if (t.decor && t.decor !== 'gate' && t.decor !== 'lantern' && t.decor !== 'bench' && t.decor !== 'flowerbox') return false;
      return true;
    }

    // Tractor & wagon can drive on owned paths, wooden bridges, and open squares—never through open water, trees, structures, decor, or stumps
    isTractorDrivable(x, y) {
      const t = this.get(x, y);
      if (!t) return false;
      if (!t.owned || t.isRoad) return false;
      if (t.water && t.path !== 'path_bridge') return false;
      if (t.tree || t.building || t.decor || t.stump) return false;
      return true;
    }

    findTractorPath(sx, sy, gx, gy) {
      sx = Math.round(sx); sy = Math.round(sy);
      gx = Math.round(gx); gy = Math.round(gy);
      if (!this.inBounds(sx, sy) || !this.inBounds(gx, gy)) return [];
      if (!this.isTractorDrivable(gx, gy)) return [];
      if (sx === gx && sy === gy) return [{ x: gx, y: gy }];

      const N = this.size;
      const dist = this._pfDist;
      const prev = this._pfPrev;
      const stamp = this._pfStamp;
      const sVal = this._pfBeginSearch();
      const closedVal = sVal + 1;

      const startK = sy * N + sx;
      const goalK = gy * N + gx;
      stamp[startK] = sVal;
      dist[startK] = 0;
      prev[startK] = -1;
      this._pfHeapPush(startK, (Math.abs(gx - sx) + Math.abs(gy - sy)) * 0.55);

      while (this._pfHeapLen > 0) {
        const ck = this._pfHeapPop();
        if (stamp[ck] === closedVal) continue;
        if (ck === goalK) break;
        stamp[ck] = closedVal;

        const cx = ck % N;
        const cy = (ck - cx) / N;
        const ct = this.tiles[cy][cx];
        const baseD = dist[ck];

        for (let i = 0; i < 4; i++) {
          const d = CARDINAL_DIRS[i];
          const nx = cx + d[0];
          const ny = cy + d[1];
          if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
          const nk = ny * N + nx;
          if (stamp[nk] === closedVal) continue;
          if (!this.isTractorDrivable(nx, ny)) continue;
          const nt = this.tiles[ny][nx];
          const dElev = Math.abs(nt.elev - ct.elev);
          if (dElev > 1) continue;

          let stepCost;
          if (dElev === 1) {
            stepCost = (ct.path && nt.path) ? 0.7 : 2.8;
          } else {
            stepCost = nt.path ? 0.5 : 1.35;
          }

          const nd = baseD + stepCost;
          const curD = stamp[nk] === sVal ? dist[nk] : 1e9;
          if (nd < curD) {
            stamp[nk] = sVal;
            dist[nk] = nd;
            prev[nk] = ck;
            this._pfHeapPush(nk, nd + (Math.abs(gx - nx) + Math.abs(gy - ny)) * 0.55);
          }
        }
      }

      if ((stamp[goalK] !== sVal && stamp[goalK] !== closedVal) || prev[goalK] === -1) return [];
      const path = [];
      let curK = goalK;
      while (curK !== -1 && curK !== startK) {
        const px = curK % N;
        path.push({ x: px, y: (curK - px) / N });
        curK = prev[curK];
      }
      path.reverse();
      return path;
    }

    // Connected flat water tiles reachable from a boat dock (bounded radius so creek boats stay scenic)
    getConnectedWaterTiles(sx, sy, maxRadius = 11) {
      sx = Math.round(sx); sy = Math.round(sy);
      const start = this.get(sx, sy);
      if (!start || !start.water) return [];

      const N = this.size;
      const cacheKey = (sy * N + sx) * 64 + maxRadius;
      const cached = this._waterPoolCache.get(cacheKey);
      if (cached) return cached;

      const targetElev = start.elev;
      const stamp = this._pfStamp;
      const sVal = this._pfBeginSearch();
      const queue = this._bfsQueue;
      const maxR2 = maxRadius * maxRadius;
      const out = [];

      const startK = sy * N + sx;
      stamp[startK] = sVal;
      let qHead = 0;
      let qTail = 0;
      queue[qTail++] = startK;

      while (qHead < qTail) {
        const ck = queue[qHead++];
        const cx = ck % N;
        const cy = (ck - cx) / N;
        out.push(this.tiles[cy][cx]);

        for (let i = 0; i < 4; i++) {
          const d = CARDINAL_DIRS[i];
          const nx = cx + d[0];
          const ny = cy + d[1];
          if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
          const nk = ny * N + nx;
          if (stamp[nk] === sVal) continue;
          const nb = this.tiles[ny][nx];
          if (!nb.water || nb.elev !== targetElev) continue;
          const dx = nx - sx;
          const dy = ny - sy;
          if (dx * dx + dy * dy > maxR2) continue;
          stamp[nk] = sVal;
          queue[qTail++] = nk;
        }
      }

      if (this._waterPoolCache.size > 48) this._waterPoolCache.clear();
      this._waterPoolCache.set(cacheKey, out);
      return out;
    }

    // A* pathfinder across connected flat water tiles for paddling boats
    findWaterPath(sx, sy, gx, gy) {
      sx = Math.round(sx); sy = Math.round(sy);
      gx = Math.round(gx); gy = Math.round(gy);
      const start = this.get(sx, sy);
      const goal = this.get(gx, gy);
      if (!start || !goal || !start.water || !goal.water || start.elev !== goal.elev) return [];
      if (sx === gx && sy === gy) return [{ x: gx, y: gy }];

      const N = this.size;
      const targetElev = start.elev;
      const dist = this._pfDist;
      const prev = this._pfPrev;
      const stamp = this._pfStamp;
      const sVal = this._pfBeginSearch();
      const closedVal = sVal + 1;

      const startK = sy * N + sx;
      const goalK = gy * N + gx;
      stamp[startK] = sVal;
      dist[startK] = 0;
      prev[startK] = -1;
      this._pfHeapPush(startK, Math.abs(gx - sx) + Math.abs(gy - sy));

      while (this._pfHeapLen > 0) {
        const ck = this._pfHeapPop();
        if (stamp[ck] === closedVal) continue;
        if (ck === goalK) break;
        stamp[ck] = closedVal;

        const cx = ck % N;
        const cy = (ck - cx) / N;
        const baseD = dist[ck];

        for (let i = 0; i < 4; i++) {
          const d = CARDINAL_DIRS[i];
          const nx = cx + d[0];
          const ny = cy + d[1];
          if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
          const nk = ny * N + nx;
          if (stamp[nk] === closedVal) continue;
          const nt = this.tiles[ny][nx];
          if (!nt.water || nt.elev !== targetElev) continue;

          const nd = baseD + 1;
          const curD = stamp[nk] === sVal ? dist[nk] : 1e9;
          if (nd < curD) {
            stamp[nk] = sVal;
            dist[nk] = nd;
            prev[nk] = ck;
            this._pfHeapPush(nk, nd + Math.abs(gx - nx) + Math.abs(gy - ny));
          }
        }
      }

      if ((stamp[goalK] !== sVal && stamp[goalK] !== closedVal) || prev[goalK] === -1) return [];
      const path = [];
      let curK = goalK;
      while (curK !== -1 && curK !== startK) {
        const px = curK % N;
        path.push({ x: px, y: (curK - px) / N });
        curK = prev[curK];
      }
      path.reverse();
      return path;
    }

    canPlaceBoatDock(x, y) {
      const t = this.get(x, y);
      if (!t || !t.owned || !t.water || t.path || t.building || t.decor) return false;
      // Must border at least one owned dry walkable land tile so guests can walk up to the pier!
      let hasShore = false;
      for (let i = 0; i < 4; i++) {
        const d = CARDINAL_DIRS[i];
        const nb = this.get(x + d[0], y + d[1]);
        if (nb && nb.owned && !nb.water && this.isWalkable(nb.x, nb.y)) {
          hasShore = true;
          break;
        }
      }
      if (!hasShore) return false;
      return this.getConnectedWaterTiles(x, y).length >= 2;
    }

    findAdjacentWalkable(tx, ty) {
      const t = this.get(tx, ty);
      if (t && this.isWalkable(tx, ty)) return { x: tx, y: ty };
      for (let i = 0; i < 4; i++) {
        const d = WALK_DIRS[i];
        const n = this.get(tx + d[0], ty + d[1]);
        if (n && this.isWalkable(n.x, n.y) && n.path) return { x: n.x, y: n.y };
      }
      for (let i = 0; i < 4; i++) {
        const d = WALK_DIRS[i];
        const n = this.get(tx + d[0], ty + d[1]);
        if (n && this.isWalkable(n.x, n.y)) return { x: n.x, y: n.y };
      }
      return null;
    }

    // Fast zero-allocation A* pathfinder on grid preferring paths & staircases across ledges
    findPath(sx, sy, gx, gy) {
      sx = Math.round(sx); sy = Math.round(sy);
      gx = Math.round(gx); gy = Math.round(gy);
      if (!this.inBounds(sx, sy) || !this.inBounds(gx, gy)) return [];
      if (sx === gx && sy === gy) return [{ x: gx, y: gy }];

      const N = this.size;
      const dist = this._pfDist;
      const prev = this._pfPrev;
      const stamp = this._pfStamp;
      const sVal = this._pfBeginSearch();
      const closedVal = sVal + 1;

      const startK = sy * N + sx;
      const goalK = gy * N + gx;
      stamp[startK] = sVal;
      dist[startK] = 0;
      prev[startK] = -1;
      this._pfHeapPush(startK, (Math.abs(gx - sx) + Math.abs(gy - sy)) * 0.6);

      while (this._pfHeapLen > 0) {
        const ck = this._pfHeapPop();
        if (stamp[ck] === closedVal) continue;
        if (ck === goalK) break;
        stamp[ck] = closedVal;

        const cx = ck % N;
        const cy = (ck - cx) / N;
        const ct = this.tiles[cy][cx];
        const baseD = dist[ck];

        for (let i = 0; i < 4; i++) {
          const d = CARDINAL_DIRS[i];
          const nx = cx + d[0];
          const ny = cy + d[1];
          if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
          const nk = ny * N + nx;
          if (stamp[nk] === closedVal) continue;
          if (!(nx === gx && ny === gy) && !this.isWalkable(nx, ny)) continue;
          const nt = this.tiles[ny][nx];
          const dElev = Math.abs(nt.elev - ct.elev);
          if (dElev > 1) continue; // Cliff too steep without ledges

          let stepCost;
          if (dElev === 1) {
            // Connected paths form stairs -> easy climb; grass ledge -> slow scramble
            stepCost = (ct.path && nt.path) ? 0.65 : 2.6;
          } else {
            stepCost = nt.path ? 0.55 : (nt.tree ? 1.85 : 1.15);
          }

          const nd = baseD + stepCost;
          const curD = stamp[nk] === sVal ? dist[nk] : 1e9;
          if (nd < curD) {
            stamp[nk] = sVal;
            dist[nk] = nd;
            prev[nk] = ck;
            this._pfHeapPush(nk, nd + (Math.abs(gx - nx) + Math.abs(gy - ny)) * 0.6);
          }
        }
      }

      if ((stamp[goalK] !== sVal && stamp[goalK] !== closedVal) || prev[goalK] === -1) return [];
      const path = [];
      let curK = goalK;
      while (curK !== -1 && curK !== startK) {
        const px = curK % N;
        path.push({ x: px, y: (curK - px) / N });
        curK = prev[curK];
      }
      path.reverse();
      return path;
    }

    serialize() {
      const tilesData = [];
      for (let y = 0; y < this.size; y++) {
        for (let x = 0; x < this.size; x++) {
          const t = this.tiles[y][x];
          tilesData.push({
            e: t.elev,
            o: t.owned ? 1 : 0,
            r: t.isRoad ? 1 : 0,
            w: t.water ? 1 : 0,
            p: t.path,
            d: t.decor,
            pl: t.plot,
            pm: t.plotManaged ? 1 : 0,
            s: t.stump ? 1 : 0,
            tr: t.tree ? { ty: t.tree.type, g: Math.round(t.tree.growth * 10) / 10, tm: t.tree.trimmed ? 1 : 0 } : null,
            b: t.building ? {
              id: t.building.id,
              ty: t.building.type,
              pr: t.building.price,
              op: t.building.open ? 1 : 0,
              rv: t.building.revenue,
              sv: t.building.served
            } : null
          });
        }
      }
      return { size: this.size, seed: this.seed, tiles: tilesData };
    }

    deserialize(data) {
      if (!data || data.size !== this.size || !Array.isArray(data.tiles)) return false;
      this.seed = data.seed || 0;
      let idx = 0;
      for (let y = 0; y < this.size; y++) {
        for (let x = 0; x < this.size; x++) {
          const d = data.tiles[idx++];
          const t = this.tiles[y][x];
          t.elev = d.e || 0;
          t.owned = !!d.o;
          t.isRoad = !!d.r;
          t.water = !!d.w;
          t.path = d.p || null;
          t.decor = d.d || null;
          t.plot = (d.pl === 'corn' ? 'blueberry' : d.pl) || null;
          t.plotManaged = !!(t.plot && d.pm);
          t.stump = !!d.s;
          const trType = d.tr ? (d.tr.ty === 'corn' ? 'blueberry' : d.tr.ty) : null;
          t.tree = trType ? { type: trType, growth: d.tr.g, trimmed: !!d.tr.tm, reservedBy: null } : null;
          t.building = d.b ? {
            id: d.b.id,
            type: d.b.ty,
            price: d.b.pr,
            open: !!d.b.op,
            revenue: d.b.rv || 0,
            served: d.b.sv || 0
          } : null;
        }
      }
      this.bumpRevision();
      return true;
    }
  }

  PT.FarmMap = FarmMap;
})();
