(function () {
  const PT = (window.PT = window.PT || {});

  class UIController {
    constructor(game) {
      this.game = game;
      this.activeTab = 'overview';
      this.activeStaffTab = 'all';
      this._seenUnlockRev = -1;
      this.zCounter = 45;
      this.uiTimer = 0;

      this.bindToolbar();
      this.bindWindows();
      this.buildCatalogs();
      this.syncTouchMode(this.game.usingTouch);
      this.updateHUD();
      this.updateStaffWindow();
      this.updateTractorWindow();
      this.updateBoatsWindow();
      this.updateFinancesWindow();
    }

    makeThumbCanvas(sprite, cropTop = 0) {
      const c = document.createElement('canvas');
      c.width = 42;
      c.height = 42;
      const ctx = c.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      if (!sprite) return c;
      const sw = sprite.width;
      const sh = sprite.height - cropTop;
      const scale = Math.min(40 / sw, 40 / sh);
      const dw = Math.round(sw * scale);
      const dh = Math.round(sh * scale);
      ctx.drawImage(sprite, 0, cropTop, sw, sh, Math.round((42 - dw) / 2), Math.round((42 - dh) / 2), dw, dh);
      return c;
    }

    bindToolbar() {
      const g = this.game;

      // Speed controls
      const syncSpeedBtns = () => {
        document.getElementById('btn-pause').classList.toggle('active', g.paused);
        document.getElementById('btn-speed-1').classList.toggle('active', !g.paused && g.speed === 1);
        document.getElementById('btn-speed-2').classList.toggle('active', !g.paused && g.speed === 2);
        document.getElementById('btn-speed-3').classList.toggle('active', !g.paused && g.speed === 3);
      };
      this.syncSpeedBtns = syncSpeedBtns;

      document.getElementById('btn-pause').onclick = () => { g.paused = !g.paused; syncSpeedBtns(); PT.audio.click(); };
      document.getElementById('btn-speed-1').onclick = () => { g.paused = false; g.speed = 1; syncSpeedBtns(); PT.audio.click(); };
      document.getElementById('btn-speed-2').onclick = () => { g.paused = false; g.speed = 2; syncSpeedBtns(); PT.audio.click(); };
      document.getElementById('btn-speed-3').onclick = () => { g.paused = false; g.speed = 3; syncSpeedBtns(); PT.audio.click(); };

      // Camera controls
      document.getElementById('btn-zoom-in').onclick = () => { this.adjustZoom(1); PT.audio.click(); };
      document.getElementById('btn-zoom-out').onclick = () => { this.adjustZoom(-1); PT.audio.click(); };
      document.getElementById('btn-rot-ccw').onclick = () => { this.rotateCamera(-1); PT.audio.click(); };
      document.getElementById('btn-rot-cw').onclick = () => { this.rotateCamera(1); PT.audio.click(); };
      document.getElementById('btn-center').onclick = () => { g.centerCamera(); PT.audio.click(); };

      // Window toggle buttons
      document.querySelectorAll('[data-window]').forEach(btn => {
        btn.onclick = () => {
          const id = 'win-' + btn.dataset.window;
          this.toggleWindow(id);
          PT.audio.click();
        };
      });

      // Direct tool buttons
      document.getElementById('btn-tool-land').onclick = () => {
        if (g.tool.mode === 'land') {
          this.cancelTool();
          this.hideWindow('win-land');
        } else {
          this.setTool('land', null, '🚩 Click highlighted FOR SALE tiles to expand your farm');
          this.showWindow('win-land');
          this.updateLandWindow();
        }
        PT.audio.click();
      };

      document.getElementById('btn-tool-harvest').onclick = () => {
        if (g.tool.mode === 'harvest') this.cancelTool();
        else this.setTool('harvest', null, '🪓 Click any mature tree to wholesale harvest it immediately');
        PT.audio.click();
      };

      document.getElementById('btn-tool-bulldoze').onclick = () => {
        if (g.tool.mode === 'bulldoze') this.cancelTool();
        else this.setTool('bulldoze', null, '💣 Click tiles to clear trees, stumps, paths, or demolish stalls');
        PT.audio.click();
      };

      document.getElementById('tool-banner-cancel').onclick = () => {
        this.cancelTool();
        PT.audio.click();
      };

      const paintToggleBtn = document.getElementById('tool-banner-paint');
      if (paintToggleBtn) {
        paintToggleBtn.onclick = () => {
          g.touchDragPaint = !g.touchDragPaint;
          this.syncPaintToggle();
          PT.audio.click();
        };
      }

      // Land brush buttons
      const setLandBrush = (sz) => {
        g.tool.landBrush = sz;
        document.getElementById('btn-land-single').classList.toggle('active', sz === 1);
        document.getElementById('btn-land-patch').classList.toggle('active', sz === 2);
        document.getElementById('btn-land-large').classList.toggle('active', sz === 3);
        PT.audio.click();
      };
      document.getElementById('btn-land-single').onclick = () => setLandBrush(1);
      document.getElementById('btn-land-patch').onclick = () => setLandBrush(2);
      document.getElementById('btn-land-large').onclick = () => setLandBrush(3);

      // Tree Plot brush & overlay buttons
      const setPlotBrush = (sz) => {
        g.tool.plotBrush = sz;
        document.getElementById('btn-plot-1').classList.toggle('active', sz === 1);
        document.getElementById('btn-plot-2').classList.toggle('active', sz === 2);
        document.getElementById('btn-plot-3').classList.toggle('active', sz === 3);
        PT.audio.click();
      };
      document.getElementById('btn-plot-1').onclick = () => setPlotBrush(1);
      document.getElementById('btn-plot-2').onclick = () => setPlotBrush(2);
      document.getElementById('btn-plot-3').onclick = () => setPlotBrush(3);

      const btnPlotOverlay = document.getElementById('btn-plot-overlay');
      btnPlotOverlay.onclick = () => {
        g.showPlotsOverlay = !g.showPlotsOverlay;
        btnPlotOverlay.classList.toggle('active', g.showPlotsOverlay);
        PT.audio.click();
      };

      document.getElementById('btn-plot-erase').onclick = () => {
        this.setTool('plot', 'erase', '🧹 Erasing Plot Designations — Click or drag on zoned tiles');
        PT.audio.click();
      };

      // Terrain brush & manipulation tool buttons
      const setTerrainBrush = (sz) => {
        g.tool.terrainBrush = sz;
        document.getElementById('btn-terr-1').classList.toggle('active', sz === 1);
        document.getElementById('btn-terr-2').classList.toggle('active', sz === 2);
        document.getElementById('btn-terr-3').classList.toggle('active', sz === 3);
        PT.audio.click();
      };
      document.getElementById('btn-terr-1').onclick = () => setTerrainBrush(1);
      document.getElementById('btn-terr-2').onclick = () => setTerrainBrush(2);
      document.getElementById('btn-terr-3').onclick = () => setTerrainBrush(3);

      const terrainHints = {
        raise: '⬆️ Raising Terrain ($15/tile) — Click or drag on owned ground',
        lower: '⬇️ Lowering Terrain ($15/tile) — Click or drag on owned ground',
        water: '💧 Filling Water ($20/tile) — Click or drag on empty owned tiles',
        dry:   '🌱 Draining Water ($15/tile) — Click or drag on owned water tiles'
      };
      document.querySelectorAll('#win-terraform .catalog-item[data-mode="terrain"]').forEach(btn => {
        btn.onclick = () => {
          const id = btn.dataset.id;
          this.setTool('terrain', id, terrainHints[id] || '⛰️ Modifying terrain');
          PT.audio.click();
        };
      });

      // Season filter buttons for Plants & Plots catalogs
      document.querySelectorAll('[data-tree-filter]').forEach(btn => {
        btn.onclick = () => {
          const f = btn.dataset.treeFilter;
          document.querySelectorAll('[data-tree-filter]').forEach(b => b.classList.toggle('active', b === btn));
          document.querySelectorAll('#trees-catalog .catalog-item').forEach(item => {
            const def = PT.TREES[item.dataset.id];
            const show = f === 'all' || (def && def.peakSeasons && def.peakSeasons.includes(f));
            item.classList.toggle('hidden', !show);
          });
          PT.audio.click();
        };
      });

      document.querySelectorAll('[data-plot-filter]').forEach(btn => {
        btn.onclick = () => {
          const f = btn.dataset.plotFilter;
          document.querySelectorAll('[data-plot-filter]').forEach(b => b.classList.toggle('active', b === btn));
          document.querySelectorAll('#plots-catalog .catalog-item').forEach(item => {
            const def = PT.TREES[item.dataset.id];
            const show = f === 'all' || (def && def.peakSeasons && def.peakSeasons.includes(f));
            item.classList.toggle('hidden', !show);
          });
          PT.audio.click();
        };
      });

      // Music, Sound, Save, Help, Reset
      const btnMusic = document.getElementById('btn-music');
      const syncMusicBtn = () => {
        if (!btnMusic) return;
        const on = PT.audio.musicEnabled;
        btnMusic.classList.toggle('active', on);
        btnMusic.style.opacity = on ? '1' : '0.55';
        btnMusic.title = on ? 'Ambient Music: On (N to Mute)' : 'Ambient Music: Off (N to Play)';
      };
      syncMusicBtn();
      if (btnMusic) {
        btnMusic.onclick = () => {
          PT.audio.setMusicEnabled(!PT.audio.musicEnabled);
          syncMusicBtn();
          PT.audio.click();
        };
      }

      const btnSound = document.getElementById('btn-sound');
      btnSound.onclick = () => {
        PT.audio.enabled = !PT.audio.enabled;
        btnSound.textContent = PT.audio.enabled ? '🔊' : '🔇';
        btnSound.classList.toggle('active', PT.audio.enabled);
      };

      document.getElementById('btn-save').onclick = () => g.save(false);
      document.getElementById('btn-help').onclick = () => { this.toggleWindow('win-help'); PT.audio.click(); };
      document.getElementById('btn-help-close').onclick = () => { this.hideWindow('win-help'); PT.audio.click(); };
      document.getElementById('btn-reset-farm').onclick = () => {
        if (confirm('Start a brand-new Pinecrest Tree Farm? Your current saved farm will be replaced.')) {
          g.resetFarm();
          this.syncPlantCatalogLocks();
          this.updateHUD();
          this.updateStaffWindow(true);
          this.updateTractorWindow(true);
          this.updateBoatsWindow(true);
          this.updateFinancesWindow();
          this.hideWindow('win-inspector');
        }
      };

      // Tabs in finances/overview window
      document.querySelectorAll('#win-finances .rct-tab').forEach(tab => {
        tab.onclick = () => {
          this.activeTab = tab.dataset.tab;
          document.querySelectorAll('#win-finances .rct-tab').forEach(t => t.classList.toggle('active', t === tab));
          document.getElementById('tab-overview').classList.toggle('hidden', this.activeTab !== 'overview');
          document.getElementById('tab-unlocks').classList.toggle('hidden', this.activeTab !== 'unlocks');
          document.getElementById('tab-finances').classList.toggle('hidden', this.activeTab !== 'finances');
          document.getElementById('tab-goals').classList.toggle('hidden', this.activeTab !== 'goals');
          this.updateFinancesWindow(true);
          PT.audio.click();
        };
      });

      // Tabs in staff management window
      document.querySelectorAll('#staff-tabs .rct-tab').forEach(tab => {
        tab.onclick = () => {
          this.activeStaffTab = tab.dataset.staffTab;
          document.querySelectorAll('#staff-tabs .rct-tab').forEach(t => t.classList.toggle('active', t === tab));
          this.updateStaffWindow(true);
          PT.audio.click();
        };
      });
    }

    adjustZoom(delta) {
      const levels = [0.45, 0.6, 0.8, 1.0, 1.25, 1.5, 2.0];
      let idx = levels.reduce((best, v, i) => Math.abs(v - this.game.cam.zoom) < Math.abs(levels[best] - this.game.cam.zoom) ? i : best, 3);
      idx = Math.max(0, Math.min(levels.length - 1, idx + delta));
      this.game.cam.zoom = levels[idx];
    }

    rotateCamera(dir) {
      const g = this.game;
      // Preserve currently centered tile across 90-degree rotation!
      const centerTile = g.map.worldToTile(g.cam.x, g.cam.y, g.cam.rot);
      g.cam.rot = (g.cam.rot + dir + 4) & 3;
      if (centerTile) {
        const p = g.map.tileToWorld(centerTile.x, centerTile.y, g.cam.rot);
        g.cam.x = p.wx;
        g.cam.y = p.wy;
      } else {
        g.centerCamera();
      }
    }

    bindWindows() {
      // Close buttons
      document.querySelectorAll('[data-close]').forEach(btn => {
        btn.onclick = () => {
          const id = btn.dataset.close;
          this.hideWindow(id);
          if (id === 'win-land' && this.game.tool.mode === 'land') this.cancelTool();
          if (id === 'win-terraform' && this.game.tool.mode === 'terrain') this.cancelTool();
          if (id === 'win-plots' && this.game.tool.mode === 'plot') this.cancelTool();
          if (id === 'win-tractor' && this.game.tool.mode === 'tractor_stop') this.cancelTool();
          if (id === 'win-boats' && this.game.tool.mode === 'boat_dock') this.cancelTool();
          if (id === 'win-inspector') this.game.selected = null;
          PT.audio.click();
        };
      });

      // Bring window to front on click + titlebar dragging
      document.querySelectorAll('.rct-window').forEach(win => {
        win.addEventListener('mousedown', () => {
          win.style.zIndex = ++this.zCounter;
        });
      });

      let dragWin = null, ox = 0, oy = 0;
      const startDrag = (bar, clientX, clientY) => {
        dragWin = document.getElementById(bar.dataset.drag);
        const rect = dragWin.getBoundingClientRect();
        dragWin.style.left = rect.left + 'px';
        dragWin.style.top = rect.top + 'px';
        dragWin.style.right = 'auto';
        dragWin.style.bottom = 'auto';
        dragWin.style.transform = 'none';
        ox = clientX - rect.left;
        oy = clientY - rect.top;
        dragWin.style.zIndex = ++this.zCounter;
      };
      const moveDrag = (clientX, clientY) => {
        if (!dragWin) return;
        const nx = Math.max(4, Math.min(window.innerWidth - 100, clientX - ox));
        const ny = Math.max(46, Math.min(window.innerHeight - 80, clientY - oy));
        dragWin.style.left = nx + 'px';
        dragWin.style.top = ny + 'px';
      };

      document.querySelectorAll('[data-drag]').forEach(bar => {
        bar.addEventListener('mousedown', (e) => {
          if (e.target.closest('button')) return;
          startDrag(bar, e.clientX, e.clientY);
        });
        bar.addEventListener('touchstart', (e) => {
          if (window.innerWidth <= 720) return; // Bottom-sheet mode on phones
          if (e.target.closest('button') || e.touches.length !== 1) return;
          const t = e.touches[0];
          startDrag(bar, t.clientX, t.clientY);
        }, { passive: true });
      });

      window.addEventListener('mousemove', (e) => moveDrag(e.clientX, e.clientY));
      window.addEventListener('mouseup', () => { dragWin = null; });
      window.addEventListener('touchmove', (e) => {
        if (!dragWin || e.touches.length !== 1) return;
        e.preventDefault();
        moveDrag(e.touches[0].clientX, e.touches[0].clientY);
      }, { passive: false });
      window.addEventListener('touchend', () => { dragWin = null; });
      window.addEventListener('touchcancel', () => { dragWin = null; });
    }

    syncTouchMode(isTouch) {
      this.game.usingTouch = !!isTouch;
      document.body.classList.toggle('is-touch-mode', this.game.usingTouch);
      this.syncPaintToggle();
    }

    syncPaintToggle() {
      const btn = document.getElementById('tool-banner-paint');
      if (!btn) return;
      const paintable = ['path', 'plant', 'plot', 'land', 'terrain', 'bulldoze', 'harvest'].includes(this.game.tool.mode);
      btn.classList.toggle('hidden', !paintable);
      btn.classList.toggle('active', !!this.game.touchDragPaint);
      btn.textContent = this.game.touchDragPaint ? '🖌 Drag Paint' : '✋ Pan Mode';
    }

    clampWindow(el) {
      if (!el || el.classList.contains('hidden') || window.innerWidth <= 720) return;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0) return;
      let left = rect.left;
      let top = rect.top;
      let needsFix = false;
      if (left + rect.width > window.innerWidth - 4) {
        left = Math.max(4, window.innerWidth - rect.width - 4);
        needsFix = true;
      }
      if (top + 60 > window.innerHeight) {
        top = Math.max(48, window.innerHeight - rect.height - 40);
        needsFix = true;
      }
      if (left < 4) { left = 4; needsFix = true; }
      if (top < 46) { top = 46; needsFix = true; }
      if (needsFix) {
        el.style.left = left + 'px';
        el.style.top = top + 'px';
        el.style.right = 'auto';
        el.style.bottom = 'auto';
        el.style.transform = 'none';
      }
    }

    clampAllWindows() {
      document.querySelectorAll('.rct-window:not(.hidden)').forEach(el => this.clampWindow(el));
    }

    showWindow(id) {
      const el = document.getElementById(id);
      if (!el) return;
      if (window.innerWidth <= 720) {
        document.querySelectorAll('.rct-window:not(.hidden)').forEach(other => {
          if (other.id !== id) this.hideWindow(other.id);
        });
      }
      el.classList.remove('hidden');
      el.style.zIndex = ++this.zCounter;
      this.clampWindow(el);
      if (id === 'win-staff') this.updateStaffWindow(true);
      if (id === 'win-finances') this.updateFinancesWindow(true);
      if (id === 'win-land') this.updateLandWindow();
      if (id === 'win-trees') this.syncPlantCatalogLocks();
      if (id === 'win-plots') {
        this.game.plotsWindowOpen = true;
        this.syncPlantCatalogLocks();
        this.updatePlotsWindow();
      }
      if (id === 'win-tractor') {
        this.game.tractorWindowOpen = true;
        this.updateTractorWindow(true);
      }
      if (id === 'win-boats') {
        this.game.boatWindowOpen = true;
        this.updateBoatsWindow(true);
      }
    }

    hideWindow(id) {
      const el = document.getElementById(id);
      if (el) el.classList.add('hidden');
      if (id === 'win-plots') this.game.plotsWindowOpen = false;
      if (id === 'win-tractor') this.game.tractorWindowOpen = false;
      if (id === 'win-boats') this.game.boatWindowOpen = false;
    }

    toggleWindow(id) {
      const el = document.getElementById(id);
      if (!el) return;
      if (el.classList.contains('hidden')) this.showWindow(id);
      else this.hideWindow(id);
    }

    setTool(mode, itemId, label) {
      this.game.tool.mode = mode;
      this.game.tool.itemId = itemId;
      document.getElementById('btn-tool-land').classList.toggle('active', mode === 'land');
      document.getElementById('btn-tool-harvest').classList.toggle('active', mode === 'harvest');
      document.getElementById('btn-tool-bulldoze').classList.toggle('active', mode === 'bulldoze');
      const eraseBtn = document.getElementById('btn-plot-erase');
      if (eraseBtn) eraseBtn.classList.toggle('active', mode === 'plot' && itemId === 'erase');

      document.querySelectorAll('.catalog-item').forEach(el => {
        el.classList.toggle('selected', el.dataset.mode === mode && el.dataset.id === itemId);
      });

      const banner = document.getElementById('tool-banner');
      if (mode === 'inspect') {
        this.game.touchDragPaint = false;
        banner.classList.add('hidden');
      } else {
        document.getElementById('tool-banner-text').textContent = label;
        banner.classList.remove('hidden');
        // On small phone screens, collapse catalog sheets after picking a placement tool so the map is visible
        if (window.innerWidth <= 720 && ['plant', 'plot', 'build', 'path', 'decor', 'terrain', 'tractor_stop', 'boat_dock'].includes(mode)) {
          ['win-trees', 'win-plots', 'win-stalls', 'win-decor', 'win-terraform', 'win-tractor', 'win-boats'].forEach(id => this.hideWindow(id));
        }
      }
      this.syncPaintToggle();
    }

    cancelTool() {
      this.setTool('inspect', null, '');
      this.hideWindow('win-land');
    }

    buildCatalogs() {
      // 1. Plants & Trees Catalog
      const treesEl = document.getElementById('trees-catalog');
      treesEl.innerHTML = '';
      for (const id of PT.TREE_ORDER) {
        const def = PT.TREES[id];
        const btn = document.createElement('button');
        btn.className = 'catalog-item';
        btn.dataset.mode = 'plant';
        btn.dataset.id = id;
        const speedLbl = def.growRate >= 1.25 ? 'Fast' : def.growRate >= 0.9 ? 'Medium' : 'Slow';
        const thumbCrop = (def.category === 'crop' && id !== 'sunflower' && id !== 'lavender') ? 38 : 14;
        btn.innerHTML = `
          <div class="catalog-preview"></div>
          <div class="catalog-meta">
            <div class="catalog-top">
              <span class="catalog-name">${def.icon || '🌲'} ${def.name}</span>
              <span class="catalog-cost">$${def.cost}</span>
            </div>
            <div class="catalog-desc">${def.desc}</div>
            <div class="catalog-tags">
              <span class="tag-pill">${def.seasonLabel || 'Winter'}</span>
              <span class="tag-pill">Sells ~$${def.basePrice}–$${Math.round(def.basePrice * 1.7)}</span>
              <span class="tag-pill">${def.regrowTo ? 'Regrows!' : speedLbl}</span>
              <span class="tag-pill lock-pill hidden" data-lock-badge="${id}"></span>
            </div>
          </div>
        `;
        btn.querySelector('.catalog-preview').appendChild(this.makeThumbCanvas(PT.sprites.trees[id].green[4], thumbCrop));
        btn.onclick = () => {
          if (!this.game.isPlantUnlocked(id)) {
            const prog = this.game.getPlantUnlockProgress(id);
            const reqDef = prog.req ? PT.TREES[prog.req.type] : null;
            this.game.setTicker(`🔒 Unlock ${def.name} by selling ${prog.needed} ${reqDef ? reqDef.name : 'crops'} (${prog.current}/${prog.needed})! See Farm Info → Unlocks.`);
            PT.audio.error();
            return;
          }
          this.setTool('plant', id, `${def.icon || '🌱'} Planting ${def.name} ($${def.cost}) — Click or tap owned grass`);
          PT.audio.click();
        };
        treesEl.appendChild(btn);
      }

      // 1b. Crop & Tree Plots Catalog
      const plotsEl = document.getElementById('plots-catalog');
      plotsEl.innerHTML = '';
      for (const id of PT.TREE_ORDER) {
        const def = PT.TREES[id];
        const btn = document.createElement('button');
        btn.className = 'catalog-item';
        btn.dataset.mode = 'plot';
        btn.dataset.id = id;
        const thumbCrop = (def.category === 'crop' && id !== 'sunflower' && id !== 'lavender') ? 38 : 14;
        btn.innerHTML = `
          <div class="catalog-preview"></div>
          <div class="catalog-meta">
            <div class="catalog-top">
              <span class="catalog-name"><span class="plot-swatch" style="background:${def.plotColor};"></span>${def.name} Plot</span>
              <span class="catalog-cost">$${def.cost}/tile</span>
            </div>
            <div class="catalog-desc">Foresters auto-plant ${def.name} in open tiles of this zone.</div>
            <div class="catalog-tags">
              <span class="tag-pill">${def.seasonLabel || 'Winter'}</span>
              <span class="tag-pill" data-plot-stat="${id}">0 tiles (0 empty)</span>
              <span class="tag-pill lock-pill hidden" data-lock-badge="${id}"></span>
            </div>
          </div>
        `;
        btn.querySelector('.catalog-preview').appendChild(this.makeThumbCanvas(PT.sprites.trees[id].green[4], thumbCrop));
        btn.onclick = () => {
          if (!this.game.isPlantUnlocked(id)) {
            const prog = this.game.getPlantUnlockProgress(id);
            const reqDef = prog.req ? PT.TREES[prog.req.type] : null;
            this.game.setTicker(`🔒 Unlock ${def.name} first by selling ${prog.needed} ${reqDef ? reqDef.name : 'crops'} (${prog.current}/${prog.needed})!`);
            PT.audio.error();
            return;
          }
          this.setTool('plot', id, `🗺 Zoning ${def.name} Plot — Click or drag on owned grass tiles`);
          PT.audio.click();
        };
        plotsEl.appendChild(btn);
      }
      this.syncPlantCatalogLocks();

      // 2. Stalls & Buildings Catalog
      const stallsEl = document.getElementById('stalls-catalog');
      stallsEl.innerHTML = '';
      for (const id of PT.BUILDING_ORDER) {
        const def = PT.BUILDINGS[id];
        const btn = document.createElement('button');
        btn.className = 'catalog-item';
        btn.dataset.mode = 'build';
        btn.dataset.id = id;
        btn.innerHTML = `
          <div class="catalog-preview"></div>
          <div class="catalog-meta">
            <div class="catalog-top">
              <span class="catalog-name">${def.name}</span>
              <span class="catalog-cost">$${def.cost}</span>
            </div>
            <div class="catalog-desc">${def.desc}</div>
            <div class="catalog-tags">
              <span class="tag-pill">Upkeep $${def.upkeep}/mo</span>
              <span class="tag-pill">Appeal +${def.appeal}</span>
            </div>
          </div>
        `;
        btn.querySelector('.catalog-preview').appendChild(this.makeThumbCanvas(PT.sprites.buildings[id].normal, 18));
        btn.onclick = () => {
          this.setTool('build', id, `🏠 Placing ${def.name} ($${def.cost}) — Place next to a walkway`);
          PT.audio.click();
        };
        stallsEl.appendChild(btn);
      }

      // 3. Paths & Decor Catalog
      const decorEl = document.getElementById('decor-catalog');
      decorEl.innerHTML = '';
      for (const id of PT.DECOR_ORDER) {
        const def = PT.DECOR[id];
        const mode = def.kind === 'path' ? 'path' : 'decor';
        const btn = document.createElement('button');
        btn.className = 'catalog-item';
        btn.dataset.mode = mode;
        btn.dataset.id = id;
        btn.innerHTML = `
          <div class="catalog-preview"></div>
          <div class="catalog-meta">
            <div class="catalog-top">
              <span class="catalog-name">${def.name}</span>
              <span class="catalog-cost">$${def.cost}</span>
            </div>
            <div class="catalog-desc">${def.desc}</div>
            <div class="catalog-tags">
              <span class="tag-pill">Appeal +${def.appeal}</span>
            </div>
          </div>
        `;
        const spr = def.kind === 'path' ? PT.sprites.tiles[id] : PT.sprites.decor[id];
        btn.querySelector('.catalog-preview').appendChild(this.makeThumbCanvas(spr, 0));
        btn.onclick = () => {
          const hint = id === 'path_bridge'
            ? `🌉 Placing ${def.name} ($${def.cost}) — Build across streams, ponds, or walkways`
            : `🛤 Placing ${def.name} ($${def.cost}) — Click or drag on owned tiles`;
          this.setTool(mode, id, hint);
          PT.audio.click();
        };
        decorEl.appendChild(btn);
      }

      // 4. Staff Hire Buttons
      const hireEl = document.getElementById('staff-hire-buttons');
      hireEl.innerHTML = '';
      for (const role of Object.keys(PT.STAFF_TYPES)) {
        const s = PT.STAFF_TYPES[role];
        const b = document.createElement('button');
        b.className = 'rct-btn';
        b.title = s.desc;
        const costLabel = (s.hireCost === 0 && s.wage === 0)
          ? 'Free (Unpaid)'
          : (s.wage === 0 ? `$${s.hireCost} (Unpaid)` : `$${s.hireCost} ($${s.wage}/mo)`);
        b.innerHTML = `+ ${s.name}<br><small>${costLabel}</small>`;
        b.onclick = () => {
          if (this.game.hireStaff(role)) {
            this.updateStaffWindow(true);
            this.updateHUD();
          }
        };
        hireEl.appendChild(b);
      }
    }

    syncPlantCatalogLocks() {
      const g = this.game;
      for (const id of PT.TREE_ORDER) {
        const prog = g.getPlantUnlockProgress(id);
        const reqDef = prog.req ? PT.TREES[prog.req.type] : null;
        document.querySelectorAll(`.catalog-item[data-id="${id}"]`).forEach(el => {
          el.classList.toggle('locked', !prog.unlocked);
        });
        document.querySelectorAll(`[data-lock-badge="${id}"]`).forEach(badge => {
          if (prog.unlocked) {
            badge.classList.add('hidden');
            badge.textContent = '';
          } else {
            badge.classList.remove('hidden');
            badge.textContent = `🔒 Sell ${prog.current}/${prog.needed} ${reqDef ? reqDef.name : ''}`;
          }
        });
      }
      this._seenUnlockRev = g.unlockRevision;
      this._seenTreesSold = g.stats.treesSold;
    }

    update(dt) {
      this.uiTimer += dt;
      if (this.uiTimer >= 0.25) {
        this.uiTimer = 0;
        this.updateHUD();
        if (this._seenUnlockRev !== this.game.unlockRevision || this._seenTreesSold !== this.game.stats.treesSold) {
          this.syncPlantCatalogLocks();
        }
        if (!document.getElementById('win-inspector').classList.contains('hidden')) {
          this.updateInspector();
        }
        if (!document.getElementById('win-finances').classList.contains('hidden')) {
          this.updateFinancesWindow();
        }
        if (!document.getElementById('win-staff').classList.contains('hidden')) {
          this.updateStaffWindow();
        }
        if (!document.getElementById('win-land').classList.contains('hidden')) {
          this.updateLandWindow();
        }
        if (!document.getElementById('win-plots').classList.contains('hidden')) {
          this.updatePlotsWindow();
        }
        if (this.game.tool.mode === 'inspect' && !document.getElementById('tool-banner').classList.contains('hidden')) {
          this.cancelTool();
        }
        if (!document.getElementById('win-tractor').classList.contains('hidden')) {
          this.updateTractorWindow();
        }
        if (!document.getElementById('win-boats').classList.contains('hidden')) {
          this.updateBoatsWindow();
        }
      }
    }

    updateBoatsWindow(force = false) {
      const g = this.game;
      const bodyEl = document.getElementById('boats-body');
      if (!bodyEl) return;
      const dock = g.boatDock;
      const def = PT.BOAT_DEF;
      const placing = g.tool.mode === 'boat_dock';
      const frozen = g.isWinterVisual();
      const pondSize = dock ? g.map.getConnectedWaterTiles(dock.x, dock.y).length : 0;
      const sig = dock
        ? `owned:${dock.x},${dock.y}:${dock.open}:${dock.price}:${dock.revenue}:${dock.served}:${dock.boats.length}:${dock.status}:${placing}:${pondSize}:${frozen}`
        : `none:${placing}:${g.cash >= def.cost}:${frozen}`;
      if (!force && sig === this._lastBoatsSig) return;
      this._lastBoatsSig = sig;

      if (!dock) {
        bodyEl.innerHTML = `
          <div class="window-hint">${def.desc}</div>
          <div class="stat-grid">
            <div class="stat-box"><div class="lbl">Dock Cost</div><div class="val">$${def.cost}</div></div>
            <div class="stat-box"><div class="lbl">Monthly Upkeep</div><div class="val">$${def.upkeep}/mo</div></div>
            <div class="stat-box"><div class="lbl">Boat / Skate Cap</div><div class="val">${def.maxBoats} / ${def.maxSkaters}</div></div>
            <div class="stat-box"><div class="lbl">Farm Appeal</div><div class="val">+${def.appeal}</div></div>
          </div>
          <button id="btn-place-boat-dock" class="rct-btn ${placing ? 'active' : 'primary'}" style="width:100%;">
            ${placing ? '✕ Cancel Placement' : `🚣 Place Boat &amp; Skate Dock ($${def.cost})`}
          </button>
        `;
        bodyEl.querySelector('#btn-place-boat-dock').onclick = () => {
          if (g.tool.mode === 'boat_dock') {
            this.cancelTool();
          } else {
            this.setTool('boat_dock', null, `🚣 Click an owned pond or stream edge next to dry land ($${def.cost})`);
          }
          PT.audio.click();
          this.updateBoatsWindow(true);
        };
        return;
      }

      const cap = dock.getCapacity(g);
      bodyEl.innerHTML = `
        <div class="window-hint">
          ${frozen
            ? '<strong>❄️ Winter Ice Skating Mode:</strong> The pond is frozen! Guests rent ice skates to glide across the ice before returning to the dock.'
            : '<strong>🚣 Open Water Boat Mode:</strong> Guests rent wooden rowboats to paddle around the pond (switches to Ice Skating when water freezes in Winter!).'}
        </div>
        <div><strong>Season Activity:</strong> ${frozen ? '⛸️ Ice Skate Rentals (Frozen Pond)' : '🚣 Rowboat Rentals (Open Water)'}</div>
        <div><strong>Status:</strong> ${dock.status}</div>
        <div><strong>Dock Location:</strong> (${dock.x}, ${dock.y}) • <strong>Pond Area:</strong> ${pondSize} tiles</div>
        <div><strong>Active ${frozen ? 'Skaters' : 'Boats'}:</strong> ${dock.boats.length} / ${cap} • <strong>Total Rentals:</strong> ${dock.served}</div>
        <div><strong>Revenue:</strong> <span class="pos">$${dock.revenue}</span> • <strong>Upkeep:</strong> $${def.upkeep}/mo</div>
        <div class="price-controls">
          <strong>Rental Fee:</strong>
          <button id="bd-price-dn" class="rct-btn small">-</button>
          <span style="min-width:34px; text-align:center; font-weight:700;">$${dock.price}</span>
          <button id="bd-price-up" class="rct-btn small">+</button>
          <small style="color:#555">(Fair: $${def.defaultPrice})</small>
        </div>
        <div style="display:flex; gap:6px; margin-top:8px; flex-wrap:wrap;">
          <button id="bd-find" class="rct-btn">Find Dock</button>
          <button id="bd-relocate" class="rct-btn ${placing ? 'active' : 'primary'}" style="flex:1;">
            ${placing ? '✕ Cancel Move' : '📍 Move Dock'}
          </button>
          <button id="bd-toggle-open" class="rct-btn">${dock.open ? 'Close' : 'Open'}</button>
        </div>
        <div style="display:flex; justify-content:flex-end; margin-top:8px;">
          <button id="bd-sell" class="rct-btn small danger">Remove Dock (+$${Math.round(def.cost * 0.5)})</button>
        </div>
      `;

      bodyEl.querySelector('#bd-price-dn').onclick = () => {
        dock.price = Math.max(def.minPrice, dock.price - 1);
        PT.audio.click();
        this.updateBoatsWindow(true);
      };
      bodyEl.querySelector('#bd-price-up').onclick = () => {
        dock.price = Math.min(def.maxPrice, dock.price + 1);
        PT.audio.click();
        this.updateBoatsWindow(true);
      };
      bodyEl.querySelector('#bd-find').onclick = () => {
        const w = g.map.tileToWorld(dock.x, dock.y, g.cam.rot);
        g.cam.x = w.wx;
        g.cam.y = w.wy;
        g.selected = { kind: 'boat_dock', ref: dock };
        PT.audio.click();
      };
      bodyEl.querySelector('#bd-relocate').onclick = () => {
        if (g.tool.mode === 'boat_dock') {
          this.cancelTool();
        } else {
          this.setTool('boat_dock', null, '🚣 Click a new owned pond/stream edge to move the Boat Dock');
        }
        PT.audio.click();
        this.updateBoatsWindow(true);
      };
      bodyEl.querySelector('#bd-toggle-open').onclick = () => {
        dock.open = !dock.open;
        g.recalcFarmRating();
        PT.audio.click();
        this.updateBoatsWindow(true);
      };
      bodyEl.querySelector('#bd-sell').onclick = () => {
        if (g.tool.mode === 'boat_dock') this.cancelTool();
        g.sellBoatDock();
        this.updateBoatsWindow(true);
        this.updateHUD();
        this.hideWindow('win-inspector');
      };
    }

    updateTractorWindow(force = false) {
      const g = this.game;
      const bodyEl = document.getElementById('tractor-body');
      if (!bodyEl) return;
      const tr = g.tractor;
      const def = PT.TRACTOR_DEF;
      const stopModeActive = g.tool.mode === 'tractor_stop';
      const sig = tr
        ? `owned:${tr.open}:${tr.price}:${tr.revenue}:${tr.served}:${tr.riders.length}:${tr.status}:${stopModeActive}:${tr.stops.map(s => `${s.x},${s.y},${g.map.isTractorDrivable(s.x, s.y) ? 1 : 0}`).join('|')}`
        : `none:${g.cash >= def.cost}`;
      if (!force && sig === this._lastTractorSig) return;
      this._lastTractorSig = sig;

      if (!tr) {
        bodyEl.innerHTML = `
          <div class="window-hint">${def.desc}</div>
          <div class="stat-grid">
            <div class="stat-box"><div class="lbl">Purchase Cost</div><div class="val">$${def.cost}</div></div>
            <div class="stat-box"><div class="lbl">Monthly Upkeep</div><div class="val">$${def.upkeep}/mo</div></div>
            <div class="stat-box"><div class="lbl">Wagon Capacity</div><div class="val">${def.capacity} guests</div></div>
            <div class="stat-box"><div class="lbl">Farm Appeal</div><div class="val">+${def.appeal}</div></div>
          </div>
          <button id="btn-buy-tractor" class="rct-btn primary" style="width:100%;">🚜 Buy Tractor Wagon Ride ($${def.cost})</button>
        `;
        bodyEl.querySelector('#btn-buy-tractor').onclick = () => {
          if (g.buyTractor()) {
            this.updateTractorWindow(true);
            this.updateHUD();
          }
        };
        return;
      }

      const stopRowsHtml = tr.stops.length === 0
        ? '<div class="window-hint">No stops set yet. Click <strong>Select Stops on Map</strong> and pick 2+ open squares or paths!</div>'
        : tr.stops.map((s, idx) => {
            const ok = g.map.isTractorDrivable(s.x, s.y);
            const active = tr.state === 'waiting' && tr.stopIdx === idx;
            return `
              <div class="roster-row">
                <div>
                  <strong>Stop #${idx + 1}</strong> (${s.x}, ${s.y}) ${active ? '🟢' : ''}${!ok ? '<span class="neg"> Blocked!</span>' : ''}
                </div>
                <div>
                  <button class="rct-btn small" data-stop-find="${idx}">Find</button>
                  <button class="rct-btn small danger" data-stop-del="${idx}">✕</button>
                </div>
              </div>
            `;
          }).join('');

      bodyEl.innerHTML = `
        <div class="window-hint">
          Drives along paths &amp; open grass (never through trees, buildings, or decor) and pauses briefly at each stop to load &amp; unload riders.
        </div>
        <div><strong>Status:</strong> ${tr.status}</div>
        <div><strong>Riders Aboard:</strong> ${tr.riders.length} / ${def.capacity} • <strong>Total Rides:</strong> ${tr.served}</div>
        <div><strong>Revenue:</strong> <span class="pos">$${tr.revenue}</span> • <strong>Upkeep:</strong> $${def.upkeep}/mo</div>
        <div class="price-controls">
          <strong>Fare:</strong>
          <button id="tr-price-dn" class="rct-btn small">-</button>
          <span style="min-width:34px; text-align:center; font-weight:700;">$${tr.price}</span>
          <button id="tr-price-up" class="rct-btn small">+</button>
          <small style="color:#555">(Fair: $${def.defaultPrice})</small>
        </div>
        <div style="display:flex; gap:6px; margin:8px 0; flex-wrap:wrap;">
          <button id="tr-select-stops" class="rct-btn ${stopModeActive ? 'active' : 'primary'}" style="flex:1;">
            ${stopModeActive ? '✓ Done Selecting Stops' : '📍 Select Stops on Map'}
          </button>
          <button id="tr-find" class="rct-btn">Find</button>
          <button id="tr-toggle-open" class="rct-btn">${tr.open ? 'Close' : 'Open'}</button>
        </div>
        <div class="section-divider">Route Stops (${tr.stops.length})</div>
        <div class="roster-list">${stopRowsHtml}</div>
        <div style="display:flex; justify-content:space-between; gap:6px; margin-top:8px;">
          <button id="tr-clear-stops" class="rct-btn small">Clear Stops</button>
          <button id="tr-sell" class="rct-btn small danger">Sell Ride (+$${Math.round(def.cost * 0.5)})</button>
        </div>
      `;

      bodyEl.querySelector('#tr-price-dn').onclick = () => {
        tr.price = Math.max(def.minPrice, tr.price - 1);
        PT.audio.click();
        this.updateTractorWindow(true);
      };
      bodyEl.querySelector('#tr-price-up').onclick = () => {
        tr.price = Math.min(def.maxPrice, tr.price + 1);
        PT.audio.click();
        this.updateTractorWindow(true);
      };
      bodyEl.querySelector('#tr-select-stops').onclick = () => {
        if (g.tool.mode === 'tractor_stop') {
          this.cancelTool();
        } else {
          this.setTool('tractor_stop', null, '📍 Click open squares or paths to add/remove Tractor Stops');
        }
        PT.audio.click();
        this.updateTractorWindow(true);
      };
      bodyEl.querySelector('#tr-find').onclick = () => {
        const w = g.map.posToWorld(tr.x, tr.y, g.cam.rot);
        g.cam.x = w.wx;
        g.cam.y = w.wy;
        g.selected = { kind: 'tractor', ref: tr };
        PT.audio.click();
      };
      bodyEl.querySelector('#tr-toggle-open').onclick = () => {
        tr.open = !tr.open;
        if (!tr.open) tr.unloadAllRiders(g);
        g.recalcFarmRating();
        PT.audio.click();
        this.updateTractorWindow(true);
      };
      bodyEl.querySelector('#tr-clear-stops').onclick = () => {
        g.clearTractorStops();
        this.updateTractorWindow(true);
      };
      bodyEl.querySelector('#tr-sell').onclick = () => {
        if (g.tool.mode === 'tractor_stop') this.cancelTool();
        g.sellTractor();
        this.updateTractorWindow(true);
        this.updateHUD();
        this.hideWindow('win-inspector');
      };

      bodyEl.querySelectorAll('[data-stop-find]').forEach(btn => {
        btn.onclick = () => {
          const s = tr.stops[Number(btn.dataset.stopFind)];
          if (!s) return;
          const w = g.map.tileToWorld(s.x, s.y, g.cam.rot);
          g.cam.x = w.wx;
          g.cam.y = w.wy;
          PT.audio.click();
        };
      });
      bodyEl.querySelectorAll('[data-stop-del]').forEach(btn => {
        btn.onclick = () => {
          g.removeTractorStop(Number(btn.dataset.stopDel));
          this.updateTractorWindow(true);
        };
      });
    }

    updatePlotsWindow() {
      const stats = this.game.getPlotStats();
      for (const id of PT.TREE_ORDER) {
        const el = document.querySelector(`[data-plot-stat="${id}"]`);
        if (el) {
          const c = stats.counts[id];
          const mg = c.managed > 0 ? ` • 🪓 ${c.managed} mgmt` : '';
          el.textContent = `${c.total} tile${c.total === 1 ? '' : 's'} (${c.empty} empty${mg})`;
        }
      }
    }

    updateHUD() {
      const g = this.game;
      const cashEl = document.getElementById('stat-cash');
      cashEl.textContent = (g.cash < 0 ? '-$' : '$') + Math.abs(Math.round(g.cash)).toLocaleString();
      cashEl.classList.toggle('low', g.cash < 100);

      const m = g.getMonthInfo();
      const s = g.getSeason();
      document.getElementById('stat-date').textContent = `${m.name} ${g.day}, Year ${g.year}`;
      const weatherIcon = g.isSnowing ? '❄️ Snowing' : `${s.icon} ${s.name}`;
      document.getElementById('stat-weather').textContent = `${weatherIcon} ${m.temp}°F`;
      document.getElementById('stat-ticker').textContent = g.ticker;
      document.getElementById('stat-guests').textContent = `👥 ${g.guests.length}`;

      const tc = g.getTreeCounts();
      document.getElementById('stat-trees').textContent = `🌲 ${tc.mature}/${tc.total}`;
      document.getElementById('stat-rating').textContent = `★ ${g.farmRating}`;
    }

    updateLandWindow() {
      const g = this.game;
      const owned = g.map.getOwnedCount();
      const sig = `${owned}:${g.stats.tilesBought}`;
      if (sig === this._lastLandSig) return;
      this._lastLandSig = sig;
      const total = g.map.size * (g.map.size - 1) - (g.map.roadSetback || 0); // exclude road & driveway
      const box = document.getElementById('land-stats-box');
      box.innerHTML = `
        <div><strong>Owned Land:</strong> ${owned} / ${total} tiles</div>
        <div><strong>Tiles Purchased:</strong> ${g.stats.tilesBought}</div>
        <div><strong>Tip:</strong> Expand toward the road in front or up into the alpine ridges!</div>
      `;
    }

    updateStaffWindow(force = false) {
      const g = this.game;
      const tab = this.activeStaffTab || 'all';

      // Count staff per role & monthly payroll
      const counts = { all: g.staff.length, forester: 0, handyman: 0, lumberjack: 0, dog: 0 };
      let totalWages = 0;
      for (const s of g.staff) {
        if (counts[s.role] !== undefined) counts[s.role]++;
        totalWages += PT.STAFF_TYPES[s.role].wage;
      }

      // Sync tab counters
      for (const k of Object.keys(counts)) {
        const el = document.getElementById('staff-tab-cnt-' + k);
        if (el) el.textContent = counts[k];
      }

      const filtered = tab === 'all' ? g.staff : g.staff.filter(s => s.role === tab);
      const sig = `${tab}:${totalWages}:${filtered.map(s => `${s.id},${s.status},${s.tasksDone}`).join('|')}`;
      if (!force && sig === this._lastStaffSig) return;
      this._lastStaffSig = sig;

      const hireGrid = document.getElementById('staff-hire-buttons');
      const roleHeader = document.getElementById('staff-role-header');
      const heading = document.getElementById('staff-roster-heading');

      if (tab === 'all') {
        hireGrid.classList.remove('hidden');
        roleHeader.innerHTML = `
          <div class="staff-role-banner">
            <div><strong>Total Crew:</strong> ${g.staff.length}</div>
            <div><strong>Monthly Payroll:</strong> $${totalWages}/mo</div>
          </div>
        `;
        heading.innerHTML = `All Active Crew (<span id="staff-count-label">${filtered.length}</span>)`;
      } else {
        hireGrid.classList.add('hidden');
        const def = PT.STAFF_TYPES[tab];
        const roleWages = filtered.length * def.wage;
        const costLabel = (def.hireCost === 0 && def.wage === 0)
          ? 'Free • Unpaid'
          : `$${def.hireCost} ($${def.wage}/mo)`;
        const btnLabel = tab === 'dog' ? '+ Welcome Farm Dog' : `+ Hire ${def.name}`;
        roleHeader.innerHTML = `
          <div class="window-hint">${def.desc}</div>
          <div class="staff-role-banner">
            <div>
              <strong>${def.name}s:</strong> ${filtered.length}<br>
              <span>${def.wage > 0 ? `Payroll: $${roleWages}/mo` : 'Unpaid ($0/mo)'}</span>
            </div>
            <button id="staff-tab-hire-btn" class="rct-btn primary">${btnLabel}<br><small>${costLabel}</small></button>
          </div>
        `;
        roleHeader.querySelector('#staff-tab-hire-btn').onclick = () => {
          if (g.hireStaff(tab)) {
            this.updateStaffWindow(true);
            this.updateHUD();
          }
        };
        heading.innerHTML = `${def.name} Roster (<span id="staff-count-label">${filtered.length}</span>)`;
      }

      const list = document.getElementById('staff-roster');
      if (filtered.length === 0) {
        const emptyMsg = tab === 'all'
          ? 'No staff hired yet. Hire a Forester to auto-plant & tend crops, or welcome a free Farm Dog!'
          : `No ${PT.STAFF_TYPES[tab].name}s on duty yet. Use the button above to add one!`;
        list.innerHTML = `<div class="window-hint">${emptyMsg}</div>`;
        return;
      }

      list.innerHTML = '';
      for (const s of filtered) {
        const def = PT.STAFF_TYPES[s.role];
        const isDog = s.role === 'dog';
        const wageLabel = def.wage > 0 ? `($${def.wage}/mo)` : '(Unpaid)';
        const statLabel = isDog ? 'Guests Cheered' : 'Tasks';
        const fireLabel = isDog ? 'Send Home' : 'Fire';
        const row = document.createElement('div');
        row.className = 'roster-row';
        row.innerHTML = `
          <div>
            <strong>${s.name}</strong> ${wageLabel}<br>
            <span style="color:#544f42">${s.status} • ${statLabel}: ${s.tasksDone}</span>
          </div>
          <div>
            <button class="rct-btn small" data-find="${s.id}">Find</button>
            <button class="rct-btn small danger" data-fire="${s.id}">${fireLabel}</button>
          </div>
        `;
        row.querySelector('[data-find]').onclick = () => {
          const w = g.map.posToWorld(s.x, s.y, g.cam.rot);
          g.cam.x = w.wx;
          g.cam.y = w.wy;
          g.selected = { kind: 'staff', ref: s };
          this.showInspector();
        };
        row.querySelector('[data-fire]').onclick = () => {
          g.fireStaff(s.id);
          this.updateStaffWindow(true);
        };
        list.appendChild(row);
      }
    }

    updateFinancesWindow(force = false) {
      const g = this.game;
      const tab = this.activeTab || 'overview';

      if (tab === 'overview') {
        const profile = g.getGuestSpawnProfile();
        const tc = profile.supply;
        const season = g.getSeason();
        const owned = g.map.getOwnedCount();
        const sig = `ov:${g.farmRating}:${g.stats.treesSold}:${season.id}:${tc.inSeasonReady}:${profile.crowdLabel}:${g.guests.length}:${profile.maxGuests}:${owned}`;
        if (!force && sig === this._lastFinancesSig) return;
        this._lastFinancesSig = sig;

        document.getElementById('tab-overview').innerHTML = `
          <div class="stat-grid">
            <div class="stat-box"><div class="lbl">Farm Rating</div><div class="val">★ ${g.farmRating} / 999</div></div>
            <div class="stat-box"><div class="lbl">Harvests Sold</div><div class="val">🧺 ${g.stats.treesSold}</div></div>
            <div class="stat-box"><div class="lbl">In-Season Ready</div><div class="val">${season.icon} ${tc.inSeasonReady} ready</div></div>
            <div class="stat-box"><div class="lbl">Seasonal Draw</div><div class="val">${profile.crowdLabel}</div></div>
            <div class="stat-box"><div class="lbl">Active Guests</div><div class="val">👥 ${g.guests.length} / ${profile.maxGuests}</div></div>
            <div class="stat-box"><div class="lbl">Owned Tiles</div><div class="val">${owned} tiles</div></div>
          </div>
          <div class="window-hint">
            <strong>Seasonal Crowd Tip:</strong> Guests flock in when you have abundant <strong>in-season U-pick crops</strong> ready—Tulips in Spring, Strawberries/Blueberries/Sunflowers in Summer, Pumpkins &amp; Apples in Fall, and Christmas trees in Winter!
          </div>
        `;
        return;
      }

      if (tab === 'finances') {
        const l = g.ledger;
        const sig = `fin:${Math.round(l.trees)}:${Math.round(l.stalls)}:${Math.round(l.milestones)}:${Math.round(l.planting)}:${Math.round(l.building)}:${Math.round(l.land)}:${Math.round(l.wages)}`;
        if (!force && sig === this._lastFinancesSig) return;
        this._lastFinancesSig = sig;

        const net = l.trees + l.stalls + l.milestones + l.planting + l.building + l.land + l.wages;
        const fmt = (v) => `<span class="${v >= 0 ? 'pos' : 'neg'}">${v >= 0 ? '+$' : '-$'}${Math.abs(Math.round(v)).toLocaleString()}</span>`;
        document.getElementById('tab-finances').innerHTML = `
          <table class="ledger-table">
            <thead><tr><th>Category</th><th class="num">Total</th></tr></thead>
            <tbody>
              <tr><td>Trees &amp; Harvest Sales</td><td class="num">${fmt(l.trees)}</td></tr>
              <tr><td>Stalls &amp; Rides</td><td class="num">${fmt(l.stalls)}</td></tr>
              <tr><td>Milestone Bonuses</td><td class="num">${fmt(l.milestones)}</td></tr>
              <tr><td>Planting &amp; Seeds</td><td class="num">${fmt(l.planting)}</td></tr>
              <tr><td>Buildings &amp; Paths</td><td class="num">${fmt(l.building)}</td></tr>
              <tr><td>Land Expansion</td><td class="num">${fmt(l.land)}</td></tr>
              <tr><td>Staff Wages &amp; Upkeep</td><td class="num">${fmt(l.wages)}</td></tr>
              <tr><th>Net Farm Profit</th><th class="num">${fmt(net)}</th></tr>
            </tbody>
          </table>
        `;
        return;
      }

      if (tab === 'unlocks') {
        const unlocksEl = document.getElementById('tab-unlocks');
        if (!unlocksEl) return;
        const sig = `unl:${g.unlockRevision}:${g.stats.treesSold}`;
        if (!force && sig === this._lastFinancesSig) return;
        this._lastFinancesSig = sig;

        const totalPlants = PT.TREE_ORDER.length;
        const unlockedCount = g.getUnlockedCount();
        let html = `
          <div class="window-hint">
            <strong>Crop &amp; Tree Unlocks (${unlockedCount} / ${totalPlants}):</strong> Harvest and sell each variety (via Guests, Manual Harvest, or Forester Management Plots) to unlock higher-tier crops, berries, &amp; trees!
          </div>
        `;
        for (const track of PT.UNLOCK_TRACKS) {
          html += `<div class="unlock-track"><div class="unlock-track-title">${track.icon} ${track.name}</div>`;
          for (const id of track.items) {
            const def = PT.TREES[id];
            const prog = g.getPlantUnlockProgress(id);
            const sold = g.getPlantSoldCount(id);
            const reqDef = prog.req ? PT.TREES[prog.req.type] : null;
            if (prog.unlocked) {
              html += `
                <div class="unlock-card unlocked">
                  <div class="unlock-card-top">
                    <span><strong>✅ ${def.icon} ${def.name}</strong> <small>(${def.seasonLabel})</small></span>
                    <span class="pos">Sold: ${sold}</span>
                  </div>
                </div>
              `;
            } else {
              html += `
                <div class="unlock-card">
                  <div class="unlock-card-top">
                    <span><strong>🔒 ${def.icon} ${def.name}</strong> <small>(${def.seasonLabel})</small></span>
                    <span>Sell ${prog.current} / ${prog.needed} ${reqDef ? reqDef.name : ''}</span>
                  </div>
                  <div class="meter-track" style="margin-top:4px; height:7px;">
                    <div class="meter-fill" style="width:${prog.pct}%; background:#d99b32;"></div>
                  </div>
                </div>
              `;
            }
          }
          html += '</div>';
        }
        unlocksEl.innerHTML = html;
        return;
      }

      // Milestones Tab
      const doneKeys = Object.keys(g.completedMilestones).filter(k => g.completedMilestones[k]).join(',');
      const sig = `goals:${doneKeys}`;
      if (!force && sig === this._lastFinancesSig) return;
      this._lastFinancesSig = sig;

      const goalsEl = document.getElementById('tab-goals');
      let gHtml = '';
      for (const m of PT.MILESTONES) {
        const done = !!g.completedMilestones[m.id];
        gHtml += `
          <div class="milestone-card${done ? ' done' : ''}">
            <div class="milestone-title">
              <span>${done ? '✅' : '🎯'} ${m.title}</span>
              <span class="pos">+$${m.reward}</span>
            </div>
            <div class="milestone-desc">${m.desc}</div>
          </div>
        `;
      }
      goalsEl.innerHTML = gHtml;
    }

    showInspector() {
      if (!this.game.selected) {
        this.hideWindow('win-inspector');
        return;
      }
      this.showWindow('win-inspector');
      this.updateInspector(true);
    }

    meterHtml(label, val, color) {
      const pct = Math.max(0, Math.min(100, Math.round(val)));
      return `
        <div class="meter-row">
          <div class="meter-head"><span>${label}</span><span>${pct}%</span></div>
          <div class="meter-track"><div class="meter-fill" style="width:${pct}%; background:${color};"></div></div>
        </div>
      `;
    }

    updateInspector(force = false) {
      const g = this.game;
      const sel = g.selected;
      if (!sel) {
        this.hideWindow('win-inspector');
        this._lastInspSig = '';
        return;
      }

      // Avoid rebuilding DOM on unchanged inspector ticks so button clicks never drop
      let sig = sel.kind + ':';
      if (sel.kind === 'guest') {
        const p = sel.ref;
        sig += `${p.id}:${Math.round(p.happiness)}:${Math.round(p.warmth)}:${Math.round(p.hunger)}:${Math.round(p.cash)}:${p.thought}:${p.itemsBought.length}:${!!p.carryingTree}`;
      } else if (sel.kind === 'staff') {
        const s = sel.ref;
        sig += `${s.id}:${s.status}:${s.tasksDone}`;
      } else if (sel.kind === 'tractor') {
        const tr = sel.ref;
        if (!g.tractor || g.tractor !== tr) {
          g.selected = null;
          this.hideWindow('win-inspector');
          this._lastInspSig = '';
          return;
        }
        sig += `${tr.open}:${tr.price}:${tr.revenue}:${tr.served}:${tr.riders.length}:${tr.stops.length}:${tr.status}`;
      } else if (sel.kind === 'boat_dock') {
        const dock = sel.ref;
        if (!g.boatDock || g.boatDock !== dock) {
          g.selected = null;
          this.hideWindow('win-inspector');
          this._lastInspSig = '';
          return;
        }
        sig += `${dock.x},${dock.y}:${dock.open}:${dock.price}:${dock.revenue}:${dock.served}:${dock.boats.length}:${dock.status}:${g.isWinterVisual()}`;
      } else if (sel.kind === 'plot') {
        const t = sel.ref;
        if (!t || !t.owned || !t.plot) {
          g.selected = null;
          this.hideWindow('win-inspector');
          this._lastInspSig = '';
          return;
        }
        const tiles = g.getConnectedPlotTiles(t);
        const managed = tiles.filter(pt => pt.plotManaged).length;
        const planted = tiles.filter(pt => !!pt.tree).length;
        const mature = tiles.filter(pt => pt.tree && pt.tree.growth >= 82).length;
        sig += `${t.x},${t.y}:${t.plot}:${tiles.length}:${managed}:${planted}:${mature}:${g.hasStaffRole('forester')}:${t.tree ? `${t.tree.type},${Math.floor(t.tree.growth)},${t.tree.trimmed}` : ''}`;
      } else if (sel.kind === 'tile') {
        const t = sel.ref;
        sig += `${t.x},${t.y}:${t.owned}:${t.plot}:${t.stump}:${t.path}:${t.decor}:${t.building ? `${t.building.id},${t.building.open},${t.building.price},${t.building.served},${t.building.revenue}` : ''}:${t.tree ? `${t.tree.type},${Math.floor(t.tree.growth)},${t.tree.trimmed}` : ''}`;
      }
      if (!force && sig === this._lastInspSig) return;
      this._lastInspSig = sig;

      const titleEl = document.getElementById('inspector-title');
      const bodyEl = document.getElementById('inspector-body');

      if (sel.kind === 'guest') {
        const p = sel.ref;
        titleEl.textContent = `👤 Guest: ${p.name}`;
        bodyEl.innerHTML = `
          <div class="thought-bubble">"${p.thought}"</div>
          ${this.meterHtml('Happiness', p.happiness, '#4fa850')}
          ${this.meterHtml('Warmth', p.warmth, '#e08434')}
          ${this.meterHtml('Hunger', p.hunger, '#c95149')}
          <div style="margin-top:6px;"><strong>Cash in Pocket:</strong> $${Math.round(p.cash)}</div>
          <div><strong>Carrying:</strong> ${p.carryingTree ? `${p.carryingTree.icon || '🎄'} ${p.carryingTree.stageName} ${p.carryingTree.name}` : 'Nothing yet'}</div>
          <div><strong>Bought:</strong> ${p.itemsBought.length ? p.itemsBought.join(', ') : 'Nothing yet'}</div>
        `;
        return;
      }

      if (sel.kind === 'staff') {
        const s = sel.ref;
        const def = PT.STAFF_TYPES[s.role];
        const isDog = s.role === 'dog';
        titleEl.textContent = isDog ? `🐕 ${s.name}` : `👷 ${s.name}`;
        bodyEl.innerHTML = `
          <div class="window-hint">${def.desc}</div>
          <div><strong>Role:</strong> ${def.name}</div>
          <div><strong>Monthly Wage:</strong> ${def.wage > 0 ? `$${def.wage}/mo` : 'Unpaid ($0/mo)'}</div>
          <div><strong>Status:</strong> ${s.status}</div>
          <div><strong>${isDog ? 'Guests Cheered' : 'Tasks Completed'}:</strong> ${s.tasksDone}</div>
          <div style="margin-top:8px;">
            <button id="insp-fire-staff" class="rct-btn danger">${isDog ? 'Send Dog Home' : 'Fire Staff Member'}</button>
          </div>
        `;
        bodyEl.querySelector('#insp-fire-staff').onclick = () => {
          g.fireStaff(s.id);
          this.hideWindow('win-inspector');
          this.updateStaffWindow(true);
        };
        return;
      }

      if (sel.kind === 'tractor') {
        const tr = sel.ref;
        const def = PT.TRACTOR_DEF;
        titleEl.textContent = `🚜 ${tr.name}`;
        bodyEl.innerHTML = `
          <div class="window-hint">${def.desc}</div>
          <div><strong>Status:</strong> ${tr.status}</div>
          <div><strong>Route Stops:</strong> ${tr.stops.length} stop${tr.stops.length === 1 ? '' : 's'}</div>
          <div><strong>Riders Aboard:</strong> ${tr.riders.length} / ${def.capacity}</div>
          <div><strong>Total Riders:</strong> ${tr.served} • <strong>Revenue:</strong> <span class="pos">$${tr.revenue}</span></div>
          <div><strong>Ticket Fare:</strong> $${tr.price} (Fair: $${def.defaultPrice})</div>
          <div style="display:flex; gap:6px; margin-top:8px; flex-wrap:wrap;">
            <button id="insp-manage-tractor" class="rct-btn primary" style="flex:1;">📍 Manage Stops &amp; Price</button>
            <button id="insp-toggle-tractor" class="rct-btn">${tr.open ? 'Close' : 'Open'}</button>
          </div>
        `;
        bodyEl.querySelector('#insp-manage-tractor').onclick = () => {
          this.showWindow('win-tractor');
          PT.audio.click();
        };
        bodyEl.querySelector('#insp-toggle-tractor').onclick = () => {
          tr.open = !tr.open;
          if (!tr.open) tr.unloadAllRiders(g);
          g.recalcFarmRating();
          PT.audio.click();
          this.updateInspector(true);
          this.updateTractorWindow(true);
        };
        return;
      }

      if (sel.kind === 'boat_dock') {
        const dock = sel.ref;
        const def = PT.BOAT_DEF;
        const frozen = dock.isFrozen(g);
        const cap = dock.getCapacity(g);
        titleEl.textContent = frozen ? '⛸️ Pond Ice Skating Dock' : `🚣 ${dock.name}`;
        bodyEl.innerHTML = `
          <div class="window-hint">${def.desc}</div>
          <div><strong>Current Mode:</strong> ${frozen ? '⛸️ Ice Skate Rentals (Frozen Pond)' : '🚣 Rowboat Rentals (Open Water)'}</div>
          <div><strong>Status:</strong> ${dock.status}</div>
          <div><strong>Active ${frozen ? 'Skaters' : 'Boats'}:</strong> ${dock.boats.length} / ${cap}</div>
          <div><strong>Total Rentals:</strong> ${dock.served} • <strong>Revenue:</strong> <span class="pos">$${dock.revenue}</span></div>
          <div><strong>Rental Fee:</strong> $${dock.price} (Fair: $${def.defaultPrice})</div>
          <div style="display:flex; gap:6px; margin-top:8px; flex-wrap:wrap;">
            <button id="insp-manage-boats" class="rct-btn primary" style="flex:1;">${frozen ? '⛸️ Manage Skate Dock' : '🚣 Manage Boat Dock'}</button>
            <button id="insp-toggle-boats" class="rct-btn">${dock.open ? 'Close' : 'Open'}</button>
          </div>
        `;
        bodyEl.querySelector('#insp-manage-boats').onclick = () => {
          this.showWindow('win-boats');
          PT.audio.click();
        };
        bodyEl.querySelector('#insp-toggle-boats').onclick = () => {
          dock.open = !dock.open;
          g.recalcFarmRating();
          PT.audio.click();
          this.updateInspector(true);
          this.updateBoatsWindow(true);
        };
        return;
      }

      if (sel.kind === 'plot') {
        const t = sel.ref;
        const tiles = g.getConnectedPlotTiles(t);
        const plotDef = PT.TREES[t.plot];
        const isManaged = tiles.some(pt => pt.plotManaged);
        const planted = tiles.filter(pt => !!pt.tree).length;
        const mature = tiles.filter(pt => pt.tree && pt.tree.growth >= 82).length;
        const empty = tiles.filter(pt => g.isTilePlantableForPlot(pt)).length;
        const inSeason = g.isPlantInSeason(plotDef);
        const hasForester = g.hasStaffRole('forester');

        let plantSection = '';
        if (t.tree) {
          const tr = t.tree;
          const def = PT.TREES[tr.type];
          const st = g.getTreeStage(tr);
          const val = g.getTreeSalePrice(tr);
          const isCrop = def.category !== 'tree';
          plantSection = `
            <div class="section-divider">Selected Square: ${def.icon || '🌲'} ${def.name}</div>
            ${this.meterHtml(`Growth (${st.name})`, Math.min(100, tr.growth), '#4a944a')}
            <div><strong>Quality:</strong> ${tr.trimmed ? (isCrop ? '⭐ Premium Tended (+25%)' : '⭐ Premium Trimmed (+25%)') : 'Natural'}</div>
            <div><strong>Sale Value:</strong> ${st.sellable ? `<span class="pos">$${val}</span>` : '<em>Growing...</em>'}</div>
            <div style="display:flex; gap:6px; margin-top:6px; flex-wrap:wrap;">
              ${!tr.trimmed ? `<button id="insp-trim" class="rct-btn primary">${isCrop ? '✨ Tend ($10)' : '✂ Trim ($10)'}</button>` : ''}
              ${st.sellable ? `<button id="insp-harvest" class="rct-btn">${isCrop ? '🧺 Pick' : '🪓 Harvest'} ($${Math.round(val * 0.85)})</button>` : ''}
            </div>
          `;
        }

        titleEl.textContent = `🗺 ${plotDef.name} Plot (${tiles.length} tile${tiles.length === 1 ? '' : 's'})`;
        bodyEl.innerHTML = `
          <div class="window-hint">
            ${isManaged
              ? '<strong>🪓 Management Plot:</strong> Foresters automatically plant, tend, and harvest mature plants here for sale!'
              : '<strong>🧺 Guest U-Pick Plot:</strong> Foresters plant &amp; tend here, and visiting guests pick mature items at Checkout.'}
          </div>
          <div><strong>Plot Type:</strong> <span class="plot-swatch" style="background:${plotDef.plotColor};"></span>${plotDef.icon || ''} ${plotDef.name}</div>
          <div><strong>Peak Season:</strong> ${plotDef.seasonLabel || 'Winter'} ${inSeason ? '<span class="pos">(In Season +25%)</span>' : ''}</div>
          <div><strong>Plot Squares:</strong> ${tiles.length} total (${planted} planted • ${mature} mature • ${empty} empty)</div>
          <div><strong>Forester Harvest:</strong> ${isManaged ? '<span class="pos">Enabled (Harvestable)</span>' : 'Disabled (Guest U-Pick)'}</div>
          ${isManaged && !hasForester ? '<div class="window-hint" style="margin-top:6px;">⚠️ Hire a <strong>Forester</strong> in the Staff window to harvest this plot!</div>' : ''}
          <div style="display:flex; gap:6px; margin-top:8px; flex-wrap:wrap;">
            <button id="insp-toggle-managed" class="rct-btn ${isManaged ? '' : 'primary'}" style="width:100%;">
              ${isManaged ? '🧺 Disable Auto-Harvest (Guest U-Pick)' : '🪓 Mark as Management Plot (Auto-Harvest)'}
            </button>
            <button id="insp-clear-plot-all" class="rct-btn danger">🧹 Clear Entire Plot (${tiles.length})</button>
          </div>
          ${plantSection}
        `;

        bodyEl.querySelector('#insp-toggle-managed').onclick = () => {
          g.setPlotManaged(t, !isManaged);
          this.updateInspector(true);
          this.updatePlotsWindow();
        };
        bodyEl.querySelector('#insp-clear-plot-all').onclick = () => {
          const count = g.clearConnectedPlot(t);
          g.setTicker(`Cleared plot designation on ${count} tile${count === 1 ? '' : 's'}.`);
          PT.audio.click();
          g.selected = { kind: 'tile', ref: t };
          this.updateInspector(true);
          this.updatePlotsWindow();
        };

        if (t.tree) {
          const tr = t.tree;
          const def = PT.TREES[tr.type];
          const val = g.getTreeSalePrice(tr);
          const isCrop = def.category !== 'tree';
          const btnTrim = bodyEl.querySelector('#insp-trim');
          if (btnTrim) {
            btnTrim.onclick = () => {
              if (g.cash < 10) { PT.audio.error(); return; }
              tr.trimmed = true;
              g.addCash(-10, 'planting', t.x, t.y);
              g.spawnSparkles(t.x, t.y, '#ffe570', 6);
              PT.audio.plant();
              this.updateInspector(true);
            };
          }
          const btnHarv = bodyEl.querySelector('#insp-harvest');
          if (btnHarv) {
            btnHarv.onclick = () => {
              const profit = Math.round(val * 0.85);
              const plantType = tr.type;
              g.harvestPlantTile(t);
              g.recordPlantSold(plantType);
              g.addCash(profit, 'trees', t.x, t.y);
              if (isCrop) PT.audio.plant();
              else PT.audio.chop();
              this.updateInspector(true);
            };
          }
        }
        return;
      }

      if (sel.kind === 'tile') {
        const t = sel.ref;
        if (t.building) {
          const b = t.building;
          const def = PT.BUILDINGS[b.type];
          titleEl.textContent = `🏠 ${def.name}`;
          bodyEl.innerHTML = `
            <div class="window-hint">${def.desc}</div>
            <div><strong>Status:</strong> ${b.open ? '🟢 Open' : '🔴 Closed'}</div>
            <div><strong>Guests Served:</strong> ${b.served}</div>
            <div><strong>Total Revenue:</strong> <span class="pos">$${b.revenue}</span></div>
            <div><strong>Monthly Upkeep:</strong> $${def.upkeep}/mo</div>
            ${def.adjustablePrice ? `
              <div class="price-controls">
                <strong>Price:</strong>
                <button id="insp-price-dn" class="rct-btn small">-</button>
                <span style="min-width:34px; text-align:center; font-weight:700;">$${b.price}</span>
                <button id="insp-price-up" class="rct-btn small">+</button>
                <small style="color:#555">(Fair: $${def.defaultPrice})</small>
              </div>
            ` : ''}
            <div style="display:flex; gap:6px; margin-top:8px;">
              <button id="insp-toggle-open" class="rct-btn">${b.open ? 'Close Stall' : 'Open Stall'}</button>
              <button id="insp-demolish" class="rct-btn danger">Demolish (+$${Math.round(def.cost * 0.45)})</button>
            </div>
          `;
          bodyEl.querySelector('#insp-toggle-open').onclick = () => {
            b.open = !b.open;
            g.recalcFarmRating();
            PT.audio.click();
            this.updateInspector();
          };
          bodyEl.querySelector('#insp-demolish').onclick = () => {
            const refund = Math.round(def.cost * 0.45);
            t.building = null;
            g.map.bumpRevision();
            g.addCash(refund, 'building', t.x, t.y);
            g.recalcFarmRating();
            PT.audio.chop();
            this.updateInspector();
          };
          if (def.adjustablePrice) {
            bodyEl.querySelector('#insp-price-dn').onclick = () => {
              b.price = Math.max(def.minPrice, b.price - 1);
              PT.audio.click();
              this.updateInspector();
            };
            bodyEl.querySelector('#insp-price-up').onclick = () => {
              b.price = Math.min(def.maxPrice, b.price + 1);
              PT.audio.click();
              this.updateInspector();
            };
          }
          return;
        }

        if (t.tree) {
          const tr = t.tree;
          const def = PT.TREES[tr.type];
          const st = g.getTreeStage(tr);
          const val = g.getTreeSalePrice(tr);
          const plotDef = t.plot ? PT.TREES[t.plot] : null;
          const inSeason = g.isPlantInSeason(def);
          const isCrop = def.category !== 'tree';
          titleEl.textContent = `${def.icon || '🌲'} ${def.name}`;
          bodyEl.innerHTML = `
            ${this.meterHtml(`Growth (${st.name})`, Math.min(100, tr.growth), '#4a944a')}
            <div><strong>Peak Season:</strong> ${def.seasonLabel || 'Winter'} ${inSeason ? '<span class="pos">(In Season +25%)</span>' : ''}</div>
            <div><strong>Quality:</strong> ${tr.trimmed ? (isCrop ? '⭐ Premium Tended (+25%)' : '⭐ Premium Trimmed (+25%)') : 'Natural'}</div>
            <div><strong>Sale Value:</strong> ${st.sellable ? `<span class="pos">$${val}</span>` : '<em>Growing...</em>'}</div>
            ${def.regrowTo ? `<div><strong>Orchard:</strong> Regrows fruit after harvesting!</div>` : ''}
            ${plotDef ? `<div><strong>Replant Plot:</strong> <span class="plot-swatch" style="background:${plotDef.plotColor};"></span>${plotDef.name}</div>` : ''}
            <div style="display:flex; gap:6px; margin-top:8px; flex-wrap:wrap;">
              ${!tr.trimmed ? `<button id="insp-trim" class="rct-btn primary">${isCrop ? '✨ Tend Plant ($10)' : '✂ Trim Tree ($10)'}</button>` : ''}
              ${st.sellable ? `<button id="insp-harvest" class="rct-btn">${isCrop ? '🧺 Pick' : '🪓 Harvest'} ($${Math.round(val * 0.85)})</button>` : ''}
            </div>
          `;
          const btnTrim = bodyEl.querySelector('#insp-trim');
          if (btnTrim) {
            btnTrim.onclick = () => {
              if (g.cash < 10) { PT.audio.error(); return; }
              tr.trimmed = true;
              g.addCash(-10, 'planting', t.x, t.y);
              g.spawnSparkles(t.x, t.y, '#ffe570', 6);
              PT.audio.plant();
              this.updateInspector();
            };
          }
          const btnHarv = bodyEl.querySelector('#insp-harvest');
          if (btnHarv) {
            btnHarv.onclick = () => {
              const profit = Math.round(val * 0.85);
              const plantType = tr.type;
              g.harvestPlantTile(t);
              g.recordPlantSold(plantType);
              g.addCash(profit, 'trees', t.x, t.y);
              if (isCrop) PT.audio.plant();
              else PT.audio.chop();
              this.updateInspector(true);
            };
          }
          return;
        }

        // Plain / unowned / path / decor tile
        titleEl.textContent = `Tile (${t.x}, ${t.y})`;
        const canBuy = g.map.canBuyTile(t.x, t.y);
        const landPrice = g.map.getTileLandPrice(t.x, t.y);
        const isStair = t.path && !!g.map.getStairInfo(t);
        const plotDef = t.plot ? PT.TREES[t.plot] : null;
        bodyEl.innerHTML = `
          <div><strong>Ownership:</strong> ${t.isRoad ? 'Country Road' : (t.owned ? '✅ Your Farm Land' : 'Wild Valley (Unowned)')}</div>
          <div><strong>Terrain:</strong> ${t.water ? (g.isWinterVisual() ? '❄️ Frozen Stream / Pond' : '💧 Stream / Pond') : 'Grassland'} (Level ${t.elev})</div>
          ${t.water && !t.path ? `<div class="window-hint" style="margin-top:6px;">Place a <strong>Wooden Bridge</strong> from <em>Paths &amp; Decor</em> to let guests, staff, &amp; tractors cross water!</div>` : ''}
          ${plotDef ? `<div><strong>Tree Plot:</strong> <span class="plot-swatch" style="background:${plotDef.plotColor};"></span>${plotDef.name}</div>` : ''}
          ${t.path ? `<div><strong>Walkway:</strong> ${PT.DECOR[t.path].name}${isStair ? ' (Stairs)' : ''}</div>` : ''}
          ${t.decor && PT.DECOR[t.decor] ? `<div><strong>Scenery:</strong> ${PT.DECOR[t.decor].name}</div>` : ''}
          ${t.stump ? `<div><strong>Status:</strong> Cut tree stump (plant over it or clear)</div>` : ''}
          <div style="display:flex; gap:6px; margin-top:8px; flex-wrap:wrap;">
            ${plotDef ? `<button id="insp-clear-plot" class="rct-btn danger">🧹 Clear Plot</button>` : ''}
            ${canBuy ? `<button id="insp-buy-tile" class="rct-btn primary">🚩 Buy This Tile ($${landPrice})</button>` : ''}
          </div>
        `;
        const clearPlotBtn = bodyEl.querySelector('#insp-clear-plot');
        if (clearPlotBtn) {
          clearPlotBtn.onclick = () => {
            t.plot = null;
            t.plotManaged = false;
            g.map.bumpRevision();
            PT.audio.click();
            this.updateInspector(true);
            this.updatePlotsWindow();
          };
        }
        const buyBtn = bodyEl.querySelector('#insp-buy-tile');
        if (buyBtn) {
          buyBtn.onclick = () => {
            if (g.cash < landPrice) { g.setTicker(`⚠️ Need $${landPrice} to buy this tile.`); PT.audio.error(); return; }
            t.owned = true;
            g.map.bumpRevision();
            g.cash -= landPrice;
            g.ledger.land -= landPrice;
            g.stats.tilesBought++;
            g.spawnSparkles(t.x, t.y, '#ffe570', 7);
            g.addFloatText(t.x, t.y, `-$${landPrice}`, '#ffe270');
            PT.audio.landBuy();
            g.checkMilestones();
            this.updateInspector();
          };
        }
      }
    }
  }

  PT.UIController = UIController;
})();
