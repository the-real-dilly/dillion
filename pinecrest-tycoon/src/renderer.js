(function () {
  const PT = (window.PT = window.PT || {});

  const DECOR_OFFSET_Y = {
    lantern: 48,
    scarecrow: 48,
    flowerbox: 48,
    snowman: 42,
    wagon_decor: 42,
    holiday_tree: 68
  };

  const CARDINAL_DIRS = [
    { dx: 0, dy: -1 }, // N
    { dx: 1, dy: 0 },  // E
    { dx: 0, dy: 1 },  // S
    { dx: -1, dy: 0 }  // W
  ];

  const WAGON_SEATS = [
    [-9, -18], [-3, -19], [3, -18], [9, -19], [-6, -15], [5, -15]
  ];

  const STAIR_PAL_WOOD = {
    treadA: '#b58555',
    treadB: '#a37446',
    riser: '#5c3b20',
    stringer: '#6e4727',
    rail: '#8f6037',
    post: '#4a2e16',
    outline: '#2b1b0d'
  };

  const STAIR_PAL_STONE = {
    treadA: '#cec2aa',
    treadB: '#bdb096',
    riser: '#786d5b',
    stringer: '#6e5034',
    rail: '#8f6a46',
    post: '#4d3621',
    outline: '#362a1f'
  };

  class Renderer {
    constructor(canvas, game) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.game = game;
      this.width = window.innerWidth;
      this.height = window.innerHeight;

      // Cached sky gradient & reusable per-frame scratch buffers (eliminates GC & Skia gradient churn)
      this._skyGrad = null;
      this._skyGradSeason = null;
      this._skyGradHeight = 0;
      this._tractorStopMap = new Map();
      this._peepBuckets = new Map();
      this._peepActiveKeys = [];
      this._lights = [];
      this._tractorEngineWrap = { kind: 'tractor_engine', ref: null, x: 0, y: 0 };
      this._tractorWagonWrap = { kind: 'tractor_wagon', ref: null, x: 0, y: 0 };
      this._boatWraps = [];
      this._cachedPlotSet = null;
      this._cachedPlotTile = null;
      this._cachedPlotRev = -1;
      this._cachedTractorSegs = [];
      this._cachedTractorSig = '';

      this.resize();
    }

    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.width = window.innerWidth;
      this.height = window.innerHeight;
      this.canvas.width = Math.floor(this.width * dpr);
      this.canvas.height = Math.floor(this.height * dpr);
      this.dpr = dpr;
      this._skyGrad = null;
    }

    worldToScreen(wx, wy) {
      const cam = this.game.cam;
      return {
        sx: (wx - cam.x) * cam.zoom + this.width / 2,
        sy: (wy - cam.y) * cam.zoom + this.height / 2
      };
    }

    screenToWorld(sx, sy) {
      const cam = this.game.cam;
      return {
        wx: (sx - this.width / 2) / cam.zoom + cam.x,
        wy: (sy - this.height / 2) / cam.zoom + cam.y
      };
    }

    render() {
      const ctx = this.ctx;
      const game = this.game;
      const map = game.map;
      const cam = game.cam;
      const rot = cam.rot;

      ctx.save();
      ctx.scale(this.dpr, this.dpr);
      ctx.imageSmoothingEnabled = false;

      // 1. Seasonal Sky / Void Tabletop Backdrop (cached gradient to avoid per-frame Skia allocations)
      const seasonId = game.getSeason().id;
      if (!this._skyGrad || this._skyGradSeason !== seasonId || this._skyGradHeight !== this.height) {
        const grad = ctx.createLinearGradient(0, 0, 0, this.height);
        if (seasonId === 'winter') {
          grad.addColorStop(0, '#162433');
          grad.addColorStop(1, '#243a4d');
        } else if (seasonId === 'autumn') {
          grad.addColorStop(0, '#2a2b26');
          grad.addColorStop(1, '#3d382c');
        } else {
          grad.addColorStop(0, '#1c2b22');
          grad.addColorStop(1, '#2b4032');
        }
        this._skyGrad = grad;
        this._skyGradSeason = seasonId;
        this._skyGradHeight = this.height;
      }
      ctx.fillStyle = this._skyGrad;
      ctx.fillRect(0, 0, this.width, this.height);

      // Apply Camera Transform
      ctx.save();
      ctx.translate(Math.round(this.width / 2), Math.round(this.height / 2));
      ctx.scale(cam.zoom, cam.zoom);
      ctx.translate(-Math.round(cam.x), -Math.round(cam.y));

      const N = map.size;
      const hw = PT.TILE_W / 2;
      const hh = PT.TILE_H / 2;
      const isSnow = game.isWinterVisual();
      const tileSeasonKey = isSnow ? 'winter' : seasonId;
      const inLandMode = game.tool.mode === 'land';
      const showPlots = game.tool.mode === 'plot' || game.showPlotsOverlay || game.plotsWindowOpen;
      const showTractorRoute = !!(game.tractor && (game.tool.mode === 'tractor_stop' || game.tractorWindowOpen || (game.selected && game.selected.kind === 'tractor')));

      // Cache connected plot tile Set (only recompute when selection or map revision changes)
      let selectedPlotSet = null;
      if (game.selected && game.selected.kind === 'plot' && game.selected.ref && game.selected.ref.plot) {
        if (this._cachedPlotTile !== game.selected.ref || this._cachedPlotRev !== map.revision) {
          this._cachedPlotSet = new Set(game.getConnectedPlotTiles(game.selected.ref));
          this._cachedPlotTile = game.selected.ref;
          this._cachedPlotRev = map.revision;
        }
        selectedPlotSet = this._cachedPlotSet;
      } else if (this._cachedPlotSet) {
        this._cachedPlotSet = null;
        this._cachedPlotTile = null;
        this._cachedPlotRev = -1;
      }

      // Map tractor stops by integer tile key (y * N + x) using reused Map (zero string allocs)
      const tractorStopMap = this._tractorStopMap;
      tractorStopMap.clear();
      const hasTractorStops = !!(game.tractor && game.tractor.stops.length > 0);
      if (hasTractorStops) {
        const stops = game.tractor.stops;
        for (let i = 0; i < stops.length; i++) {
          tractorStopMap.set(stops[i].y * N + stops[i].x, i);
        }
      }

      // Bucket entities by tile depth (rx + ry) using reused bucket arrays (zero Map/Array churn)
      const peepBuckets = this._peepBuckets;
      const activeKeys = this._peepActiveKeys;
      for (let i = 0; i < activeKeys.length; i++) {
        peepBuckets.get(activeKeys[i]).length = 0;
      }
      activeKeys.length = 0;

      const addPeep = (e) => {
        const ix = Math.max(0, Math.min(N - 1, Math.round(e.x)));
        const iy = Math.max(0, Math.min(N - 1, Math.round(e.y)));
        let rx, ry;
        switch (rot & 3) {
          case 0: rx = ix; ry = iy; break;
          case 1: rx = iy; ry = N - 1 - ix; break;
          case 2: rx = N - 1 - ix; ry = N - 1 - iy; break;
          case 3: rx = N - 1 - iy; ry = ix; break;
        }
        const key = rx + ry;
        let bucket = peepBuckets.get(key);
        if (!bucket) {
          bucket = [];
          peepBuckets.set(key, bucket);
        }
        if (bucket.length === 0) activeKeys.push(key);
        bucket.push(e);
      };
      for (let i = 0; i < game.guests.length; i++) {
        const g = game.guests[i];
        if (g.state !== 'riding_tractor' && g.state !== 'paddling_boat') addPeep(g);
      }
      for (let i = 0; i < game.staff.length; i++) addPeep(game.staff[i]);
      if (game.tractor) {
        const ew = this._tractorEngineWrap;
        ew.ref = game.tractor; ew.x = game.tractor.x; ew.y = game.tractor.y;
        addPeep(ew);
        const ww = this._tractorWagonWrap;
        ww.ref = game.tractor; ww.x = game.tractor.wagonX; ww.y = game.tractor.wagonY;
        addPeep(ww);
      }
      if (game.boatDock) {
        const boats = game.boatDock.boats;
        for (let i = 0; i < boats.length; i++) {
          let bw = this._boatWraps[i];
          if (!bw) {
            bw = { kind: 'boat', ref: null, x: 0, y: 0 };
            this._boatWraps[i] = bw;
          }
          bw.ref = boats[i];
          bw.x = boats[i].x;
          bw.y = boats[i].y;
          addPeep(bw);
        }
      }

      // Collect warm lights in a flat numeric stride [wx, wy, r, kind] (0=warm, 1=fire) — zero object allocs!
      const lights = this._lights;
      lights.length = 0;

      // Viewport culling bounds in world coordinates (crucial for 60 FPS on 48x48 maps)
      const halfVisW = (this.width * 0.5) / cam.zoom;
      const halfVisH = (this.height * 0.5) / cam.zoom;
      const viewMinX = cam.x - halfVisW - 96;
      const viewMaxX = cam.x + halfVisW + 96;
      const viewMinY = cam.y - halfVisH - 120;
      const viewMaxY = cam.y + halfVisH + 150;

      const minSum = Math.max(0, Math.floor((viewMinY - hh) / hh));
      const maxSum = Math.min((N - 1) * 2, Math.ceil((viewMaxY + hh + 5 * PT.ELEV_PX) / hh));

      // 2. Painter's Algorithm Pass: Back-to-Front diagonals (viewport culled)
      for (let sum = minSum; sum <= maxSum; sum++) {
        const rxMin = Math.max(0, sum - (N - 1));
        const rxMax = Math.min(N - 1, sum);

        for (let rx = rxMin; rx <= rxMax; rx++) {
          const ry = sum - rx;
          const wx = (rx - ry) * hw;
          if (wx < viewMinX || wx > viewMaxX) continue;

          let x, y;
          switch (rot & 3) {
            case 0: x = rx; y = ry; break;
            case 1: x = N - 1 - ry; y = rx; break;
            case 2: x = N - 1 - rx; y = N - 1 - ry; break;
            case 3: x = ry; y = N - 1 - rx; break;
          }

          const t = map.tiles[y][x];
          const wy = (rx + ry) * hh - t.elev * PT.ELEV_PX;
          if (wy < viewMinY || wy > viewMaxY) continue;

          // Cliff walls / RCT earth cross-section skirts on front-left (ry+1) and front-right (rx+1)
          this.drawTerrainSkirts(ctx, map, x, y, rx, ry, wx, wy, t.elev, rot);

          // Draw Base Terrain Diamond (water / road / path / seasonal grass)
          const stair = t.path ? map.getStairInfo(t) : null;
          let tileSprite;
          if (t.water) {
            if (isSnow) {
              tileSprite = t.owned ? PT.sprites.tiles.water_winter : PT.sprites.tiles.water_winter_wild;
            } else {
              tileSprite = t.owned ? PT.sprites.tiles.water : PT.sprites.tiles.water_wild;
            }
          } else if (t.isRoad && !t.path) {
            tileSprite = PT.sprites.tiles.road;
          } else if (t.path && !stair && t.path !== 'path_bridge') {
            tileSprite = PT.sprites.tiles[t.path];
          } else {
            const key = t.owned ? tileSeasonKey : (tileSeasonKey + '_wild');
            tileSprite = PT.sprites.tiles[key][t.variant];
          }
          ctx.drawImage(tileSprite, Math.round(wx - hw), Math.round(wy - hh));

          // Live gentle water ripple sparkle on unfrozen open water (zero RGBA string allocs)
          if (t.water && !isSnow && !t.path) {
            const glint = Math.sin(game.time * 2.4 + x * 1.9 + y * 2.7);
            if (glint > 0.35) {
              ctx.globalAlpha = glint * 0.55;
              ctx.fillStyle = '#d2f5ff';
              ctx.fillRect(Math.round(wx - 7 + ((x * 5) % 9)), Math.round(wy - 2 + ((y * 3) % 5)), 6, 1);
              ctx.globalAlpha = 1;
            }
          }

          // Draw 2.5D Wooden Bridge with pilings & smart auto-railings over water or ground!
          if (t.path === 'path_bridge') {
            this.drawBridgeTile(ctx, map, t, wx, wy, rot);
          }

          // Draw 2.5D Isometric Stairs when path transitions up to a higher ledge!
          if (stair) {
            this.drawPathStairs(ctx, t, stair, wx, wy, rot);
          }

          // Draw Crop/Tree Plot zone overlay when Plot Overlay is active OR this plot is selected
          const isPlotSelected = !!(selectedPlotSet && selectedPlotSet.has(t));
          if ((showPlots || isPlotSelected) && t.owned && t.plot) {
            this.drawPlotOverlay(ctx, map, t, wx, wy, rot, isPlotSelected);
          }

          // Draw Owned Land Perimeter Fence Posts (classic RCT property border!)
          if (t.owned) {
            this.drawOwnershipEdges(ctx, map, x, y, wx, wy, rot);
          }

          // In Buy Land mode, highlight every adjacent purchasable FOR SALE tile!
          if (inLandMode && map.canBuyTile(x, y)) {
            this.drawForSaleOverlay(ctx, wx, wy, map.getTileLandPrice(x, y));
          }

          // Selected tile highlight (or subtle focus square inside a selected plot)
          if (game.selected && game.selected.kind === 'tile' && game.selected.ref === t) {
            this.drawDiamondOutline(ctx, wx, wy, '#ffe866', 2, 'rgba(255, 232, 102, 0.22)');
          } else if (game.selected && game.selected.kind === 'plot' && game.selected.ref === t) {
            this.drawDiamondOutline(ctx, wx, wy, 'rgba(255, 255, 255, 0.75)', 1.5, null);
          }

          // Draw Boat & Skate Rental Dock pier on its shoreline water tile
          if (game.boatDock && game.boatDock.x === x && game.boatDock.y === y) {
            ctx.drawImage(PT.sprites.boats.dock, Math.round(wx - 32), Math.round(wy - 46));
            // Cozy winter snow cap on dock awning when pond is frozen for ice skating!
            if (isSnow) {
              ctx.fillStyle = '#f2f9ff';
              ctx.fillRect(Math.round(wx - 14), Math.round(wy - 31), 24, 2);
            }
            if (game.boatDock.open) {
              lights.push(wx, wy - 24, 42, 0);
            } else {
              ctx.fillStyle = '#b52b24';
              ctx.fillRect(Math.round(wx - 14), Math.round(wy - 40), 28, 10);
              ctx.fillStyle = '#ffffff';
              ctx.font = 'bold 8px sans-serif';
              ctx.textAlign = 'center';
              ctx.fillText('CLOSED', Math.round(wx), Math.round(wy - 32));
            }
            if (game.selected && game.selected.ref === game.boatDock) {
              this.drawDiamondOutline(ctx, wx, wy, '#ffe866', 2, 'rgba(255, 232, 102, 0.18)');
            }
          }

          // Draw Tractor Stop sign & tile pad
          if (hasTractorStops) {
            const stopIdx = tractorStopMap.get(y * N + x);
            if (stopIdx !== undefined) {
              this.drawTractorStopMarker(ctx, wx, wy, stopIdx, map.isTractorDrivable(x, y), showTractorRoute);
            }
          }

          // Draw Stump
          if (t.stump) {
            const st = isSnow ? PT.sprites.stumpSnow : PT.sprites.stump;
            ctx.drawImage(st, Math.round(wx - 32), Math.round(wy - 34));
          }

          // Draw Decor (excluding gate which draws slightly taller)
          if (t.decor) {
            if (t.decor === 'gate') {
              ctx.drawImage(PT.sprites.decor.gate, Math.round(wx - 40), Math.round(wy - 74));
              lights.push(wx - 15, wy - 24, 34, 0, wx + 15, wy - 24, 34, 0);
            } else if (t.decor === 'gazebo') {
              ctx.drawImage(PT.sprites.decor.gazebo, Math.round(wx - 40), Math.round(wy - 74));
              lights.push(wx, wy - 28, 52, 0);
            } else {
              const ds = PT.sprites.decor[t.decor];
              if (ds) {
                const oy = DECOR_OFFSET_Y[t.decor] || 34;
                ctx.drawImage(ds, Math.round(wx - 32), Math.round(wy - oy));
                if (t.decor === 'lantern') {
                  lights.push(wx, wy - 29, 44, 0);
                } else if (t.decor === 'holiday_tree') {
                  lights.push(wx, wy - 36, 58, 0);
                }
              }
            }
          }

          // Draw Tree or Seasonal Plant
          if (t.tree) {
            const stageIdx = game.getTreeStageIndex(t.tree);
            const plantDef = PT.TREES[t.tree.type];
            const set = PT.sprites.trees[t.tree.type][isSnow ? 'snow' : 'green'];
            ctx.drawImage(set[stageIdx], Math.round(wx - 32), Math.round(wy - 78));

            // Trimmed / tended golden star sparkle badge (zero string allocs)
            if (t.tree.trimmed && stageIdx >= 2) {
              const pulse = 0.65 + 0.35 * Math.sin(game.time * 4 + x + y);
              const badgeLift = plantDef && plantDef.category === 'crop' ? 14 : (22 + stageIdx * 9);
              ctx.globalAlpha = pulse;
              ctx.fillStyle = '#ffeb73';
              ctx.fillRect(Math.round(wx + 8), Math.round(wy - badgeLift), 3, 3);
              ctx.globalAlpha = 1;
            }
          }

          // Draw Building / Stall
          if (t.building) {
            const bSpr = PT.sprites.buildings[t.building.type][isSnow ? 'snow' : 'normal'];
            ctx.drawImage(bSpr, Math.round(wx - 40), Math.round(wy - 74));

            // Animated firepit flicker!
            if (t.building.type === 'firepit') {
              const flk = Math.sin(game.time * 14 + x) * 2;
              ctx.fillStyle = '#ff7b1c';
              ctx.fillRect(Math.round(wx - 4), Math.round(wy - 14 + flk * 0.5), 8, 5);
              ctx.fillStyle = '#ffe566';
              ctx.fillRect(Math.round(wx - 2), Math.round(wy - 18 + flk), 4, 5);
              lights.push(wx, wy - 12, 58, 1);
            } else if (t.building.open) {
              lights.push(wx - 8, wy - 16, 40, 0);
            }

            // Closed sign indicator
            if (!t.building.open) {
              ctx.fillStyle = '#b52b24';
              ctx.fillRect(Math.round(wx - 14), Math.round(wy - 48), 28, 10);
              ctx.fillStyle = '#ffffff';
              ctx.font = 'bold 8px sans-serif';
              ctx.textAlign = 'center';
              ctx.fillText('CLOSED', Math.round(wx), Math.round(wy - 40));
            }
          }
        }

        // Draw Peeps belonging to this depth diagonal
        const peeps = peepBuckets.get(sum);
        if (peeps && peeps.length > 0) {
          if (peeps.length > 1) {
            peeps.sort((a, b) => {
              const pa = map.posToWorld(a.x, a.y, rot);
              const pb = map.posToWorld(b.x, b.y, rot);
              return pa.wy - pb.wy;
            });
          }
          for (let i = 0; i < peeps.length; i++) {
            this.drawPeep(ctx, peeps[i], rot);
          }
        }
      }

      // 2b. Tractor Route Preview Overlay (when managing tractor or placing stops)
      if (showTractorRoute && game.tractor) {
        this.drawTractorRouteOverlay(ctx, game.tractor, rot);
      }

      // 3. Tool Hover Ghost Preview
      if (game.hoverTile) {
        this.drawHoverGhost(ctx, game.hoverTile);
      }

      // 4. World Particles (fire embers, chimney smoke, planting sparkles)
      if (game.particles.length > 0) {
        ctx.save();
        for (let i = 0; i < game.particles.length; i++) {
          const p = game.particles[i];
          const w = map.posToWorld(p.tx, p.ty, rot);
          ctx.globalAlpha = Math.max(0, 1 - p.age / p.life);
          ctx.fillStyle = p.color;
          ctx.fillRect(Math.round(w.wx + p.px), Math.round(w.wy + p.py), p.size, p.size);
        }
        ctx.restore();
      }

      // 5. Warm Holiday Glow Overlay — stamps pre-rendered radial sprites (ZERO per-frame CanvasGradient allocations!)
      if (lights.length > 0) {
        const glowStrength = isSnow ? 0.34 : 0.14;
        const warmGlow = PT.sprites.glows.warm;
        const fireGlow = PT.sprites.glows.fire;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = glowStrength;
        for (let i = 0; i < lights.length; i += 4) {
          const lx = lights[i];
          const ly = lights[i + 1];
          const r = lights[i + 2];
          const spr = lights[i + 3] === 1 ? fireGlow : warmGlow;
          ctx.drawImage(spr, lx - r, ly - r, r * 2, r * 2);
        }
        ctx.restore();
      }

      // 6. Floating RCT Cash & Action Popups
      if (game.floatTexts.length > 0) {
        ctx.save();
        ctx.font = 'bold 12px "Trebuchet MS", sans-serif';
        ctx.textAlign = 'center';
        for (let i = 0; i < game.floatTexts.length; i++) {
          const ft = game.floatTexts[i];
          const w = map.posToWorld(ft.tx, ft.ty, rot);
          const lift = ft.age * 24;
          ctx.globalAlpha = Math.min(1, (1 - ft.age / ft.life) * 1.4);
          const tx = Math.round(w.wx);
          const ty = Math.round(w.wy - 30 - lift);
          ctx.fillStyle = '#000000';
          ctx.fillText(ft.text, tx + 1, ty + 1);
          ctx.fillStyle = ft.color;
          ctx.fillText(ft.text, tx, ty);
        }
        ctx.restore();
      }

      ctx.restore(); // end camera transform

      // 7. Screen-space Snowfall Particles (Winter / Snowy days)
      if (game.isSnowing) {
        ctx.fillStyle = 'rgba(245, 250, 255, 0.85)';
        for (const f of game.snowflakes) {
          ctx.fillRect(Math.round(f.x * this.width), Math.round(f.y * this.height), f.s, f.s);
        }
      }

      ctx.restore();
    }

    drawBridgeTile(ctx, map, t, wx, wy, rot) {
      const hw = PT.TILE_W / 2;
      const hh = PT.TILE_H / 2;
      const lift = t.water ? 4 : 2;
      const by = wy - lift;

      // Vertices of the slightly raised bridge deck diamond
      const V = [
        [wx,      by - hh + 1], // 0: Top
        [wx + hw - 1, by],      // 1: Right
        [wx,      by + hh - 1], // 2: Bottom
        [wx - hw + 1, by]       // 3: Left
      ];

      // Determine which view edges have an open railing (no connecting path/road on that side)
      let railMask = 0;
      const rShift = 4 - (rot & 3);
      for (let i = 0; i < 4; i++) {
        const d = CARDINAL_DIRS[i];
        const nb = map.get(t.x + d.dx, t.y + d.dy);
        const connected = !!(nb && (nb.path || nb.isRoad));
        if (!connected) {
          railMask |= (1 << ((i + rShift) & 3));
        }
      }

      const drawRailEdge = (edgeIdx) => {
        const p1 = V[edgeIdx];
        const p2 = V[(edgeIdx + 1) & 3];
        const pmx = (p1[0] + p2[0]) * 0.5;
        const pmy = (p1[1] + p2[1]) * 0.5;
        const railH = 7;

        // Vertical timber posts
        ctx.strokeStyle = '#4a2e16';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p1[0], p1[1] - railH);
        ctx.moveTo(pmx, pmy);     ctx.lineTo(pmx, pmy - railH);
        ctx.moveTo(p2[0], p2[1]); ctx.lineTo(p2[0], p2[1] - railH);
        ctx.stroke();

        // Mid & top wooden handrails
        ctx.strokeStyle = '#734a27';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(p1[0], p1[1] - 3); ctx.lineTo(p2[0], p2[1] - 3);
        ctx.stroke();

        ctx.strokeStyle = '#a87446';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(p1[0], p1[1] - railH); ctx.lineTo(p2[0], p2[1] - railH);
        ctx.stroke();
      };

      // 1. Timber pilings dipping into water under front deck edges
      if (t.water) {
        ctx.fillStyle = '#472c16';
        ctx.fillRect(Math.round(wx - hw + 6), Math.round(by + 1), 3, lift + 5);
        ctx.fillRect(Math.round(wx - 1), Math.round(by + hh - 2), 3, lift + 5);
        ctx.fillRect(Math.round(wx + hw - 9), Math.round(by + 1), 3, lift + 5);
      }

      // 2. Back railings (edges 3=LT and 0=TR) drawn behind the deck
      if (railMask & 8) drawRailEdge(3);
      if (railMask & 1) drawRailEdge(0);

      // 3. Raised timber plank deck & front beam thickness
      ctx.beginPath();
      ctx.moveTo(V[3][0], V[3][1]);
      ctx.lineTo(V[2][0], V[2][1]);
      ctx.lineTo(V[2][0], V[2][1] + lift);
      ctx.lineTo(V[3][0], V[3][1] + lift);
      ctx.closePath();
      ctx.fillStyle = '#6e4727';
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(V[2][0], V[2][1]);
      ctx.lineTo(V[1][0], V[1][1]);
      ctx.lineTo(V[1][0], V[1][1] + lift);
      ctx.lineTo(V[2][0], V[2][1] + lift);
      ctx.closePath();
      ctx.fillStyle = '#52341b';
      ctx.fill();

      // Main planked bridge top diamond
      ctx.beginPath();
      ctx.moveTo(V[0][0], V[0][1]);
      ctx.lineTo(V[1][0], V[1][1]);
      ctx.lineTo(V[2][0], V[2][1]);
      ctx.lineTo(V[3][0], V[3][1]);
      ctx.closePath();
      ctx.fillStyle = '#b38150';
      ctx.fill();
      ctx.strokeStyle = '#4a2e16';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Subtle timber plank seam lines across the bridge
      ctx.strokeStyle = 'rgba(74, 46, 22, 0.55)';
      ctx.lineWidth = 1;
      for (let k = 1; k <= 4; k++) {
        const u = k / 5;
        const aX = V[3][0] + (V[0][0] - V[3][0]) * u;
        const aY = V[3][1] + (V[0][1] - V[3][1]) * u;
        const bX = V[2][0] + (V[1][0] - V[2][0]) * u;
        const bY = V[2][1] + (V[1][1] - V[2][1]) * u;
        ctx.beginPath();
        ctx.moveTo(aX, aY);
        ctx.lineTo(bX, bY);
        ctx.stroke();
      }

      // 4. Front railings (edges 2=BL and 1=RB) drawn in front of the deck
      if (railMask & 4) drawRailEdge(2);
      if (railMask & 2) drawRailEdge(1);
    }

    drawPathStairs(ctx, tile, stair, wx, wy, rot) {
      const hw = PT.TILE_W / 2;
      const hh = PT.TILE_H / 2;
      const H = PT.ELEV_PX;

      // Diamond corners at lower tile elevation
      const V = [
        { x: wx,      y: wy - hh }, // 0: Top
        { x: wx + hw, y: wy      }, // 1: Right
        { x: wx,      y: wy + hh }, // 2: Bottom
        { x: wx - hw, y: wy      }  // 3: Left
      ];

      // Convert logical direction (0=N,1=E,2=S,3=W) to camera view edge (0=TR,1=RB,2=BL,3=LT)
      const viewDir = (stair.dirIdx + (4 - (rot & 3))) & 3;

      // Paired low-edge and high-edge endpoints so (loA -> hiA) || (loB -> hiB)
      let loA, loB, hiA, hiB;
      if (viewDir === 0) {
        // Ascending back-right (toward T-R)
        loA = V[3]; loB = V[2]; hiA = V[0]; hiB = V[1];
      } else if (viewDir === 1) {
        // Ascending front-right (toward R-B)
        loA = V[3]; loB = V[0]; hiA = V[2]; hiB = V[1];
      } else if (viewDir === 2) {
        // Ascending front-left (toward B-L)
        loA = V[0]; loB = V[1]; hiA = V[3]; hiB = V[2];
      } else {
        // Ascending back-left (toward L-T)
        loA = V[2]; loB = V[1]; hiA = V[3]; hiB = V[0];
      }

      const isWood = tile.path === 'path_boardwalk';
      const pal = isWood ? STAIR_PAL_WOOD : STAIR_PAL_STONE;

      const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      const stairPt = (s, u, z) => {
        // s in [0..1] along climb (low->high), u in [0..1] across width (A->B), z vertical lift
        const pA = lerp(loA, hiA, s);
        const pB = lerp(loB, hiB, s);
        const p = lerp(pA, pB, u);
        return { x: p.x, y: p.y - z };
      };

      const m = 0.08; // curb inset along stair width
      const STEPS = 5;
      const ascendingAway = (viewDir === 0 || viewDir === 3);

      // Helper to draw a wooden/stone side stringer + RCT balustrade railing along side u
      const drawRail = (u, drawUnderWall) => {
        const b0 = stairPt(0, u, 0);
        const b1 = stairPt(1, u, 0);
        const t0 = stairPt(0, u, 0);
        const t1 = stairPt(1, u, H);

        if (drawUnderWall) {
          ctx.beginPath();
          ctx.moveTo(b0.x, b0.y);
          ctx.lineTo(b1.x, b1.y);
          ctx.lineTo(t1.x, t1.y);
          ctx.closePath();
          ctx.fillStyle = pal.stringer;
          ctx.fill();
          ctx.strokeStyle = pal.outline;
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        // Handrail posts & sloped top rail (classic RCT steps look!)
        const railH = isWood ? 6 : 4;
        const pMid = stairPt(0.5, u, H * 0.5);
        ctx.strokeStyle = pal.post;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(t0.x, t0.y); ctx.lineTo(t0.x, t0.y - railH);
        ctx.moveTo(pMid.x, pMid.y); ctx.lineTo(pMid.x, pMid.y - railH);
        ctx.moveTo(t1.x, t1.y); ctx.lineTo(t1.x, t1.y - railH);
        ctx.stroke();

        ctx.strokeStyle = pal.rail;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(t0.x, t0.y - railH);
        ctx.lineTo(t1.x, t1.y - railH);
        ctx.stroke();
      };

      // Determine which side rail (u=m vs u=1-m) is further back vs closer to camera
      const backU = (viewDir === 0 || viewDir === 2) ? m : (1 - m);
      const frontU = 1 - backU;

      // 1. Draw back side railing first
      drawRail(backU, false);

      // 2. Draw crisp stepped treads & risers back-to-front
      const startI = ascendingAway ? STEPS - 1 : 0;
      const endI = ascendingAway ? -1 : STEPS;
      const stepDelta = ascendingAway ? -1 : 1;

      for (let i = startI; i !== endI; i += stepDelta) {
        const s0 = i / STEPS;
        const s1 = (i + 1) / STEPS;
        const z0 = (i / STEPS) * H;
        const z1 = ((i + 1) / STEPS) * H;

        // Vertical riser at s0 from z0 to z1
        if (ascendingAway) {
          const rA0 = stairPt(s0, m, z0);
          const rB0 = stairPt(s0, 1 - m, z0);
          const rB1 = stairPt(s0, 1 - m, z1);
          const rA1 = stairPt(s0, m, z1);
          ctx.beginPath();
          ctx.moveTo(rA0.x, rA0.y);
          ctx.lineTo(rB0.x, rB0.y);
          ctx.lineTo(rB1.x, rB1.y);
          ctx.lineTo(rA1.x, rA1.y);
          ctx.closePath();
          ctx.fillStyle = pal.riser;
          ctx.fill();
        }

        // Horizontal step tread from s0 to s1 at height z1
        const qA0 = stairPt(s0, m, z1);
        const qB0 = stairPt(s0, 1 - m, z1);
        const qB1 = stairPt(s1, 1 - m, z1);
        const qA1 = stairPt(s1, m, z1);

        ctx.beginPath();
        ctx.moveTo(qA0.x, qA0.y);
        ctx.lineTo(qB0.x, qB0.y);
        ctx.lineTo(qB1.x, qB1.y);
        ctx.lineTo(qA1.x, qA1.y);
        ctx.closePath();
        ctx.fillStyle = (i % 2 === 0) ? pal.treadA : pal.treadB;
        ctx.fill();

        // Subtle dark step-edge crease for pixel-crisp step separation
        ctx.strokeStyle = pal.outline;
        ctx.lineWidth = 0.85;
        ctx.beginPath();
        ctx.moveTo(qA0.x, qA0.y);
        ctx.lineTo(qB0.x, qB0.y);
        ctx.stroke();
      }

      // 3. Draw front side stringer wall & railing
      drawRail(frontU, true);
    }

    drawTerrainSkirts(ctx, map, x, y, rx, ry, wx, wy, elev, rot) {
      const N = map.size;
      const hw = PT.TILE_W / 2;
      const hh = PT.TILE_H / 2;
      const r = rot & 3;

      // Front-left neighbor at view (rx, ry + 1) — zero per-tile closure allocation
      let leftNeighbor = null;
      const ly1 = ry + 1;
      if (ly1 < N) {
        let lx, ly;
        if (r === 0) { lx = rx; ly = ly1; }
        else if (r === 1) { lx = N - 1 - ly1; ly = rx; }
        else if (r === 2) { lx = N - 1 - rx; ly = N - 1 - ly1; }
        else { lx = ly1; ly = N - 1 - rx; }
        leftNeighbor = map.tiles[ly][lx];
      }

      // Front-right neighbor at view (rx + 1, ry)
      let rightNeighbor = null;
      const rx1 = rx + 1;
      if (rx1 < N) {
        let lx, ly;
        if (r === 0) { lx = rx1; ly = ry; }
        else if (r === 1) { lx = N - 1 - ry; ly = rx1; }
        else if (r === 2) { lx = N - 1 - rx1; ly = N - 1 - ry; }
        else { lx = ry; ly = N - 1 - rx1; }
        rightNeighbor = map.tiles[ly][lx];
      }

      const leftDrop = leftNeighbor ? (elev - leftNeighbor.elev) * PT.ELEV_PX : (elev * PT.ELEV_PX + 24);
      const rightDrop = rightNeighbor ? (elev - rightNeighbor.elev) * PT.ELEV_PX : (elev * PT.ELEV_PX + 24);

      if (leftDrop > 0) {
        ctx.beginPath();
        ctx.moveTo(wx - hw, wy);
        ctx.lineTo(wx, wy + hh);
        ctx.lineTo(wx, wy + hh + leftDrop);
        ctx.lineTo(wx - hw, wy + leftDrop);
        ctx.closePath();
        ctx.fillStyle = '#6e5239';
        ctx.fill();
        ctx.strokeStyle = '#3d2c1e';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      if (rightDrop > 0) {
        ctx.beginPath();
        ctx.moveTo(wx, wy + hh);
        ctx.lineTo(wx + hw, wy);
        ctx.lineTo(wx + hw, wy + rightDrop);
        ctx.lineTo(wx, wy + hh + rightDrop);
        ctx.closePath();
        ctx.fillStyle = '#523b28';
        ctx.fill();
        ctx.strokeStyle = '#2e2015';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    drawPlotOverlay(ctx, map, t, wx, wy, rot, isSelected = false) {
      const def = PT.TREES[t.plot];
      if (!def) return;
      const hw = PT.TILE_W / 2;
      const hh = PT.TILE_H / 2;
      const col = def.plotColor || '#7be06b';

      // Translucent tinted plot diamond
      ctx.beginPath();
      ctx.moveTo(wx, wy - hh);
      ctx.lineTo(wx + hw, wy);
      ctx.lineTo(wx, wy + hh);
      ctx.lineTo(wx - hw, wy);
      ctx.closePath();
      ctx.globalAlpha = isSelected ? 0.36 : 0.24;
      ctx.fillStyle = col;
      ctx.fill();
      if (t.plotManaged) {
        ctx.globalAlpha = isSelected ? 0.18 : 0.12;
        ctx.fillStyle = '#ffe055';
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Crisp solid boundary lines on outer edges of contiguous same-species plots
      const rShift = 4 - (rot & 3);
      for (let i = 0; i < 4; i++) {
        const d = CARDINAL_DIRS[i];
        const nb = map.get(t.x + d.dx, t.y + d.dy);
        if (nb && nb.owned && nb.plot === t.plot) continue;
        const edgeIdx = (i + rShift) & 3;
        let x1, y1, x2, y2;
        if (edgeIdx === 0) { x1 = wx; y1 = wy - hh; x2 = wx + hw; y2 = wy; }
        else if (edgeIdx === 1) { x1 = wx + hw; y1 = wy; x2 = wx; y2 = wy + hh; }
        else if (edgeIdx === 2) { x1 = wx; y1 = wy + hh; x2 = wx - hw; y2 = wy; }
        else { x1 = wx - hw; y1 = wy; x2 = wx; y2 = wy - hh; }

        ctx.strokeStyle = isSelected ? '#ffe866' : col;
        ctx.lineWidth = isSelected ? 3 : 2;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        // Management Plot dashed gold accent along the outer perimeter
        if (t.plotManaged) {
          ctx.save();
          ctx.strokeStyle = isSelected ? '#ffffff' : '#ffe055';
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 3]);
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
          ctx.restore();
        }
      }

      // Open planting spot marker (gold diamond pip for Management Plots, + cross for regular plots)
      if (!t.tree && !t.building && !t.path && !t.decor) {
        ctx.fillStyle = t.plotManaged ? '#ffe055' : col;
        ctx.fillRect(Math.round(wx - 4), Math.round(wy - 1), 9, 2);
        ctx.fillRect(Math.round(wx - 1), Math.round(wy - 4), 2, 9);
      }
    }

    drawOwnershipEdges(ctx, map, x, y, wx, wy, rot) {
      const hw = PT.TILE_W / 2;
      const hh = PT.TILE_H / 2;
      const rShift = 4 - (rot & 3);

      ctx.strokeStyle = '#9e7446';
      ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        const d = CARDINAL_DIRS[i];
        const nb = map.get(x + d.dx, y + d.dy);
        if (!nb || nb.owned || nb.isRoad) continue;
        const edgeIdx = (i + rShift) & 3;
        let x1, y1, x2, y2;
        if (edgeIdx === 0) { x1 = wx; y1 = wy - hh; x2 = wx + hw; y2 = wy; }
        else if (edgeIdx === 1) { x1 = wx + hw; y1 = wy; x2 = wx; y2 = wy + hh; }
        else if (edgeIdx === 2) { x1 = wx; y1 = wy + hh; x2 = wx - hw; y2 = wy; }
        else { x1 = wx - hw; y1 = wy; x2 = wx; y2 = wy - hh; }
        ctx.beginPath();
        ctx.moveTo(x1, y1 - 3);
        ctx.lineTo(x2, y2 - 3);
        ctx.stroke();
        // Corner fence post
        ctx.fillStyle = '#5c3c20';
        ctx.fillRect(Math.round(x1 - 1), Math.round(y1 - 6), 3, 6);
      }
    }

    drawForSaleOverlay(ctx, wx, wy, price) {
      this.drawDiamondOutline(ctx, wx, wy, '#ffcb3d', 1.5, 'rgba(255, 203, 61, 0.22)');
      // Tiny iconic RCT "FOR SALE" stake in center of tile
      ctx.fillStyle = '#5c3c20';
      ctx.fillRect(Math.round(wx - 1), Math.round(wy - 9), 2, 9);
      ctx.fillStyle = '#ffda59';
      ctx.fillRect(Math.round(wx - 9), Math.round(wy - 16), 18, 9);
      ctx.strokeStyle = '#5c3c20';
      ctx.lineWidth = 1;
      ctx.strokeRect(Math.round(wx - 9), Math.round(wy - 16), 18, 9);
      ctx.fillStyle = '#291c0d';
      ctx.font = 'bold 8px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('$' + price, Math.round(wx), Math.round(wy - 9));
    }

    drawDiamondOutline(ctx, wx, wy, stroke, lineW = 2, fill = null) {
      const hw = PT.TILE_W / 2;
      const hh = PT.TILE_H / 2;
      ctx.beginPath();
      ctx.moveTo(wx, wy - hh);
      ctx.lineTo(wx + hw, wy);
      ctx.lineTo(wx, wy + hh);
      ctx.lineTo(wx - hw, wy);
      ctx.closePath();
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fill();
      }
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lineW;
      ctx.stroke();
    }

    drawTractorStopMarker(ctx, wx, wy, stopIdx, isDrivable, highlighted) {
      // Ground stop pad outline
      const stroke = !isDrivable ? '#ff6159' : (highlighted ? '#ffe366' : '#d99e3b');
      const fill = !isDrivable ? 'rgba(255, 80, 70, 0.28)' : (highlighted ? 'rgba(255, 224, 90, 0.25)' : 'rgba(255, 210, 90, 0.14)');
      this.drawDiamondOutline(ctx, wx, wy, stroke, highlighted ? 2 : 1.5, fill);

      // Cute wooden roadside tractor stop post & numbered sign on the back edge of tile
      const sx = Math.round(wx + 12);
      const sy = Math.round(wy - 4);
      ctx.fillStyle = '#5c3b20';
      ctx.fillRect(sx - 1, sy - 15, 2, 15);
      ctx.fillStyle = !isDrivable ? '#b52b24' : '#c93832';
      ctx.fillRect(sx - 7, sy - 23, 14, 10);
      ctx.strokeStyle = '#ffea99';
      ctx.lineWidth = 1;
      ctx.strokeRect(sx - 6.5, sy - 22.5, 13, 9);
      ctx.fillStyle = '#fff9e0';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(stopIdx + 1), sx, sy - 15);
    }

    drawTractorRouteOverlay(ctx, tractor, rot) {
      const map = this.game.map;
      // Cache route A* segments — only recompute when map revision or tractor stops change!
      let sig = String(map.revision) + '|';
      for (let i = 0; i < tractor.stops.length; i++) {
        sig += tractor.stops[i].x + ',' + tractor.stops[i].y + ';';
      }
      if (sig !== this._cachedTractorSig) {
        this._cachedTractorSegs = this.game.getTractorRouteSegments();
        this._cachedTractorSig = sig;
      }
      const segs = this._cachedTractorSegs;
      if (segs.length === 0) return;

      ctx.save();
      ctx.strokeStyle = '#ffd95e';
      ctx.lineWidth = 3;
      ctx.setLineDash([7, 5]);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      for (let s = 0; s < segs.length; s++) {
        const seg = segs[s];
        ctx.beginPath();
        for (let i = 0; i < seg.length; i++) {
          const w = map.tileToWorld(seg[i].x, seg[i].y, rot);
          if (i === 0) ctx.moveTo(w.wx, w.wy - 2);
          else ctx.lineTo(w.wx, w.wy - 2);
        }
        ctx.stroke();
      }
      ctx.restore();
    }

    drawPeep(ctx, e, rot) {
      if (e.kind === 'tractor_engine' || e.kind === 'tractor_wagon') {
        this.drawTractorPart(ctx, e.kind, e.ref, rot);
        return;
      }
      if (e.kind === 'boat') {
        this.drawBoat(ctx, e.ref, rot);
        return;
      }

      const w = this.game.map.posToWorld(e.x, e.y, rot);
      const frame = Math.floor(e.walkPhase) & 1;
      let spr;
      if (e.kind === 'staff') {
        spr = PT.sprites.peeps['staff_' + e.role][frame];
      } else {
        const prefix = e.carryingTree
          ? (e.carryingTree.category === 'tree' ? 'guest_tree_' : 'guest_basket_')
          : 'guest_';
        spr = PT.sprites.peeps[prefix + e.coatIdx][frame];
      }
      if (e.kind === 'staff' && e.role === 'dog') {
        const dx = e.dirX || 0;
        const dy = e.dirY || 0;
        let drx, dry;
        switch (rot & 3) {
          case 0: drx = dx;  dry = dy;  break;
          case 1: drx = dy;  dry = -dx; break;
          case 2: drx = -dx; dry = -dy; break;
          case 3: drx = -dy; dry = dx;  break;
        }
        if (drx - dry < -0.001) {
          ctx.save();
          ctx.translate(Math.round(w.wx), Math.round(w.wy - 26));
          ctx.scale(-1, 1);
          ctx.drawImage(spr, -14, 0);
          ctx.restore();
        } else {
          ctx.drawImage(spr, Math.round(w.wx - 14), Math.round(w.wy - 26));
        }
      } else {
        ctx.drawImage(spr, Math.round(w.wx - 14), Math.round(w.wy - 26));
      }

      // Selection ring under selected peep
      if (this.game.selected && this.game.selected.ref === e) {
        ctx.strokeStyle = '#ffe866';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(Math.round(w.wx), Math.round(w.wy + 1), 8, 4, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    drawTractorPart(ctx, partKind, tr, rot) {
      const map = this.game.map;
      const isEngine = partKind === 'tractor_engine';
      const wxPos = isEngine ? tr.x : tr.wagonX;
      const wyPos = isEngine ? tr.y : tr.wagonY;
      const w = map.posToWorld(wxPos, wyPos, rot);

      // Draw sturdy iron tow hitch connecting the tractor and wagon
      if (isEngine) {
        const wWag = map.posToWorld(tr.wagonX, tr.wagonY, rot);
        ctx.save();
        ctx.strokeStyle = '#24272b';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(Math.round(w.wx), Math.round(w.wy - 5));
        ctx.lineTo(Math.round(wWag.wx), Math.round(wWag.wy - 5));
        ctx.stroke();
        ctx.strokeStyle = '#5c636b';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(Math.round(w.wx), Math.round(w.wy - 6));
        ctx.lineTo(Math.round(wWag.wx), Math.round(wWag.wy - 6));
        ctx.stroke();
        ctx.restore();
      }

      const dx = isEngine ? (tr.dirX || 0) : (tr.wagonDirX || 0);
      const dy = isEngine ? (tr.dirY || -1) : (tr.wagonDirY || -1);
      let drx, dry;
      switch (rot & 3) {
        case 0: drx = dx;  dry = dy;  break;
        case 1: drx = dy;  dry = -dx; break;
        case 2: drx = -dx; dry = -dy; break;
        case 3: drx = -dy; dry = dx;  break;
      }
      const screenDx = drx - dry;
      const screenDy = drx + dry;
      const faceLeft = screenDx < -0.001;
      const facingBack = screenDy < -0.001;
      const frame = Math.floor(tr.wheelPhase) & 1;

      const sprKey = isEngine
        ? (facingBack ? 'engineBack' : 'engineFront')
        : (facingBack ? 'wagonBack' : 'wagonFront');
      const spr = PT.sprites.tractor[sprKey][frame];
      const halfW = spr.width >> 1;
      const anchorY = 38;

      if (faceLeft) {
        ctx.save();
        ctx.translate(Math.round(w.wx), Math.round(w.wy - anchorY));
        ctx.scale(-1, 1);
        ctx.drawImage(spr, -halfW, 0);
        ctx.restore();
      } else {
        ctx.drawImage(spr, Math.round(w.wx - halfW), Math.round(w.wy - anchorY));
      }

      // Render seated passengers aboard the hay wagon!
      if (!isEngine && tr.riders.length > 0) {
        const bob = frame === 1 ? -1 : 0;
        const count = Math.min(tr.riders.length, WAGON_SEATS.length);
        for (let i = 0; i < count; i++) {
          const r = tr.riders[i];
          const scheme = PT.GUEST_COATS[r.coatIdx % PT.GUEST_COATS.length];
          const seat = WAGON_SEATS[i];
          const px = Math.round(w.wx + seat[0]);
          const py = Math.round(w.wy + seat[1] + bob);
          // Coat torso
          ctx.fillStyle = scheme.coat;
          ctx.fillRect(px - 2, py - 2, 5, 5);
          // Head
          ctx.fillStyle = '#f2caa8';
          ctx.fillRect(px - 1, py - 6, 4, 4);
          // Knit hat
          ctx.fillStyle = scheme.hat;
          ctx.fillRect(px - 2, py - 8, 5, 3);
        }
      }

      // Selection ring when Tractor Ride is inspected
      if (this.game.selected && this.game.selected.ref === tr) {
        ctx.strokeStyle = '#ffe866';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(Math.round(w.wx), Math.round(w.wy + 1), isEngine ? 15 : 18, 7, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    drawBoat(ctx, b, rot) {
      const w = this.game.map.posToWorld(b.x, b.y, rot);
      const dx = b.dirX || 1;
      const dy = b.dirY || 0;
      let drx, dry;
      switch (rot & 3) {
        case 0: drx = dx;  dry = dy;  break;
        case 1: drx = dy;  dry = -dx; break;
        case 2: drx = -dx; dry = -dy; break;
        case 3: drx = -dy; dry = dx;  break;
      }
      const faceLeft = (drx - dry) < -0.001;
      const facingBack = (drx + dry) < -0.001;
      const frame = Math.floor(b.paddlePhase) & 1;

      if (b.mode === 'skate') {
        // Render a lively gliding ice skater on the frozen winter pond!
        const scheme = b.guest ? PT.GUEST_COATS[b.guest.coatIdx % PT.GUEST_COATS.length] : PT.GUEST_COATS[0];
        const px = Math.round(w.wx);
        const py = Math.round(w.wy);
        const glideDir = faceLeft ? -1 : 1;
        const lean = frame === 0 ? 1 : -1;

        // Crisp ice reflection / shadow + faint skate carve marks
        ctx.fillStyle = 'rgba(40, 80, 110, 0.25)';
        ctx.beginPath(); ctx.ellipse(px, py + 1, 7, 3, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px - glideDir * 6, py + 1);
        ctx.lineTo(px, py + 1);
        ctx.stroke();

        // Gliding legs & gleaming silver skate blades
        ctx.fillStyle = '#262b33';
        ctx.fillRect(px - 3 + (lean > 0 ? 1 : -1), py - 6, 2, 5);
        ctx.fillRect(px + 1 + (lean < 0 ? 1 : -1), py - 6, 2, 5);
        ctx.fillStyle = '#eef8ff';
        ctx.fillRect(px - 4 + (lean > 0 ? 1 : -1), py - 1, 4, 1);
        ctx.fillRect(px + (lean < 0 ? 1 : -1), py - 1, 4, 1);

        // Winter coat torso & outstretched balancing arms
        ctx.fillStyle = scheme.coat;
        ctx.fillRect(px - 4, py - 13, 8, 8);
        ctx.fillRect(px - 6, py - 11 + (frame === 0 ? 0 : 1), 2, 2);
        ctx.fillRect(px + 4, py - 11 + (frame === 1 ? 0 : 1), 2, 2);

        // Trailing festive scarf tail fluttering behind direction of glide
        ctx.fillStyle = scheme.hat;
        ctx.fillRect(px - glideDir * 5, py - 13, 3, 2);
        ctx.fillRect(px - glideDir * 7, py - 12, 2, 2);

        // Head & knit hat with pom-pom
        ctx.fillStyle = '#f2caa8';
        ctx.fillRect(px - 2, py - 18, 5, 5);
        ctx.fillStyle = scheme.hat;
        ctx.fillRect(px - 3, py - 21, 7, 4);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(px, py - 23, 2, 2);

        if (this.game.selected && this.game.selected.ref === b.dock) {
          ctx.strokeStyle = '#ffe866';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.ellipse(px, py + 1, 9, 4, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        return;
      }

      const spr = PT.sprites.boats[facingBack ? 'boatBack' : 'boatFront'][frame];
      const halfW = spr.width >> 1;
      const anchorY = 24;

      if (faceLeft) {
        ctx.save();
        ctx.translate(Math.round(w.wx), Math.round(w.wy - anchorY));
        ctx.scale(-1, 1);
        ctx.drawImage(spr, -halfW, 0);
        ctx.restore();
      } else {
        ctx.drawImage(spr, Math.round(w.wx - halfW), Math.round(w.wy - anchorY));
      }

      // Draw seated paddling guest inside the rowboat
      if (b.guest) {
        const scheme = PT.GUEST_COATS[b.guest.coatIdx % PT.GUEST_COATS.length];
        const bob = frame === 1 ? -1 : 0;
        const px = Math.round(w.wx);
        const py = Math.round(w.wy - 8 + bob);
        ctx.fillStyle = scheme.coat;
        ctx.fillRect(px - 3, py - 2, 6, 5);
        ctx.fillStyle = '#f2caa8';
        ctx.fillRect(px - 2, py - 6, 4, 4);
        ctx.fillStyle = scheme.hat;
        ctx.fillRect(px - 3, py - 8, 6, 3);
      }

      if (this.game.selected && this.game.selected.ref === b.dock) {
        ctx.strokeStyle = '#ffe866';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(Math.round(w.wx), Math.round(w.wy + 1), 13, 5, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    drawHoverGhost(ctx, tile) {
      const game = this.game;
      const rot = game.cam.rot;
      const mode = game.tool.mode;
      const check = game.canApplyTool(tile);

      if (mode === 'inspect') {
        const p = game.map.tileToWorld(tile.x, tile.y, rot);
        this.drawDiamondOutline(ctx, p.wx, p.wy, 'rgba(255,255,255,0.65)', 1.5, 'rgba(255,255,255,0.08)');
        return;
      }

      if (mode === 'land') {
        const tiles = game.getLandBrushTiles(tile);
        for (const t of tiles) {
          const p = game.map.tileToWorld(t.x, t.y, rot);
          const ok = game.map.canBuyTile(t.x, t.y);
          this.drawDiamondOutline(ctx, p.wx, p.wy, ok ? '#6bff87' : '#ff6868', 2.5, ok ? 'rgba(95, 255, 128, 0.28)' : 'rgba(255, 90, 90, 0.22)');
        }
        return;
      }

      if (mode === 'terrain') {
        const tiles = game.getTerrainBrushTiles(tile);
        const action = game.tool.itemId;
        const okCol = action === 'water' ? '#5cc8ff' : (action === 'lower' ? '#ffd259' : '#78ff8c');
        const okFill = action === 'water' ? 'rgba(92, 200, 255, 0.30)' : (action === 'lower' ? 'rgba(255, 210, 89, 0.25)' : 'rgba(110, 255, 130, 0.26)');
        for (const t of tiles) {
          const p = game.map.tileToWorld(t.x, t.y, rot);
          const ok = game.canTerraformTile(t, action).ok;
          this.drawDiamondOutline(ctx, p.wx, p.wy, ok ? okCol : '#ff6868', 2.5, ok ? okFill : 'rgba(255, 90, 90, 0.22)');
        }
        const cp = game.map.tileToWorld(tile.x, tile.y, rot);
        const glyph = action === 'raise' ? '⬆ RAISE' : (action === 'lower' ? '⬇ LOWER' : (action === 'water' ? '💧 WATER' : '🌱 DRAIN'));
        ctx.fillStyle = '#1c1812';
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(glyph, Math.round(cp.wx) + 1, Math.round(cp.wy - 16) + 1);
        ctx.fillStyle = check.ok ? okCol : '#ff7b73';
        ctx.fillText(glyph, Math.round(cp.wx), Math.round(cp.wy - 16));
        return;
      }

      if (mode === 'plot') {
        const tiles = game.getPlotBrushTiles(tile);
        const isErase = game.tool.itemId === 'erase';
        const def = !isErase ? PT.TREES[game.tool.itemId] : null;
        const strokeCol = isErase ? '#ff8a6b' : (def ? def.plotColor : '#78ff8c');
        for (const t of tiles) {
          const p = game.map.tileToWorld(t.x, t.y, rot);
          const ok = isErase
            ? (t.owned && !!t.plot)
            : (t.owned && !t.isRoad && !t.water && !t.building && !t.path && !t.decor);
          this.drawDiamondOutline(
            ctx,
            p.wx,
            p.wy,
            ok ? strokeCol : '#ff6868',
            2.5,
            ok ? 'rgba(255, 255, 255, 0.2)' : 'rgba(255, 90, 90, 0.22)'
          );
        }
        return;
      }

      if (mode === 'boat_dock') {
        const p = game.map.tileToWorld(tile.x, tile.y, rot);
        const col = check.ok ? '#78ff8c' : '#ff6961';
        const fill = check.ok ? 'rgba(110, 255, 130, 0.28)' : 'rgba(255, 90, 90, 0.28)';
        this.drawDiamondOutline(ctx, p.wx, p.wy, col, 2.5, fill);
        ctx.save();
        ctx.globalAlpha = check.ok ? 0.8 : 0.45;
        ctx.drawImage(PT.sprites.boats.dock, Math.round(p.wx - 32), Math.round(p.wy - 46));
        ctx.restore();
        ctx.fillStyle = '#1c1812';
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        const lbl = check.ok ? '🚣 PLACE DOCK' : 'WATER EDGE ONLY';
        ctx.fillText(lbl, Math.round(p.wx) + 1, Math.round(p.wy - 34) + 1);
        ctx.fillStyle = col;
        ctx.fillText(lbl, Math.round(p.wx), Math.round(p.wy - 34));
        return;
      }

      if (mode === 'tractor_stop') {
        const p = game.map.tileToWorld(tile.x, tile.y, rot);
        const col = check.ok ? (check.removing ? '#ffad5c' : '#78ff8c') : '#ff6961';
        const fill = check.ok ? (check.removing ? 'rgba(255, 165, 80, 0.28)' : 'rgba(110, 255, 130, 0.28)') : 'rgba(255, 90, 90, 0.28)';
        this.drawDiamondOutline(ctx, p.wx, p.wy, col, 2.5, fill);
        ctx.fillStyle = '#1c1812';
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        const lbl = check.ok ? (check.removing ? '✕ REMOVE STOP' : '📍 ADD STOP') : 'BLOCKED';
        ctx.fillText(lbl, Math.round(p.wx) + 1, Math.round(p.wy - 18) + 1);
        ctx.fillStyle = col;
        ctx.fillText(lbl, Math.round(p.wx), Math.round(p.wy - 18));
        return;
      }

      const p = game.map.tileToWorld(tile.x, tile.y, rot);
      const col = check.ok ? '#78ff8c' : '#ff6961';
      const fill = check.ok ? 'rgba(110, 255, 130, 0.25)' : 'rgba(255, 90, 90, 0.28)';
      this.drawDiamondOutline(ctx, p.wx, p.wy, col, 2, fill);

      // Draw translucent preview sprite
      ctx.save();
      ctx.globalAlpha = 0.72;
      const isSnow = game.isWinterVisual();
      if (mode === 'plant' && game.tool.itemId) {
        const spr = PT.sprites.trees[game.tool.itemId][isSnow ? 'snow' : 'green'][2];
        ctx.drawImage(spr, Math.round(p.wx - 32), Math.round(p.wy - 78));
      } else if (mode === 'build' && game.tool.itemId) {
        const spr = PT.sprites.buildings[game.tool.itemId][isSnow ? 'snow' : 'normal'];
        ctx.drawImage(spr, Math.round(p.wx - 40), Math.round(p.wy - 74));
      } else if (mode === 'path' && game.tool.itemId === 'path_bridge') {
        ctx.drawImage(PT.sprites.tiles.path_bridge, Math.round(p.wx - 32), Math.round(p.wy - 22));
      } else if (mode === 'decor' && game.tool.itemId) {
        const spr = PT.sprites.decor[game.tool.itemId];
        if (spr) {
          if (game.tool.itemId === 'gazebo') {
            ctx.drawImage(spr, Math.round(p.wx - 40), Math.round(p.wy - 74));
          } else {
            const oy = DECOR_OFFSET_Y[game.tool.itemId] || 34;
            ctx.drawImage(spr, Math.round(p.wx - 32), Math.round(p.wy - oy));
          }
        }
      }
      ctx.restore();
    }
  }

  PT.Renderer = Renderer;
})();
