(function () {
  const PT = (window.PT = window.PT || {});

  window.addEventListener('DOMContentLoaded', () => {
    // 1. Pre-render procedural pixel-art sprite atlas
    PT.sprites.buildAll();

    // 2. Initialize Core Game, Isometric Renderer, and RCT UI
    const canvas = document.getElementById('game-canvas');
    const game = new PT.Game();
    const renderer = new PT.Renderer(canvas, game);
    game.renderer = renderer;
    const ui = new PT.UIController(game);
    window.pinecrestGame = game;

    // 3. Input Handling (Desktop Mouse/Keyboard + Mobile Multi-Touch)
    const PAINT_MODES = ['path', 'plant', 'plot', 'land', 'terrain', 'bulldoze', 'harvest'];
    let isPanning = false;
    let isPainting = false;
    let lastMouseX = 0;
    let lastMouseY = 0;
    let lastPaintedKey = '';
    let lastTouchTime = -1000;
    const keysDown = new Set();

    // Unlock Web Audio & start seasonal ambient music on first user gesture
    const unlockAudioOnce = () => {
      PT.audio.setSeason(game.getSeason().id);
      PT.audio.unlockAndStartMusic();
      window.removeEventListener('mousedown', unlockAudioOnce, true);
      window.removeEventListener('touchstart', unlockAudioOnce, true);
      window.removeEventListener('keydown', unlockAudioOnce, true);
    };
    window.addEventListener('mousedown', unlockAudioOnce, true);
    window.addEventListener('touchstart', unlockAudioOnce, true);
    window.addEventListener('keydown', unlockAudioOnce, true);

    window.addEventListener('touchstart', () => {
      lastTouchTime = performance.now();
      PT.audio.ensure();
      if (!game.usingTouch) ui.syncTouchMode(true);
    }, { passive: true });

    const onViewportResize = () => {
      renderer.resize();
      ui.clampAllWindows();
    };
    window.addEventListener('resize', onViewportResize);
    window.addEventListener('orientationchange', onViewportResize);

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    canvas.addEventListener('mousedown', (e) => {
      if (performance.now() - lastTouchTime < 600) return;
      if (game.usingTouch) ui.syncTouchMode(false);
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;

      // Right-click or Middle-click or Shift+Left -> Pan Camera
      if (e.button === 2 || e.button === 1 || (e.button === 0 && e.shiftKey)) {
        isPanning = true;
        canvas.style.cursor = 'grabbing';
        return;
      }

      if (e.button === 0) {
        const w = renderer.screenToWorld(e.clientX, e.clientY);
        const tile = game.map.worldToTile(w.wx, w.wy, game.cam.rot);
        game.hoverTile = tile;

        if (game.tool.mode === 'inspect') {
          game.applyToolAt(tile, e.clientX, e.clientY);
          ui.showInspector();
        } else {
          isPainting = true;
          lastPaintedKey = tile ? `${tile.x},${tile.y}` : '';
          game.applyToolAt(tile, e.clientX, e.clientY);
          ui.updateHUD();
        }
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (performance.now() - lastTouchTime < 600) return;
      const dx = e.clientX - lastMouseX;
      const dy = e.clientY - lastMouseY;
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;

      if (isPanning) {
        game.cam.x -= dx / game.cam.zoom;
        game.cam.y -= dy / game.cam.zoom;
        return;
      }

      if (e.target === canvas) {
        const w = renderer.screenToWorld(e.clientX, e.clientY);
        const tile = game.map.worldToTile(w.wx, w.wy, game.cam.rot);
        game.hoverTile = tile;

        // Drag-to-paint for paths, trees, plots, land, or bulldoze!
        if (isPainting && tile && PAINT_MODES.includes(game.tool.mode)) {
          const key = `${tile.x},${tile.y}`;
          if (key !== lastPaintedKey) {
            lastPaintedKey = key;
            game.applyToolAt(tile, e.clientX, e.clientY);
            ui.updateHUD();
          }
        }
      }
    });

    window.addEventListener('mouseup', () => {
      isPanning = false;
      isPainting = false;
      lastPaintedKey = '';
      canvas.style.cursor = 'default';
    });

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      ui.adjustZoom(e.deltaY < 0 ? 1 : -1);
    }, { passive: false });

    // Mobile / Touch Controls (1-finger tap/pan or drag-paint, 2-finger pinch-zoom & pan)
    let touchState = null; // null | 'pending' | 'pan' | 'paint' | 'pinch'
    let touchStartX = 0;
    let touchStartY = 0;
    let touchLastX = 0;
    let touchLastY = 0;
    let wasMultiTouch = false;
    let pinchStartDist = 0;
    let pinchStartZoom = 1;
    let pinchWorld = null;

    const beginPinch = (t0, t1) => {
      const midX = (t0.clientX + t1.clientX) * 0.5;
      const midY = (t0.clientY + t1.clientY) * 0.5;
      wasMultiTouch = true;
      touchState = 'pinch';
      game.hoverTile = null;
      pinchStartDist = Math.max(10, Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY));
      pinchStartZoom = game.cam.zoom;
      pinchWorld = renderer.screenToWorld(midX, midY);
    };

    const paintAtTouch = (clientX, clientY) => {
      const w = renderer.screenToWorld(clientX, clientY);
      const tile = game.map.worldToTile(w.wx, w.wy, game.cam.rot);
      game.hoverTile = tile;
      if (tile) {
        const key = `${tile.x},${tile.y}`;
        if (key !== lastPaintedKey) {
          lastPaintedKey = key;
          game.applyToolAt(tile, clientX, clientY, 32);
          ui.updateHUD();
        }
      }
    };

    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      lastTouchTime = performance.now();
      PT.audio.ensure();
      if (!game.usingTouch) ui.syncTouchMode(true);

      if (e.touches.length >= 2) {
        beginPinch(e.touches[0], e.touches[1]);
        return;
      }

      if (e.touches.length === 1) {
        const t = e.touches[0];
        touchStartX = touchLastX = t.clientX;
        touchStartY = touchLastY = t.clientY;
        lastPaintedKey = '';

        if (wasMultiTouch) {
          touchState = 'pan';
        } else if (game.touchDragPaint && PAINT_MODES.includes(game.tool.mode)) {
          touchState = 'paint';
          paintAtTouch(t.clientX, t.clientY);
        } else {
          touchState = 'pending';
        }
      }
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      lastTouchTime = performance.now();

      if (e.touches.length >= 2) {
        const t0 = e.touches[0], t1 = e.touches[1];
        if (touchState !== 'pinch' || !pinchWorld) {
          beginPinch(t0, t1);
          return;
        }
        const midX = (t0.clientX + t1.clientX) * 0.5;
        const midY = (t0.clientY + t1.clientY) * 0.5;
        const curDist = Math.max(10, Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY));
        const newZoom = Math.max(0.45, Math.min(2.0, pinchStartZoom * (curDist / pinchStartDist)));
        game.cam.zoom = newZoom;
        game.cam.x = pinchWorld.wx - (midX - renderer.width / 2) / newZoom;
        game.cam.y = pinchWorld.wy - (midY - renderer.height / 2) / newZoom;
        return;
      }

      if (e.touches.length === 1) {
        const t = e.touches[0];
        const dx = t.clientX - touchLastX;
        const dy = t.clientY - touchLastY;
        touchLastX = t.clientX;
        touchLastY = t.clientY;

        if (touchState === 'pending') {
          if (Math.hypot(t.clientX - touchStartX, t.clientY - touchStartY) >= 10) {
            touchState = 'pan';
            game.hoverTile = null;
            game.cam.x -= (t.clientX - touchStartX) / game.cam.zoom;
            game.cam.y -= (t.clientY - touchStartY) / game.cam.zoom;
          }
        } else if (touchState === 'pan') {
          game.cam.x -= dx / game.cam.zoom;
          game.cam.y -= dy / game.cam.zoom;
        } else if (touchState === 'paint') {
          paintAtTouch(t.clientX, t.clientY);
        }
      }
    }, { passive: false });

    const finishTouch = (e, cancelled) => {
      e.preventDefault();
      lastTouchTime = performance.now();

      if (e.touches.length === 0) {
        if (!cancelled && touchState === 'pending' && !wasMultiTouch) {
          const w = renderer.screenToWorld(touchStartX, touchStartY);
          const tile = game.map.worldToTile(w.wx, w.wy, game.cam.rot);
          if (game.tool.mode === 'inspect') {
            game.applyToolAt(tile, touchStartX, touchStartY, 32);
            ui.showInspector();
          } else {
            game.applyToolAt(tile, touchStartX, touchStartY, 32);
            ui.updateHUD();
          }
        }
        touchState = null;
        wasMultiTouch = false;
        pinchWorld = null;
        lastPaintedKey = '';
        game.hoverTile = null;
      } else if (e.touches.length === 1) {
        const t = e.touches[0];
        touchLastX = t.clientX;
        touchLastY = t.clientY;
        touchState = 'pan';
        pinchWorld = null;
      }
    };

    canvas.addEventListener('touchend', (e) => finishTouch(e, false), { passive: false });
    canvas.addEventListener('touchcancel', (e) => finishTouch(e, true), { passive: false });

    // Keyboard shortcuts
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      const k = e.key.toLowerCase();
      keysDown.add(k);

      if (k === 'escape') {
        if (game.tool.mode !== 'inspect') {
          ui.cancelTool();
        } else {
          game.selected = null;
          ui.hideWindow('win-inspector');
        }
      } else if (k === ' ') {
        e.preventDefault();
        game.paused = !game.paused;
        ui.syncSpeedBtns();
      } else if (k === '1') { game.paused = false; game.speed = 1; ui.syncSpeedBtns(); }
      else if (k === '2') { game.paused = false; game.speed = 2; ui.syncSpeedBtns(); }
      else if (k === '3') { game.paused = false; game.speed = 3; ui.syncSpeedBtns(); }
      else if (k === 'q') { ui.rotateCamera(-1); }
      else if (k === 'e') { ui.rotateCamera(1); }
      else if (k === 'c') { game.centerCamera(); }
      else if (k === '=' || k === '+') { ui.adjustZoom(1); }
      else if (k === '-' || k === '_') { ui.adjustZoom(-1); }
      else if (k === 't') { ui.toggleWindow('win-trees'); }
      else if (k === 'z') { ui.toggleWindow('win-plots'); }
      else if (k === 'b') { ui.toggleWindow('win-stalls'); }
      else if (k === 'p') { ui.toggleWindow('win-decor'); }
      else if (k === 'm') { ui.toggleWindow('win-staff'); }
      else if (k === 'r') { ui.toggleWindow('win-tractor'); }
      else if (k === 'o') { ui.toggleWindow('win-boats'); }
      else if (k === 'f') { ui.toggleWindow('win-finances'); }
      else if (k === 'l') { document.getElementById('btn-tool-land').click(); }
      else if (k === 'g') { ui.toggleWindow('win-terraform'); }
      else if (k === 'h') { document.getElementById('btn-tool-harvest').click(); }
      else if (k === 'x') { document.getElementById('btn-tool-bulldoze').click(); }
      else if (k === 'n') {
        const musicBtn = document.getElementById('btn-music');
        if (musicBtn) musicBtn.click();
      }
    });

    window.addEventListener('keyup', (e) => {
      keysDown.delete(e.key.toLowerCase());
    });

    // 4. Main Animation Loop
    let lastTime = performance.now();
    function frame(now) {
      const dt = Math.min(0.08, (now - lastTime) / 1000);
      lastTime = now;

      // Smooth keyboard camera panning
      const panSpeed = 420 / game.cam.zoom;
      if (keysDown.has('arrowleft') || keysDown.has('a')) game.cam.x -= panSpeed * dt;
      if (keysDown.has('arrowright') || keysDown.has('d')) game.cam.x += panSpeed * dt;
      if (keysDown.has('arrowup') || keysDown.has('w')) game.cam.y -= panSpeed * dt;
      if (keysDown.has('arrowdown') || keysDown.has('s')) game.cam.y += panSpeed * dt;

      game.update(dt);
      PT.audio.setSeason(game.getSeason().id);
      renderer.render();
      ui.update(dt);

      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });
})();
