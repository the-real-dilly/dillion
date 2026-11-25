(function () {
  const PT = (window.PT = window.PT || {});

  // Deterministic pseudo-random helper for crisp pixel dithering
  function hash(x, y, s = 0) {
    let n = (x * 374761393 + y * 668265263 + s * 1442695041) | 0;
    n = (n ^ (n >> 13)) * 1274126177;
    return ((n ^ (n >> 16)) >>> 0) / 4294967295;
  }

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    return { c, ctx };
  }

  // Draw pixel-crisp filled isometric diamond (64x32)
  function drawIsoDiamond(ctx, ox, oy, w, h, fillFn, edgeHi, edgeLo) {
    const hw = w >> 1;
    const hh = h >> 1;
    for (let y = 0; y < h; y++) {
      const dy = y < hh ? y : h - 1 - y;
      const span = Math.floor(((dy + 0.5) / hh) * hw);
      const x0 = hw - span;
      const x1 = hw + span - 1;
      for (let x = x0; x <= x1; x++) {
        let col = fillFn(x, y);
        if (edgeHi && (x === x0 && y < hh)) col = edgeHi;
        else if (edgeLo && (x === x1 && y >= hh)) col = edgeLo;
        ctx.fillStyle = col;
        ctx.fillRect(ox + x, oy + y, 1, 1);
      }
    }
  }

  function drawIsoBox(ctx, cx, by, halfW, halfH, wallH, colors) {
    // Top face
    ctx.beginPath();
    ctx.moveTo(cx, by - wallH - halfH * 2);
    ctx.lineTo(cx + halfW, by - wallH - halfH);
    ctx.lineTo(cx, by - wallH);
    ctx.lineTo(cx - halfW, by - wallH - halfH);
    ctx.closePath();
    ctx.fillStyle = colors.top;
    ctx.fill();

    // Left sunlit wall
    ctx.beginPath();
    ctx.moveTo(cx - halfW, by - wallH - halfH);
    ctx.lineTo(cx, by - wallH);
    ctx.lineTo(cx, by);
    ctx.lineTo(cx - halfW, by - halfH);
    ctx.closePath();
    ctx.fillStyle = colors.left;
    ctx.fill();

    // Right shaded wall
    ctx.beginPath();
    ctx.moveTo(cx, by - wallH);
    ctx.lineTo(cx + halfW, by - wallH - halfH);
    ctx.lineTo(cx + halfW, by - halfH);
    ctx.lineTo(cx, by);
    ctx.closePath();
    ctx.fillStyle = colors.right;
    ctx.fill();

    // Crisp RCT dark pixel outline
    ctx.strokeStyle = colors.outline || '#241c15';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, by - wallH - halfH * 2);
    ctx.lineTo(cx + halfW, by - wallH - halfH);
    ctx.lineTo(cx + halfW, by - halfH);
    ctx.lineTo(cx, by);
    ctx.lineTo(cx - halfW, by - halfH);
    ctx.lineTo(cx - halfW, by - wallH - halfH);
    ctx.closePath();
    ctx.stroke();
  }

  function drawPitchedRoof(ctx, cx, topCenterY, halfW, halfH, peakH, colors, snow) {
    // True 2:1 isometric pitched roof sitting cleanly on top of drawIsoBox
    const lx = cx - halfW, ly = topCenterY;
    const rx = cx + halfW, ry = topCenterY;
    const tx = cx,         ty = topCenterY - halfH;
    const bx = cx,         by = topCenterY + halfH;

    // Ridge runs along back-left (L-T midpoint) to front-right (B-R midpoint)
    const p0x = cx - halfW * 0.5, p0y = topCenterY - halfH * 0.5 - peakH;
    const p1x = cx + halfW * 0.5, p1y = topCenterY + halfH * 0.5 - peakH;

    // Back-right roof slope (shaded)
    ctx.beginPath();
    ctx.moveTo(p0x, p0y);
    ctx.lineTo(tx, ty);
    ctx.lineTo(rx, ry);
    ctx.lineTo(p1x, p1y);
    ctx.closePath();
    ctx.fillStyle = snow ? '#cadbe8' : colors.right;
    ctx.fill();

    // Front-left roof slope (sunlit)
    ctx.beginPath();
    ctx.moveTo(p0x, p0y);
    ctx.lineTo(p1x, p1y);
    ctx.lineTo(bx, by);
    ctx.lineTo(lx, ly);
    ctx.closePath();
    ctx.fillStyle = snow ? '#eef5fa' : colors.left;
    ctx.fill();

    // Front-right gable triangle
    ctx.beginPath();
    ctx.moveTo(p1x, p1y);
    ctx.lineTo(rx, ry);
    ctx.lineTo(bx, by);
    ctx.closePath();
    ctx.fillStyle = colors.gable || colors.right;
    ctx.fill();

    // Crisp RCT outline & ridge line
    ctx.strokeStyle = '#231b15';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(p0x, p0y);
    ctx.lineTo(lx, ly);
    ctx.lineTo(bx, by);
    ctx.lineTo(rx, ry);
    ctx.lineTo(tx, ty);
    ctx.lineTo(p0x, p0y);
    ctx.moveTo(p0x, p0y);
    ctx.lineTo(p1x, p1y);
    ctx.lineTo(bx, by);
    ctx.moveTo(p1x, p1y);
    ctx.lineTo(rx, ry);
    ctx.stroke();

    if (snow) {
      // Cozy snow trim along the sunlit front-left eave
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i <= 5; i++) {
        const t = i / 5;
        const px = Math.round(lx + t * (bx - lx));
        const py = Math.round(ly + t * (by - ly));
        ctx.fillRect(px - 1, py - 1, 3, 2);
      }
    }
  }

  class SpriteAtlas {
    constructor() {
      this.tiles = {};
      this.trees = {};
      this.buildings = {};
      this.decor = {};
      this.peeps = {};
      this.tractor = {};
      this.boats = {};
      this.glows = {};
      this.stump = null;
      this.stumpSnow = null;
      this.built = false;
    }

    buildAll() {
      if (this.built) return;
      this.buildTiles();
      this.buildTrees();
      this.buildBuildings();
      this.buildDecor();
      this.buildPeeps();
      this.buildTractor();
      this.buildBoats();
      this.buildGlows();
      this.built = true;
    }

    buildGlows() {
      const makeGlow = (rgb) => {
        const size = 128;
        const half = size / 2;
        const { c, ctx } = makeCanvas(size, size);
        const g = ctx.createRadialGradient(half, half, 2, half, half, half);
        g.addColorStop(0, `rgba(${rgb}, 1)`);
        g.addColorStop(0.5, `rgba(${rgb}, 0.38)`);
        g.addColorStop(1, `rgba(${rgb}, 0)`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, size, size);
        return c;
      };
      this.glows.warm = makeGlow('255, 220, 120');
      this.glows.fire = makeGlow('255, 165, 70');
    }

    buildTiles() {
      const seasonPalettes = {
        spring: { a: '#68a34c', b: '#5c9642', c: '#74b054', wildA: '#558241', wildB: '#4c7539', hi: '#82be62', lo: '#487833' },
        summer: { a: '#599442', b: '#4f873a', c: '#66a14d', wildA: '#4a7838', wildB: '#416b30', hi: '#71ad57', lo: '#3d6b2b' },
        autumn: { a: '#a1934c', b: '#948541', c: '#b39e52', wildA: '#82743c', wildB: '#756834', hi: '#baa95d', lo: '#75662f' },
        winter: { a: '#dde8f0', b: '#cfdde8', c: '#eaf2f7', wildA: '#bcccd9', wildB: '#b0c2d1', hi: '#f7fbff', lo: '#9eb4c7' }
      };

      for (const season of ['spring', 'summer', 'autumn', 'winter']) {
        const pal = seasonPalettes[season];
        this.tiles[season] = [];
        this.tiles[season + '_wild'] = [];

        for (let v = 0; v < 3; v++) {
          // Owned grass/snow
          const { c, ctx } = makeCanvas(64, 34);
          drawIsoDiamond(ctx, 0, 0, 64, 32, (x, y) => {
            const r = hash(x, y, v * 17 + season.length);
            if (r < 0.14) return pal.c;
            if (r < 0.45) return pal.b;
            return pal.a;
          }, pal.hi, pal.lo);

          // Tiny seasonal details
          if (season === 'spring' && v === 1) {
            ctx.fillStyle = '#f5d76e';
            ctx.fillRect(26, 13, 2, 2);
            ctx.fillStyle = '#f2b8c6';
            ctx.fillRect(38, 17, 2, 2);
          } else if (season === 'autumn' && v === 2) {
            ctx.fillStyle = '#bf5b2c';
            ctx.fillRect(28, 15, 2, 1);
            ctx.fillRect(35, 19, 2, 1);
          }
          this.tiles[season].push(c);

          // Unowned wild land
          const w = makeCanvas(64, 34);
          drawIsoDiamond(w.ctx, 0, 0, 64, 32, (x, y) => {
            const r = hash(x, y, v * 29 + 99);
            if (r < 0.35) return pal.wildB;
            return pal.wildA;
          }, null, pal.lo);
          // Subtle wild grass tuft
          if (v === 0) {
            w.ctx.fillStyle = season === 'winter' ? '#95adc2' : '#355427';
            w.ctx.fillRect(29, 14, 1, 3);
            w.ctx.fillRect(31, 15, 1, 2);
          }
          this.tiles[season + '_wild'].push(w.c);
        }
      }

      // Country Road tile (asphalt/dirt packed country lane)
      const road = makeCanvas(64, 34);
      drawIsoDiamond(road.ctx, 0, 0, 64, 32, (x, y) => {
        const r = hash(x, y, 501);
        if (r < 0.25) return '#6f6b64';
        if (r < 0.6) return '#635f59';
        return '#5a5650';
      }, '#7e7a72', '#47433e');
      // Subtle dashed lane center mark
      road.ctx.fillStyle = '#d4c37b';
      road.ctx.fillRect(28, 15, 4, 2);
      road.ctx.fillRect(35, 18, 4, 2);
      this.tiles.road = road.c;

      // Paths (Gravel & Boardwalk)
      const gravel = makeCanvas(64, 34);
      drawIsoDiamond(gravel.ctx, 0, 0, 64, 32, (x, y) => {
        const r = hash(x, y, 701);
        if (r < 0.2) return '#c2b69f';
        if (r < 0.55) return '#b0a38b';
        return '#9e917a';
      }, '#d4c8b2', '#7a6e5b');
      this.tiles.path_gravel = gravel.c;

      const board = makeCanvas(64, 34);
      drawIsoDiamond(board.ctx, 0, 0, 64, 32, (x, y) => {
        const band = ((x + y * 2) >> 2) % 3;
        const seam = ((x + y * 2) % 4) === 0;
        if (seam) return '#593d24';
        return band === 0 ? '#9c7148' : band === 1 ? '#8c633d' : '#a87c52';
      }, '#ba8e63', '#5c3f25');
      this.tiles.path_boardwalk = board.c;

      // Water tiles (Owned + Wild, Summer/Autumn Blue + Frozen Winter Ice)
      const makeWaterTile = (a, b, c, hi, lo, glint) => {
        const w = makeCanvas(64, 34);
        drawIsoDiamond(w.ctx, 0, 0, 64, 32, (x, y) => {
          const wave = ((x + y * 3) % 11 === 0) && hash(x, y, 811) > 0.45;
          if (wave) return glint;
          const r = hash(x, y, 809);
          if (r < 0.25) return c;
          if (r < 0.60) return b;
          return a;
        }, hi, lo);
        return w.c;
      };
      this.tiles.water = makeWaterTile('#3680a8', '#2f7399', '#428db5', '#74bddb', '#20526e', '#8cd4f0');
      this.tiles.water_wild = makeWaterTile('#2c6b8f', '#255f80', '#35789c', '#5a9ec2', '#194159', '#6fb6d6');
      this.tiles.water_winter = makeWaterTile('#9bc6db', '#8ebad1', '#b0d5e8', '#e6f5fc', '#6b9ab3', '#ffffff');
      this.tiles.water_winter_wild = makeWaterTile('#85aec4', '#79a2b8', '#99bed4', '#cce3f0', '#5b8299', '#e6f4fc');

      // Wooden Bridge catalog & preview sprite (raised plank deck + railings over water)
      const bridge = makeCanvas(64, 40);
      drawIsoDiamond(bridge.ctx, 0, 6, 64, 32, (x, y) => {
        const r = hash(x, y, 815);
        return r < 0.35 ? '#2f7399' : '#3a86b0';
      }, '#74bddb', '#20526e');
      // Timber deck planks slightly elevated
      drawIsoDiamond(bridge.ctx, 0, 2, 60, 28, (x, y) => {
        const band = ((x + y * 2) >> 2) % 3;
        const seam = ((x + y * 2) % 4) === 0;
        if (seam) return '#4d3018';
        return band === 0 ? '#b88552' : band === 1 ? '#a67546' : '#c4905c';
      }, '#d6a470', '#5c3b20');
      // Iconic wooden bridge handrails along both sides
      bridge.ctx.strokeStyle = '#5c3b20';
      bridge.ctx.lineWidth = 2;
      bridge.ctx.beginPath();
      bridge.ctx.moveTo(4, 15); bridge.ctx.lineTo(31, 2);
      bridge.ctx.moveTo(33, 28); bridge.ctx.lineTo(60, 15);
      bridge.ctx.stroke();
      bridge.ctx.strokeStyle = '#9c6b3e';
      bridge.ctx.lineWidth = 2;
      bridge.ctx.beginPath();
      bridge.ctx.moveTo(4, 11); bridge.ctx.lineTo(31, 0);
      bridge.ctx.moveTo(33, 24); bridge.ctx.lineTo(60, 11);
      bridge.ctx.stroke();
      this.tiles.path_bridge = bridge.c;
    }

    buildTrees() {
      // Tree stumps (normal + snow)
      for (const snow of [false, true]) {
        const { c, ctx } = makeCanvas(64, 48);
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.fillRect(25, 34, 14, 5);
        ctx.fillStyle = '#5c3b22';
        ctx.fillRect(27, 29, 10, 8);
        ctx.fillStyle = '#472c18';
        ctx.fillRect(32, 29, 5, 8);
        ctx.fillStyle = snow ? '#eef5fa' : '#d6b485';
        ctx.fillRect(27, 27, 10, 4);
        ctx.fillStyle = snow ? '#cbdce8' : '#b89465';
        ctx.fillRect(29, 28, 6, 2);
        if (snow) this.stumpSnow = c;
        else this.stump = c;
      }

      for (const id of PT.TREE_ORDER) {
        const def = PT.TREES[id];
        this.trees[id] = { green: [], snow: [] };

        for (let stage = 0; stage < 5; stage++) {
          for (const snowy of [false, true]) {
            const { c, ctx } = makeCanvas(64, 96);
            this.renderTreeSprite(ctx, def, stage, snowy);
            this.trees[id][snowy ? 'snow' : 'green'].push(c);
          }
        }
      }
    }

    renderTreeSprite(ctx, def, stage, snowy) {
      if (def.id === 'daffodil') return this.renderDaffodilSprite(ctx, stage, snowy);
      if (def.id === 'tulip') return this.renderTulipSprite(ctx, stage, snowy);
      if (def.id === 'lavender') return this.renderLavenderSprite(ctx, stage, snowy);
      if (def.id === 'strawberry') return this.renderStrawberrySprite(ctx, stage, snowy);
      if (def.id === 'raspberry') return this.renderBerryBushSprite(ctx, stage, snowy, {
        dark: '#6e102e', mid: '#d9265a', hi: '#ff8fb0', leafLo: '#22521e', leafHi: '#569c44'
      });
      if (def.id === 'blueberry') return this.renderBlueberrySprite(ctx, stage, snowy);
      if (def.id === 'blackberry') return this.renderBerryBushSprite(ctx, stage, snowy, {
        dark: '#180d29', mid: '#3f226b', hi: '#9e74d4', leafLo: '#193d1c', leafHi: '#427a3c'
      });
      if (def.id === 'sunflower') return this.renderSunflowerSprite(ctx, stage, snowy);
      if (def.id === 'apple') return this.renderAppleTreeSprite(ctx, def, stage, snowy, false);
      if (def.id === 'peach') return this.renderAppleTreeSprite(ctx, def, stage, snowy, true);
      if (def.id === 'pumpkin') return this.renderPumpkinSprite(ctx, stage, snowy);
      if (def.id === 'mums') return this.renderMumsSprite(ctx, stage, snowy);

      const cx = 32;
      const baseY = 78; // aligns with center of tile diamond
      const pal = def.palette;

      // Ground drop shadow (RCT style)
      const shadowW = [6, 11, 16, 21, 25][stage];
      ctx.fillStyle = 'rgba(0, 0, 0, 0.24)';
      ctx.beginPath();
      ctx.ellipse(cx + 2, baseY + 1, shadowW, Math.round(shadowW * 0.45), 0, 0, Math.PI * 2);
      ctx.fill();

      if (stage === 0) {
        // Tiny planted seedling with soil mound
        ctx.fillStyle = '#63442a';
        ctx.fillRect(cx - 5, baseY - 1, 10, 4);
        ctx.fillStyle = pal.trunk;
        ctx.fillRect(cx - 1, baseY - 6, 2, 6);
        ctx.fillStyle = pal.mid;
        ctx.fillRect(cx - 3, baseY - 9, 6, 4);
        ctx.fillStyle = pal.hi;
        ctx.fillRect(cx - 2, baseY - 11, 3, 3);
        if (snowy) {
          ctx.fillStyle = '#edf5fa';
          ctx.fillRect(cx - 2, baseY - 11, 4, 2);
        }
        return;
      }

      const heights = [12, 22, 36, 52, 66];
      const widths  = [6,  11, 17, 23, 27];
      const tiers   = [1,  2,  3,  4,  5];

      const totalH = heights[stage];
      const maxW = widths[stage];
      const numTiers = tiers[stage];
      const trunkH = Math.max(4, Math.round(totalH * 0.16));
      const trunkW = stage >= 3 ? 6 : 4;

      // Trunk
      ctx.fillStyle = pal.trunk;
      ctx.fillRect(cx - (trunkW >> 1), baseY - trunkH, trunkW, trunkH + 1);
      ctx.fillStyle = '#382213';
      ctx.fillRect(cx, baseY - trunkH, trunkW >> 1, trunkH + 1);

      // Layered evergreen bough tiers from bottom up
      for (let t = 0; t < numTiers; t++) {
        const frac = t / Math.max(1, numTiers - 1);
        const tierBottom = Math.round(baseY - trunkH + 2 - frac * (totalH - trunkH - 12));
        const tierH = Math.round((totalH * 0.46) * (1 - frac * 0.35));
        const tierW = Math.round(maxW * (1 - frac * 0.56));
        const topY = tierBottom - tierH;

        for (let py = topY; py <= tierBottom; py++) {
          const p = (py - topY) / Math.max(1, tierH);
          let halfSpan = Math.round(p * tierW);
          // Scalloped bough bottom edge
          if (py >= tierBottom - 2) {
            halfSpan = Math.max(1, halfSpan - ((py === tierBottom) ? 1 : 0));
          }
          for (let px = cx - halfSpan; px <= cx + halfSpan; px++) {
            const relX = (px - cx) / Math.max(1, halfSpan);
            const n = hash(px, py, t * 31 + stage * 7);
            // Scallop cutouts along bottom row
            if (py === tierBottom && ((px - cx + 20) % 4 === 0)) continue;

            let col;
            if (px === cx - halfSpan || px === cx + halfSpan || py === topY) {
              col = pal.out;
            } else if (relX < -0.15) {
              col = n > 0.3 ? pal.hi : pal.mid;
            } else if (relX < 0.3) {
              col = n > 0.65 ? pal.hi : (n > 0.2 ? pal.mid : pal.lo);
            } else {
              col = n > 0.35 ? pal.lo : pal.mid;
            }

            // Snow frosting on upper sunlit bough ridges
            if (snowy) {
              const snowLine = p < 0.42 + (relX < 0 ? 0.14 : -0.05) && n > 0.18;
              const edgeSnow = py <= topY + 3 && p < 0.55;
              if ((snowLine || edgeSnow) && px !== cx - halfSpan && px !== cx + halfSpan) {
                col = relX < 0.15 ? '#f5faff' : '#cfe0ed';
              }
            }

            ctx.fillStyle = col;
            ctx.fillRect(px, py, 1, 1);
          }
        }
      }

      // Grand stage subtle golden star/ribbon accent on Snowy Noble Fir
      if (def.id === 'noble' && stage >= 3) {
        const tipY = baseY - totalH;
        ctx.fillStyle = '#ffe275';
        ctx.fillRect(cx - 1, tipY - 2, 2, 2);
      }
    }

    drawCropSoilBed(ctx, cx, baseY, rx, ry, snowy) {
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath();
      ctx.ellipse(cx + 1, baseY + 2, rx + 2, ry + 1, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#5e3f27';
      ctx.beginPath();
      ctx.ellipse(cx, baseY, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#755033';
      ctx.beginPath();
      ctx.ellipse(cx - 1, baseY - 1, Math.max(3, rx - 3), Math.max(2, ry - 2), 0, 0, Math.PI * 2);
      ctx.fill();
      if (snowy) {
        ctx.fillStyle = 'rgba(235, 244, 252, 0.72)';
        ctx.beginPath();
        ctx.ellipse(cx, baseY - 1, Math.max(4, rx - 2), Math.max(2, ry - 2), 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    renderTulipSprite(ctx, stage, snowy) {
      const cx = 32, baseY = 78;
      this.drawCropSoilBed(ctx, cx, baseY, [9, 13, 16, 18, 20][stage], [4, 6, 7, 8, 9][stage], snowy);

      if (stage === 0) {
        ctx.fillStyle = '#4e9139';
        ctx.fillRect(cx - 5, baseY - 5, 2, 5);
        ctx.fillRect(cx, baseY - 6, 2, 6);
        ctx.fillRect(cx + 4, baseY - 4, 2, 4);
        return;
      }

      const spots = stage === 1
        ? [[-6, -1], [-1, 1], [5, -1], [1, -3]]
        : stage === 2
          ? [[-9, 0], [-4, -3], [1, 2], [6, -2], [10, 1], [-2, 3]]
          : stage === 3
            ? [[-11, 1], [-7, -3], [-3, 2], [2, -4], [6, 1], [11, -1], [-1, -1], [4, 3]]
            : [[-13, 1], [-9, -3], [-5, 2], [-1, -5], [3, 0], [7, -3], [12, 1], [-8, 3], [0, 4], [8, 3], [4, -5]];
      const colors = ['#eb4468', '#ffd23f', '#f57eb0', '#ff6b4a', '#b366e8'];
      const stemH = [5, 8, 12, 15, 17][stage];

      spots.forEach(([ox, oy], i) => {
        const x = cx + ox;
        const y = baseY + oy;
        // Crisp green leaves & stem
        ctx.fillStyle = '#2d5e24';
        ctx.fillRect(x - 2, y - Math.floor(stemH * 0.55), 2, Math.floor(stemH * 0.55));
        ctx.fillStyle = '#4f993b';
        ctx.fillRect(x, y - stemH, 2, stemH);
        ctx.fillRect(x + 2, y - Math.floor(stemH * 0.45), 2, Math.floor(stemH * 0.45));

        if (stage >= 2) {
          const col = colors[i % colors.length];
          const budW = stage === 2 ? 3 : 5;
          const budH = stage === 2 ? 4 : 5;
          ctx.fillStyle = '#241a18';
          ctx.fillRect(x - Math.floor(budW / 2) - 1, y - stemH - budH, budW + 2, budH + 1);
          ctx.fillStyle = col;
          ctx.fillRect(x - Math.floor(budW / 2), y - stemH - budH + 1, budW, budH - 1);
          if (stage >= 3) {
            ctx.fillStyle = '#fff5d6';
            ctx.fillRect(x, y - stemH - budH + 1, 1, 2);
          }
          if (snowy) {
            ctx.fillStyle = '#eef6fc';
            ctx.fillRect(x - 1, y - stemH - budH, 3, 2);
          }
        }
      });
    }

    renderStrawberrySprite(ctx, stage, snowy) {
      const cx = 32, baseY = 78;
      this.drawCropSoilBed(ctx, cx, baseY, [10, 14, 17, 19, 21][stage], [5, 6, 8, 9, 10][stage], snowy);

      if (stage === 0) {
        ctx.fillStyle = '#4d913a';
        ctx.fillRect(cx - 4, baseY - 4, 3, 3);
        ctx.fillRect(cx + 2, baseY - 3, 3, 2);
        return;
      }

      // Leafy berry bushes
      const mounds = stage === 1
        ? [[-6, 0, 5], [5, 0, 5], [0, -2, 5]]
        : stage === 2
          ? [[-9, 1, 6], [0, -3, 7], [9, 1, 6], [0, 3, 6]]
          : [[-11, 1, 7], [-4, -4, 7], [5, -3, 7], [11, 1, 7], [-4, 3, 7], [5, 3, 7]];

      for (const [ox, oy, r] of mounds) {
        ctx.fillStyle = '#1f4518';
        ctx.beginPath(); ctx.ellipse(cx + ox, baseY + oy - 2, r + 1, Math.round(r * 0.65) + 1, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#38752a';
        ctx.beginPath(); ctx.ellipse(cx + ox, baseY + oy - 3, r, Math.round(r * 0.65), 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#5da644';
        ctx.beginPath(); ctx.ellipse(cx + ox - 1, baseY + oy - 4, Math.max(2, r - 2), Math.max(2, Math.round(r * 0.45)), 0, 0, Math.PI * 2); ctx.fill();
        if (snowy) {
          ctx.fillStyle = '#edf5fa';
          ctx.fillRect(cx + ox - r + 2, baseY + oy - 6, r * 2 - 4, 2);
        }
      }

      // White blossoms in stage 2+
      if (stage >= 2) {
        const blossoms = [[-9, -4], [0, -7], [8, -4], [-2, 1], [6, 0]];
        for (const [bx, by] of blossoms) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(cx + bx, baseY + by, 2, 2);
          ctx.fillStyle = '#ffd94a';
          ctx.fillRect(cx + bx, baseY + by, 1, 1);
        }
      }

      // Bright juicy strawberries in stage 3 & 4!
      if (stage >= 3) {
        const berries = stage === 3
          ? [[-11, -1], [-4, -5], [5, -4], [11, -1], [-3, 2], [6, 2]]
          : [[-13, 0], [-9, -3], [-4, -6], [1, -2], [6, -5], [12, 0], [-7, 2], [-1, 3], [5, 3], [10, 2]];
        for (const [bx, by] of berries) {
          ctx.fillStyle = '#80171d';
          ctx.fillRect(cx + bx - 1, baseY + by - 1, 4, 4);
          ctx.fillStyle = '#e82c38';
          ctx.fillRect(cx + bx, baseY + by - 1, 3, 3);
          ctx.fillStyle = '#ff8a92';
          ctx.fillRect(cx + bx, baseY + by - 1, 1, 1);
          ctx.fillStyle = '#57a83c';
          ctx.fillRect(cx + bx, baseY + by - 2, 2, 1);
        }
      }
    }

    renderSunflowerSprite(ctx, stage, snowy) {
      const cx = 32, baseY = 78;
      this.drawCropSoilBed(ctx, cx, baseY, [9, 12, 15, 17, 19][stage], [4, 5, 7, 8, 8][stage], snowy);

      if (stage === 0) {
        ctx.fillStyle = '#4e8f35';
        ctx.fillRect(cx - 2, baseY - 6, 2, 6);
        ctx.fillRect(cx - 4, baseY - 6, 6, 2);
        return;
      }

      const stalks = stage === 1
        ? [[-4, 1, 12], [3, -1, 14]]
        : stage === 2
          ? [[-7, 1, 20], [0, -2, 25], [7, 1, 21]]
          : stage === 3
            ? [[-9, 1, 28], [-1, -2, 34], [8, 1, 29], [3, 3, 24]]
            : [[-11, 2, 33], [-5, -2, 41], [3, -3, 44], [11, 1, 35], [1, 3, 30]];

      for (const [ox, oy, h] of stalks) {
        const x = cx + ox;
        const y = baseY + oy;
        // Sturdy stalk + side leaves
        ctx.fillStyle = '#2d5c20';
        ctx.fillRect(x - 1, y - h, 3, h);
        ctx.fillStyle = '#539438';
        ctx.fillRect(x, y - h, 2, h);
        ctx.fillStyle = '#43802b';
        ctx.fillRect(x - 5, y - Math.round(h * 0.5), 4, 3);
        ctx.fillRect(x + 2, y - Math.round(h * 0.35), 4, 3);

        if (stage === 2) {
          ctx.fillStyle = '#4b822d';
          ctx.fillRect(x - 2, y - h - 4, 5, 5);
          ctx.fillStyle = '#ebd04b';
          ctx.fillRect(x - 1, y - h - 4, 3, 2);
        } else if (stage >= 3) {
          const r = stage === 4 ? 6 : 5;
          const hy = y - h - 2;
          // Dark outline + golden petals
          ctx.fillStyle = '#7a4b12';
          ctx.beginPath(); ctx.arc(x + 1, hy, r + 1, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#f5be27';
          ctx.beginPath(); ctx.arc(x + 1, hy, r, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#ffe56b';
          ctx.fillRect(x - r + 2, hy - r + 1, r, 2);
          // Brown seed disc
          ctx.fillStyle = '#4f2c14';
          ctx.beginPath(); ctx.arc(x + 1, hy, Math.max(2, r - 3), 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#754623';
          ctx.fillRect(x, hy - 1, 2, 1);
          if (snowy) {
            ctx.fillStyle = '#edf5fa';
            ctx.fillRect(x - r + 2, hy - r, r * 2 - 2, 2);
          }
        }
      }
    }

    renderAppleTreeSprite(ctx, def, stage, snowy, isPeach = false) {
      const cx = 32, baseY = 78;
      const pal = def.palette;

      const shadowW = [6, 11, 17, 21, 24][stage];
      ctx.fillStyle = 'rgba(0, 0, 0, 0.24)';
      ctx.beginPath();
      ctx.ellipse(cx + 2, baseY + 1, shadowW, Math.round(shadowW * 0.45), 0, 0, Math.PI * 2);
      ctx.fill();

      if (stage === 0) {
        ctx.fillStyle = '#63442a';
        ctx.fillRect(cx - 5, baseY - 1, 10, 4);
        ctx.fillStyle = pal.trunk;
        ctx.fillRect(cx - 1, baseY - 10, 2, 10);
        ctx.fillStyle = pal.hi;
        ctx.fillRect(cx - 3, baseY - 12, 6, 4);
        return;
      }

      const trunkH = [8, 12, 17, 21, 24][stage];
      const trunkW = stage >= 3 ? 6 : 4;
      const crownR = [5, 10, 15, 19, 22][stage];
      const crownY = baseY - trunkH - Math.round(crownR * 0.55);

      // Trunk + small fork branches
      ctx.fillStyle = pal.trunk;
      ctx.fillRect(cx - (trunkW >> 1), baseY - trunkH, trunkW, trunkH + 1);
      ctx.fillStyle = '#402614';
      ctx.fillRect(cx, baseY - trunkH, trunkW >> 1, trunkH + 1);

      // Rounded leafy orchard canopy (3 overlapping pixel-dithered puffs)
      const puffs = [
        [0, 0, crownR],
        [-Math.round(crownR * 0.45), Math.round(crownR * 0.18), Math.round(crownR * 0.72)],
        [Math.round(crownR * 0.45), Math.round(crownR * 0.15), Math.round(crownR * 0.72)],
        [0, -Math.round(crownR * 0.35), Math.round(crownR * 0.75)]
      ];

      for (const [px, py, r] of puffs) {
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            const d2 = dx * dx + dy * dy;
            if (d2 > r * r) continue;
            const x = cx + px + dx;
            const y = crownY + py + dy;
            const edge = d2 > (r - 1.2) * (r - 1.2);
            const n = hash(x, y, stage * 19 + 7);
            let col;
            if (edge) col = pal.out;
            else if (dx + dy < -r * 0.25) col = n > 0.25 ? pal.hi : pal.mid;
            else if (dx + dy < r * 0.35) col = n > 0.65 ? pal.hi : (n > 0.2 ? pal.mid : pal.lo);
            else col = n > 0.3 ? pal.lo : pal.mid;

            if (snowy && dy < -r * 0.15 && !edge && n > 0.18) {
              col = dx < 2 ? '#f5faff' : '#cfe0ed';
            }
            ctx.fillStyle = col;
            ctx.fillRect(x, y, 1, 1);
          }
        }
      }

      // Stage 2: pale pink blossoms; Stage 3 & 4: apples or golden-blush peaches!
      if (stage === 2 && !snowy) {
        const blossoms = [[-7, -3], [4, -6], [8, 2], [-3, 4], [1, -1]];
        for (const [bx, by] of blossoms) {
          ctx.fillStyle = isPeach ? '#ffb8d2' : '#ffd6e2';
          ctx.fillRect(cx + bx, crownY + by, 2, 2);
        }
      } else if (stage >= 3) {
        const fruits = stage === 3
          ? [[-10, 1], [-4, -7], [5, -6], [11, 2], [-2, 4], [5, 5], [-8, -5]]
          : [[-13, 2], [-8, -6], [-1, -10], [7, -7], [13, 1], [-10, 7], [-3, 5], [4, 7], [10, 6], [1, -1], [-5, 0]];
        for (const [ax, ay] of fruits) {
          if (isPeach) {
            ctx.fillStyle = '#8c3b1c';
            ctx.fillRect(cx + ax - 1, crownY + ay - 1, 4, 4);
            ctx.fillStyle = '#ff9a52';
            ctx.fillRect(cx + ax, crownY + ay - 1, 3, 3);
            ctx.fillStyle = '#ffe285';
            ctx.fillRect(cx + ax, crownY + ay - 1, 2, 1);
            ctx.fillStyle = '#e84c4c';
            ctx.fillRect(cx + ax + 1, crownY + ay + 1, 2, 1);
          } else {
            ctx.fillStyle = '#6e1414';
            ctx.fillRect(cx + ax - 1, crownY + ay - 1, 4, 4);
            ctx.fillStyle = '#e6332c';
            ctx.fillRect(cx + ax, crownY + ay - 1, 3, 3);
            ctx.fillStyle = '#ffd180';
            ctx.fillRect(cx + ax, crownY + ay - 1, 1, 1);
          }
        }
      }
    }

    renderPumpkinSprite(ctx, stage, snowy) {
      const cx = 32, baseY = 78;
      this.drawCropSoilBed(ctx, cx, baseY, [10, 15, 18, 20, 22][stage], [5, 7, 8, 9, 10][stage], snowy);

      if (stage === 0) {
        ctx.fillStyle = '#4e9137';
        ctx.fillRect(cx - 2, baseY - 5, 2, 5);
        ctx.fillRect(cx - 4, baseY - 5, 6, 2);
        return;
      }

      // Curling green pumpkin vines & broad leaves
      ctx.strokeStyle = '#336b24';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx - 12, baseY + 1);
      ctx.quadraticCurveTo(cx - 4, baseY - 6, cx + 2, baseY + 1);
      ctx.quadraticCurveTo(cx + 8, baseY + 5, cx + 14, baseY - 1);
      ctx.stroke();

      const leaves = stage === 1
        ? [[-7, -1], [0, -3], [7, 0]]
        : [[-13, 0], [-6, -4], [2, -5], [10, -2], [-8, 3], [6, 3]];
      for (const [lx, ly] of leaves) {
        ctx.fillStyle = '#24521a';
        ctx.fillRect(cx + lx - 3, baseY + ly - 2, 7, 5);
        ctx.fillStyle = '#4e9638';
        ctx.fillRect(cx + lx - 2, baseY + ly - 2, 5, 3);
      }

      if (stage === 2) {
        // Yellow squash blossoms & tiny green gourds
        ctx.fillStyle = '#ffd43b';
        ctx.fillRect(cx - 6, baseY - 4, 3, 3);
        ctx.fillRect(cx + 7, baseY - 2, 3, 3);
        ctx.fillStyle = '#7bb344';
        ctx.fillRect(cx - 1, baseY - 3, 5, 4);
      } else if (stage >= 3) {
        const pumpkins = stage === 3
          ? [[-7, -1, 6, 5], [6, 0, 5, 4]]
          : [[-9, 1, 6, 5], [9, 1, 6, 5], [0, -2, 8, 7]];
        for (const [px, py, rx, ry] of pumpkins) {
          const x = cx + px;
          const y = baseY + py - ry + 2;
          // Outline
          ctx.fillStyle = '#5e2809';
          ctx.beginPath(); ctx.ellipse(x, y, rx + 1, ry + 1, 0, 0, Math.PI * 2); ctx.fill();
          // Main plump orange body
          ctx.fillStyle = '#eb771c';
          ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
          // Vertical ribs
          ctx.fillStyle = '#c4560e';
          ctx.fillRect(x - Math.round(rx * 0.45), y - ry + 1, 1, ry * 2 - 2);
          ctx.fillRect(x + Math.round(rx * 0.4), y - ry + 1, 1, ry * 2 - 2);
          // Sunlit highlight
          ctx.fillStyle = '#ffa940';
          ctx.fillRect(x - 2, y - ry + 2, 3, Math.max(2, ry - 2));
          // Sturdy stem
          ctx.fillStyle = '#4c6b27';
          ctx.fillRect(x - 1, y - ry - 3, 2, 4);
          ctx.fillRect(x, y - ry - 4, 2, 2);
          if (snowy) {
            ctx.fillStyle = '#f2f8fc';
            ctx.fillRect(x - rx + 2, y - ry, rx * 2 - 4, 2);
          }
        }
      }
    }

    renderBlueberrySprite(ctx, stage, snowy) {
      const cx = 32, baseY = 78;
      this.drawCropSoilBed(ctx, cx, baseY, [9, 13, 16, 18, 20][stage], [4, 6, 7, 8, 9][stage], snowy);

      if (stage === 0) {
        ctx.fillStyle = '#5c4128';
        ctx.fillRect(cx - 1, baseY - 6, 2, 6);
        ctx.fillStyle = '#4e9144';
        ctx.fillRect(cx - 3, baseY - 7, 6, 3);
        return;
      }

      // Woody shrub stems underneath the foliage
      ctx.fillStyle = '#5c4128';
      ctx.fillRect(cx - 4, baseY - 6, 2, 6);
      ctx.fillRect(cx + 2, baseY - 6, 2, 6);

      // Rounded orchard blueberry bush canopy clusters
      const clusters = stage === 1
        ? [[-4, -7, 5], [4, -7, 5], [0, -10, 6]]
        : stage === 2
          ? [[-7, -9, 7], [7, -9, 7], [0, -13, 8], [0, -6, 7]]
          : stage === 3
            ? [[-9, -10, 8], [9, -10, 8], [-4, -15, 8], [5, -15, 8], [0, -8, 9]]
            : [[-11, -10, 9], [11, -10, 9], [-5, -17, 9], [6, -17, 9], [0, -20, 8], [0, -9, 10]];

      for (const [ox, oy, r] of clusters) {
        ctx.fillStyle = '#15301a';
        ctx.beginPath(); ctx.ellipse(cx + ox, baseY + oy, r + 1, Math.round(r * 0.78) + 1, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#2d6336';
        ctx.beginPath(); ctx.ellipse(cx + ox, baseY + oy - 1, r, Math.round(r * 0.78), 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#4f8f4d';
        ctx.beginPath(); ctx.ellipse(cx + ox - 1, baseY + oy - 2, Math.max(2, r - 2), Math.max(2, Math.round(r * 0.52)), 0, 0, Math.PI * 2); ctx.fill();
        if (snowy && oy <= -12) {
          ctx.fillStyle = '#eef6fc';
          ctx.fillRect(cx + ox - r + 2, baseY + oy - Math.round(r * 0.7), r * 2 - 4, 2);
        }
      }

      // Delicate pale-white bell blossoms in stage 2
      if (stage === 2 && !snowy) {
        const blossoms = [[-8, -11], [0, -16], [7, -10], [-3, -7], [4, -14]];
        for (const [bx, by] of blossoms) {
          ctx.fillStyle = '#f7f9ff';
          ctx.fillRect(cx + bx, baseY + by, 2, 2);
          ctx.fillStyle = '#dce6ff';
          ctx.fillRect(cx + bx + 1, baseY + by + 1, 1, 1);
        }
      }

      // Plump indigo/cobalt blueberry clusters in stage 3 & 4!
      if (stage >= 3) {
        const berries = stage === 3
          ? [[-10, -11], [-5, -16], [4, -16], [10, -10], [-3, -8], [5, -8], [0, -12]]
          : [[-13, -11], [-9, -16], [-3, -21], [4, -20], [10, -15], [13, -10], [-7, -8], [-1, -13], [6, -12], [1, -7], [8, -7], [-11, -7]];
        for (const [bx, by] of berries) {
          // Pair of clustered blueberries
          ctx.fillStyle = '#182459';
          ctx.fillRect(cx + bx - 1, baseY + by - 1, 4, 4);
          ctx.fillStyle = '#385ed4';
          ctx.fillRect(cx + bx, baseY + by - 1, 3, 3);
          ctx.fillStyle = '#9cc2ff';
          ctx.fillRect(cx + bx, baseY + by - 1, 1, 1);
        }
      }
    }

    renderDaffodilSprite(ctx, stage, snowy) {
      const cx = 32, baseY = 78;
      this.drawCropSoilBed(ctx, cx, baseY, [9, 13, 16, 18, 19][stage], [4, 6, 7, 8, 9][stage], snowy);
      if (stage === 0) {
        ctx.fillStyle = '#53993a';
        ctx.fillRect(cx - 4, baseY - 5, 2, 5);
        ctx.fillRect(cx + 2, baseY - 6, 2, 6);
        return;
      }
      const spots = stage === 1
        ? [[-6, 0], [0, -2], [6, 0]]
        : stage === 2
          ? [[-9, 0], [-3, -3], [3, 1], [9, -1], [0, 3]]
          : [[-11, 1], [-6, -3], [-1, 2], [4, -4], [10, 0], [-4, 3], [5, 3], [0, -1], [8, -3]];
      const h = [5, 9, 12, 15, 17][stage];
      for (const [ox, oy] of spots) {
        const x = cx + ox, y = baseY + oy;
        ctx.fillStyle = '#336b24';
        ctx.fillRect(x - 1, y - h, 2, h);
        ctx.fillStyle = '#5da641';
        ctx.fillRect(x, y - h, 2, h);
        if (stage >= 2) {
          const r = stage >= 3 ? 3 : 2;
          ctx.fillStyle = '#c49014';
          ctx.fillRect(x - r, y - h - r, r * 2 + 1, r * 2);
          ctx.fillStyle = '#ffe548';
          ctx.fillRect(x - r + 1, y - h - r, r * 2 - 1, r * 2 - 1);
          if (stage >= 3) {
            ctx.fillStyle = '#ff981a';
            ctx.fillRect(x - 1, y - h - 2, 2, 2);
          }
          if (snowy) {
            ctx.fillStyle = '#eef6fc';
            ctx.fillRect(x - 1, y - h - r, 3, 1);
          }
        }
      }
    }

    renderLavenderSprite(ctx, stage, snowy) {
      const cx = 32, baseY = 78;
      this.drawCropSoilBed(ctx, cx, baseY, [10, 14, 17, 19, 21][stage], [4, 6, 8, 9, 10][stage], snowy);
      if (stage === 0) {
        ctx.fillStyle = '#6c9460';
        ctx.fillRect(cx - 5, baseY - 4, 2, 4);
        ctx.fillRect(cx, baseY - 5, 2, 5);
        ctx.fillRect(cx + 5, baseY - 4, 2, 4);
        return;
      }
      const tufts = stage === 1
        ? [[-6, 0], [0, -2], [6, 0]]
        : stage === 2
          ? [[-9, 1], [-3, -3], [4, -2], [10, 1], [0, 3]]
          : [[-12, 1], [-7, -3], [-2, 1], [3, -4], [8, -1], [13, 1], [-8, 3], [-1, 4], [6, 3], [1, -1]];
      const h = [5, 9, 14, 19, 22][stage];
      for (const [ox, oy] of tufts) {
        const x = cx + ox, y = baseY + oy;
        // Silvery-green aromatic foliage & slender stems
        ctx.fillStyle = '#476b43';
        ctx.fillRect(x - 2, y - 5, 5, 5);
        ctx.fillStyle = '#6f9c68';
        ctx.fillRect(x, y - h, 2, h);
        if (stage >= 2) {
          const spH = stage === 2 ? 5 : (stage === 3 ? 9 : 11);
          ctx.fillStyle = '#4f2c8c';
          ctx.fillRect(x - 1, y - h - spH + 3, 4, spH);
          ctx.fillStyle = '#925ee0';
          ctx.fillRect(x - 1, y - h - spH + 2, 3, spH - 1);
          ctx.fillStyle = '#cfaeff';
          ctx.fillRect(x, y - h - spH + 2, 2, Math.max(2, spH - 4));
          if (snowy) {
            ctx.fillStyle = '#edf5fa';
            ctx.fillRect(x - 1, y - h - spH + 1, 3, 2);
          }
        }
      }
    }

    renderBerryBushSprite(ctx, stage, snowy, colors) {
      const cx = 32, baseY = 78;
      this.drawCropSoilBed(ctx, cx, baseY, [9, 13, 16, 18, 20][stage], [4, 6, 7, 8, 9][stage], snowy);
      if (stage === 0) {
        ctx.fillStyle = '#5c4128';
        ctx.fillRect(cx - 1, baseY - 6, 2, 6);
        ctx.fillStyle = colors.leafHi;
        ctx.fillRect(cx - 3, baseY - 7, 6, 3);
        return;
      }
      ctx.fillStyle = '#543921';
      ctx.fillRect(cx - 5, baseY - 7, 2, 7);
      ctx.fillRect(cx + 3, baseY - 7, 2, 7);
      const clusters = stage === 1
        ? [[-5, -7, 5], [5, -7, 5], [0, -10, 6]]
        : stage === 2
          ? [[-8, -9, 7], [8, -9, 7], [0, -14, 8], [0, -6, 7]]
          : stage === 3
            ? [[-10, -10, 8], [10, -10, 8], [-4, -16, 8], [5, -16, 8], [0, -9, 9]]
            : [[-12, -10, 9], [12, -10, 9], [-5, -17, 9], [6, -17, 9], [0, -21, 8], [0, -9, 10]];
      for (const [ox, oy, r] of clusters) {
        ctx.fillStyle = '#122914';
        ctx.beginPath(); ctx.ellipse(cx + ox, baseY + oy, r + 1, Math.round(r * 0.78) + 1, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = colors.leafLo;
        ctx.beginPath(); ctx.ellipse(cx + ox, baseY + oy - 1, r, Math.round(r * 0.78), 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = colors.leafHi;
        ctx.beginPath(); ctx.ellipse(cx + ox - 1, baseY + oy - 2, Math.max(2, r - 2), Math.max(2, Math.round(r * 0.52)), 0, 0, Math.PI * 2); ctx.fill();
        if (snowy && oy <= -12) {
          ctx.fillStyle = '#eef6fc';
          ctx.fillRect(cx + ox - r + 2, baseY + oy - Math.round(r * 0.7), r * 2 - 4, 2);
        }
      }
      if (stage === 2 && !snowy) {
        for (const [bx, by] of [[-7, -11], [0, -16], [7, -10], [-2, -7], [4, -14]]) {
          ctx.fillStyle = '#fff5fa';
          ctx.fillRect(cx + bx, baseY + by, 2, 2);
        }
      }
      if (stage >= 3) {
        const berries = stage === 3
          ? [[-10, -11], [-5, -16], [4, -16], [10, -10], [-3, -8], [5, -8], [0, -12]]
          : [[-13, -11], [-9, -16], [-3, -21], [4, -20], [10, -15], [13, -10], [-7, -8], [-1, -13], [6, -12], [1, -7], [8, -7], [-11, -7]];
        for (const [bx, by] of berries) {
          ctx.fillStyle = colors.dark;
          ctx.fillRect(cx + bx - 1, baseY + by - 1, 4, 4);
          ctx.fillStyle = colors.mid;
          ctx.fillRect(cx + bx, baseY + by - 1, 3, 3);
          ctx.fillStyle = colors.hi;
          ctx.fillRect(cx + bx, baseY + by - 1, 1, 1);
        }
      }
    }

    renderMumsSprite(ctx, stage, snowy) {
      const cx = 32, baseY = 78;
      this.drawCropSoilBed(ctx, cx, baseY, [10, 14, 17, 19, 21][stage], [5, 6, 8, 9, 10][stage], snowy);
      if (stage === 0) {
        ctx.fillStyle = '#4c8734';
        ctx.fillRect(cx - 3, baseY - 4, 6, 4);
        return;
      }
      const mounds = stage === 1
        ? [[-6, 0, 5], [5, 0, 5], [0, -3, 6]]
        : [[-9, 1, 7], [9, 1, 7], [0, -3, 9]];
      const palettes = [
        ['#992919', '#e05a2b', '#ff9f45'],
        ['#946312', '#e8a825', '#ffe169'],
        ['#691930', '#ad2b4e', '#f07195']
      ];
      mounds.forEach(([ox, oy, r], idx) => {
        const rr = stage >= 4 ? r + 2 : (stage === 3 ? r + 1 : r);
        ctx.fillStyle = '#1b3d16';
        ctx.beginPath(); ctx.ellipse(cx + ox, baseY + oy - 3, rr + 1, Math.round(rr * 0.72) + 1, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#3b6e29';
        ctx.beginPath(); ctx.ellipse(cx + ox, baseY + oy - 4, rr, Math.round(rr * 0.72), 0, 0, Math.PI * 2); ctx.fill();
        if (stage >= 2) {
          const pal = palettes[idx % palettes.length];
          const density = stage === 2 ? 5 : (stage === 3 ? 10 : 16);
          for (let i = 0; i < density; i++) {
            const ang = (Math.PI * 2 * i) / density + idx;
            const dist = (i % 3 === 0 ? 0.25 : 0.65) * rr;
            const fx = Math.round(cx + ox + Math.cos(ang) * dist);
            const fy = Math.round(baseY + oy - 5 + Math.sin(ang) * dist * 0.65);
            ctx.fillStyle = pal[0];
            ctx.fillRect(fx - 1, fy - 1, 3, 3);
            ctx.fillStyle = pal[1];
            ctx.fillRect(fx - 1, fy - 1, 2, 2);
            if (stage >= 3) {
              ctx.fillStyle = pal[2];
              ctx.fillRect(fx, fy - 1, 1, 1);
            }
          }
        }
        if (snowy) {
          ctx.fillStyle = '#eef6fc';
          ctx.fillRect(cx + ox - rr + 2, baseY + oy - Math.round(rr * 0.75) - 3, rr * 2 - 4, 2);
        }
      });
    }

    buildBuildings() {
      for (const id of PT.BUILDING_ORDER) {
        this.buildings[id] = { normal: this.renderBuilding(id, false), snow: this.renderBuilding(id, true) };
      }
    }

    renderBuilding(id, snow) {
      const { c, ctx } = makeCanvas(80, 96);
      const cx = 40;
      const by = 78;

      // Ground shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
      ctx.beginPath();
      ctx.ellipse(cx + 2, by - 4, 28, 13, 0, 0, Math.PI * 2);
      ctx.fill();

      if (id === 'checkout') {
        // Timber Saw & Checkout Shed
        drawIsoBox(ctx, cx, by, 24, 12, 20, {
          top: '#8c633e', left: '#a67a51', right: '#785233'
        });
        drawPitchedRoof(ctx, cx, by - 31, 26, 13, 13, {
          left: '#4f7a53', right: '#355739', gable: '#785233'
        }, snow);
        // Service window + glowing warm interior
        ctx.fillStyle = '#ffe594';
        ctx.fillRect(cx - 17, by - 21, 9, 7);
        ctx.strokeStyle = '#3b2514';
        ctx.strokeRect(cx - 17, by - 21, 9, 7);
        // Counter shelf
        ctx.fillStyle = '#5c3c22';
        ctx.fillRect(cx - 19, by - 14, 12, 3);
        // Stacked cut logs outside right wall
        ctx.fillStyle = '#6b4528';
        ctx.fillRect(cx + 8, by - 10, 10, 6);
        ctx.fillStyle = '#d9b584';
        ctx.fillRect(cx + 9, by - 9, 2, 2);
        ctx.fillRect(cx + 13, by - 9, 2, 2);
        ctx.fillRect(cx + 11, by - 6, 2, 2);
        // Red roof sign badge
        ctx.fillStyle = '#b53a30';
        ctx.fillRect(cx - 11, by - 30, 14, 5);
        ctx.fillStyle = '#fff3cc';
        ctx.fillRect(cx - 9, by - 28, 10, 1);
      } else if (id === 'cocoa') {
        // Hot Cocoa Stand — classic striped RCT stall!
        drawIsoBox(ctx, cx, by, 20, 10, 19, {
          top: '#7d5434', left: '#9e6d45', right: '#6e492b'
        });
        drawPitchedRoof(ctx, cx, by - 28, 22, 11, 11, {
          left: '#c93832', right: '#912420', gable: '#f5efe1'
        }, snow);
        // Red & white striped awning trim along front-left eave
        for (let i = 0; i < 4; i++) {
          ctx.fillStyle = (i % 2 === 0) ? '#f5efe1' : '#c93832';
          ctx.fillRect(cx - 20 + i * 5, by - 28 + Math.round(i * 2.5), 5, 4);
        }
        // Cozy cocoa counter & glowing mug icon
        ctx.fillStyle = '#ffdf85';
        ctx.fillRect(cx - 14, by - 19, 10, 7);
        ctx.fillStyle = '#472816';
        ctx.fillRect(cx - 11, by - 16, 4, 4);
        // Giant rooftop steaming cocoa mug sign
        ctx.fillStyle = '#c93832';
        ctx.fillRect(cx - 5, by - 50, 10, 9);
        ctx.fillStyle = '#fff5e1';
        ctx.fillRect(cx - 4, by - 51, 8, 2);
        ctx.strokeStyle = '#331c13';
        ctx.strokeRect(cx - 5, by - 50, 10, 9);
      } else if (id === 'cider') {
        // Cider & Donut Shack
        drawIsoBox(ctx, cx, by, 21, 10, 19, {
          top: '#a87d43', left: '#bf9254', right: '#8c6634'
        });
        drawPitchedRoof(ctx, cx, by - 28, 23, 11, 11, {
          left: '#b85c28', right: '#873e16', gable: '#8c6634'
        }, snow);
        // Warm service window
        ctx.fillStyle = '#ffe599';
        ctx.fillRect(cx - 14, by - 19, 10, 7);
        ctx.strokeStyle = '#3b2412';
        ctx.strokeRect(cx - 14, by - 19, 10, 7);
        // Apple cider wooden barrel on right
        ctx.fillStyle = '#734726';
        ctx.fillRect(cx + 8, by - 12, 8, 10);
        ctx.fillStyle = '#383838';
        ctx.fillRect(cx + 8, by - 10, 8, 1);
        ctx.fillRect(cx + 8, by - 5, 8, 1);
        // Donut rooftop sign
        ctx.fillStyle = '#d99848';
        ctx.beginPath();
        ctx.arc(cx, by - 46, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#e86888';
        ctx.beginPath();
        ctx.arc(cx, by - 46, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#331f10';
        ctx.fillRect(cx - 1, by - 47, 2, 2);
      } else if (id === 'wreath') {
        // Barn-red Wreath & Garland Barn
        drawIsoBox(ctx, cx, by, 24, 12, 22, {
          top: '#8c312b', left: '#ad3e36', right: '#7d2923'
        });
        drawPitchedRoof(ctx, cx, by - 33, 26, 13, 14, {
          left: '#575e66', right: '#3b4147', gable: '#94322b'
        }, snow);
        // White barn X-door
        ctx.fillStyle = '#5e211c';
        ctx.fillRect(cx + 5, by - 18, 11, 12);
        ctx.strokeStyle = '#f0e9d8';
        ctx.strokeRect(cx + 5, by - 18, 11, 12);
        // Big evergreen wreath with red bow on left wall
        ctx.fillStyle = '#2d6e3a';
        ctx.beginPath();
        ctx.arc(cx - 12, by - 18, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ad3e36';
        ctx.beginPath();
        ctx.arc(cx - 12, by - 18, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#eb3b34';
        ctx.fillRect(cx - 14, by - 13, 4, 3);
      } else if (id === 'firepit') {
        // Stone Fire Pit with crossed logs & cozy benches
        // Bench snippets
        ctx.fillStyle = '#7d5533';
        ctx.fillRect(cx - 21, by - 11, 10, 4);
        ctx.fillRect(cx + 11, by - 11, 10, 4);
        // Stone ring
        const stones = [
          [-10, -4], [-6, -8], [0, -9], [6, -8], [10, -4],
          [7, 0], [0, 2], [-7, 0]
        ];
        for (const [sx, sy] of stones) {
          ctx.fillStyle = '#787e85';
          ctx.fillRect(cx + sx - 3, by - 7 + sy, 6, 5);
          ctx.fillStyle = '#a3aab2';
          ctx.fillRect(cx + sx - 2, by - 7 + sy, 3, 2);
        }
        // Glowing coals & logs
        ctx.fillStyle = '#522e19';
        ctx.fillRect(cx - 5, by - 10, 10, 4);
        ctx.fillStyle = '#ff6b1c';
        ctx.fillRect(cx - 4, by - 12, 8, 5);
        ctx.fillStyle = '#ffd54a';
        ctx.fillRect(cx - 2, by - 15, 4, 5);
      } else if (id === 'reindeer') {
        // Wooden Reindeer Corral Pen + cute pixel reindeer
        // Back fence rails
        ctx.strokeStyle = '#734c2b';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx - 24, by - 14);
        ctx.lineTo(cx, by - 26);
        ctx.lineTo(cx + 24, by - 14);
        ctx.stroke();
        // Hay pile
        ctx.fillStyle = '#d9b54a';
        ctx.fillRect(cx + 5, by - 18, 9, 6);
        ctx.fillStyle = '#f0cf69';
        ctx.fillRect(cx + 6, by - 19, 6, 3);
        // Reindeer 1
        this.drawPixelReindeer(ctx, cx - 7, by - 10, true);
        // Reindeer 2
        this.drawPixelReindeer(ctx, cx + 6, by - 5, false);
        // Front fence posts & rails
        ctx.strokeStyle = '#8c5e36';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx - 24, by - 14);
        ctx.lineTo(cx, by - 2);
        ctx.lineTo(cx + 24, by - 14);
        ctx.stroke();
        const posts = [[-24, -14], [-12, -8], [0, -2], [12, -8], [24, -14], [0, -26]];
        ctx.fillStyle = '#59391e';
        for (const [px, py] of posts) {
          ctx.fillRect(cx + px - 1, by + py - 7, 3, 9);
        }
      } else if (id === 'santa') {
        // Santa's Photo Cabin — grand festive log cabin
        drawIsoBox(ctx, cx, by, 26, 13, 24, {
          top: '#80522e', left: '#9c663b', right: '#6e4525'
        });
        drawPitchedRoof(ctx, cx, by - 36, 28, 14, 15, {
          left: '#bd2f2a', right: '#851e1b', gable: '#8a5832'
        }, snow);
        // Candy cane striped porch posts
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(cx - 22, by - 22, 3, 14);
        ctx.fillStyle = '#d62f29';
        ctx.fillRect(cx - 22, by - 20, 3, 3);
        ctx.fillRect(cx - 22, by - 14, 3, 3);
        // Warm glowing holiday windows
        ctx.fillStyle = '#ffe88a';
        ctx.fillRect(cx - 15, by - 22, 8, 8);
        ctx.fillRect(cx + 7, by - 22, 8, 8);
        ctx.strokeStyle = '#4a2912';
        ctx.strokeRect(cx - 15, by - 22, 8, 8);
        ctx.strokeRect(cx + 7, by - 22, 8, 8);
        // Golden star on gable
        ctx.fillStyle = '#ffe359';
        ctx.fillRect(cx + 12, by - 45, 4, 4);
        ctx.fillRect(cx + 13, by - 47, 2, 8);
        ctx.fillRect(cx + 10, by - 44, 8, 2);
        // Chimney
        ctx.fillStyle = '#8a3932';
        ctx.fillRect(cx - 16, by - 58, 7, 13);
        ctx.fillStyle = snow ? '#f2f8fc' : '#5e231e';
        ctx.fillRect(cx - 17, by - 59, 9, 3);
      }

      return c;
    }

    drawPixelReindeer(ctx, x, y, redNose) {
      // Legs
      ctx.fillStyle = '#5c3b21';
      ctx.fillRect(x - 4, y - 3, 2, 4);
      ctx.fillRect(x + 2, y - 3, 2, 4);
      // Body
      ctx.fillStyle = '#8c5e38';
      ctx.fillRect(x - 5, y - 8, 10, 5);
      // Head
      ctx.fillStyle = '#9e6d44';
      ctx.fillRect(x - 8, y - 12, 5, 5);
      // Antlers
      ctx.fillStyle = '#d9c298';
      ctx.fillRect(x - 7, y - 16, 1, 4);
      ctx.fillRect(x - 5, y - 15, 1, 3);
      ctx.fillRect(x - 8, y - 15, 2, 1);
      // Nose
      ctx.fillStyle = redNose ? '#ff332b' : '#26180f';
      ctx.fillRect(x - 9, y - 10, 2, 2);
    }

    buildDecor() {
      // Lantern Post
      {
        const { c, ctx } = makeCanvas(64, 64);
        const cx = 32, by = 48;
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.fillRect(cx - 4, by - 1, 8, 3);
        ctx.fillStyle = '#2d3338';
        ctx.fillRect(cx - 1, by - 26, 3, 26);
        ctx.fillRect(cx - 4, by - 2, 9, 3);
        // Pine garland wrap
        ctx.fillStyle = '#2f6e3b';
        ctx.fillRect(cx - 3, by - 18, 7, 3);
        ctx.fillStyle = '#d43630';
        ctx.fillRect(cx - 1, by - 17, 3, 2);
        // Lantern glow box
        ctx.fillStyle = '#fff0a6';
        ctx.fillRect(cx - 3, by - 31, 7, 6);
        ctx.fillStyle = '#2d3338';
        ctx.fillRect(cx - 4, by - 33, 9, 2);
        this.decor.lantern = c;
      }

      // Split-Rail Fence
      {
        const { c, ctx } = makeCanvas(64, 48);
        const cx = 32, by = 34;
        ctx.fillStyle = '#5c3b22';
        ctx.fillRect(cx - 14, by - 13, 3, 11);
        ctx.fillRect(cx, by - 6, 3, 11);
        ctx.fillRect(cx + 12, by - 13, 3, 11);
        ctx.strokeStyle = '#8c5f38';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx - 13, by - 11); ctx.lineTo(cx + 1, by - 4); ctx.lineTo(cx + 13, by - 11);
        ctx.moveTo(cx - 13, by - 6);  ctx.lineTo(cx + 1, by + 1); ctx.lineTo(cx + 13, by - 6);
        ctx.stroke();
        this.decor.fence = c;
      }

      // Wooden Bench
      {
        const { c, ctx } = makeCanvas(64, 48);
        const cx = 32, by = 34;
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.fillRect(cx - 10, by - 2, 20, 4);
        ctx.fillStyle = '#47301e';
        ctx.fillRect(cx - 9, by - 6, 2, 6);
        ctx.fillRect(cx + 7, by - 6, 2, 6);
        ctx.fillStyle = '#996a40';
        ctx.fillRect(cx - 10, by - 9, 20, 4);
        ctx.fillStyle = '#805631';
        ctx.fillRect(cx - 10, by - 14, 20, 4);
        this.decor.bench = c;
      }

      // Festive Snowman
      {
        const { c, ctx } = makeCanvas(64, 56);
        const cx = 32, by = 42;
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.fillRect(cx - 7, by - 1, 14, 4);
        // Bottom snow ball
        ctx.fillStyle = '#dbe8f2';
        ctx.beginPath(); ctx.arc(cx, by - 6, 7, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(cx - 1, by - 7, 5, 0, Math.PI * 2); ctx.fill();
        // Middle ball
        ctx.fillStyle = '#e5f0f7';
        ctx.beginPath(); ctx.arc(cx, by - 15, 5, 0, Math.PI * 2); ctx.fill();
        // Red scarf
        ctx.fillStyle = '#cf352e';
        ctx.fillRect(cx - 5, by - 20, 10, 3);
        ctx.fillRect(cx + 2, by - 18, 3, 5);
        // Head
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(cx, by - 23, 4, 0, Math.PI * 2); ctx.fill();
        // Carrot nose & eyes
        ctx.fillStyle = '#eb7c23';
        ctx.fillRect(cx + 1, by - 23, 4, 2);
        ctx.fillStyle = '#1f2326';
        ctx.fillRect(cx - 2, by - 25, 1, 1);
        ctx.fillRect(cx + 1, by - 25, 1, 1);
        // Top hat
        ctx.fillStyle = '#24292e';
        ctx.fillRect(cx - 5, by - 27, 10, 2);
        ctx.fillRect(cx - 3, by - 32, 6, 5);
        this.decor.snowman = c;
      }

      // Farm Entrance Arch Gate
      {
        const { c, ctx } = makeCanvas(80, 96);
        const cx = 40, by = 78;
        // Two hefty timber pillars
        ctx.fillStyle = '#5e3c21';
        ctx.fillRect(cx - 22, by - 40, 7, 36);
        ctx.fillRect(cx + 15, by - 40, 7, 36);
        ctx.fillStyle = '#855834';
        ctx.fillRect(cx - 22, by - 40, 4, 36);
        ctx.fillRect(cx + 15, by - 40, 4, 36);
        // Overhead timber header sign
        ctx.fillStyle = '#305936';
        ctx.fillRect(cx - 25, by - 48, 50, 12);
        ctx.strokeStyle = '#d9b56c';
        ctx.lineWidth = 2;
        ctx.strokeRect(cx - 24, by - 47, 48, 10);
        // Festive garland & tiny red berries
        ctx.fillStyle = '#3f8a4c';
        ctx.fillRect(cx - 25, by - 37, 50, 3);
        ctx.fillStyle = '#e03b34';
        for (let i = -20; i <= 20; i += 8) {
          ctx.fillRect(cx + i, by - 36, 2, 2);
        }
        // Hanging warm lanterns on pillars
        ctx.fillStyle = '#ffe98c';
        ctx.fillRect(cx - 17, by - 26, 4, 5);
        ctx.fillRect(cx + 13, by - 26, 4, 5);
        this.decor.gate = c;
      }

      // Golden Hay Bales + Harvest Pumpkin
      {
        const { c, ctx } = makeCanvas(64, 48);
        const cx = 32, by = 34;
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.fillRect(cx - 13, by - 2, 26, 5);
        // Bottom two hay bales
        drawIsoBox(ctx, cx - 5, by + 1, 9, 5, 7, { top: '#f0ce60', left: '#d9b143', right: '#b38c2b', outline: '#5c4314' });
        drawIsoBox(ctx, cx + 6, by + 1, 9, 5, 7, { top: '#ebd06a', left: '#cfa83c', right: '#a68226', outline: '#5c4314' });
        // Top hay bale
        drawIsoBox(ctx, cx, by - 6, 8, 4, 6, { top: '#f5da78', left: '#deb647', right: '#ba922f', outline: '#5c4314' });
        // Twine ties
        ctx.fillStyle = '#734b1e';
        ctx.fillRect(cx - 3, by - 12, 1, 7);
        ctx.fillRect(cx + 3, by - 12, 1, 7);
        // Cute harvest pumpkin perched on top
        ctx.fillStyle = '#5e2809';
        ctx.beginPath(); ctx.ellipse(cx + 1, by - 16, 5, 4, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#eb771c';
        ctx.beginPath(); ctx.ellipse(cx + 1, by - 16, 4, 3, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#4c6b27';
        ctx.fillRect(cx, by - 21, 2, 3);
        this.decor.haybale = c;
      }

      // Harvest Scarecrow
      {
        const { c, ctx } = makeCanvas(64, 64);
        const cx = 32, by = 48;
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.fillRect(cx - 5, by - 1, 10, 3);
        // Timber post & crossbeam
        ctx.fillStyle = '#5c3b20';
        ctx.fillRect(cx - 1, by - 28, 3, 28);
        ctx.fillRect(cx - 12, by - 21, 24, 2);
        // Straw hands
        ctx.fillStyle = '#ebd06a';
        ctx.fillRect(cx - 15, by - 22, 4, 4);
        ctx.fillRect(cx + 11, by - 22, 4, 4);
        // Flannel shirt & denim overalls
        ctx.fillStyle = '#c43b35';
        ctx.fillRect(cx - 5, by - 22, 10, 10);
        ctx.fillStyle = '#ffd159';
        ctx.fillRect(cx - 4, by - 19, 8, 1);
        ctx.fillStyle = '#3a689e';
        ctx.fillRect(cx - 4, by - 15, 8, 6);
        // Burlap head
        ctx.fillStyle = '#d9b578';
        ctx.fillRect(cx - 4, by - 29, 8, 7);
        ctx.fillStyle = '#241c15';
        ctx.fillRect(cx - 2, by - 27, 1, 1);
        ctx.fillRect(cx + 1, by - 27, 1, 1);
        ctx.fillRect(cx - 2, by - 24, 4, 1);
        // Pointed straw hat
        ctx.fillStyle = '#d9b143';
        ctx.fillRect(cx - 7, by - 31, 14, 2);
        ctx.fillStyle = '#ebcb5e';
        ctx.fillRect(cx - 4, by - 36, 8, 5);
        ctx.fillRect(cx - 2, by - 38, 4, 2);
        ctx.fillStyle = '#a8322a';
        ctx.fillRect(cx - 4, by - 32, 8, 1);
        this.decor.scarecrow = c;
      }

      // Spring Flower Arch
      {
        const { c, ctx } = makeCanvas(64, 64);
        const cx = 32, by = 48;
        ctx.fillStyle = 'rgba(0,0,0,0.20)';
        ctx.fillRect(cx - 15, by - 1, 6, 3);
        ctx.fillRect(cx + 9, by - 1, 6, 3);
        // Wooden trellis posts & arch
        ctx.fillStyle = '#734a27';
        ctx.fillRect(cx - 14, by - 28, 4, 28);
        ctx.fillRect(cx + 10, by - 28, 4, 28);
        ctx.fillStyle = '#99683d';
        ctx.fillRect(cx - 15, by - 31, 30, 4);
        ctx.fillRect(cx - 11, by - 34, 22, 3);
        // Lush green climbing vines
        ctx.fillStyle = '#3b8233';
        ctx.fillRect(cx - 15, by - 27, 5, 16);
        ctx.fillRect(cx + 10, by - 27, 5, 16);
        ctx.fillRect(cx - 14, by - 33, 28, 6);
        // Bright spring blossoms along the arch
        const blooms = [[-13, -22, '#f57eb0'], [-12, -31, '#ffe047'], [-5, -33, '#eb4468'], [2, -34, '#b88ef5'], [9, -31, '#ffe047'], [12, -23, '#f57eb0'], [-1, -30, '#ffffff'], [12, -16, '#eb4468']];
        for (const [bx, byo, col] of blooms) {
          ctx.fillStyle = col;
          ctx.fillRect(cx + bx, by + byo, 3, 3);
        }
        this.decor.flowerbox = c;
      }

      // Vintage Flower Cart
      {
        const { c, ctx } = makeCanvas(64, 56);
        const cx = 32, by = 42;
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.beginPath(); ctx.ellipse(cx, by, 15, 6, 0, 0, Math.PI * 2); ctx.fill();
        // Wooden wagon box
        ctx.fillStyle = '#5c3b20';
        ctx.fillRect(cx - 13, by - 16, 26, 10);
        ctx.fillStyle = '#96653b';
        ctx.fillRect(cx - 12, by - 15, 24, 8);
        ctx.fillStyle = '#b07b4a';
        ctx.fillRect(cx - 12, by - 15, 24, 2);
        // Push handle
        ctx.fillStyle = '#5c3b20';
        ctx.fillRect(cx + 13, by - 13, 6, 2);
        // Overflowing colorful blooms & greenery
        ctx.fillStyle = '#3a7a2c';
        ctx.fillRect(cx - 11, by - 20, 22, 6);
        const fl = [[-9, -21, '#f57eb0'], [-4, -23, '#ffe047'], [1, -22, '#a675e8'], [6, -23, '#eb4468'], [9, -20, '#ff981a'], [-1, -19, '#ffffff']];
        for (const [fx, fy, col] of fl) {
          ctx.fillStyle = col;
          ctx.fillRect(cx + fx, by + fy, 4, 4);
        }
        // Spoked wooden wheels
        for (const wx of [cx - 8, cx + 8]) {
          ctx.fillStyle = '#241b14';
          ctx.beginPath(); ctx.arc(wx, by - 4, 4.5, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#80522b';
          ctx.beginPath(); ctx.arc(wx, by - 4, 3, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#e0be70';
          ctx.fillRect(wx - 1, by - 5, 2, 2);
        }
        this.decor.wagon_decor = c;
      }

      // Lit Festival Pine (decorated holiday showpiece tree)
      {
        const { c, ctx } = makeCanvas(64, 84);
        const cx = 32, by = 68;
        ctx.fillStyle = 'rgba(0,0,0,0.26)';
        ctx.beginPath(); ctx.ellipse(cx + 1, by + 1, 18, 8, 0, 0, Math.PI * 2); ctx.fill();
        // Trunk & red tree skirt
        ctx.fillStyle = '#b82e28';
        ctx.beginPath(); ctx.ellipse(cx, by - 1, 11, 5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#59371e';
        ctx.fillRect(cx - 3, by - 10, 6, 9);
        // Layered lush evergreen silhouette
        const tiers = [[20, 18, 12], [16, 20, 24], [12, 18, 36], [7, 14, 47]];
        for (const [w, h, yOff] of tiers) {
          for (let py = 0; py < h; py++) {
            const span = Math.round(((h - py) / h) * w);
            ctx.fillStyle = '#18361c';
            ctx.fillRect(cx - span - 1, by - yOff - py, span * 2 + 2, 1);
            ctx.fillStyle = '#2d6b38';
            ctx.fillRect(cx - span, by - yOff - py, span * 2, 1);
            ctx.fillStyle = '#479450';
            ctx.fillRect(cx - span, by - yOff - py, Math.max(1, span), 1);
          }
        }
        // Sparkling warm lights & colorful holiday ornaments!
        const orns = [
          [-11, -15, '#ffe86b'], [-4, -18, '#eb3b34'], [5, -16, '#ffe86b'], [11, -14, '#5ec9eb'],
          [-8, -28, '#eb3b34'], [0, -26, '#ffe86b'], [8, -29, '#f5c73d'],
          [-5, -39, '#ffe86b'], [4, -40, '#eb3b34'], [-1, -48, '#ffe86b'], [2, -52, '#5ec9eb']
        ];
        for (const [ox, oy, col] of orns) {
          ctx.fillStyle = col;
          ctx.fillRect(cx + ox, by + oy, 3, 3);
        }
        // Glowing golden star topper
        ctx.fillStyle = '#fff080';
        ctx.fillRect(cx - 2, by - 64, 5, 5);
        ctx.fillRect(cx - 1, by - 66, 3, 9);
        ctx.fillRect(cx - 4, by - 63, 9, 3);
        this.decor.holiday_tree = c;
      }

      // Country Picnic Gazebo
      {
        const { c, ctx } = makeCanvas(80, 96);
        const cx = 40, by = 78;
        ctx.fillStyle = 'rgba(0,0,0,0.24)';
        ctx.beginPath(); ctx.ellipse(cx + 1, by - 3, 27, 13, 0, 0, Math.PI * 2); ctx.fill();
        // Raised timber floor platform
        drawIsoBox(ctx, cx, by, 24, 12, 4, { top: '#b08254', left: '#8a5f38', right: '#6e4928' });
        // Cozy wooden picnic table inside
        ctx.fillStyle = '#6e4727';
        ctx.fillRect(cx - 9, by - 13, 18, 4);
        ctx.fillRect(cx - 6, by - 9, 2, 5);
        ctx.fillRect(cx + 4, by - 9, 2, 5);
        // 4 sturdy timber corner posts
        ctx.fillStyle = '#5c3b20';
        const posts = [[-20, -10], [18, -10], [0, -20], [0, -2]];
        for (const [px, py] of posts) {
          ctx.fillRect(cx + px - 1, by + py - 24, 3, 24);
        }
        // Shingled pitched gazebo roof
        drawPitchedRoof(ctx, cx, by - 34, 26, 13, 14, {
          left: '#4c7552', right: '#325238', gable: '#6e4727'
        }, false);
        // Warm glowing string lights along front eave
        for (let i = 0; i < 6; i++) {
          ctx.fillStyle = '#fff099';
          ctx.fillRect(cx - 20 + i * 7, by - 32 + Math.round(Math.abs(i - 2.5) * 1.6), 2, 2);
        }
        this.decor.gazebo = c;
      }
    }

    buildPeeps() {
      // Pre-render crisp RCT-style guest & staff peeps (2 walk frames)
      PT.GUEST_COATS.forEach((scheme, idx) => {
        this.peeps['guest_' + idx] = [
          this.renderPeep(scheme.coat, scheme.hat, 0, false),
          this.renderPeep(scheme.coat, scheme.hat, 1, false)
        ];
        this.peeps['guest_tree_' + idx] = [
          this.renderPeep(scheme.coat, scheme.hat, 0, 'tree'),
          this.renderPeep(scheme.coat, scheme.hat, 1, 'tree')
        ];
        this.peeps['guest_basket_' + idx] = [
          this.renderPeep(scheme.coat, scheme.hat, 0, 'basket'),
          this.renderPeep(scheme.coat, scheme.hat, 1, 'basket')
        ];
      });

      for (const role of Object.keys(PT.STAFF_TYPES)) {
        const s = PT.STAFF_TYPES[role];
        if (role === 'dog') {
          this.peeps['staff_dog'] = [
            this.renderDog(0),
            this.renderDog(1)
          ];
        } else {
          this.peeps['staff_' + role] = [
            this.renderPeep(s.color, s.hat, 0, false, true),
            this.renderPeep(s.color, s.hat, 1, false, true)
          ];
        }
      }
    }

    renderDog(frame) {
      const { c, ctx } = makeCanvas(28, 32);
      const cx = 14, by = 28;
      const bob = frame === 1 ? -1 : 0;

      // Ground shadow
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(cx - 6, by - 2, 12, 3);

      // Far legs (shaded golden brown)
      ctx.fillStyle = '#9c6628';
      if (frame === 0) {
        ctx.fillRect(9, by - 6, 2, 5);
        ctx.fillRect(16, by - 6, 2, 5);
      } else {
        ctx.fillRect(10, by - 6, 2, 4);
        ctx.fillRect(15, by - 6, 2, 4);
      }

      // Wagging fluffy tail
      ctx.fillStyle = '#d99b43';
      if (frame === 0) {
        ctx.fillRect(6, by - 12 + bob, 3, 2);
        ctx.fillRect(5, by - 14 + bob, 2, 3);
        ctx.fillStyle = '#f2c679';
        ctx.fillRect(5, by - 14 + bob, 1, 2);
      } else {
        ctx.fillRect(7, by - 13 + bob, 3, 2);
        ctx.fillRect(7, by - 15 + bob, 2, 3);
        ctx.fillStyle = '#f2c679';
        ctx.fillRect(8, by - 15 + bob, 1, 2);
      }

      // Body outline / underbelly accent for contrast on snow & grass
      ctx.fillStyle = '#6b4218';
      ctx.fillRect(8, by - 6 + bob, 11, 1);
      ctx.fillRect(7, by - 10 + bob, 1, 4);

      // Golden coat torso
      ctx.fillStyle = '#d99b43';
      ctx.fillRect(8, by - 11 + bob, 10, 5);
      // Sunlit back highlight
      ctx.fillStyle = '#ebb55b';
      ctx.fillRect(9, by - 11 + bob, 8, 2);
      // Fluffy cream chest
      ctx.fillStyle = '#f5d28c';
      ctx.fillRect(16, by - 10 + bob, 3, 4);

      // Near legs & paws (animated trot)
      ctx.fillStyle = '#c98b38';
      if (frame === 0) {
        ctx.fillRect(8, by - 6, 2, 5);
        ctx.fillRect(17, by - 6, 2, 5);
        ctx.fillStyle = '#f5d28c';
        ctx.fillRect(8, by - 2, 2, 1);
        ctx.fillRect(17, by - 2, 2, 1);
      } else {
        ctx.fillRect(9, by - 5, 2, 4);
        ctx.fillRect(16, by - 5, 2, 4);
        ctx.fillStyle = '#f5d28c';
        ctx.fillRect(9, by - 2, 2, 1);
        ctx.fillRect(16, by - 2, 2, 1);
      }

      // Festive red farm bandana & gold tag
      ctx.fillStyle = '#cf352e';
      ctx.fillRect(16, by - 11 + bob, 3, 3);
      ctx.fillRect(17, by - 8 + bob, 2, 2);
      ctx.fillStyle = '#ffe270';
      ctx.fillRect(18, by - 8 + bob, 1, 1);

      // Head & snout
      ctx.fillStyle = '#d99b43';
      ctx.fillRect(16, by - 16 + bob, 6, 5);
      ctx.fillStyle = '#ebb55b';
      ctx.fillRect(17, by - 16 + bob, 4, 2);
      ctx.fillStyle = '#e8b25a';
      ctx.fillRect(21, by - 14 + bob, 3, 3);

      // Floppy brown ear
      ctx.fillStyle = '#8c5423';
      ctx.fillRect(16, by - 15 + bob, 2, 4);
      ctx.fillStyle = '#6e3f18';
      ctx.fillRect(16, by - 12 + bob, 2, 1);

      // Eye & nose
      ctx.fillStyle = '#1f1914';
      ctx.fillRect(20, by - 15 + bob, 1, 2);
      ctx.fillRect(23, by - 14 + bob, 2, 2);

      // Happy pink tongue
      ctx.fillStyle = '#f27c8f';
      ctx.fillRect(22, by - 11 + bob, frame === 1 ? 2 : 1, frame === 1 ? 2 : 1);

      return c;
    }

    renderPeep(coat, hat, frame, carryingTree, isStaff = false) {
      const { c, ctx } = makeCanvas(28, 32);
      const cx = 14, by = 28;

      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(cx - 4, by - 2, 8, 3);

      // Legs (animated step)
      ctx.fillStyle = '#2b2f36';
      const step = frame === 0 ? 1 : -1;
      ctx.fillRect(cx - 3, by - 7 + (step > 0 ? 1 : 0), 2, 6);
      ctx.fillRect(cx + 1, by - 7 + (step < 0 ? 1 : 0), 2, 6);

      // Torso / winter coat
      ctx.fillStyle = coat;
      ctx.fillRect(cx - 4, by - 14, 8, 8);
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.fillRect(cx + 1, by - 14, 3, 8);
      // Staff badge/belt
      if (isStaff) {
        ctx.fillStyle = '#ffe270';
        ctx.fillRect(cx - 3, by - 10, 6, 2);
      }

      // Head
      ctx.fillStyle = '#f2caa8';
      ctx.fillRect(cx - 2, by - 19, 5, 5);
      // Knit hat / cap
      ctx.fillStyle = hat;
      ctx.fillRect(cx - 3, by - 22, 7, 4);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(cx, by - 24, 2, 2);

      // Mini Christmas tree or harvest basket carried by guest!
      if (carryingTree === 'tree' || carryingTree === true) {
        ctx.fillStyle = '#5c3c22';
        ctx.fillRect(cx + 4, by - 10, 2, 4);
        ctx.fillStyle = '#2d6e3a';
        ctx.fillRect(cx + 2, by - 15, 7, 5);
        ctx.fillStyle = '#479450';
        ctx.fillRect(cx + 3, by - 20, 5, 5);
        ctx.fillRect(cx + 4, by - 23, 3, 3);
      } else if (carryingTree === 'basket') {
        ctx.fillStyle = '#7a4e26';
        ctx.fillRect(cx + 2, by - 12, 7, 5);
        ctx.fillStyle = '#b57d43';
        ctx.fillRect(cx + 3, by - 11, 5, 3);
        // Colorful seasonal harvest peeking out of basket
        ctx.fillStyle = '#eb771c';
        ctx.fillRect(cx + 3, by - 14, 3, 3);
        ctx.fillStyle = '#e8353c';
        ctx.fillRect(cx + 6, by - 13, 2, 2);
      }

      return c;
    }

    buildTractor() {
      this.tractor.engineFront = [this.renderTractorEngine(0, false), this.renderTractorEngine(1, false)];
      this.tractor.engineBack  = [this.renderTractorEngine(0, true),  this.renderTractorEngine(1, true)];
      this.tractor.wagonFront  = [this.renderTractorWagon(0, false),  this.renderTractorWagon(1, false)];
      this.tractor.wagonBack   = [this.renderTractorWagon(0, true),   this.renderTractorWagon(1, true)];
    }

    // Crisp RCT-style vintage red farm tractor (facing right; flipped in renderer for left)
    renderTractorEngine(frame, facingBack) {
      const { c, ctx } = makeCanvas(48, 48);
      const cx = 24, by = 38;
      const bob = frame === 1 ? -1 : 0;

      // Ground shadow
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath();
      ctx.ellipse(cx, by + 1, 15, 7, 0, 0, Math.PI * 2);
      ctx.fill();

      // Far-side wheels (peeking underneath)
      ctx.fillStyle = '#1b1d21';
      ctx.beginPath(); ctx.arc(cx - 5, by - 4, 5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + 8, by - 3, 4, 0, Math.PI * 2); ctx.fill();

      // Main chassis & red tractor engine hood
      ctx.fillStyle = '#241814';
      ctx.fillRect(cx - 12, by - 16 + bob, 24, 11);
      ctx.fillStyle = '#b52f28';
      ctx.fillRect(cx - 11, by - 15 + bob, 22, 9);
      // Sunlit top hood
      ctx.fillStyle = '#d9443b';
      ctx.fillRect(cx - 2, by - 15 + bob, 13, 4);
      // Shaded lower frame
      ctx.fillStyle = '#781d18';
      ctx.fillRect(cx - 11, by - 9 + bob, 22, 3);

      // Silver front radiator grille & warm headlight (when facing right/front)
      ctx.fillStyle = '#cdd6de';
      ctx.fillRect(cx + 9, by - 14 + bob, 3, 7);
      ctx.fillStyle = '#5e6873';
      ctx.fillRect(cx + 10, by - 13 + bob, 1, 5);
      if (!facingBack) {
        ctx.fillStyle = '#fff3a1';
        ctx.fillRect(cx + 11, by - 14 + bob, 2, 2);
      }

      // Vertical exhaust smokestack
      ctx.fillStyle = '#2a2e33';
      ctx.fillRect(cx + 5, by - 25 + bob, 2, 10);
      ctx.fillStyle = '#505761';
      ctx.fillRect(cx + 5, by - 25 + bob, 1, 9);

      // Driver seat & steering wheel
      ctx.fillStyle = '#3d2818';
      ctx.fillRect(cx - 9, by - 18 + bob, 6, 4);
      ctx.fillStyle = '#26292e';
      ctx.fillRect(cx - 1, by - 20 + bob, 2, 6);
      ctx.fillRect(cx - 3, by - 20 + bob, 5, 1);

      // Cheerful tractor driver in blue overalls & straw farm hat!
      ctx.fillStyle = '#3b6ba6';
      ctx.fillRect(cx - 8, by - 23 + bob, 6, 6);
      ctx.fillStyle = '#c43b35';
      ctx.fillRect(cx - 7, by - 22 + bob, 4, 3);
      ctx.fillStyle = '#f2caa8';
      ctx.fillRect(cx - 7, by - 27 + bob, 4, 4);
      // Straw farm hat
      ctx.fillStyle = '#e8c45f';
      ctx.fillRect(cx - 9, by - 28 + bob, 8, 2);
      ctx.fillRect(cx - 7, by - 31 + bob, 4, 3);
      ctx.fillStyle = '#b8352e';
      ctx.fillRect(cx - 7, by - 29 + bob, 4, 1);

      // Near-side rear big tractor wheel + front wheel with yellow hubs
      const drawWheel = (wx, wy, r) => {
        ctx.fillStyle = '#1f2226';
        ctx.beginPath(); ctx.arc(wx, wy, r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#383d45';
        ctx.beginPath(); ctx.arc(wx, wy, r - 1.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ebca59';
        ctx.beginPath(); ctx.arc(wx, wy, Math.max(2, r - 3), 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#6e4e18';
        const spoke = frame === 0 ? 1 : -1;
        ctx.fillRect(Math.round(wx + spoke - 0.5), Math.round(wy - 1), 1, 2);
      };
      drawWheel(cx - 7, by - 5, 6.5);
      drawWheel(cx + 8, by - 3, 4.2);

      // Rear wheel mudguard fender
      ctx.fillStyle = '#b52f28';
      ctx.fillRect(cx - 12, by - 13 + bob, 9, 2);
      ctx.fillStyle = '#d9443b';
      ctx.fillRect(cx - 11, by - 14 + bob, 7, 1);

      return c;
    }

    // Rustic tow-behind hayride wagon (facing right; flipped in renderer for left)
    renderTractorWagon(frame, facingBack) {
      const { c, ctx } = makeCanvas(52, 48);
      const cx = 26, by = 38;
      const bob = frame === 1 ? -1 : 0;

      // Ground shadow
      ctx.fillStyle = 'rgba(0,0,0,0.26)';
      ctx.beginPath();
      ctx.ellipse(cx, by + 1, 18, 8, 0, 0, Math.PI * 2);
      ctx.fill();

      // Back wooden railing
      ctx.fillStyle = '#5c3b20';
      ctx.fillRect(cx - 15, by - 20 + bob, 30, 8);
      ctx.fillStyle = '#7d522e';
      ctx.fillRect(cx - 14, by - 19 + bob, 28, 2);
      ctx.fillRect(cx - 14, by - 15 + bob, 28, 2);

      // Golden hay bales piled inside wagon bed!
      ctx.fillStyle = '#c99c32';
      ctx.fillRect(cx - 14, by - 17 + bob, 28, 8);
      ctx.fillStyle = '#e8c151';
      ctx.fillRect(cx - 13, by - 18 + bob, 26, 6);
      ctx.fillStyle = '#f7dc81';
      ctx.fillRect(cx - 11, by - 18 + bob, 10, 2);
      ctx.fillRect(cx + 2, by - 17 + bob, 9, 2);

      // Front slatted timber side walls
      ctx.fillStyle = '#3b2412';
      ctx.fillRect(cx - 16, by - 12 + bob, 32, 6);
      ctx.fillStyle = '#99683d';
      ctx.fillRect(cx - 15, by - 11 + bob, 30, 4);
      ctx.fillStyle = '#b07b4a';
      ctx.fillRect(cx - 15, by - 11 + bob, 30, 2);

      // Vertical corner & side wooden posts
      ctx.fillStyle = '#5c3b20';
      for (const px of [-15, -5, 5, 13]) {
        ctx.fillRect(cx + px, by - 19 + bob, 2, 12);
      }
      // Top side rail
      ctx.fillStyle = '#a87446';
      ctx.fillRect(cx - 16, by - 16 + bob, 32, 2);

      // Tiny festive green pine garland & red bow on wagon side
      ctx.fillStyle = '#2f6e3b';
      ctx.fillRect(cx - 8, by - 11 + bob, 16, 2);
      ctx.fillStyle = '#d93832';
      ctx.fillRect(cx - 1, by - 11 + bob, 2, 2);

      // Spoked wagon wheels (animated rotation)
      const drawWagonWheel = (wx, wy) => {
        ctx.fillStyle = '#241b14';
        ctx.beginPath(); ctx.arc(wx, wy, 4.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#734a27';
        ctx.beginPath(); ctx.arc(wx, wy, 3.2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#d9b56c';
        ctx.fillRect(Math.round(wx - 0.5), Math.round(wy - 0.5), 1.5, 1.5);
        ctx.fillStyle = '#3b2412';
        if (frame === 0) ctx.fillRect(Math.round(wx - 2), Math.round(wy), 4, 1);
        else ctx.fillRect(Math.round(wx), Math.round(wy - 2), 1, 4);
      };
      drawWagonWheel(cx - 10, by - 3);
      drawWagonWheel(cx + 10, by - 3);

      return c;
    }

    buildBoats() {
      this.boats.dock = this.renderBoatDock();
      this.boats.boatFront = [this.renderRowboat(0, false), this.renderRowboat(1, false)];
      this.boats.boatBack  = [this.renderRowboat(0, true),  this.renderRowboat(1, true)];
    }

    // Rustic lakeside wooden Boat Rental Dock pier with mooring post, life ring & ticket canopy
    renderBoatDock() {
      const { c, ctx } = makeCanvas(64, 64);
      const cx = 32, by = 46;

      // Water shadow under pier
      ctx.fillStyle = 'rgba(0, 20, 40, 0.28)';
      ctx.beginPath(); ctx.ellipse(cx, by + 2, 22, 10, 0, 0, Math.PI * 2); ctx.fill();

      // Timber pier pilings dipping into water
      ctx.fillStyle = '#4a2e16';
      ctx.fillRect(cx - 19, by - 4, 3, 10);
      ctx.fillRect(cx - 2,  by + 4, 4, 10);
      ctx.fillRect(cx + 16, by - 4, 3, 10);

      // Raised timber pier deck diamond
      drawIsoBox(ctx, cx, by + 3, 21, 10, 4, {
        top: '#b38150', left: '#7d542f', right: '#5e3d1f', outline: '#3b2412'
      });

      // Plank seams across dock deck
      ctx.strokeStyle = 'rgba(74, 46, 22, 0.55)';
      ctx.lineWidth = 1;
      for (let i = -12; i <= 12; i += 6) {
        ctx.beginPath();
        ctx.moveTo(cx + i - 5, by - 7);
        ctx.lineTo(cx + i + 5, by - 2);
        ctx.stroke();
      }

      // Cozy small boat-rental booth canopy on back side of pier
      ctx.fillStyle = '#5c3b20';
      ctx.fillRect(cx - 12, by - 25, 2, 17);
      ctx.fillRect(cx + 8,  by - 25, 2, 17);
      // Striped red & white awning
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = (i % 2 === 0) ? '#c93832' : '#f5efe1';
        ctx.fillRect(cx - 14 + i * 4, by - 30, 4, 6);
      }
      ctx.strokeStyle = '#331c13';
      ctx.lineWidth = 1;
      ctx.strokeRect(cx - 14, by - 30, 24, 6);

      // Mooring bollard + red-and-white life preserver ring
      ctx.fillStyle = '#5c3b20';
      ctx.fillRect(cx + 13, by - 14, 3, 10);
      ctx.fillStyle = '#eb3b34';
      ctx.beginPath(); ctx.arc(cx + 14, by - 12, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(cx + 13, by - 16, 2, 2);
      ctx.fillRect(cx + 13, by - 10, 2, 2);
      ctx.fillStyle = '#5c3b20';
      ctx.beginPath(); ctx.arc(cx + 14, by - 12, 1.5, 0, Math.PI * 2); ctx.fill();

      // Tiny moored spare paddle leaning on post
      ctx.fillStyle = '#d9b56c';
      ctx.fillRect(cx - 15, by - 16, 2, 12);
      ctx.fillStyle = '#9e6b38';
      ctx.fillRect(cx - 16, by - 18, 4, 4);

      return c;
    }

    // Crisp wooden paddle rowboat (facing right; flipped horizontally in renderer for left)
    renderRowboat(frame, facingBack) {
      const { c, ctx } = makeCanvas(38, 32);
      const cx = 19, by = 24;
      const bob = frame === 1 ? -1 : 0;

      // Soft water ripple ring around hull
      ctx.strokeStyle = 'rgba(210, 242, 255, 0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(cx, by + 1, 13, 5, 0, 0, Math.PI * 2);
      ctx.stroke();

      // Far oar sweeping behind hull
      ctx.strokeStyle = '#d4aa6a';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx + 1, by - 6 + bob);
      ctx.lineTo(cx + (frame === 0 ? 7 : -2), by - 12 + bob);
      ctx.stroke();

      // Wooden hull outer shell
      ctx.fillStyle = '#3b2210';
      ctx.beginPath();
      ctx.moveTo(cx - 12, by - 5 + bob);
      ctx.lineTo(cx + 10, by - 5 + bob);
      ctx.lineTo(cx + 14, by - 2 + bob);
      ctx.lineTo(cx + 8,  by + 2 + bob);
      ctx.lineTo(cx - 9,  by + 2 + bob);
      ctx.closePath();
      ctx.fill();

      // Sunlit hull interior & gunwale rim
      ctx.fillStyle = '#996234';
      ctx.beginPath();
      ctx.moveTo(cx - 11, by - 4 + bob);
      ctx.lineTo(cx + 9,  by - 4 + bob);
      ctx.lineTo(cx + 12, by - 2 + bob);
      ctx.lineTo(cx + 7,  by + 1 + bob);
      ctx.lineTo(cx - 8,  by + 1 + bob);
      ctx.closePath();
      ctx.fill();

      // Recessed dark wooden boat interior & center seat bench
      ctx.fillStyle = '#5e3819';
      ctx.fillRect(cx - 7, by - 5 + bob, 14, 3);
      ctx.fillStyle = '#c48f5a';
      ctx.fillRect(cx - 2, by - 5 + bob, 4, 3);

      // Sunlit bow highlight stripe
      ctx.fillStyle = '#c98e55';
      ctx.fillRect(cx - 9, by - 3 + bob, 19, 1);

      // Near wooden oar (animated rowing stroke + splash droplet!)
      const oarTipX = frame === 0 ? (cx - 6) : (cx + 4);
      const oarTipY = frame === 0 ? (by + 4) : (by + 3);
      ctx.strokeStyle = '#e0b977';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx, by - 5 + bob);
      ctx.lineTo(oarTipX, oarTipY);
      ctx.stroke();
      // White splash glint at oar blade
      ctx.fillStyle = '#e6f8ff';
      ctx.fillRect(oarTipX - 1, oarTipY - 1, 3, 2);

      return c;
    }
  }

  PT.sprites = new SpriteAtlas();
})();
