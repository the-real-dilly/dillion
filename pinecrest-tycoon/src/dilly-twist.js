/* ==========================================================================
   THE DILLY TWIST — Interactive Chaos Powers, Neon Drift Car, Pie-A-Tree,
   Cash Rain & Dilly VIP Events for Pinecrest Tycoon.
   Original Game Created by King.
   ========================================================================== */
(function () {
  const style = document.createElement("style");
  style.textContent = `
    #btn-dilly {
      position: fixed; top: 102px; right: 14px; z-index: 900;
      display: inline-flex; align-items: center; gap: 7px;
      padding: 8px 14px; border-radius: 999px; cursor: pointer;
      background: linear-gradient(135deg, #6d1bd9 0%, #c828a8 55%, #ff9900 100%);
      color: #fff; border: 1.5px solid #4ef2ff;
      font: 800 12.5px/1 system-ui, sans-serif; letter-spacing: .04em;
      box-shadow: 0 6px 20px rgba(0,0,0,.48), 0 0 16px rgba(78,242,255,.42);
      transition: transform .15s ease, box-shadow .15s ease;
    }
    #btn-dilly:hover { transform: translateY(-1px) scale(1.03); box-shadow: 0 8px 24px rgba(0,0,0,.58), 0 0 24px rgba(78,242,255,.68); }

    #dilly-dock {
      position: fixed; top: 146px; right: 14px; z-index: 905;
      width: min(300px, 90vw); display: none; flex-direction: column; gap: 8px;
      background: linear-gradient(180deg, rgba(24,10,38,.95), rgba(12,6,22,.96));
      border: 1.5px solid #4ef2ff; border-radius: 10px; padding: 12px;
      box-shadow: 0 18px 50px rgba(0,0,0,.78), 0 0 28px rgba(176,48,255,.35);
      color: #fff; font-family: system-ui, sans-serif; backdrop-filter: blur(8px);
    }
    #dilly-dock.open { display: flex; animation: dillyPop .2s ease; }
    @keyframes dillyPop { from { opacity: 0; transform: translateY(-6px) scale(.97); } to { opacity: 1; transform: none; } }

    .dl-head { display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(78,242,255,.25); padding-bottom: 7px; }
    .dl-head strong { font-size: 14px; color: #ffe169; letter-spacing: .03em; }
    .dl-head span { font-size: 11px; color: #8ef5ff; display: block; }
    .dl-x { background: none; border: none; color: #ccc; font-size: 16px; cursor: pointer; padding: 2px 6px; }
    .dl-x:hover { color: #fff; }

    .dl-act {
      display: flex; align-items: center; justify-content: space-between; gap: 8px;
      width: 100%; text-align: left; padding: 9px 10px; border-radius: 7px; cursor: pointer;
      background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.16);
      color: #fff; font: 700 12.5px/1.2 system-ui, sans-serif; transition: background .15s, border-color .15s, transform .1s;
    }
    .dl-act:hover:not(:disabled) { background: rgba(168,42,230,.32); border-color: #4ef2ff; transform: translateX(-2px); }
    .dl-act:disabled { opacity: .5; cursor: not-allowed; }
    .dl-act small { display: block; font-weight: 400; font-size: 11px; color: rgba(255,235,255,.76); margin-top: 2px; }
    .dl-tag {
      font: 700 10.5px/1 monospace; padding: 4px 6px; border-radius: 4px;
      background: rgba(78,242,255,.16); color: #7af6ff; white-space: nowrap;
    }

    #dilly-fx { position: fixed; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 950; }
    #dilly-toast {
      position: fixed; top: 62px; left: 50%; transform: translateX(-50%) translateY(-16px);
      z-index: 960; pointer-events: none; opacity: 0; transition: opacity .25s, transform .25s;
      background: linear-gradient(90deg, #5c16c5, #c828a8); color: #fff;
      border: 1.5px solid #ffe169; border-radius: 999px; padding: 9px 18px;
      font: 700 13px/1.2 system-ui, sans-serif; box-shadow: 0 10px 30px rgba(0,0,0,.6);
      white-space: nowrap; max-width: 92vw; overflow: hidden; text-overflow: ellipsis;
    }
    #dilly-toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }

    #pickle-raid-banner {
      position: fixed; top: 56px; left: 50%; transform: translateX(-50%);
      z-index: 940; display: none; align-items: center; gap: 10px;
      background: linear-gradient(90deg, #1b5e18, #388e24, #1b5e18);
      color: #fff; border: 2px solid #9dff5c; border-radius: 999px; padding: 7px 16px;
      font: 800 13px/1.2 system-ui, sans-serif; letter-spacing: .02em;
      box-shadow: 0 8px 26px rgba(0,0,0,.62), 0 0 18px rgba(125,255,77,.45);
      animation: picklePulse 1.1s ease-in-out infinite;
    }
    #pickle-raid-banner.show { display: inline-flex; }
    @keyframes picklePulse { 0%,100% { box-shadow: 0 8px 26px rgba(0,0,0,.62), 0 0 14px rgba(125,255,77,.35); } 50% { box-shadow: 0 8px 26px rgba(0,0,0,.62), 0 0 28px rgba(255,225,77,.7); } }
  `;
  document.head.appendChild(style);

  /* ---------- FX Canvas & Toast ---------- */
  const fx = document.createElement("canvas");
  fx.id = "dilly-fx";
  document.body.appendChild(fx);
  const fctx = fx.getContext("2d");

  const toast = document.createElement("div");
  toast.id = "dilly-toast";
  document.body.appendChild(toast);

  let toastTimer = null;
  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add("show");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 3600);
    if (window.pinecrestGame) window.pinecrestGame.ticker = msg;
  }

  /* ---------- Funky Web Audio SFX ---------- */
  let sfxCtx = null;
  function tone(freq, dur, type, vol, slide) {
    try {
      sfxCtx = sfxCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (sfxCtx.state === "suspended") sfxCtx.resume();
      const t = sfxCtx.currentTime;
      const o = sfxCtx.createOscillator(), g = sfxCtx.createGain();
      o.type = type || "triangle";
      o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
      g.gain.setValueAtTime(vol || 0.08, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(sfxCtx.destination);
      o.start(t); o.stop(t + dur + 0.02);
    } catch (_) {}
  }

  /* ---------- Live FX Entities (Cash Bills, Flying Pies, Neon Drift Car) ---------- */
  const items = [];
  let driftCar = null;
  let fxRunning = false;

  function ensureFxLoop() {
    if (fxRunning) return;
    fxRunning = true;
    requestAnimationFrame(stepFx);
  }

  function stepFx() {
    const w = window.innerWidth, h = window.innerHeight;
    if (fx.width !== w || fx.height !== h) { fx.width = w; fx.height = h; }
    fctx.clearRect(0, 0, w, h);

    // Draw Neon Drift Car if active
    if (driftCar) {
      driftCar.x += driftCar.vx;
      driftCar.y += Math.sin(driftCar.t * 0.14) * 3.2;
      driftCar.t++;
      driftCar.trail.push({ x: driftCar.x - 45, y: driftCar.y + 18, a: 1 });
      if (driftCar.trail.length > 36) driftCar.trail.shift();

      // Cyan neon drift tracks
      for (const p of driftCar.trail) {
        p.a *= 0.94;
        fctx.fillStyle = `rgba(78,242,255,${p.a * 0.65})`;
        fctx.beginPath(); fctx.arc(p.x, p.y, 9, 0, Math.PI * 2); fctx.fill();
        fctx.fillStyle = `rgba(255,255,255,${p.a * 0.45})`;
        fctx.beginPath(); fctx.arc(p.x - 6, p.y - 12, 6, 0, Math.PI * 2); fctx.fill();
      }

      // Car body
      fctx.save();
      fctx.translate(driftCar.x, driftCar.y);
      fctx.rotate(Math.sin(driftCar.t * 0.14) * 0.09);
      // Neon underglow
      fctx.shadowColor = "#4ef2ff";
      fctx.shadowBlur = 26;
      fctx.fillStyle = "#5f16c9";
      fctx.beginPath(); fctx.roundRect(-64, -22, 128, 44, 14); fctx.fill();
      // Gold stripe & roof
      fctx.shadowBlur = 0;
      fctx.fillStyle = "#ffd447";
      fctx.fillRect(-54, -4, 108, 7);
      fctx.fillStyle = "#1c1230";
      fctx.beginPath(); fctx.roundRect(-24, -17, 50, 34, 8); fctx.fill();
      // Christmas fairy lights around car
      const colors = ["#ff3b3b", "#ffe14d", "#4ef2ff", "#52ff88"];
      for (let i = 0; i < 8; i++) {
        fctx.fillStyle = colors[(i + Math.floor(driftCar.t / 5)) % colors.length];
        fctx.beginPath(); fctx.arc(-50 + i * 14, -20, 3.2, 0, Math.PI * 2); fctx.fill();
        fctx.beginPath(); fctx.arc(-50 + i * 14, 20, 3.2, 0, Math.PI * 2); fctx.fill();
      }
      // Label
      fctx.font = "800 13px system-ui, sans-serif";
      fctx.fillStyle = "#ffe169";
      fctx.textAlign = "center";
      fctx.fillText("👑 THE REAL DILLY", 0, -30);
      fctx.restore();

      if (driftCar.x > w + 180) driftCar = null;
    }

    // Draw Bills, Pies, Splats & Floating Text
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      it.x += it.vx; it.y += it.vy;
      it.vy += it.g || 0;
      it.rot += it.vr || 0;
      it.life--;
      const alpha = Math.min(1, it.life / 25);

      fctx.save();
      fctx.globalAlpha = Math.max(0, alpha);
      fctx.translate(it.x, it.y);
      fctx.rotate(it.rot);
      if (it.kind === "bill") {
        fctx.fillStyle = "#28a745";
        fctx.strokeStyle = "#ffe169";
        fctx.lineWidth = 2;
        fctx.fillRect(-16, -9, 32, 18);
        fctx.strokeRect(-16, -9, 32, 18);
        fctx.fillStyle = "#fff";
        fctx.font = "800 11px system-ui, sans-serif";
        fctx.textAlign = "center";
        fctx.fillText("$100", 0, 4);
      } else if (it.kind === "pie") {
        fctx.font = "34px serif";
        fctx.textAlign = "center";
        fctx.fillText("🥧", 0, 12);
      } else if (it.kind === "spark") {
        fctx.fillStyle = it.col;
        fctx.beginPath(); fctx.arc(0, 0, it.r, 0, Math.PI * 2); fctx.fill();
      }
      fctx.restore();

      if (it.life <= 0) items.splice(i, 1);
    }

    if (items.length > 0 || driftCar) {
      requestAnimationFrame(stepFx);
    } else {
      fxRunning = false;
    }
  }

  /* ---------- Dilly Twist Powers ---------- */
  const cooldowns = {};
  function ready(id, sec, btn) {
    const now = Date.now();
    if (cooldowns[id] && now < cooldowns[id]) return false;
    cooldowns[id] = now + sec * 1000;
    if (btn) {
      btn.disabled = true;
      const tag = btn.querySelector(".dl-tag");
      const orig = tag.textContent;
      const iv = setInterval(() => {
        const left = Math.ceil((cooldowns[id] - Date.now()) / 1000);
        if (left <= 0) {
          clearInterval(iv);
          btn.disabled = false;
          tag.textContent = orig;
        } else {
          tag.textContent = `${left}s`;
        }
      }, 250);
    }
    return true;
  }

  function triggerDrift(btn) {
    if (!ready("drift", 12, btn)) return;
    const g = window.pinecrestGame;
    driftCar = { x: -120, y: window.innerHeight * 0.42, vx: 13.5, t: 0, trail: [] };
    ensureFxLoop();
    tone(190, 0.22, "sawtooth", 0.08, 340);
    setTimeout(() => tone(260, 0.25, "sawtooth", 0.07, 480), 140);
    if (g) {
      for (let i = 0; i < 8; i++) {
        if (typeof g.spawnGuest === "function") g.spawnGuest();
      }
      if (g.guests) g.guests.forEach((guest) => { guest.happiness = 100; });
    }
    showToast("🚗 THE REAL DILLY drifted through Pinecrest! +8 hyped-up VIP holiday shoppers!");
  }

  function triggerPieGrow(btn) {
    if (!ready("pie", 10, btn)) return;
    const g = window.pinecrestGame;
    const w = window.innerWidth, h = window.innerHeight;
    for (let i = 0; i < 7; i++) {
      items.push({
        kind: "pie",
        x: w * 0.15 + Math.random() * w * 0.7,
        y: h * 0.85,
        vx: (Math.random() - 0.5) * 9,
        vy: -13 - Math.random() * 6,
        g: 0.42, rot: 0, vr: (Math.random() - 0.5) * 0.35, life: 70
      });
    }
    ensureFxLoop();
    tone(520, 0.14, "sine", 0.09, 220);
    setTimeout(() => tone(310, 0.18, "triangle", 0.09, 640), 120);

    let grown = 0;
    if (g && g.map && g.map.tiles) {
      for (let y = 0; y < g.map.size && grown < 8; y++) {
        for (let x = 0; x < g.map.size && grown < 8; x++) {
          const t = g.map.tiles[y][x];
          if (t.tree && t.tree.growth < 100) {
            t.tree.growth = 104;
            grown++;
          }
        }
      }
    }
    if (grown > 0) {
      showToast(`🥧 Dilly's Pie-A-Tree Chaos! ${grown} saplings instantly matured to 100% harvest size!`);
    } else {
      if (g) g.cash += 200;
      showToast("🥧 All trees already mature! Dilly tossed you a +$200 Pie Bonus instead!");
    }
  }

  function triggerCashRain(btn) {
    if (!ready("cash", 15, btn)) return;
    const g = window.pinecrestGame;
    const w = window.innerWidth;
    for (let i = 0; i < 48; i++) {
      items.push({
        kind: i % 3 === 0 ? "spark" : "bill",
        col: i % 2 === 0 ? "#ffe169" : "#4ef2ff",
        r: 3 + Math.random() * 4,
        x: Math.random() * w,
        y: -20 - Math.random() * 260,
        vx: (Math.random() - 0.5) * 3.5,
        vy: 3.5 + Math.random() * 4.5,
        g: 0.04, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.18, life: 140
      });
    }
    ensureFxLoop();
    [523, 659, 784, 1046].forEach((f, idx) => setTimeout(() => tone(f, 0.25, "triangle", 0.07), idx * 75));
    if (g) {
      g.cash += 500;
      if (g.guests) g.guests.forEach((guest) => { guest.happiness = 100; });
    }
    showToast("💸 DILLY CASH RAIN! +$500 holiday stimulus dropped onto Pinecrest Tree Farm!");
  }

  function triggerPieVance(btn) {
    if (!ready("vance", 15, btn)) return;
    const g = window.pinecrestGame;
    const w = window.innerWidth, h = window.innerHeight;
    for (let i = 0; i < 4; i++) {
      items.push({
        kind: "pie", x: w * 0.12, y: h * 0.65,
        vx: 14 + Math.random() * 6, vy: -9 - Math.random() * 4,
        g: 0.32, rot: 0, vr: 0.32, life: 65
      });
    }
    for (let i = 0; i < 24; i++) {
      items.push({
        kind: "spark", col: "#fff6e5", r: 4 + Math.random() * 5,
        x: w * 0.72, y: h * 0.45,
        vx: (Math.random() - 0.5) * 10, vy: (Math.random() - 0.5) * 10,
        g: 0.18, rot: 0, vr: 0, life: 55
      });
    }
    ensureFxLoop();
    tone(440, 0.18, "square", 0.06, 150);
    setTimeout(() => tone(660, 0.22, "triangle", 0.08, 880), 160);
    if (g) {
      g.cash += 250;
      g.farmRating = Math.min(999, (g.farmRating || 700) + 25);
    }
    showToast("🎯 SPLAT! Dilly pied Richard Vance's Range Rover! Viral clip earned +$250 & Farm Rating +25!");
  }

  /* ---------- Mount Floating Pill & Chaos Dock ---------- */
  window.addEventListener("DOMContentLoaded", () => {
    const pill = document.createElement("button");
    pill.id = "btn-dilly";
    pill.title = "Open The Dilly Twist Chaos Powers!";
    pill.innerHTML = '<span>🤪</span><span>Dilly Twist</span>';
    document.body.appendChild(pill);

    const dock = document.createElement("div");
    dock.id = "dilly-dock";
    dock.innerHTML = `
      <div class="dl-head">
        <div>
          <strong>👑 THE DILLY TWIST</strong>
          <span>Holiday Chaos Meets Pinecrest Farm</span>
        </div>
        <button class="dl-x" id="dl-close">✕</button>
      </div>
      <button class="dl-act" id="dl-drift">
        <div>🚗 Neon Drift Delivery<small>Drift through the snow &amp; spawn +8 VIP shoppers</small></div>
        <span class="dl-tag">+8 VIP</span>
      </button>
      <button class="dl-act" id="dl-pie">
        <div>🥧 Pie-A-Tree Instant Grow<small>Launch pies to mature up to 8 saplings to 100%</small></div>
        <span class="dl-tag">GROW</span>
      </button>
      <button class="dl-act" id="dl-cash">
        <div>💸 Dilly Cash Rain<small>Make it rain $100 bills &amp; max guest happiness</small></div>
        <span class="dl-tag">+$500</span>
      </button>
      <button class="dl-act" id="dl-vance">
        <div>🎯 Pie Richard Vance!<small>Splat the developer's SUV for viral cash &amp; rating</small></div>
        <span class="dl-tag">+$250</span>
      </button>
      <button class="dl-act" id="dl-raid">
        <div>🥒 Summon Pickle Raid!<small>Unleash Dill Pickle Raiders + 👑 King Dill Boss!</small></div>
        <span class="dl-tag">RAID!</span>
      </button>
      <button class="dl-act" id="dl-movie">
        <div>🎬 Watch Dilly's Movie Scene<small>Jump to Act VII: Enter The Real Dilly!</small></div>
        <span class="dl-tag">PLAY ▶</span>
      </button>
    `;
    document.body.appendChild(dock);

    const raidBanner = document.createElement("div");
    raidBanner.id = "pickle-raid-banner";
    document.body.appendChild(raidBanner);

    pill.addEventListener("click", () => dock.classList.toggle("open"));
    dock.querySelector("#dl-close").addEventListener("click", () => dock.classList.remove("open"));
    dock.querySelector("#dl-drift").addEventListener("click", (e) => triggerDrift(e.currentTarget));
    dock.querySelector("#dl-pie").addEventListener("click", (e) => triggerPieGrow(e.currentTarget));
    dock.querySelector("#dl-cash").addEventListener("click", (e) => triggerCashRain(e.currentTarget));
    dock.querySelector("#dl-vance").addEventListener("click", (e) => triggerPieVance(e.currentTarget));
    dock.querySelector("#dl-raid").addEventListener("click", () => {
      dock.classList.remove("open");
      const g = window.pinecrestGame;
      if (g && typeof g.spawnPickleRaid === "function") {
        g.spawnPickleRaid(5, true);
      }
    });
    dock.querySelector("#dl-movie").addEventListener("click", () => {
      dock.classList.remove("open");
      if (window.PTStory) window.PTStory.playAct(6);
    });

    // Live Dill Pickle Raid HUD Banner updater
    setInterval(() => {
      const g = window.pinecrestGame;
      if (!g || !g.pickles || g.pickles.length === 0) {
        raidBanner.classList.remove("show");
        return;
      }
      const n = g.pickles.length;
      const boss = g.pickles.some((p) => p.isBoss);
      raidBanner.textContent = boss
        ? `🥒 DILL PICKLE RAID! ${n} Raiders + 👑 KING DILL — CLICK PICKLES TO BONK! ($45–$150 Bounty)`
        : `🥒 DILL PICKLE RAID! ${n} Raider${n === 1 ? "" : "s"} Storming Your Trees — CLICK TO BONK ($45 Bounty!)`;
      raidBanner.classList.add("show");
    }, 250);

    // Periodic ambient Dilly Twist ticker quips
    const QUIPS = [
      "🤪 Dilly just tipped the Hot Cocoa stand $100 and asked for extra marshmallows!",
      "🚗 Spotting: A purple sports car with Christmas lights just did a donut by the barn!",
      "🥧 Rumor has it Richard Vance is still wiping whipped cream off his Range Rover!",
      "🥒 Watch the entrance road — Dill Pickle Raiders love stealing fresh Christmas trees!"
    ];
    let qIdx = 0;
    setInterval(() => {
      const g = window.pinecrestGame;
      if (g && !g.paused && (!g.pickles || g.pickles.length === 0)) {
        g.ticker = QUIPS[qIdx % QUIPS.length];
        qIdx++;
      }
    }, 75000);
  });

  window.DillyTwist = { triggerDrift, triggerPieGrow, triggerCashRain, triggerPieVance };
})();
