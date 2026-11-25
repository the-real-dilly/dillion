(function () {
  const PT = (window.PT = window.PT || {});

  const SAVE_KEY = 'pinecrest_tycoon_save_v5';

  class Game {
    constructor() {
      this.map = new PT.FarmMap(PT.MAP_SIZE);
      this.guests = [];
      this.staff = [];
      this.pickles = [];
      this.pickleRaidTimer = 30; // First Dill Pickle Raid arrives after 30s!
      this.pickleWaveActive = false;
      this.pickleWaveNum = 0;
      this.tractor = null;
      this.boatDock = null;
      this.floatTexts = [];
      this.particles = [];
      this.snowflakes = [];

      // Camera state
      this.cam = {
        x: 0,
        y: 360,
        zoom: 1.0,
        rot: 0
      };

      // Simulation state
      this.speed = 1; // 0=pause, 1, 2, 3
      this.paused = false;
      this.year = 1;
      this.month = 10; // Nov (0-indexed: 10 = Nov, 11 = Dec!)
      this.day = 18;
      this.dayTimer = 0;
      this.time = 0;
      this.isSnowing = false;
      this.snowCover = 0; // 0..1

      // Economy
      this.cash = 1250;
      this.farmRating = 660;
      this.ledger = {
        trees: 0,
        stalls: 0,
        planting: 0,
        building: 0,
        land: 0,
        wages: 0,
        milestones: 0
      };
      this.stats = {
        treesSold: 0,
        treesPlanted: 0,
        totalGuests: 0,
        tilesBought: 0,
        soldByType: {}
      };
      this.completedMilestones = {};
      this.unlockedPlants = this.createDefaultUnlocks();
      this.unlockRevision = 0;

      // Active tool
      this.tool = {
        mode: 'inspect', // inspect | plant | plot | build | path | decor | land | terrain | harvest | bulldoze | tractor_stop | boat_dock
        itemId: null,
        landBrush: 1, // 1 = single tile, 2 = 2x2 patch, 3 = 3x3 plot
        plotBrush: 1, // 1 = 1x1, 2 = 2x2, 3 = 3x3
        terrainBrush: 1 // 1 = 1x1, 2 = 2x2, 3 = 3x3
      };
      this.showPlotsOverlay = false;
      this.plotsWindowOpen = false;
      this.tractorWindowOpen = false;
      this.boatWindowOpen = false;
      this.touchDragPaint = false;
      this.usingTouch = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
      this.hoverTile = null;
      this.selected = null; // { kind: 'tile'|'guest'|'staff', ref }
      this.ticker = 'Welcome to Pinecrest Tree Farm! Holiday shoppers are arriving for November!';
      this.guestSpawnTimer = 1.2;
      this.nextBuildingId = 1;

      this.initSnowflakes();
      if (!this.load()) {
        this.setupStarterFarm();
      }
      this.centerCamera();
    }

    initSnowflakes() {
      this.snowflakes = [];
      for (let i = 0; i < 110; i++) {
        this.snowflakes.push({
          x: Math.random(),
          y: Math.random(),
          s: 1 + Math.floor(Math.random() * 2.4),
          vy: 0.04 + Math.random() * 0.07,
          vx: -0.015 + Math.random() * 0.03,
          phase: Math.random() * Math.PI * 2
        });
      }
    }

    setupStarterFarm() {
      this.map.initFresh();
      this.guests = [];
      this.staff = [];
      this.tractor = null;
      this.boatDock = null;
      this.floatTexts = [];
      this.particles = [];

      this.year = 1;
      this.month = 10; // Nov
      this.day = 18;
      this.cash = 1250;
      this.snowCover = 0.25;
      this.isSnowing = true;
      this.completedMilestones = {};
      this.unlockedPlants = this.createDefaultUnlocks();
      this.unlockRevision++;
      this.ledger = { trees: 0, stalls: 0, planting: 0, building: 0, land: 0, wages: 0, milestones: 0 };
      this.stats = { treesSold: 0, treesPlanted: 0, totalGuests: 0, tilesBought: 0, soldByType: {} };

      const ex = this.map.entrance.x;
      const ey = this.map.entrance.y;

      // Main gravel walkway from entrance gate (ex, ey) north up the stairs onto the upper terrace!
      for (let y = ey - 13; y <= ey; y++) {
        this.map.get(ex, y).path = 'path_gravel';
      }
      // Spacious lower plaza cross path (elev 0)
      for (let x = ex - 5; x <= ex + 6; x++) {
        this.map.get(x, ey - 3).path = 'path_gravel';
      }
      this.map.get(ex + 1, ey - 2).path = 'path_gravel';

      // Western grove side trail (elev 0)
      for (let y = ey - 9; y <= ey - 3; y++) {
        this.map.get(ex - 5, y).path = 'path_gravel';
      }

      // Upper scenic terrace walkway (elev 1) + eastern timber boardwalk stairs!
      for (let x = ex - 6; x <= ex + 6; x++) {
        this.map.get(x, ey - 12).path = 'path_gravel';
      }
      for (let y = ey - 12; y <= ey - 3; y++) {
        this.map.get(ex + 6, y).path = 'path_boardwalk';
      }

      // Starter Buildings
      this.placeStarterBuilding(ex - 1, ey - 2, 'checkout');
      this.placeStarterBuilding(ex + 2, ey - 2, 'cocoa');
      this.placeStarterBuilding(ex + 1, ey - 4, 'firepit');

      // Cozy starter decor (including seasonal themed scenery!)
      this.map.get(ex - 1, ey - 1).decor = 'lantern';
      this.map.get(ex + 1, ey - 1).decor = 'lantern';
      this.map.get(ex - 1, ey - 4).decor = 'lantern';
      this.map.get(ex - 1, ey - 10).decor = 'lantern';
      this.map.get(ex + 5, ey - 11).decor = 'lantern';
      this.map.get(ex - 2, ey - 3).decor = 'bench';
      this.map.get(ex + 4, ey - 4).decor = 'snowman';
      this.map.get(ex + 3, ey - 1).decor = 'haybale';
      this.map.get(ex + 8, ey - 1).decor = 'scarecrow';
      this.map.get(ex - 3, ey - 2).decor = 'holiday_tree';

      // Starter groves & fields using starter-tier unlocked plants (sell them to unlock higher tiers!)
      const starterTrees = [
        // Lower-west Scotch Pine grove
        [ex - 4, ey - 5, 'scotch', 96, true],
        [ex - 3, ey - 5, 'scotch', 88, false],
        [ex - 2, ey - 5, 'scotch', 92, true],
        [ex - 4, ey - 6, 'scotch', 78, false],
        [ex - 3, ey - 6, 'scotch', 86, true],
        [ex - 2, ey - 6, 'scotch', 62, false],
        [ex - 4, ey - 7, 'scotch', 44, false],
        [ex - 2, ey - 7, 'scotch', 88, true],
        [ex - 1, ey - 7, 'scotch', 66, false],
        [ex - 7, ey - 5, 'scotch', 90, true],
        [ex - 6, ey - 5, 'scotch', 84, false],
        [ex - 7, ey - 6, 'scotch', 74, false],
        [ex - 6, ey - 6, 'scotch', 60, false],
        // Lower-east Scotch Pine grove
        [ex + 2, ey - 5, 'scotch', 102, true],
        [ex + 3, ey - 5, 'scotch', 89, false],
        [ex + 4, ey - 5, 'scotch', 84, false],
        [ex + 2, ey - 6, 'scotch', 90, true],
        [ex + 3, ey - 6, 'scotch', 72, false],
        [ex + 4, ey - 6, 'scotch', 64, false],
        [ex + 2, ey - 7, 'scotch', 85, true],
        [ex + 3, ey - 7, 'scotch', 58, false],
        [ex + 4, ey - 7, 'scotch', 78, true],
        // Upper terrace starter pine grove (elev 1 — accessed via stairs!)
        [ex - 6, ey - 14, 'scotch', 92, true],
        [ex - 5, ey - 14, 'scotch', 86, true],
        [ex - 4, ey - 14, 'scotch', 95, true],
        [ex - 3, ey - 14, 'scotch', 84, false],
        [ex - 2, ey - 14, 'scotch', 90, true],
        [ex + 1, ey - 14, 'scotch', 88, true],
        [ex + 2, ey - 14, 'scotch', 78, false],
        [ex + 3, ey - 14, 'scotch', 68, false],
        [ex + 4, ey - 14, 'scotch', 56, false],
        [ex + 5, ey - 14, 'scotch', 82, true],
        // Starter Spring Daffodil bed (west front meadow)
        [ex - 7, ey - 1, 'daffodil', 84, false],
        [ex - 6, ey - 1, 'daffodil', 76, false],
        [ex - 5, ey - 1, 'daffodil', 62, false],
        // Starter Autumn Pumpkin Patch (east front meadow)
        [ex + 4, ey - 1, 'pumpkin', 96, true],
        [ex + 5, ey - 1, 'pumpkin', 88, false],
        [ex + 6, ey - 1, 'pumpkin', 84, false],
        [ex + 7, ey - 1, 'pumpkin', 65, false]
      ];
      for (const [tx, ty, type, growth, trimmed] of starterTrees) {
        const t = this.map.get(tx, ty);
        if (t && t.owned && !t.water && !t.path && !t.building) {
          t.tree = { type, growth, trimmed, reservedBy: null };
        }
      }

      // Starter Crop & Tree Plots so Foresters automatically replant starter varieties!
      for (let y = ey - 7; y <= ey - 5; y++) {
        for (let x = ex - 4; x <= ex - 2; x++) {
          const t = this.map.get(x, y);
          if (t && t.owned && !t.water && !t.path && !t.building && !t.decor) t.plot = 'scotch';
        }
        for (let x = ex + 2; x <= ex + 4; x++) {
          const t = this.map.get(x, y);
          if (t && t.owned && !t.water && !t.path && !t.building && !t.decor) t.plot = 'scotch';
        }
      }
      for (let x = ex + 1; x <= ex + 5; x++) {
        const t = this.map.get(x, ey - 14);
        if (t && t.owned && !t.water && !t.path && !t.building && !t.decor) t.plot = 'scotch';
      }
      // Starter seasonal plots (Daffodils, Pumpkins, Strawberries)
      for (let x = ex - 7; x <= ex - 5; x++) {
        const t = this.map.get(x, ey - 1);
        if (t && t.owned && !t.water && !t.path && !t.building && !t.decor) t.plot = 'daffodil';
      }
      for (let x = ex + 4; x <= ex + 7; x++) {
        const t = this.map.get(x, ey - 1);
        if (t && t.owned && !t.water && !t.path && !t.building && !t.decor) t.plot = 'pumpkin';
      }
      for (let x = ex + 7; x <= ex + 8; x++) {
        for (let y = ey - 6; y <= ey - 4; y++) {
          const t = this.map.get(x, y);
          if (t && t.owned && !t.water && !t.path && !t.building && !t.decor) t.plot = 'strawberry';
        }
      }

      // Starter Forester staff member
      this.staff.push(new PT.Staff('forester', ex, ey - 5));

      // Starter visitors walking up the approach driveway into the farm
      for (let i = 0; i < 4; i++) {
        const g = new PT.Guest(ex + (i - 1.5) * 0.25, ey - i * 0.7, true);
        this.guests.push(g);
        this.stats.totalGuests++;
      }

      this.recalcFarmRating();
    }

    placeStarterBuilding(x, y, type) {
      const t = this.map.get(x, y);
      const def = PT.BUILDINGS[type];
      t.building = {
        id: this.nextBuildingId++,
        type,
        price: def.defaultPrice,
        open: true,
        revenue: 0,
        served: 0
      };
    }

    centerCamera() {
      const p = this.map.posToWorld(this.map.entrance.x, this.map.entrance.y - 6.5, this.cam.rot);
      this.cam.x = p.wx;
      this.cam.y = p.wy;
    }

    getMonthInfo() {
      return PT.MONTHS[this.month];
    }

    getSeason() {
      return PT.SEASONS[this.getMonthInfo().season];
    }

    isWinterVisual() {
      return this.snowCover >= 0.45 || this.getSeason().id === 'winter';
    }

    getTreeStage(tree) {
      let stage = PT.TREE_STAGES[0];
      for (const s of PT.TREE_STAGES) {
        if (tree.growth >= s.minGrowth) stage = s;
      }
      return stage;
    }

    getTreeStageIndex(tree) {
      let idx = 0;
      for (let i = 0; i < PT.TREE_STAGES.length; i++) {
        if (tree.growth >= PT.TREE_STAGES[i].minGrowth) idx = i;
      }
      return idx;
    }

    isPlantInSeason(def) {
      if (!def) return false;
      const seasonId = this.getSeason().id;
      if (def.category === 'tree' && (this.month === 10 || seasonId === 'winter')) return true;
      return !!(def.peakSeasons && def.peakSeasons.includes(seasonId));
    }

    getTreeSalePrice(tree) {
      const def = PT.TREES[tree.type];
      const stage = this.getTreeStage(tree);
      if (!stage.sellable) return 0;
      const trimMult = tree.trimmed ? 1.25 : 1.0;
      const seasonId = this.getSeason().id;
      let seasonMult = 0.85;
      if (def.category === 'tree') {
        seasonMult = (this.month === 11) ? 1.25 : ((this.month === 10 || seasonId === 'winter') ? 1.08 : 0.88);
      } else if (def.peakSeasons && def.peakSeasons.includes(seasonId)) {
        seasonMult = 1.25;
      }
      return Math.round(def.basePrice * stage.priceMult * trimMult * seasonMult);
    }

    harvestPlantTile(tile) {
      if (!tile || !tile.tree) return;
      const def = PT.TREES[tile.tree.type];
      if (def && def.regrowTo) {
        // Orchard trees keep their canopy and regrow fruit for the next harvest!
        tile.tree.growth = def.regrowTo;
        tile.tree.reservedBy = null;
      } else if (def && def.category === 'crop') {
        // Seasonal ground crops clear cleanly without leaving wood stumps
        tile.tree = null;
        tile.stump = false;
        this.map.bumpRevision();
      } else {
        tile.tree = null;
        tile.stump = true;
        this.map.bumpRevision();
      }
    }

    hasStaffRole(role) {
      return this.staff.some(s => s.role === role);
    }

    isTileClaimedByStaff(tile, excludeStaffId = null, role = null) {
      if (!tile) return false;
      return this.staff.some(s =>
        s.id !== excludeStaffId &&
        (!role || s.role === role) &&
        s.targetTile === tile
      );
    }

    countStaffClaimingTile(tile, excludeStaffId = null, role = null) {
      if (!tile) return 0;
      let count = 0;
      for (const s of this.staff) {
        if (s.id !== excludeStaffId && (!role || s.role === role) && s.targetTile === tile) {
          count++;
        }
      }
      return count;
    }

    getBuildingCount() {
      let c = 0;
      for (let y = 0; y < this.map.size; y++) {
        for (let x = 0; x < this.map.size; x++) {
          if (this.map.tiles[y][x].building) c++;
        }
      }
      return c;
    }

    getSeasonalPlantStats() {
      let total = 0;
      let mature = 0;
      let inSeasonReady = 0;
      let offSeasonReady = 0;
      let ownedTiles = 0;
      let openBuildings = 0;
      const inSeasonByType = {};
      const N = this.map.size;
      const tiles = this.map.tiles;
      for (let y = 0; y < N; y++) {
        const row = tiles[y];
        for (let x = 0; x < N; x++) {
          const t = row[x];
          if (!t.owned) continue;
          ownedTiles++;
          if (t.building && t.building.open) openBuildings++;
          if (!t.tree) continue;
          const tr = t.tree;
          total++;
          if (this.getTreeStage(tr).sellable) {
            mature++;
            // U-pick availability for visiting guests (skip Forester-only Management Plots & already-reserved plants)
            if (!t.plotManaged && !tr.reservedBy) {
              const def = PT.TREES[tr.type];
              if (this.isPlantInSeason(def)) {
                inSeasonReady++;
                inSeasonByType[tr.type] = (inSeasonByType[tr.type] || 0) + 1;
              } else {
                offSeasonReady++;
              }
            }
          }
        }
      }
      const speciesIds = Object.keys(inSeasonByType);
      let topSpeciesId = null;
      let topCount = 0;
      for (const id of speciesIds) {
        if (inSeasonByType[id] > topCount) {
          topCount = inSeasonByType[id];
          topSpeciesId = id;
        }
      }
      return {
        total,
        mature,
        inSeasonReady,
        offSeasonReady,
        ownedTiles,
        openBuildings,
        inSeasonSpecies: speciesIds.length,
        topSpeciesName: topSpeciesId && PT.TREES[topSpeciesId] ? PT.TREES[topSpeciesId].name : null
      };
    }

    getGuestSpawnProfile() {
      const mInfo = this.getMonthInfo();
      const supply = this.getSeasonalPlantStats();
      const hasTractor = !!(this.tractor && this.tractor.isReadyForGuests());
      const hasBoatDock = !!(this.boatDock && this.boatDock.open);

      // Scale guest capacity generously with farm land area, stalls/attractions, & abundant seasonal harvests!
      const ratingBase = Math.floor(4 + (this.farmRating / 100) * (0.65 + mInfo.demand * 0.45));
      const landBonus = Math.floor(Math.max(0, supply.ownedTiles - 220) / 28);
      const buildingBonus = Math.floor(supply.openBuildings * 2.2) + (hasTractor ? 6 : 0) + (hasBoatDock ? 6 : 0);
      const seasonalBonus = Math.min(
        120,
        Math.floor(supply.inSeasonReady * 0.9 + supply.offSeasonReady * 0.25 + supply.inSeasonSpecies * 3.0)
      );
      const maxGuests = Math.max(4, Math.min(280, ratingBase + landBonus + buildingBonus + seasonalBonus));

      const sizeMult = 1 + Math.min(2.2, Math.max(0, supply.ownedTiles - 280) / 900);
      const supplyMult = 0.45 + Math.min(
        4.2,
        supply.inSeasonReady * 0.08 + supply.offSeasonReady * 0.02 + supply.inSeasonSpecies * 0.16
      );
      const effectiveDemand = Math.max(0.25, mInfo.demand * (0.55 + this.farmRating / 1100) * supplyMult * sizeMult);
      const baseInterval = Math.max(0.22, Math.min(8.5, 4.0 / effectiveDemand));

      const crowdLabel = supply.inSeasonReady >= 60
        ? 'Mega Harvest Fair!'
        : supply.inSeasonReady >= 24
          ? 'Festival Rush!'
          : supply.inSeasonReady >= 10
            ? 'Busy Harvest'
            : supply.inSeasonReady >= 3
              ? 'Steady'
              : 'Quiet';

      return { maxGuests, baseInterval, supply, crowdLabel };
    }

    getTreeCounts() {
      const s = this.getSeasonalPlantStats();
      return { total: s.total, mature: s.mature, inSeasonReady: s.inSeasonReady };
    }

    addCash(amount, category, wxTile = null, wyTile = null) {
      this.cash += amount;
      if (category && this.ledger[category] !== undefined) {
        this.ledger[category] += amount;
      }
      if (wxTile !== null && wyTile !== null) {
        const sign = amount >= 0 ? '+' : '-';
        const col = amount >= 0 ? '#9ef58e' : '#ff8c85';
        this.addFloatText(wxTile, wyTile, `${sign}$${Math.abs(Math.round(amount))}`, col);
      }
      if (amount > 0) PT.audio.cash();
    }

    createDefaultUnlocks() {
      const u = {};
      for (const id of PT.TREE_ORDER) {
        if (PT.TREES[id] && PT.TREES[id].unlockedByDefault) u[id] = true;
      }
      return u;
    }

    isPlantUnlocked(id) {
      return !!(this.unlockedPlants && this.unlockedPlants[id]);
    }

    getPlantSoldCount(id) {
      return (this.stats.soldByType && this.stats.soldByType[id]) || 0;
    }

    getPlantUnlockProgress(id) {
      const def = PT.TREES[id];
      if (!def) return { unlocked: false, current: 0, needed: 0, pct: 0, req: null };
      const unlocked = this.isPlantUnlocked(id);
      if (unlocked || !def.unlockReq) {
        return { unlocked: true, current: this.getPlantSoldCount(id), needed: 0, pct: 100, req: def.unlockReq || null };
      }
      const current = this.getPlantSoldCount(def.unlockReq.type);
      const needed = def.unlockReq.count;
      const pct = Math.min(100, Math.round((current / Math.max(1, needed)) * 100));
      return { unlocked: false, current, needed, pct, req: def.unlockReq };
    }

    getUnlockedCount() {
      let c = 0;
      for (const id of PT.TREE_ORDER) {
        if (this.isPlantUnlocked(id)) c++;
      }
      return c;
    }

    recordPlantSold(plantType) {
      this.stats.treesSold++;
      if (plantType) {
        if (!this.stats.soldByType) this.stats.soldByType = {};
        this.stats.soldByType[plantType] = (this.stats.soldByType[plantType] || 0) + 1;
        this.checkPlantUnlocks();
      }
    }

    checkPlantUnlocks(silent = false) {
      let newlyUnlocked = 0;
      for (const id of PT.TREE_ORDER) {
        if (this.unlockedPlants[id]) continue;
        const def = PT.TREES[id];
        if (!def || !def.unlockReq) continue;
        if (this.getPlantSoldCount(def.unlockReq.type) >= def.unlockReq.count) {
          this.unlockedPlants[id] = true;
          this.unlockRevision++;
          newlyUnlocked++;
          if (!silent) {
            PT.audio.milestone();
            this.setTicker(`🔓 Unlocked ${def.icon || '🌱'} ${def.name}! Now available in Plants & Plots!`);
            this.addFloatText(this.map.entrance.x, this.map.entrance.y - 2, `🔓 ${def.name}!`, '#ffe46b');
          }
        }
      }
      return newlyUnlocked;
    }

    recordTreeSale(sale, tx, ty, building, itemName = 'Christmas tree', plantType = null) {
      this.recordPlantSold(plantType);
      if (building) {
        building.served++;
        building.revenue += sale;
      }
      this.addCash(sale, 'trees', tx, ty);
      if (!this.ticker.startsWith('🔓 Unlocked')) {
        this.setTicker(`Sold ${itemName} for $${sale}! (${this.stats.treesSold} harvests sold total)`);
      }
      this.checkMilestones();
    }

    addFloatText(tx, ty, text, color = '#fff7b0') {
      if (this.floatTexts.length >= 40) {
        this.floatTexts.shift();
      }
      this.floatTexts.push({
        tx, ty, text, color,
        age: 0,
        life: 1.55
      });
    }

    spawnParticle(p) {
      if (this.particles.length >= 220) return;
      this.particles.push(p);
    }

    spawnSparkles(tx, ty, color = '#fff2a6', count = 6) {
      for (let i = 0; i < count; i++) {
        if (this.particles.length >= 220) break;
        const ang = (Math.PI * 2 * i) / count + Math.random() * 0.5;
        this.particles.push({
          tx: tx + (Math.random() - 0.5) * 0.3,
          ty: ty + (Math.random() - 0.5) * 0.3,
          vx: Math.cos(ang) * (12 + Math.random() * 14),
          vy: -16 - Math.random() * 20,
          px: 0, py: -14,
          color,
          size: 2 + Math.floor(Math.random() * 2),
          age: 0,
          life: 0.6 + Math.random() * 0.4
        });
      }
    }

    setTicker(msg) {
      this.ticker = msg;
    }

    update(rawDt) {
      const dt = Math.min(rawDt, 0.08);
      this.time += dt;

      // Update UI snow & ambient particles even when paused? Only snowflakes gently!
      this.updateSnowflakes(dt);

      if (this.paused || this.speed === 0) return;

      const simDt = dt * (this.speed === 1 ? 1 : this.speed === 2 ? 2.4 : 5.0);

      // Advance calendar: 1 day = 1.65s at 1x
      this.dayTimer += simDt;
      if (this.dayTimer >= 1.65) {
        this.dayTimer -= 1.65;
        this.advanceDay();
      }

      // Smooth snow cover transition
      const mInfo = this.getMonthInfo();
      const targetSnow = (this.month === 11 || this.month === 0) ? 1.0 : (this.month === 1 ? 0.75 : (this.month === 10 && this.day > 15 ? 0.38 : 0.0));
      this.snowCover += (targetSnow - this.snowCover) * Math.min(1, simDt * 0.25);

      // Grow all trees & seasonal plants smoothly
      const season = this.getSeason();
      for (let y = 0; y < this.map.size; y++) {
        for (let x = 0; x < this.map.size; x++) {
          const t = this.map.tiles[y][x];
          if (t.tree && t.tree.growth < 108) {
            const def = PT.TREES[t.tree.type];
            const trimBonus = t.tree.trimmed ? 1.08 : 1.0;
            const sMult = (def.seasonGrowth && def.seasonGrowth[season.id] !== undefined)
              ? def.seasonGrowth[season.id]
              : season.growthMult;
            t.tree.growth = Math.min(108, t.tree.growth + simDt * 1.15 * def.growRate * sMult * trimBonus);
          }
          // Ambient chimney / firepit smoke puffs (real-time dt + hard particle cap so 3x speed never floods!)
          if (t.building && (t.building.type === 'firepit' || t.building.type === 'santa' || t.building.type === 'cocoa')) {
            if (this.particles.length < 200 && Math.random() < dt * (t.building.type === 'firepit' ? 3.2 : 1.2)) {
              const isFire = t.building.type === 'firepit';
              this.spawnParticle({
                tx: t.x,
                ty: t.y,
                vx: -4 + Math.random() * 8,
                vy: isFire ? -20 - Math.random() * 14 : -14 - Math.random() * 8,
                px: isFire ? (Math.random() - 0.5) * 6 : 12,
                py: isFire ? -14 : -46,
                color: isFire ? (Math.random() < 0.45 ? '#ff9933' : '#ffe066') : 'rgba(235, 240, 245, 0.7)',
                size: isFire ? 2 : 3,
                age: 0,
                life: isFire ? 0.7 : 1.5
              });
            }
          }
        }
      }

      // Guest Spawning (driven by farm size, ready in-season plants, Farm Rating, attractions, & seasonal demand!)
      this.guestSpawnTimer -= simDt;
      if (this.guestSpawnTimer <= 0) {
        const profile = this.getGuestSpawnProfile();
        if (this.guests.length < profile.maxGuests) {
          this.spawnGuest(profile.supply);
          // Families arrive in pairs on large, bustling farms!
          if (profile.maxGuests >= 90 && this.guests.length < profile.maxGuests && Math.random() < 0.45) {
            this.spawnGuest(profile.supply);
          }
        }
        this.guestSpawnTimer = Math.max(0.18, profile.baseInterval * (0.75 + Math.random() * 0.5));
      }

      // Update Guests
      for (let i = this.guests.length - 1; i >= 0; i--) {
        const alive = this.guests[i].update(simDt, this);
        if (!alive) {
          if (this.selected && this.selected.ref === this.guests[i]) this.selected = null;
          this.guests.splice(i, 1);
        }
      }

      // Update Staff
      for (const s of this.staff) {
        s.update(simDt, this);
      }

      // Update Dill Pickle Raiders & Periodic Raid Waves
      this.pickleRaidTimer -= dt;
      if (this.pickleRaidTimer <= 0 && this.pickles.length === 0) {
        this.pickleWaveNum++;
        const count = Math.min(6, 3 + Math.floor(this.pickleWaveNum / 2));
        const hasBoss = this.pickleWaveNum >= 2 && (this.pickleWaveNum % 2 === 0);
        this.spawnPickleRaid(count, hasBoss);
        this.pickleRaidTimer = 50 + Math.random() * 20;
      }
      if (this.pickles.length > 0) {
        for (let i = this.pickles.length - 1; i >= 0; i--) {
          const alive = this.pickles[i].update(simDt, this);
          if (!alive) {
            this.pickles.splice(i, 1);
          }
        }
        if (this.pickles.length === 0 && this.pickleWaveActive) {
          this.pickleWaveActive = false;
          this.addCash(120, 'milestones', this.map.entrance.x, this.map.entrance.y);
          this.setTicker('🎉 DILL PICKLE RAID REPELLED! +$120 Farm Defense Bonus!');
        }
      }

      // Update Tractor Wagon Ride
      if (this.tractor) {
        this.tractor.update(simDt, this);
      }

      // Update Pond Boat Rentals
      if (this.boatDock) {
        this.boatDock.update(simDt, this);
      }

      // Update floating texts & particles
      for (let i = this.floatTexts.length - 1; i >= 0; i--) {
        this.floatTexts[i].age += dt;
        if (this.floatTexts[i].age >= this.floatTexts[i].life) this.floatTexts.splice(i, 1);
      }
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.age += dt;
        p.px += p.vx * dt;
        p.py += p.vy * dt;
        if (p.age >= p.life) this.particles.splice(i, 1);
      }
    }

    updateSnowflakes(dt) {
      if (!this.isSnowing) return;
      for (const f of this.snowflakes) {
        f.y += f.vy * dt;
        f.x += (f.vx + Math.sin(this.time * 1.4 + f.phase) * 0.012) * dt;
        if (f.y > 1.02) { f.y = -0.02; f.x = Math.random(); }
        if (f.x < -0.02) f.x = 1.02;
        if (f.x > 1.02) f.x = -0.02;
      }
    }

    advanceDay() {
      const mInfo = this.getMonthInfo();
      this.day++;
      if (this.day > mInfo.days) {
        this.day = 1;
        this.month++;
        if (this.month >= 12) {
          this.month = 0;
          this.year++;
          this.setTicker(`🎉 Happy New Year! Welcome to Year ${this.year} at Pinecrest Tree Farm!`);
        }
        this.onNewMonth();
      }

      // Daily weather check
      if (this.day % 3 === 0) {
        this.isSnowing = Math.random() < this.getMonthInfo().snowChance;
      }

      this.recalcFarmRating();
      this.checkMilestones();
    }

    onNewMonth() {
      // Pay staff wages & building upkeep once a month
      let wages = 0;
      for (const s of this.staff) wages += PT.STAFF_TYPES[s.role].wage;
      let upkeep = 0;
      for (let y = 0; y < this.map.size; y++) {
        for (let x = 0; x < this.map.size; x++) {
          const b = this.map.tiles[y][x].building;
          if (b && b.open) upkeep += PT.BUILDINGS[b.type].upkeep;
        }
      }
      if (this.tractor && this.tractor.open) {
        upkeep += PT.TRACTOR_DEF.upkeep;
      }
      if (this.boatDock && this.boatDock.open) {
        upkeep += PT.BOAT_DEF.upkeep;
      }
      const total = wages + upkeep;
      if (total > 0) {
        this.cash -= total;
        this.ledger.wages -= total;
        this.setTicker(`Monthly upkeep & staff wages paid: -$${total} (${PT.MONTHS[this.month].name} Year ${this.year})`);
      }

      if (this.month === 11) {
        this.isSnowing = true;
        this.setTicker('❄️ December Holiday Rush has begun! Families are flocking in for Christmas trees!');
      } else if (this.month === 2) {
        this.setTicker('🌷 Spring has arrived! Plant Spring Tulips & saplings now for fast growth!');
      } else if (this.month === 5) {
        this.setTicker('☀️ Summer is here! Guests are flocking in for Strawberries, Blueberries, Sunflowers & Apples!');
      } else if (this.month === 8) {
        this.setTicker('🎃 Autumn harvest time! Harvest Pumpkins & Honeycrisp Apples are in peak demand!');
      }

      this.save(true);
    }

    recalcFarmRating() {
      let appeal = 0;
      let waterAppeal = 0;
      let matureTrees = 0;
      let hasCheckout = false;
      for (let y = 0; y < this.map.size; y++) {
        for (let x = 0; x < this.map.size; x++) {
          const t = this.map.tiles[y][x];
          if (!t.owned) continue;
          if (t.water) {
            waterAppeal += 3;
          }
          if (t.tree) {
            const def = PT.TREES[t.tree.type];
            appeal += def.appeal * (0.4 + 0.6 * (t.tree.growth / 100));
            if (this.getTreeStage(t.tree).sellable) matureTrees++;
          }
          if (t.building && t.building.open) {
            appeal += PT.BUILDINGS[t.building.type].appeal;
            if (t.building.type === 'checkout') hasCheckout = true;
          }
          if (t.decor && PT.DECOR[t.decor]) {
            appeal += PT.DECOR[t.decor].appeal;
          }
          if (t.path && PT.DECOR[t.path]) {
            appeal += PT.DECOR[t.path].appeal * 0.4;
          }
        }
      }

      appeal += Math.min(45, waterAppeal);

      if (this.tractor && this.tractor.open && this.tractor.stops.length >= 2) {
        appeal += PT.TRACTOR_DEF.appeal;
      }
      if (this.boatDock && this.boatDock.open) {
        appeal += PT.BOAT_DEF.appeal;
      }

      let avgHappy = 72;
      if (this.guests.length > 0) {
        avgHappy = this.guests.reduce((acc, g) => acc + g.happiness, 0) / this.guests.length;
      }

      let rating = 320 + avgHappy * 3.4 + Math.min(260, appeal * 0.85) + Math.min(80, matureTrees * 4);
      if (!hasCheckout) rating -= 120;
      this.farmRating = Math.max(100, Math.min(999, Math.round(rating)));
    }

    checkMilestones() {
      for (const m of PT.MILESTONES) {
        if (!this.completedMilestones[m.id] && m.check(this)) {
          this.completedMilestones[m.id] = true;
          this.cash += m.reward;
          this.ledger.milestones += m.reward;
          PT.audio.milestone();
          this.setTicker(`🏆 Milestone Achieved: "${m.title}"! Bonus Award: +$${m.reward}!`);
          this.addFloatText(this.map.entrance.x, this.map.entrance.y - 2, `🏆 +$${m.reward}!`, '#ffe46b');
        }
      }
    }

    spawnGuest(supply = null) {
      const s = supply || this.getSeasonalPlantStats();
      const ex = this.map.entrance.x + (Math.random() - 0.5) * 0.4;
      const ey = this.map.roadY;
      const g = new PT.Guest(ex, ey, this.isWinterVisual());
      const pickChance = Math.min(0.94, 0.48 + s.inSeasonReady * 0.03 + s.offSeasonReady * 0.01);
      g.wantsTree = Math.random() < pickChance;
      if (g.wantsTree && s.topSpeciesName && Math.random() < 0.65) {
        g.thought = `Heard the ${s.topSpeciesName} are ready for picking!`;
      }
      this.guests.push(g);
      this.stats.totalGuests++;
    }

    findBestBuilding(types, gx, gy, budget) {
      let bestTile = null;
      let bestScore = 1e9;
      const N = this.map.size;
      const tiles = this.map.tiles;
      const isCheckoutOnly = types.length === 1 && types[0] === 'checkout';
      const distWeight = isCheckoutOnly ? 1.0 : 0.35;
      const randSpread = isCheckoutOnly ? 2 : 14;
      for (let y = 0; y < N; y++) {
        const row = tiles[y];
        for (let x = 0; x < N; x++) {
          const t = row[x];
          const b = t.building;
          if (b && b.open && b.price <= budget && types.includes(b.type)) {
            const score = Math.hypot(x - gx, y - gy) * distWeight - PT.BUILDINGS[b.type].appeal * 0.15 + Math.random() * randSpread;
            if (score < bestScore) {
              bestScore = score;
              bestTile = t;
            }
          }
        }
      }
      return bestTile;
    }

    findBestSellableTree(gx, gy, budget) {
      let bestTile = null;
      let bestScore = -1e9;
      const N = this.map.size;
      const tiles = this.map.tiles;
      for (let y = 0; y < N; y++) {
        const row = tiles[y];
        for (let x = 0; x < N; x++) {
          const t = row[x];
          if (t.owned && t.tree && !t.tree.reservedBy && !t.plotManaged) {
            const st = this.getTreeStage(t.tree);
            if (!st.sellable) continue;
            const def = PT.TREES[t.tree.type];
            const price = this.getTreeSalePrice(t.tree);
            if (price <= budget) {
              const inSeasonBonus = this.isPlantInSeason(def) ? 32 : 0;
              const qualityScore = inSeasonBonus + st.priceMult * 18 + (t.tree.trimmed ? 12 : 0) - Math.hypot(x - gx, y - gy) * 0.22 + Math.random() * 24;
              if (qualityScore > bestScore) {
                bestScore = qualityScore;
                bestTile = t;
              }
            }
          }
        }
      }
      return bestTile;
    }

    // Pick a scenic walkable destination spread out across the farm so guests explore instead of clustering by the gate
    findExploreTile(fromX, fromY) {
      let bestTile = null;
      let bestScore = -1e9;
      const N = this.map.size;
      const tiles = this.map.tiles;
      const ex = this.map.entrance.x;
      const ey = this.map.entrance.y;

      for (let y = 0; y < N; y++) {
        const row = tiles[y];
        for (let x = 0; x < N; x++) {
          const t = row[x];
          if (!t.owned || t.isRoad || t.decor === 'gate') continue;
          if (!this.map.isWalkable(x, y)) continue;

          const dHere = Math.hypot(x - fromX, y - fromY);
          const dGate = Math.hypot(x - ex, y - ey);

          // Encourage spreading away from the entrance & strolling to a fresh part of the farm
          let score = Math.min(16, dGate * 0.55) + Math.random() * 26;
          if (dHere >= 5 && dHere <= 28) score += 8;
          else if (dHere < 4) score -= 10;

          if (t.path) score += 5;
          if (t.tree) score += 4;
          if (t.decor) score += 3;

          if (score > bestScore) {
            bestScore = score;
            bestTile = t;
          }
        }
      }
      return bestTile;
    }

    findRandomWalkableTile(preferPath = false) {
      const list = [];
      for (let y = 0; y < this.map.size; y++) {
        for (let x = 0; x < this.map.size; x++) {
          const t = this.map.tiles[y][x];
          if (t.owned && this.map.isWalkable(x, y)) {
            if (!preferPath || t.path) list.push(t);
          }
        }
      }
      if (list.length === 0 && preferPath) return this.findRandomWalkableTile(false);
      if (list.length === 0) return null;
      return list[Math.floor(Math.random() * list.length)];
    }

    // ---------- Player Tool Actions ----------
    isTractorStop(x, y) {
      if (!this.tractor) return false;
      return this.tractor.stops.some(s => s.x === x && s.y === y);
    }

    isTilePlantableForPlot(tile) {
      return !!(tile && tile.owned && !tile.isRoad && !tile.water && !tile.tree && !tile.building && !tile.path && !tile.decor && !this.isTractorStop(tile.x, tile.y));
    }

    isTileHarvestableByForester(tile) {
      return !!(
        tile &&
        tile.owned &&
        tile.plot &&
        tile.plotManaged &&
        tile.tree &&
        !tile.tree.reservedBy &&
        tile.tree.growth >= 82
      );
    }

    getConnectedPlotTiles(startTile) {
      if (!startTile || !startTile.owned || !startTile.plot) return [];
      const targetPlot = startTile.plot;
      const N = this.map.size;
      const visited = new Set();
      const queue = [startTile];
      let head = 0;
      const result = [];
      visited.add(startTile.y * N + startTile.x);
      while (head < queue.length) {
        const cur = queue[head++];
        result.push(cur);
        const cx = cur.x;
        const cy = cur.y;
        const n1 = this.map.get(cx + 1, cy);
        if (n1 && n1.owned && n1.plot === targetPlot && !n1.building) {
          const k = n1.y * N + n1.x;
          if (!visited.has(k)) { visited.add(k); queue.push(n1); }
        }
        const n2 = this.map.get(cx - 1, cy);
        if (n2 && n2.owned && n2.plot === targetPlot && !n2.building) {
          const k = n2.y * N + n2.x;
          if (!visited.has(k)) { visited.add(k); queue.push(n2); }
        }
        const n3 = this.map.get(cx, cy + 1);
        if (n3 && n3.owned && n3.plot === targetPlot && !n3.building) {
          const k = n3.y * N + n3.x;
          if (!visited.has(k)) { visited.add(k); queue.push(n3); }
        }
        const n4 = this.map.get(cx, cy - 1);
        if (n4 && n4.owned && n4.plot === targetPlot && !n4.building) {
          const k = n4.y * N + n4.x;
          if (!visited.has(k)) { visited.add(k); queue.push(n4); }
        }
      }
      return result;
    }

    setPlotManaged(startTile, managed) {
      const tiles = this.getConnectedPlotTiles(startTile);
      if (tiles.length === 0) return 0;
      const flag = !!managed;
      for (const t of tiles) {
        t.plotManaged = flag;
      }
      this.map.bumpRevision();
      const def = PT.TREES[startTile.plot];
      const name = def ? def.name : 'Plot';
      PT.audio.click();
      if (flag) {
        this.setTicker(`🪓 Marked ${name} Plot (${tiles.length} tile${tiles.length === 1 ? '' : 's'}) as Management Plot — Foresters will harvest when mature!`);
      } else {
        this.setTicker(`🧺 Set ${name} Plot (${tiles.length} tile${tiles.length === 1 ? '' : 's'}) to Guest U-Pick (Forester harvesting off).`);
      }
      return tiles.length;
    }

    clearConnectedPlot(startTile) {
      const tiles = this.getConnectedPlotTiles(startTile);
      for (const t of tiles) {
        t.plot = null;
        t.plotManaged = false;
      }
      if (tiles.length > 0) this.map.bumpRevision();
      return tiles.length;
    }

    getPlotStats() {
      const counts = {};
      for (const id of PT.TREE_ORDER) counts[id] = { total: 0, empty: 0, managed: 0 };
      let totalZoned = 0;
      let totalEmpty = 0;
      for (let y = 0; y < this.map.size; y++) {
        for (let x = 0; x < this.map.size; x++) {
          const t = this.map.tiles[y][x];
          if (t.owned && t.plot && counts[t.plot]) {
            counts[t.plot].total++;
            if (t.plotManaged) counts[t.plot].managed++;
            totalZoned++;
            if (this.isTilePlantableForPlot(t)) {
              counts[t.plot].empty++;
              totalEmpty++;
            }
          }
        }
      }
      return { counts, totalZoned, totalEmpty };
    }

    canApplyTool(tile) {
      if (!tile) return { ok: false, reason: 'Out of bounds' };
      const mode = this.tool.mode;

      if (mode === 'land') {
        const tiles = this.getLandBrushTiles(tile);
        const buyable = tiles.filter(t => this.map.canBuyTile(t.x, t.y));
        if (buyable.length === 0) return { ok: false, reason: 'Must border owned land' };
        const cost = buyable.reduce((s, t) => s + this.map.getTileLandPrice(t.x, t.y), 0);
        if (this.cash < cost) return { ok: false, reason: `Need $${cost}`, cost };
        return { ok: true, cost, tiles: buyable };
      }

      if (mode === 'terrain') {
        const action = this.tool.itemId;
        const tiles = this.getTerrainBrushTiles(tile);
        const valid = tiles.filter(t => this.canTerraformTile(t, action).ok);
        if (valid.length === 0) {
          const firstCheck = this.canTerraformTile(tile, action);
          return { ok: false, reason: firstCheck.reason || 'Cannot modify terrain here' };
        }
        const unitCost = action === 'water' ? 20 : 15;
        const cost = valid.length * unitCost;
        if (this.cash < unitCost) return { ok: false, reason: `Need $${unitCost}`, cost };
        return { ok: true, cost, tiles: valid };
      }

      if (mode === 'plot') {
        const tiles = this.getPlotBrushTiles(tile);
        const isErase = this.tool.itemId === 'erase';
        if (!isErase && !this.isPlantUnlocked(this.tool.itemId)) {
          return { ok: false, reason: 'Locked crop/tree — check Farm Info → Unlocks!' };
        }
        const valid = tiles.filter(t => {
          if (!t.owned || t.isRoad || t.decor === 'gate') return false;
          if (isErase) return !!t.plot;
          return !t.water && !t.building && !t.path && !t.decor;
        });
        if (valid.length === 0) {
          return { ok: false, reason: isErase ? 'No plot to clear here' : 'Select owned grass tiles' };
        }
        return { ok: true, tiles: valid };
      }

      if (tile.isRoad || tile.decor === 'gate') {
        return { ok: false, reason: 'Entrance/Road protected' };
      }
      if (!tile.owned) {
        return { ok: false, reason: 'Unowned land — use Buy Land!' };
      }

      if (mode === 'tractor_stop') {
        if (!this.tractor) return { ok: false, reason: 'Buy the Tractor Ride first' };
        if (this.isTractorStop(tile.x, tile.y)) return { ok: true, removing: true };
        if (!this.map.isTractorDrivable(tile.x, tile.y)) {
          return { ok: false, reason: 'Must be an open square or path (no trees, buildings, or decor)' };
        }
        return { ok: true, removing: false };
      }

      if (mode === 'boat_dock') {
        if (!this.map.canPlaceBoatDock(tile.x, tile.y)) {
          return { ok: false, reason: 'Place on an owned pond/stream edge next to dry land' };
        }
        const cost = this.boatDock ? 0 : PT.BOAT_DEF.cost;
        if (this.cash < cost) return { ok: false, reason: `Need $${cost}`, cost };
        return { ok: true, cost };
      }

      if (mode === 'plant') {
        const def = PT.TREES[this.tool.itemId];
        if (!def) return { ok: false };
        if (!this.isPlantUnlocked(def.id)) {
          return { ok: false, reason: 'Locked crop/tree — check Farm Info → Unlocks!' };
        }
        if (tile.water) return { ok: false, reason: 'Cannot plant in water' };
        if (tile.building || tile.path || tile.decor || tile.tree) {
          return { ok: false, reason: 'Tile occupied' };
        }
        if (this.cash < def.cost) return { ok: false, reason: `Need $${def.cost}`, cost: def.cost };
        return { ok: true, cost: def.cost };
      }

      if (mode === 'build') {
        const def = PT.BUILDINGS[this.tool.itemId];
        if (!def) return { ok: false };
        if (tile.water) return { ok: false, reason: 'Cannot build on water' };
        if (tile.building || tile.tree || tile.decor || tile.path) {
          return { ok: false, reason: 'Clear tile first' };
        }
        if (this.cash < def.cost) return { ok: false, reason: `Need $${def.cost}`, cost: def.cost };
        return { ok: true, cost: def.cost };
      }

      if (mode === 'path') {
        const def = PT.DECOR[this.tool.itemId];
        if (!def) return { ok: false };
        if (this.boatDock && this.boatDock.x === tile.x && this.boatDock.y === tile.y) {
          return { ok: false, reason: 'Boat Dock is here' };
        }
        if (tile.water && !def.onWater) return { ok: false, reason: 'Use a Wooden Bridge to cross water!' };
        if (tile.building || tile.tree) return { ok: false, reason: 'Tile occupied' };
        if (tile.path === this.tool.itemId) return { ok: false, reason: 'Already placed' };
        if (this.cash < def.cost) return { ok: false, reason: `Need $${def.cost}`, cost: def.cost };
        return { ok: true, cost: def.cost };
      }

      if (mode === 'decor') {
        const def = PT.DECOR[this.tool.itemId];
        if (!def) return { ok: false };
        if (tile.water) return { ok: false, reason: 'Cannot place scenery on water' };
        if (tile.building || tile.tree || tile.decor) return { ok: false, reason: 'Tile occupied' };
        if (this.cash < def.cost) return { ok: false, reason: `Need $${def.cost}`, cost: def.cost };
        return { ok: true, cost: def.cost };
      }

      if (mode === 'harvest') {
        if (!tile.tree) return { ok: false, reason: 'No tree here' };
        const st = this.getTreeStage(tile.tree);
        if (!st.sellable) return { ok: false, reason: 'Tree not mature yet' };
        return { ok: true, profit: Math.round(this.getTreeSalePrice(tile.tree) * 0.85) };
      }

      if (mode === 'bulldoze') {
        if (!tile.tree && !tile.building && !tile.path && !tile.decor && !tile.stump) {
          return { ok: false, reason: 'Nothing to clear' };
        }
        return { ok: true };
      }

      return { ok: true };
    }

    getLandBrushTiles(tile) {
      const sz = this.tool.landBrush;
      if (sz <= 1) return [tile];
      const out = [];
      for (let dy = 0; dy < sz; dy++) {
        for (let dx = 0; dx < sz; dx++) {
          const n = this.map.get(tile.x + dx, tile.y + dy);
          if (n) out.push(n);
        }
      }
      return out;
    }

    getTerrainBrushTiles(tile) {
      const sz = this.tool.terrainBrush;
      if (sz <= 1) return [tile];
      const out = [];
      for (let dy = 0; dy < sz; dy++) {
        for (let dx = 0; dx < sz; dx++) {
          const n = this.map.get(tile.x + dx, tile.y + dy);
          if (n) out.push(n);
        }
      }
      return out;
    }

    canTerraformTile(t, action) {
      if (!t || !t.owned || t.isRoad || t.decor === 'gate') {
        return { ok: false, reason: 'Select owned farm tiles (away from road/gate)' };
      }
      if (this.boatDock && this.boatDock.x === t.x && this.boatDock.y === t.y) {
        return { ok: false, reason: 'Move or remove Boat Dock first' };
      }
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];

      if (action === 'raise' || action === 'lower') {
        if (t.building) return { ok: false, reason: 'Clear building first' };
        if (t.water) return { ok: false, reason: 'Drain water first to change elevation' };
        const nextElev = action === 'raise' ? t.elev + 1 : t.elev - 1;
        if (nextElev > 3) return { ok: false, reason: 'Already at max elevation (Level 3)' };
        if (nextElev < 0) return { ok: false, reason: 'Already at min elevation (Level 0)' };
        for (const [dx, dy] of dirs) {
          const nb = this.map.get(t.x + dx, t.y + dy);
          if (nb && Math.abs(nb.elev - nextElev) > 1) {
            return { ok: false, reason: 'Too steep — adjust adjacent tiles first (max 1-level step)' };
          }
        }
        return { ok: true };
      }

      if (action === 'water') {
        if (t.water) return { ok: false, reason: 'Already water' };
        if (t.building || t.tree || t.decor || t.stump) {
          return { ok: false, reason: 'Clear trees, buildings, or decor first' };
        }
        if (t.path && t.path !== 'path_bridge') {
          return { ok: false, reason: 'Clear path first (or use a Wooden Bridge)' };
        }
        // Keep connected water surfaces flat at the same elevation
        for (const [dx, dy] of dirs) {
          const nb = this.map.get(t.x + dx, t.y + dy);
          if (nb && nb.water && nb.elev !== t.elev) {
            return { ok: false, reason: 'Match adjacent water elevation before connecting' };
          }
        }
        return { ok: true };
      }

      if (action === 'dry') {
        if (!t.water) return { ok: false, reason: 'Select water tiles to drain' };
        return { ok: true };
      }

      return { ok: false, reason: 'Unknown terrain tool' };
    }

    nudgeEntitiesOffWaterTile(tile) {
      const safe = this.map.findAdjacentWalkable(tile.x, tile.y) || this.map.entrance;
      for (const g of this.guests) {
        if (g.state === 'paddling_boat' || g.state === 'riding_tractor') continue;
        if (Math.round(g.x) === tile.x && Math.round(g.y) === tile.y) {
          g.x = safe.x; g.y = safe.y; g.path = [];
        }
      }
      for (const s of this.staff) {
        if (Math.round(s.x) === tile.x && Math.round(s.y) === tile.y) {
          s.x = safe.x; s.y = safe.y; s.path = [];
        }
      }
    }

    getPlotBrushTiles(tile) {
      const sz = this.tool.plotBrush;
      if (sz <= 1) return [tile];
      const out = [];
      for (let dy = 0; dy < sz; dy++) {
        for (let dx = 0; dx < sz; dx++) {
          const n = this.map.get(tile.x + dx, tile.y + dy);
          if (n) out.push(n);
        }
      }
      return out;
    }

    spawnPickleRaid(count = 4, withBoss = false) {
      if (!PT.PickleRaider) return;
      const gx = this.map.entrance.x;
      const gy = this.map.entrance.y;
      for (let i = 0; i < count; i++) {
        const isBoss = withBoss && i === 0;
        const ox = (Math.random() - 0.5) * 2.2;
        const oy = 0.6 + i * 0.45;
        const p = new PT.PickleRaider(gx + 0.5 + ox, gy + oy, isBoss);
        this.pickles.push(p);
      }
      this.pickleWaveActive = true;
      if (PT.audio && PT.audio.error) PT.audio.error();
      const bossMsg = withBoss ? ' + 👑 KING DILL BOSS' : '';
      this.setTicker(`🥒 DILL PICKLE RAID! ${count} Pickle Raiders${bossMsg} are storming your trees — CLICK them to BONK for $45+ bounty!`);
    }

    pickPickleNear(screenX, screenY, hitRadius = 34) {
      if (!this.renderer || !this.pickles || this.pickles.length === 0) return null;
      let best = null;
      let bestD = hitRadius;
      for (let i = 0; i < this.pickles.length; i++) {
        const p = this.pickles[i];
        const w = this.map.posToWorld(p.x, p.y, this.cam.rot);
        const s = this.renderer.worldToScreen(w.wx, w.wy);
        const d = Math.hypot(screenX - s.sx, screenY - (s.sy - 14 * this.cam.zoom));
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      return best;
    }

    applyToolAt(tile, screenX, screenY, hitRadius = 20) {
      // Always allow clicking/tapping a Dill Pickle Raider to BONK it immediately in any tool mode!
      const pIdx = this.pickPickleNear(screenX, screenY, Math.max(hitRadius + 14, 34));
      if (pIdx !== null) {
        const raider = this.pickles[pIdx];
        const alive = raider.bonk(this, false);
        if (!alive) this.pickles.splice(pIdx, 1);
        return;
      }

      if (this.tool.mode === 'inspect') {
        // Check if clicking a peep near cursor first!
        const picked = this.pickEntityNear(screenX, screenY, hitRadius);
        if (picked) {
          this.selected = picked;
          PT.audio.click();
          return;
        }
        if (tile) {
          if (tile.owned && tile.plot && !tile.building) {
            this.selected = { kind: 'plot', ref: tile };
          } else {
            this.selected = { kind: 'tile', ref: tile };
          }
          PT.audio.click();
        }
        return;
      }

      const check = this.canApplyTool(tile);
      if (!check.ok) {
        if (check.reason) this.setTicker(`⚠️ ${check.reason}`);
        PT.audio.error();
        return;
      }

      const mode = this.tool.mode;
      if (mode === 'land') {
        // Iteratively buy connected tiles in brush
        let bought = 0;
        let spent = 0;
        let changed = true;
        const targets = this.getLandBrushTiles(tile);
        while (changed) {
          changed = false;
          for (const t of targets) {
            if (this.map.canBuyTile(t.x, t.y)) {
              const price = this.map.getTileLandPrice(t.x, t.y);
              if (this.cash >= price) {
                t.owned = true;
                this.cash -= price;
                this.ledger.land -= price;
                spent += price;
                bought++;
                this.stats.tilesBought++;
                this.spawnSparkles(t.x, t.y, '#ffe570', 6);
                changed = true;
              }
            }
          }
        }
        if (bought > 0) {
          this.map.bumpRevision();
          PT.audio.landBuy();
          this.addFloatText(tile.x, tile.y, `-${'$' + spent} (+${bought} tile${bought > 1 ? 's' : ''})`, '#ffe270');
          this.setTicker(`🚩 Expanded farm by ${bought} tile${bought > 1 ? 's' : ''}! Total owned: ${this.map.getOwnedCount()} tiles.`);
          this.checkMilestones();
        }
        return;
      }

      if (mode === 'terrain') {
        const action = this.tool.itemId;
        const unitCost = action === 'water' ? 20 : 15;
        const targets = this.getTerrainBrushTiles(tile);
        let changed = 0;
        let spent = 0;
        for (const t of targets) {
          if (this.cash < unitCost) break;
          if (!this.canTerraformTile(t, action).ok) continue;
          if (action === 'raise') {
            t.elev++;
            this.spawnSparkles(t.x, t.y, '#c9a679', 4);
          } else if (action === 'lower') {
            t.elev--;
            this.spawnSparkles(t.x, t.y, '#a88760', 4);
          } else if (action === 'water') {
            t.water = true;
            t.plot = null;
            t.plotManaged = false;
            this.nudgeEntitiesOffWaterTile(t);
            this.spawnSparkles(t.x, t.y, '#8cd4f0', 5);
          } else if (action === 'dry') {
            t.water = false;
            this.spawnSparkles(t.x, t.y, '#88d474', 5);
          }
          this.cash -= unitCost;
          this.ledger.land -= unitCost;
          spent += unitCost;
          changed++;
        }
        if (changed > 0) {
          this.map.bumpRevision();
          if (action === 'water') PT.audio.splash();
          else PT.audio.plant();
          this.addFloatText(tile.x, tile.y, `-$${spent}`, '#ffe270');
          const verbs = { raise: 'Raised', lower: 'Lowered', water: 'Filled with water on', dry: 'Drained' };
          this.setTicker(`⛰️ ${verbs[action] || 'Modified'} ${changed} tile${changed > 1 ? 's' : ''} (-$${spent}).`);
          this.recalcFarmRating();
        }
        return;
      }

      if (mode === 'plot') {
        const isErase = this.tool.itemId === 'erase';
        const targets = check.tiles || this.getPlotBrushTiles(tile);
        let changed = 0;
        const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        for (const t of targets) {
          if (isErase) {
            if (t.plot) { t.plot = null; t.plotManaged = false; changed++; }
          } else if (t.owned && !t.isRoad && !t.water && !t.building && !t.path && !t.decor) {
            if (t.plot !== this.tool.itemId) {
              t.plot = this.tool.itemId;
              // Inherit management flag if expanding an adjacent same-species Management Plot
              let inheritManaged = false;
              for (const [dx, dy] of dirs) {
                const nb = this.map.get(t.x + dx, t.y + dy);
                if (nb && nb.owned && nb.plot === t.plot && nb.plotManaged) {
                  inheritManaged = true;
                  break;
                }
              }
              t.plotManaged = inheritManaged;
              if (inheritManaged) {
                for (const pt of this.getConnectedPlotTiles(t)) pt.plotManaged = true;
              }
              changed++;
            }
          }
        }
        if (changed > 0) {
          this.map.bumpRevision();
          PT.audio.click();
          if (isErase) {
            this.setTicker(`Cleared plot designation on ${changed} tile${changed > 1 ? 's' : ''}.`);
          } else {
            const def = PT.TREES[this.tool.itemId];
            this.setTicker(`🗺 Zoned ${changed} tile${changed > 1 ? 's' : ''} as ${def.name} plot — Foresters will plant empty spaces!`);
          }
        }
        return;
      }

      if (mode === 'tractor_stop') {
        this.toggleTractorStop(tile);
        return;
      }

      if (mode === 'boat_dock') {
        if (this.placeBoatDock(tile)) {
          this.tool.mode = 'inspect';
          this.tool.itemId = null;
        }
        return;
      }

      if (mode === 'plant') {
        const def = PT.TREES[this.tool.itemId];
        tile.stump = false;
        tile.tree = { type: def.id, growth: 4, trimmed: false, reservedBy: null };
        this.map.bumpRevision();
        this.stats.treesPlanted++;
        this.addCash(-def.cost, 'planting', tile.x, tile.y);
        this.spawnSparkles(tile.x, tile.y, '#88d474', 5);
        PT.audio.plant();
        return;
      }

      if (mode === 'build') {
        const def = PT.BUILDINGS[this.tool.itemId];
        tile.stump = false;
        tile.plot = null;
        tile.plotManaged = false;
        tile.building = {
          id: this.nextBuildingId++,
          type: def.id,
          price: def.defaultPrice,
          open: true,
          revenue: 0,
          served: 0
        };
        this.map.bumpRevision();
        this.addCash(-def.cost, 'building', tile.x, tile.y);
        this.spawnSparkles(tile.x, tile.y, '#ffd875', 8);
        PT.audio.build();
        this.setTicker(`🏠 Built ${def.name}!`);
        this.recalcFarmRating();
        this.checkMilestones();
        return;
      }

      if (mode === 'path') {
        const def = PT.DECOR[this.tool.itemId];
        tile.stump = false;
        tile.plot = null;
        tile.plotManaged = false;
        tile.path = def.id;
        this.map.bumpRevision();
        this.addCash(-def.cost, 'building', tile.x, tile.y);
        PT.audio.click();
        return;
      }

      if (mode === 'decor') {
        const def = PT.DECOR[this.tool.itemId];
        tile.stump = false;
        tile.plot = null;
        tile.plotManaged = false;
        tile.decor = def.id;
        this.map.bumpRevision();
        this.addCash(-def.cost, 'building', tile.x, tile.y);
        this.spawnSparkles(tile.x, tile.y, '#ffe98a', 5);
        PT.audio.build();
        this.recalcFarmRating();
        return;
      }

      if (mode === 'harvest') {
        const profit = check.profit;
        const plantType = tile.tree.type;
        const def = PT.TREES[plantType];
        const name = def ? def.name : 'Harvest';
        this.harvestPlantTile(tile);
        this.recordPlantSold(plantType);
        this.addCash(profit, 'trees', tile.x, tile.y);
        this.spawnSparkles(tile.x, tile.y, '#8cc474', 8);
        if (def && def.category !== 'tree') PT.audio.plant();
        else PT.audio.chop();
        if (!this.ticker.startsWith('🔓 Unlocked')) {
          this.setTicker(`${def ? def.icon : '🪓'} Wholesale harvested ${name} for $${profit}!`);
        }
        this.checkMilestones();
        return;
      }

      if (mode === 'bulldoze') {
        let refund = 0;
        if (tile.building) {
          refund = Math.round(PT.BUILDINGS[tile.building.type].cost * 0.45);
          tile.building = null;
        }
        tile.tree = null;
        tile.decor = null;
        tile.path = null;
        tile.stump = false;
        this.map.bumpRevision();
        if (refund > 0) this.addCash(refund, 'building', tile.x, tile.y);
        PT.audio.chop();
        this.recalcFarmRating();
      }
    }

    hireStaff(role) {
      const def = PT.STAFF_TYPES[role];
      if (!def) return false;
      if (this.cash < def.hireCost) {
        this.setTicker(`⚠️ Need $${def.hireCost} to hire a ${def.name}.`);
        PT.audio.error();
        return false;
      }
      if (def.hireCost > 0) {
        this.cash -= def.hireCost;
        this.ledger.wages -= def.hireCost;
      }
      const s = new PT.Staff(role, this.map.entrance.x, this.map.entrance.y - 1);
      this.staff.push(s);
      if (role === 'dog') {
        PT.audio.bark();
        this.setTicker(`🐕 Welcomed ${s.name} to the farm! (Unpaid — works for belly rubs!)`);
      } else {
        PT.audio.build();
        this.setTicker(`👷 Hired ${s.name}!`);
      }
      return true;
    }

    fireStaff(id) {
      const idx = this.staff.findIndex(s => s.id === id);
      if (idx >= 0) {
        const s = this.staff[idx];
        this.staff.splice(idx, 1);
        if (this.selected && this.selected.ref === s) this.selected = null;
        if (s.role === 'dog') {
          this.setTicker(`Sent ${s.name} home for a cozy nap.`);
        } else {
          this.setTicker(`Released ${s.name} from staff.`);
        }
        PT.audio.click();
      }
    }

    buyTractor() {
      if (this.tractor) return false;
      const def = PT.TRACTOR_DEF;
      if (this.cash < def.cost) {
        this.setTicker(`⚠️ Need $${def.cost} to buy the ${def.name}.`);
        PT.audio.error();
        return false;
      }
      // Find a clean drivable spawn tile near the entrance plaza
      const ex = this.map.entrance.x;
      const ey = this.map.entrance.y;
      let spawn = null;
      const preferred = [
        [ex, ey - 3], [ex, ey - 2], [ex + 1, ey - 3], [ex - 1, ey - 3], [ex, ey - 4]
      ];
      for (const [px, py] of preferred) {
        if (this.map.isTractorDrivable(px, py)) { spawn = { x: px, y: py }; break; }
      }
      if (!spawn) {
        outer: for (let y = this.map.size - 1; y >= 0; y--) {
          for (let x = 0; x < this.map.size; x++) {
            if (this.map.isTractorDrivable(x, y)) { spawn = { x, y }; break outer; }
          }
        }
      }
      if (!spawn) {
        this.setTicker('⚠️ Clear an open path or grass square to place the Tractor!');
        PT.audio.error();
        return false;
      }

      this.addCash(-def.cost, 'building', spawn.x, spawn.y);
      const tr = new PT.Tractor(spawn.x, spawn.y);
      tr.syncTrailAfterTeleport();

      // Seed 2 convenient initial stops if open (plaza + upper terrace) so it starts rolling right away!
      tr.stops.push({ x: spawn.x, y: spawn.y });
      const upperCandidates = [
        [ex, ey - 12], [ex + 6, ey - 12], [ex - 5, ey - 9], [ex + 6, ey - 3]
      ];
      for (const [ux, uy] of upperCandidates) {
        if ((ux !== spawn.x || uy !== spawn.y) && this.map.isTractorDrivable(ux, uy)) {
          if (this.map.findTractorPath(spawn.x, spawn.y, ux, uy).length > 0) {
            tr.stops.push({ x: ux, y: uy });
            break;
          }
        }
      }

      this.tractor = tr;
      this.spawnSparkles(spawn.x, spawn.y, '#ffe066', 10);
      PT.audio.tractorBell();
      this.recalcFarmRating();
      this.setTicker(`🚜 Bought the ${def.name}! Click stops on paths or open ground to customize its route.`);
      return true;
    }

    sellTractor() {
      if (!this.tractor) return;
      const refund = Math.round(PT.TRACTOR_DEF.cost * 0.5);
      this.tractor.unloadAllRiders(this);
      const tx = this.tractor.x;
      const ty = this.tractor.y;
      if (this.selected && this.selected.ref === this.tractor) this.selected = null;
      this.tractor = null;
      this.addCash(refund, 'building', tx, ty);
      PT.audio.chop();
      this.recalcFarmRating();
      this.setTicker(`Sold Tractor Wagon Ride (+$${refund}).`);
    }

    toggleTractorStop(tile) {
      if (!this.tractor || !tile) return;
      const idx = this.tractor.stops.findIndex(s => s.x === tile.x && s.y === tile.y);
      if (idx >= 0) {
        this.removeTractorStop(idx);
        return;
      }
      if (!this.map.isTractorDrivable(tile.x, tile.y)) {
        this.setTicker('⚠️ Tractor stops must be on open squares or paths.');
        PT.audio.error();
        return;
      }
      this.tractor.stops.push({ x: tile.x, y: tile.y });
      this.spawnSparkles(tile.x, tile.y, '#ffcf59', 6);
      PT.audio.tractorBell();
      this.recalcFarmRating();
      this.setTicker(`📍 Added Tractor Stop #${this.tractor.stops.length} at (${tile.x}, ${tile.y})!`);
    }

    removeTractorStop(idx) {
      if (!this.tractor || idx < 0 || idx >= this.tractor.stops.length) return;
      this.tractor.stops.splice(idx, 1);
      if (this.tractor.stopIdx >= this.tractor.stops.length) this.tractor.stopIdx = 0;
      this.tractor.path = [];
      if (this.tractor.stops.length < 2) {
        this.tractor.unloadAllRiders(this);
        this.tractor.state = 'idle';
      }
      PT.audio.click();
      this.recalcFarmRating();
      this.setTicker(`Removed Tractor Stop #${idx + 1}.`);
    }

    clearTractorStops() {
      if (!this.tractor) return;
      this.tractor.stops = [];
      this.tractor.stopIdx = 0;
      this.tractor.path = [];
      this.tractor.unloadAllRiders(this);
      this.tractor.state = 'idle';
      PT.audio.click();
      this.recalcFarmRating();
      this.setTicker('Cleared all Tractor Ride stops.');
    }

    getTractorRouteSegments() {
      if (!this.tractor || this.tractor.stops.length < 2) return [];
      const stops = this.tractor.stops;
      const segments = [];
      for (let i = 0; i < stops.length; i++) {
        const a = stops[i];
        const b = stops[(i + 1) % stops.length];
        const p = this.map.findTractorPath(a.x, a.y, b.x, b.y);
        if (p.length > 0) {
          segments.push([{ x: a.x, y: a.y }, ...p]);
        }
      }
      return segments;
    }

    placeBoatDock(tile) {
      if (!tile || !this.map.canPlaceBoatDock(tile.x, tile.y)) {
        this.setTicker('⚠️ Place the Boat Dock on an owned pond/stream edge next to dry land.');
        PT.audio.error();
        return false;
      }
      const def = PT.BOAT_DEF;
      if (this.boatDock) {
        // Relocate existing dock smoothly
        this.boatDock.disembarkAll(this);
        this.boatDock.x = tile.x;
        this.boatDock.y = tile.y;
        this.spawnSparkles(tile.x, tile.y, '#9ee6ff', 8);
        PT.audio.splash();
        this.setTicker(`🚣 Relocated ${def.name} dock to (${tile.x}, ${tile.y})!`);
        return true;
      }
      if (this.cash < def.cost) {
        this.setTicker(`⚠️ Need $${def.cost} to build the ${def.name} dock.`);
        PT.audio.error();
        return false;
      }
      this.addCash(-def.cost, 'building', tile.x, tile.y);
      this.boatDock = new PT.BoatDock(tile.x, tile.y);
      this.spawnSparkles(tile.x, tile.y, '#9ee6ff', 10);
      PT.audio.splash();
      this.recalcFarmRating();
      this.setTicker(`🚣 Built ${def.name}! Guests can now rent rowboats and paddle around the pond!`);
      return true;
    }

    sellBoatDock() {
      if (!this.boatDock) return;
      const refund = Math.round(PT.BOAT_DEF.cost * 0.5);
      const bx = this.boatDock.x;
      const by = this.boatDock.y;
      this.boatDock.disembarkAll(this);
      if (this.selected && this.selected.ref === this.boatDock) this.selected = null;
      this.boatDock = null;
      this.addCash(refund, 'building', bx, by);
      PT.audio.chop();
      this.recalcFarmRating();
      this.setTicker(`Removed Pond Boat Rentals dock (+$${refund}).`);
    }

    pickEntityNear(screenX, screenY, hitRadius = 20) {
      if (!this.renderer) return null;
      const all = [...this.guests.filter(g => g.state !== 'riding_tractor' && g.state !== 'paddling_boat'), ...this.staff];
      let best = null;
      let bestD = hitRadius;
      for (const e of all) {
        const w = this.map.posToWorld(e.x, e.y, this.cam.rot);
        const p = this.renderer.worldToScreen(w.wx, w.wy);
        const d = Math.hypot(screenX - p.sx, screenY - (p.sy - 10 * this.cam.zoom));
        if (d < bestD) {
          bestD = d;
          best = { kind: e.kind, ref: e };
        }
      }
      // Also allow clicking/tapping the Tractor or its tow-behind Wagon!
      if (this.tractor) {
        const tr = this.tractor;
        for (const [tx, ty] of [[tr.x, tr.y], [tr.wagonX, tr.wagonY]]) {
          const w = this.map.posToWorld(tx, ty, this.cam.rot);
          const p = this.renderer.worldToScreen(w.wx, w.wy);
          const d = Math.hypot(screenX - p.sx, screenY - (p.sy - 12 * this.cam.zoom));
          if (d < Math.max(bestD, 26)) {
            bestD = d;
            best = { kind: 'tractor', ref: tr };
          }
        }
      }
      // Also allow clicking/tapping the Boat Rental Dock or any paddling rowboat!
      if (this.boatDock) {
        const dock = this.boatDock;
        const pts = [[dock.x, dock.y], ...dock.boats.map(b => [b.x, b.y])];
        for (const [bx, by] of pts) {
          const w = this.map.posToWorld(bx, by, this.cam.rot);
          const p = this.renderer.worldToScreen(w.wx, w.wy);
          const d = Math.hypot(screenX - p.sx, screenY - (p.sy - 10 * this.cam.zoom));
          if (d < Math.max(bestD, 26)) {
            bestD = d;
            best = { kind: 'boat_dock', ref: dock };
          }
        }
      }
      return best;
    }

    save(silent = false) {
      try {
        const data = {
          year: this.year,
          month: this.month,
          day: this.day,
          cash: this.cash,
          snowCover: this.snowCover,
          isSnowing: this.isSnowing,
          ledger: this.ledger,
          stats: this.stats,
          completedMilestones: this.completedMilestones,
          unlockedPlants: this.unlockedPlants,
          nextBuildingId: this.nextBuildingId,
          map: this.map.serialize(),
          staff: this.staff.map(s => ({ role: s.role, name: s.name, x: s.x, y: s.y, tasksDone: s.tasksDone })),
          tractor: this.tractor ? {
            x: this.tractor.x,
            y: this.tractor.y,
            open: this.tractor.open,
            price: this.tractor.price,
            revenue: this.tractor.revenue,
            served: this.tractor.served,
            stops: this.tractor.stops,
            stopIdx: this.tractor.stopIdx
          } : null,
          boatDock: this.boatDock ? {
            x: this.boatDock.x,
            y: this.boatDock.y,
            open: this.boatDock.open,
            price: this.boatDock.price,
            revenue: this.boatDock.revenue,
            served: this.boatDock.served
          } : null
        };
        localStorage.setItem(SAVE_KEY, JSON.stringify(data));
        if (!silent) {
          this.setTicker('💾 Farm saved successfully!');
          PT.audio.click();
        }
        return true;
      } catch (e) {
        return false;
      }
    }

    load() {
      try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw) return false;
        const d = JSON.parse(raw);
        if (!d || !this.map.deserialize(d.map)) return false;
        this.year = d.year || 1;
        this.month = d.month ?? 10;
        this.day = d.day || 18;
        this.cash = d.cash ?? 1250;
        this.snowCover = d.snowCover ?? 0;
        this.isSnowing = !!d.isSnowing;
        this.ledger = Object.assign(this.ledger, d.ledger || {});
        this.stats = Object.assign(this.stats, d.stats || {});
        if (!this.stats.soldByType) this.stats.soldByType = {};
        this.completedMilestones = d.completedMilestones || {};
        this.unlockedPlants = Object.assign(this.createDefaultUnlocks(), d.unlockedPlants || {});
        this.checkPlantUnlocks(true);
        this.unlockRevision++;
        this.nextBuildingId = d.nextBuildingId || 20;
        this.staff = (d.staff || []).filter(sd => PT.STAFF_TYPES[sd.role]).map(sd => {
          const s = new PT.Staff(sd.role, sd.x, sd.y);
          s.name = sd.name;
          s.tasksDone = sd.tasksDone || 0;
          return s;
        });
        if (d.tractor) {
          const tr = new PT.Tractor(d.tractor.x, d.tractor.y);
          tr.open = d.tractor.open !== false;
          tr.price = d.tractor.price ?? PT.TRACTOR_DEF.defaultPrice;
          tr.revenue = d.tractor.revenue || 0;
          tr.served = d.tractor.served || 0;
          tr.stops = Array.isArray(d.tractor.stops) ? d.tractor.stops.map(s => ({ x: s.x, y: s.y })) : [];
          tr.stopIdx = d.tractor.stopIdx || 0;
          tr.syncTrailAfterTeleport();
          this.tractor = tr;
        } else {
          this.tractor = null;
        }
        if (d.boatDock) {
          const bd = new PT.BoatDock(d.boatDock.x, d.boatDock.y);
          bd.open = d.boatDock.open !== false;
          bd.price = d.boatDock.price ?? PT.BOAT_DEF.defaultPrice;
          bd.revenue = d.boatDock.revenue || 0;
          bd.served = d.boatDock.served || 0;
          this.boatDock = bd;
        } else {
          this.boatDock = null;
        }
        this.guests = [];
        for (let i = 0; i < 3; i++) this.spawnGuest();
        this.recalcFarmRating();
        this.setTicker('📂 Loaded your saved Pinecrest Tree Farm!');
        return true;
      } catch (e) {
        return false;
      }
    }

    resetFarm() {
      localStorage.removeItem(SAVE_KEY);
      this.setupStarterFarm();
      this.selected = null;
      this.centerCamera();
      this.setTicker('🌲 Started a brand-new Pinecrest Tree Farm!');
      PT.audio.landBuy();
    }
  }

  PT.Game = Game;
})();
