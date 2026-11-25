/* Hallmark-Style Cinematic Storyline & Video Cutscene Engine for Pinecrest Tycoon */
(function () {
  const STORAGE_KEY = "pinecrest_story_v1";

  const CHAPTERS = [
    {
      id: "ch1",
      num: "CHAPTER I",
      title: "Home for the Holidays",
      tagline: "A city architect. A snowy mountain farm. One last Christmas.",
      img: "assets/story/ch1.jpg",
      goalText: "Sell 12 Christmas trees or reach $2,500 cash to unlock Chapter II.",
      unlockCheck: () => true,
      beats: [
        {
          who: "NARRATOR",
          role: "Pinecrest Valley · November",
          text: "Three days after leaving her high-rise job in the city, Clara stands beneath the snowy timber archway of her late grandfather's Christmas tree farm.",
          cam: { s0: 1.04, s1: 1.14, x0: -1.5, x1: 1.5, y0: 0, y1: -1.2 },
          dur: 6800
        },
        {
          who: "CLARA",
          role: "New Owner of Pinecrest Farm",
          text: "Grandpa left me the deed... and a mountain of overdue bills. Look at these pines—everyone in the city told me to sell, but I can't let this place disappear.",
          cam: { s0: 1.12, s1: 1.22, x0: 2.5, x1: 4.5, y0: -1.5, y1: -2.2 },
          dur: 7200
        },
        {
          who: "LUKE",
          role: "Head Carpenter & Tree Grower",
          text: "Name's Luke. Your grandfather taught me how to prune every spruce on this ridge. If you're staying through Christmas, grab a scarf—we've got a valley to bring back to life.",
          cam: { s0: 1.14, s1: 1.24, x0: -3.5, x1: -1.0, y0: -1.0, y1: -2.0 },
          dur: 7500
        }
      ]
    },
    {
      id: "ch2",
      num: "CHAPTER II",
      title: "The Developer's Ultimatum",
      tagline: "Big-city money wants the ridge. Christmas spirit stands in the way.",
      img: "assets/story/ch2.jpg",
      goalText: "Sell 12 Christmas trees or reach $2,500 cash to unlock Chapter II.",
      unlockCheck: (g) => g && ((g.stats && g.stats.treesSold >= 12) || g.cash >= 2500 || g.year >= 2),
      beats: [
        {
          who: "NARRATOR",
          role: "Late Afternoon · First Flurries",
          text: "Just as the first families return to Pinecrest, a gleaming black Range Rover crunches up the snowy gravel drive.",
          cam: { s0: 1.05, s1: 1.15, x0: 2.5, x1: -1.0, y0: 0, y1: -1.0 },
          dur: 6200
        },
        {
          who: "RICHARD VANCE",
          role: "Vance Luxury Resorts",
          text: "Charming little hobby farm, Clara. Sign these papers and I'll turn this ridge into Pinecrest Alpine Condos by spring. Unless you can actually turn a profit before Christmas Eve...",
          cam: { s0: 1.16, s1: 1.25, x0: 5.5, x1: 3.5, y0: -1.5, y1: -2.2 },
          dur: 7800
        },
        {
          who: "LUKE",
          role: "Head Carpenter & Tree Grower",
          text: "This valley isn't for sale, Vance. By Christmas Eve, every family in the county will be drinking hot cocoa right here under the evergreens.",
          cam: { s0: 1.14, s1: 1.24, x0: -5.0, x1: -3.0, y0: -1.2, y1: -2.0 },
          dur: 7200
        }
      ]
    },
    {
      id: "ch3",
      num: "CHAPTER III",
      title: "Cocoa by the Firelight",
      tagline: "Warm lights, fresh pine, and a town falling back in love with Christmas.",
      img: "assets/story/ch3.jpg",
      goalText: "Sell 35 Christmas trees or reach $5,000 cash to unlock Chapter III.",
      unlockCheck: (g) => g && ((g.stats && g.stats.treesSold >= 35) || g.cash >= 5000 || g.year >= 2),
      beats: [
        {
          who: "NARRATOR",
          role: "December Dusk · Snowfall",
          text: "Lanterns glow along every path. Families haul fresh-cut firs through the snow while cinnamon and hot cocoa drift across the ridge.",
          cam: { s0: 1.04, s1: 1.15, x0: -2.0, x1: 2.0, y0: 0.5, y1: -1.5 },
          dur: 6800
        },
        {
          who: "CLARA",
          role: "Owner of Pinecrest Farm",
          text: "Listen to them laughing, Luke... I spent five years designing glass towers in the city and never felt anything like this. Maybe Grandpa knew I needed Pinecrest more than it needed me.",
          cam: { s0: 1.14, s1: 1.24, x0: -1.5, x1: 0.5, y0: -1.5, y1: -2.5 },
          dur: 7800
        },
        {
          who: "LUKE",
          role: "Head Carpenter & Tree Grower",
          text: "Cheers to that. One more big push for the Christmas Eve Tree Lighting, and Richard Vance can pack his blueprints back to the city for good.",
          cam: { s0: 1.12, s1: 1.22, x0: 1.5, x1: -0.5, y0: -1.0, y1: -2.0 },
          dur: 7200
        }
      ]
    },
    {
      id: "ch4",
      num: "GRAND FINALE",
      title: "The Pinecrest Miracle",
      tagline: "Christmas Eve · Pinecrest Farm is saved forever.",
      img: "assets/story/ch4.jpg",
      goalText: "Sell 75 Christmas trees, reach $9,000 cash, or reach Year 2 to unlock the Grand Finale!",
      unlockCheck: (g) => g && ((g.stats && g.stats.treesSold >= 75) || g.cash >= 9000 || g.year >= 2),
      rewardCash: 2500,
      beats: [
        {
          who: "NARRATOR",
          role: "Christmas Eve · Pinecrest Square",
          text: "As midnight snow drifts beneath a crescent moon, the whole town gathers around the towering Pinecrest spruce. One flip of the switch lights the entire valley in gold.",
          cam: { s0: 1.03, s1: 1.14, x0: 0, x1: 0, y0: 1.5, y1: -1.5 },
          dur: 7400
        },
        {
          who: "CLARA",
          role: "Owner of Pinecrest Farm",
          text: "We did it! The mortgage is paid in full, the town is here, and Vance withdrew his offer. Pinecrest Farm belongs to the valley forever.",
          cam: { s0: 1.14, s1: 1.25, x0: -1.0, x1: 0.5, y0: -1.2, y1: -2.4 },
          dur: 7400
        },
        {
          who: "LUKE",
          role: "Head Carpenter & Tree Grower",
          text: "Merry Christmas, Clara. Welcome home to Pinecrest. (+$2,500 Holiday Miracle Bonus awarded!)",
          cam: { s0: 1.18, s1: 1.28, x0: 0.5, x1: 0, y0: -2.0, y1: -2.8 },
          dur: 7600
        }
      ]
    }
  ];

  const state = loadState();
  function loadState() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return { seen: raw.seen || {}, rewarded: raw.rewarded || {} };
    } catch (_) {
      return { seen: {}, rewarded: {} };
    }
  }
  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {}
  }

  /* ---------- Hallmark Movie CSS ---------- */
  const style = document.createElement("style");
  style.textContent = `
    #hm-overlay {
      position: fixed; inset: 0; z-index: 9999; display: none; align-items: center; justify-content: center;
      background: radial-gradient(circle at 50% 45%, #191210 0%, #070506 100%);
      font-family: Georgia, "Times New Roman", serif; color: #fff8eb; user-select: none;
    }
    #hm-overlay.open { display: flex; animation: hmFadeIn .55s ease; }
    @keyframes hmFadeIn { from { opacity: 0; } to { opacity: 1; } }
    #hm-stage {
      position: relative; width: min(1060px, 95vw); aspect-ratio: 16 / 9; overflow: hidden;
      background: #000; border: 2px solid rgba(255,214,138,.45);
      box-shadow: 0 28px 90px rgba(0,0,0,.92), 0 0 60px rgba(255,180,70,.18);
      border-radius: 6px;
    }
    #hm-img {
      position: absolute; inset: -6%; width: 112%; height: 112%; object-fit: cover;
      will-change: transform, opacity; filter: contrast(1.04) saturate(1.08);
      transition: opacity .5s ease;
    }
    #hm-snow { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 2; }
    #hm-vig {
      position: absolute; inset: 0; pointer-events: none; z-index: 3;
      background:
        linear-gradient(180deg, rgba(8,5,6,.76) 0%, rgba(8,5,6,0) 20%, rgba(8,5,6,0) 60%, rgba(8,5,6,.90) 100%),
        radial-gradient(ellipse at 50% 45%, rgba(255,210,130,0) 48%, rgba(12,6,8,.55) 100%);
    }
    #hm-top {
      position: absolute; top: 14px; left: 20px; right: 20px; z-index: 5;
      display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;
    }
    #hm-badge {
      display: inline-flex; flex-direction: column; gap: 2px;
      text-shadow: 0 2px 10px rgba(0,0,0,.9);
    }
    #hm-chap { font: 700 11px/1.2 system-ui, sans-serif; letter-spacing: .24em; color: #ffd479; text-transform: uppercase; }
    #hm-title { font: 700 clamp(18px, 2.4vw, 28px)/1.1 Georgia, serif; color: #fff9ee; }
    #hm-tag { font: italic 13px/1.2 Georgia, serif; color: rgba(255,236,205,.82); }
    #hm-top-btns { display: flex; gap: 8px; }
    .hm-btn {
      font: 600 12px/1 system-ui, sans-serif; letter-spacing: .06em; text-transform: uppercase;
      color: #fff6e5; background: rgba(24,14,16,.78); border: 1px solid rgba(255,214,138,.45);
      padding: 8px 13px; border-radius: 4px; cursor: pointer; backdrop-filter: blur(4px);
    }
    .hm-btn:hover { background: rgba(168,38,44,.88); border-color: #ffe09a; }
    .hm-btn.gold { background: linear-gradient(180deg, #b83232, #7e1c20); border-color: #ffd479; color: #fff; }
    #hm-bottom {
      position: absolute; left: 24px; right: 24px; bottom: 16px; z-index: 5;
      display: flex; flex-direction: column; gap: 10px;
    }
    #hm-dialog {
      background: rgba(14,9,11,.74); border-left: 3px solid #ffd479; border-radius: 0 6px 6px 0;
      padding: 12px 16px; backdrop-filter: blur(6px); max-width: 820px;
    }
    #hm-who-row { display: flex; align-items: baseline; gap: 10px; margin-bottom: 4px; }
    #hm-who { font: 700 13px/1 system-ui, sans-serif; letter-spacing: .16em; color: #ffd479; text-transform: uppercase; }
    #hm-role { font: italic 12px/1 Georgia, serif; color: rgba(255,232,200,.72); }
    #hm-text { font: 400 clamp(14px, 1.55vw, 18px)/1.45 Georgia, serif; color: #fffaf0; text-shadow: 0 1px 4px rgba(0,0,0,.85); }
    #hm-controls { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    #hm-prog { flex: 1; height: 4px; background: rgba(255,255,255,.18); border-radius: 2px; overflow: hidden; }
    #hm-prog-fill { height: 100%; width: 0%; background: linear-gradient(90deg, #e04848, #ffd479); }
    #hm-credit { font: 600 11px/1 system-ui, sans-serif; letter-spacing: .12em; color: rgba(255,220,160,.65); text-transform: uppercase; }

    /* Story Chapter Menu Modal */
    #hm-menu {
      position: fixed; inset: 0; z-index: 9998; display: none; align-items: center; justify-content: center;
      background: rgba(8,6,8,.78); backdrop-filter: blur(5px);
    }
    #hm-menu.open { display: flex; }
    #hm-card {
      width: min(640px, 94vw); max-height: 88vh; overflow-y: auto;
      background: linear-gradient(180deg, #231718, #140e10); color: #fff6e6;
      border: 2px solid #c99c4a; border-radius: 8px; padding: 20px 22px;
      box-shadow: 0 24px 70px rgba(0,0,0,.85); font-family: system-ui, sans-serif;
    }
    #hm-card h2 { margin: 0 0 4px; font: 700 22px/1.2 Georgia, serif; color: #ffd984; }
    #hm-card .hm-sub { margin: 0 0 14px; font-size: 13px; color: rgba(255,235,205,.78); }
    .hm-ch-row {
      display: grid; grid-template-columns: 112px 1fr auto; gap: 12px; align-items: center;
      background: rgba(255,255,255,.05); border: 1px solid rgba(255,214,138,.22);
      border-radius: 6px; padding: 8px; margin-bottom: 9px;
    }
    .hm-ch-row img { width: 112px; height: 63px; object-fit: cover; border-radius: 4px; display: block; }
    .hm-ch-row.locked img { filter: grayscale(.8) brightness(.55); }
    .hm-ch-row h4 { margin: 0 0 2px; font: 700 14px/1.2 Georgia, serif; color: #fff6e5; }
    .hm-ch-row p { margin: 0; font-size: 12px; color: rgba(255,230,200,.72); line-height: 1.3; }
    .hm-menu-foot { display: flex; justify-content: space-between; align-items: center; margin-top: 14px; gap: 10px; flex-wrap: wrap; }
    #btn-story {
      position: fixed; top: 58px; right: 14px; z-index: 900;
      display: inline-flex; align-items: center; gap: 7px;
      padding: 8px 14px; border-radius: 999px; cursor: pointer;
      background: linear-gradient(180deg, #b52a2e 0%, #7d171c 100%);
      color: #fff7e8; border: 1.5px solid #ffd479;
      font: 700 13px/1 Georgia, serif; letter-spacing: .03em;
      box-shadow: 0 6px 20px rgba(0,0,0,.45), 0 0 14px rgba(255,204,102,.28);
      transition: transform .15s ease, box-shadow .15s ease;
    }
    #btn-story:hover { transform: translateY(-1px); box-shadow: 0 8px 24px rgba(0,0,0,.55), 0 0 20px rgba(255,214,120,.45); }
  `;
  document.head.appendChild(style);

  /* ---------- Build DOM ---------- */
  const overlay = document.createElement("div");
  overlay.id = "hm-overlay";
  overlay.innerHTML = `
    <div id="hm-stage">
      <img id="hm-img" src="" alt="Hallmark cinematic scene">
      <canvas id="hm-snow"></canvas>
      <div id="hm-vig"></div>
      <div id="hm-top">
        <div id="hm-badge">
          <span id="hm-chap"></span>
          <span id="hm-title"></span>
          <span id="hm-tag"></span>
        </div>
        <div id="hm-top-btns">
          <button class="hm-btn" id="hm-auto">Auto: ON</button>
          <button class="hm-btn" id="hm-skip">Skip ✕</button>
        </div>
      </div>
      <div id="hm-bottom">
        <div id="hm-dialog">
          <div id="hm-who-row"><span id="hm-who"></span><span id="hm-role"></span></div>
          <div id="hm-text"></div>
        </div>
        <div id="hm-controls">
          <div id="hm-prog"><div id="hm-prog-fill"></div></div>
          <span id="hm-credit">Pinecrest Tycoon · By King</span>
          <button class="hm-btn gold" id="hm-next">Next ▶</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const menu = document.createElement("div");
  menu.id = "hm-menu";
  menu.innerHTML = `
    <div id="hm-card">
      <h2>🎬 A Pinecrest Christmas — Storyline</h2>
      <p class="hm-sub">Hallmark-style cinematic holiday chapters · Created by <strong>King</strong></p>
      <div id="hm-list"></div>
      <div class="hm-menu-foot">
        <button class="hm-btn gold" id="hm-full-movie">▶ Watch Full Movie (All 4 Chapters)</button>
        <button class="hm-btn" id="hm-menu-close">Back to Farm</button>
      </div>
    </div>
  `;
  document.body.appendChild(menu);

  /* ---------- Hallmark Celesta / Piano Music Box Score ---------- */
  let scoreTimer = null;
  let scoreCtx = null;
  function startHallmarkScore() {
    stopHallmarkScore();
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      scoreCtx = scoreCtx || new AC();
      if (scoreCtx.state === "suspended") scoreCtx.resume();
      // Warm holiday major-7th arpeggio notes (F major / D minor Hallmark progression)
      const notes = [523.25, 659.25, 783.99, 987.77, 880.0, 698.46, 587.33, 659.25, 523.25, 587.33, 698.46, 880.0];
      let idx = 0;
      const playNote = () => {
        if (!scoreCtx || !overlay.classList.contains("open")) return;
        const t = scoreCtx.currentTime, f = notes[idx++ % notes.length];
        const osc = scoreCtx.createOscillator(), g = scoreCtx.createGain();
        osc.type = "triangle"; osc.frequency.setValueAtTime(f, t);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.045, t + 0.04);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.45);
        osc.connect(g); g.connect(scoreCtx.destination);
        osc.start(t); osc.stop(t + 1.5);
      };
      playNote();
      scoreTimer = setInterval(playNote, 720);
    } catch (_) {}
  }
  function stopHallmarkScore() {
    if (scoreTimer) { clearInterval(scoreTimer); scoreTimer = null; }
  }

  /* ---------- Snow & Warm Golden Bokeh Video Overlay ---------- */
  const snowCv = overlay.querySelector("#hm-snow");
  const sctx = snowCv.getContext("2d");
  const flakes = Array.from({ length: 75 }, () => ({
    x: Math.random(), y: Math.random(), r: 1.2 + Math.random() * 2.8,
    vy: 0.04 + Math.random() * 0.09, vx: (Math.random() - 0.5) * 0.03,
    gold: Math.random() < 0.24, ph: Math.random() * 6.28
  }));

  /* ---------- Cutscene Player ---------- */
  let playing = false, queue = [], curChap = null, beatIdx = 0, beatStart = 0, autoPlay = true, rafId = 0, wasPaused = false;

  const imgEl = overlay.querySelector("#hm-img");
  const chapEl = overlay.querySelector("#hm-chap");
  const titleEl = overlay.querySelector("#hm-title");
  const tagEl = overlay.querySelector("#hm-tag");
  const whoEl = overlay.querySelector("#hm-who");
  const roleEl = overlay.querySelector("#hm-role");
  const textEl = overlay.querySelector("#hm-text");
  const progEl = overlay.querySelector("#hm-prog-fill");
  const autoBtn = overlay.querySelector("#hm-auto");
  const nextBtn = overlay.querySelector("#hm-next");

  function startChapter(ch, chain) {
    queue = chain ? [...chain] : [ch];
    menu.classList.remove("open");
    const g = window.pinecrestGame;
    if (g && !playing) { wasPaused = !!g.paused; g.paused = true; }
    playing = true;
    overlay.classList.add("open");
    startHallmarkScore();
    loadNextChapter();
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(animLoop);
  }

  function loadNextChapter() {
    curChap = queue.shift();
    if (!curChap) { closePlayer(); return; }
    state.seen[curChap.id] = true;
    if (curChap.rewardCash && !state.rewarded[curChap.id] && window.pinecrestGame) {
      state.rewarded[curChap.id] = true;
      window.pinecrestGame.cash += curChap.rewardCash;
    }
    saveState();
    chapEl.textContent = curChap.num;
    titleEl.textContent = curChap.title;
    tagEl.textContent = curChap.tagline;
    imgEl.style.opacity = "0";
    imgEl.src = curChap.img;
    imgEl.onload = () => { imgEl.style.opacity = "1"; };
    beatIdx = 0;
    showBeat();
  }

  function showBeat() {
    const b = curChap.beats[beatIdx];
    whoEl.textContent = b.who;
    roleEl.textContent = b.role;
    textEl.textContent = b.text;
    beatStart = performance.now();
    const isLast = beatIdx === curChap.beats.length - 1 && queue.length === 0;
    nextBtn.textContent = isLast ? "Back to Farm 🌲" : "Next ▶";
  }

  function advanceBeat() {
    if (!curChap) return;
    beatIdx++;
    if (beatIdx >= curChap.beats.length) loadNextChapter();
    else showBeat();
  }

  function closePlayer() {
    playing = false;
    curChap = null;
    queue = [];
    overlay.classList.remove("open");
    stopHallmarkScore();
    cancelAnimationFrame(rafId);
    const g = window.pinecrestGame;
    if (g) g.paused = wasPaused;
  }

  function animLoop(now) {
    if (!playing || !curChap) return;
    const b = curChap.beats[beatIdx];
    const u = Math.min(1, (now - beatStart) / b.dur);
    // Smooth Ken Burns video motion
    const s = b.cam.s0 + (b.cam.s1 - b.cam.s0) * u;
    const tx = b.cam.x0 + (b.cam.x1 - b.cam.x0) * u;
    const ty = b.cam.y0 + (b.cam.y1 - b.cam.y0) * u;
    imgEl.style.transform = `translate(${tx}%, ${ty}%) scale(${s})`;
    progEl.style.width = `${u * 100}%`;

    // Snow & golden bokeh overlay
    const w = snowCv.clientWidth || 960, h = snowCv.clientHeight || 540;
    if (snowCv.width !== w || snowCv.height !== h) { snowCv.width = w; snowCv.height = h; }
    sctx.clearRect(0, 0, w, h);
    const dt = 1 / 60;
    for (const f of flakes) {
      f.y = (f.y + f.vy * dt) % 1;
      f.x = (f.x + (f.vx + Math.sin(now * 0.001 + f.ph) * 0.015) * dt + 1) % 1;
      sctx.beginPath();
      sctx.arc(f.x * w, f.y * h, f.gold ? f.r * 2.2 : f.r, 0, Math.PI * 2);
      sctx.fillStyle = f.gold ? "rgba(255,214,120,0.22)" : "rgba(255,255,255,0.72)";
      sctx.fill();
    }

    if (autoPlay && u >= 1) advanceBeat();
    rafId = requestAnimationFrame(animLoop);
  }

  nextBtn.addEventListener("click", advanceBeat);
  overlay.querySelector("#hm-skip").addEventListener("click", closePlayer);
  autoBtn.addEventListener("click", () => {
    autoPlay = !autoPlay;
    autoBtn.textContent = autoPlay ? "Auto: ON" : "Auto: OFF";
  });

  /* ---------- Story Menu & Toolbar Button ---------- */
  function openStoryMenu() {
    const g = window.pinecrestGame;
    const list = menu.querySelector("#hm-list");
    list.innerHTML = CHAPTERS.map((ch, idx) => {
      const unlocked = ch.unlockCheck(g) || !!state.seen[ch.id];
      return `
        <div class="hm-ch-row ${unlocked ? "" : "locked"}">
          <img src="${ch.img}" alt="${ch.title}">
          <div>
            <h4>${ch.num}: ${ch.title}</h4>
            <p>${unlocked ? ch.tagline : "🔒 " + ch.goalText}</p>
          </div>
          <button class="hm-btn ${unlocked ? "gold" : ""}" data-play="${idx}">${unlocked ? (state.seen[ch.id] ? "Replay ▶" : "Watch ▶") : "Preview ▶"}</button>
        </div>
      `;
    }).join("");
    list.querySelectorAll("[data-play]").forEach((btn) => {
      btn.addEventListener("click", () => startChapter(CHAPTERS[+btn.dataset.play]));
    });
    menu.classList.add("open");
  }

  menu.querySelector("#hm-menu-close").addEventListener("click", () => menu.classList.remove("open"));
  menu.querySelector("#hm-full-movie").addEventListener("click", () => startChapter(CHAPTERS[0], CHAPTERS));

  window.addEventListener("DOMContentLoaded", () => {
    // Mount floating Hallmark Story button (always visible on desktop & mobile)
    const btn = document.createElement("button");
    btn.id = "btn-story";
    btn.title = "Hallmark Cinematic Storyline";
    btn.innerHTML = '<span>🎬</span><span>Story</span>';
    btn.addEventListener("click", openStoryMenu);
    document.body.appendChild(btn);

    // Auto-play Chapter 1 on first visit (after 0.9s so farm renders behind it)
    setTimeout(() => {
      if (!state.seen.ch1 && !playing) startChapter(CHAPTERS[0]);
    }, 900);

    // Watch farm milestones to auto-trigger Chapters 2, 3, and 4
    setInterval(() => {
      const g = window.pinecrestGame;
      if (!g || playing) return;
      for (const ch of CHAPTERS) {
        if (!state.seen[ch.id] && ch.unlockCheck(g)) {
          startChapter(ch);
          break;
        }
      }
    }, 1500);
  });

  window.PTStory = { openMenu: openStoryMenu, playChapter: (i) => startChapter(CHAPTERS[i]), playFullMovie: () => startChapter(CHAPTERS[0], CHAPTERS) };
})();
