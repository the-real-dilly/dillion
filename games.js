/* Dillion mini-games. Each view is f(H, arg) where H = helpers exposed by app.js */
(() => {
const V = window.GAME_VIEWS = {};
const pick = a => a[Math.floor(Math.random() * a.length)];
const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const best = (H, k, v, low) => { const g = H.store.get("games", {}); const old = g[k]; const better = old == null || (low ? v < old : v > old); if (better) { g[k] = v; H.store.set("games", g); } return better; };
const bestOf = (H, k) => H.store.get("games", {})[k];

/* ---------- hub ---------- */
V.games = H => {
  const g = [
    ["dillystrike", "Dilly Strike", "CS:GO + Valorant-style 3D tactical FPS with buy menu, abilities, tactical bots & Rust WebSocket multiplayer.", "🎯", "dilly-strike/index.html"],
    ["dillyverse", "DillyVerse", "Build. Explore. Survive. — 3D voxel sandbox survival, crafting, biomes, caves, creatures & multiplayer.", "🧊", "dillyverse/index.html"],
    ["dillyfortress", "Dilly Fortress", "Tactical tower defense — 3 maps, 6 upgradeable turrets, commander abilities, boss waves & endless mode.", "🏰", "dilly-fortress/index.html"],
    ["dgm", "Dilly Gone Mad", "Out now · cinematic 3D open-world driving through Los Pepinos.", "🎬", "dilly-gone-mad.html?v=20261125014530#play"],
    ["dilly", "Dilly Goes Wild", "Steal cars, bonk for cash, outrun the cops. A top-down city romp starring Dilly the pickle.", "🥒", "dilly-goes-wild.html?v=20261125014530"],
    ["crossword", "Mini Crossword", "A 5×5 cosmic crossword. A new grid each day.", "✚"],
    ["scramble", "Orbit Scramble", "Unjumble five space words before the clock runs out.", "🌀"],
    ["rescue", "Rover Rescue", "Guess the word before the rover runs out of oxygen.", "🤖"],
    ["memory", "Memory Match", "Flip cards, match the pairs, fewest moves wins.", "🪐"],
    ["hilo", "Higher or Lower", "Which world is bigger? Which sits farther from the Sun?", "⚖"],
    ["party", "Rocket Relay", "Name answers fast — don't let the rocket blow up.", "🚀"]
  ];
  H.app.innerHTML = `<h1>Games</h1><p class="sub">more ways to spend a Sol</p>${g.map(([id, n, d, ic, href]) => `<a class="card pack link" href="${href || "#/" + id}"><div><h3><span class="ic">${ic}</span> ${n}${href ? ' <span class="tag">NEW</span>' : ""}</h3><p>${d}</p></div><b class="t-dillion">${bestOf(H, id) != null ? "best " + bestOf(H, id) : "play"}</b></a>`).join("")}`;
};

/* ---------- crossword ---------- */
const CW = [
  { a: ["SOLAR", "ANGEL", "ENTRY"], d: ["SPACE", "LIGHT", "RELAY"],
    ac: ["Of the sun", "Halo wearer", "Way in"], dc: ["The final frontier", "Not heavy, not dark", "Race with a baton pass"] },
  { a: ["TITAN", "SONAR", "EARTH"], d: ["TASTE", "TENOR", "NORTH"],
    ac: ["Saturn's biggest moon", "Underwater echo finder", "Our home planet"], dc: ["Sweet or salty, for one", "High male singing voice", "Where a compass needle points"] },
  { a: ["ATLAS", "ANGEL", "ENTER"], d: ["AWARE", "LIGHT", "SOLAR"],
    ac: ["Book of maps", "Winged messenger", "Come in"], dc: ["Conscious (of)", "Opposite of dark", "___ system"] }
];
V.crossword = (H, arg) => {
  const n = arg != null && arg !== "" ? +arg % CW.length : H.dayNo(H.today()) % CW.length, P = CW[n];
  const sol = r => c => (r % 2 === 0 ? P.a[r / 2][c] : (c % 2 === 0 ? P.d[c / 2][r] : null));
  const isBlock = (r, c) => r % 2 === 1 && c % 2 === 1;
  const num = { "0,0": 1, "0,2": 2, "0,4": 3, "2,0": 4, "4,0": 5 };
  let cur = { r: 0, c: 0, dir: "A" }, t0 = Date.now(), done = false;
  const cells = [];
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) cells.push(isBlock(r, c) ? `<i class="blk"></i>` : `<div class="cell" data-r="${r}" data-c="${c}">${num[r + "," + c] ? `<sup>${num[r + "," + c]}</sup>` : ""}<input maxlength="1" inputmode="text" autocapitalize="characters" aria-label="row ${r + 1} column ${c + 1}"></div>`);
  H.app.innerHTML = `<h1>Mini Crossword</h1><p class="sub">Puzzle ${n + 1} of ${CW.length} · tap a cell, type letters, tap again to switch direction</p>
  <div class="cwgrid" id="cw">${cells.join("")}</div><div class="row center"><button class="btn small" id="chk">Check</button><button class="btn small ghost" id="rev">Reveal</button>${CW.map((_, i) => `<a class="btn small ghost" href="#/crossword/${i}">#${i + 1}</a>`).join("")}</div>
  <div class="card cwclues"><div><h3>Across</h3><ol>${[1, 4, 5].map((k, i) => `<li data-d="A" data-r="${i * 2}"><b>${k}</b> ${H.esc(P.ac[i])}</li>`).join("")}</ol></div><div><h3>Down</h3><ol>${[1, 2, 3].map((k, i) => `<li data-d="D" data-c="${i * 2}"><b>${k}</b> ${H.esc(P.dc[i])}</li>`).join("")}</ol></div></div><div id="cwmsg"></div>`;
  const cellEl = (r, c) => H.app.querySelector(`.cell[data-r="${r}"][data-c="${c}"]`);
  const inp = (r, c) => cellEl(r, c)?.querySelector("input");
  const okDir = (r, c, d) => d === "A" ? r % 2 === 0 : c % 2 === 0;
  const paint = () => {
    H.app.querySelectorAll(".cell").forEach(e => e.classList.remove("act", "cur"));
    for (let k = 0; k < 5; k++) { const e = cur.dir === "A" ? cellEl(cur.r, k) : cellEl(k, cur.c); e && e.classList.add("act"); }
    cellEl(cur.r, cur.c)?.classList.add("cur");
    H.app.querySelectorAll(".cwclues li").forEach(li => li.classList.toggle("on", li.dataset.d === cur.dir && (cur.dir === "A" ? +li.dataset.r === cur.r : +li.dataset.c === cur.c)));
  };
  const focus = (r, c, dir) => { if (isBlock(r, c) || r < 0 || c < 0 || r > 4 || c > 4) return false; cur = { r, c, dir: okDir(r, c, dir) ? dir : (dir === "A" ? "D" : "A") }; inp(r, c).focus(); inp(r, c).select(); paint(); return true; };
  const step = (k) => { const [dr, dc] = cur.dir === "A" ? [0, k] : [k, 0]; focus(cur.r + dr, cur.c + dc, cur.dir); };
  const check = (mark) => { let ok = true, full = true; H.app.querySelectorAll(".cell").forEach(e => { const r = +e.dataset.r, c = +e.dataset.c, v = e.querySelector("input").value.toUpperCase(); if (!v) full = false; if (v !== sol(r)(c)) { ok = false; if (mark && v) e.classList.add("bad"); } }); return { ok, full }; };
  const win = () => { if (done) return; done = true; const s = Math.round((Date.now() - t0) / 1000); const nb = best(H, "crossword", s, true);
    H.app.querySelector("#cwmsg").innerHTML = `<div class="result t-dillion"><div class="tier">★ Solved in ${s}s</div><div>${nb ? "New best time!" : "Best: " + bestOf(H, "crossword") + "s"}</div></div>`; H.fx && H.fx("boost"); };
  H.app.querySelector("#cw").addEventListener("input", e => { const el = e.target; el.value = el.value.replace(/[^a-z]/gi, "").toUpperCase().slice(-1); el.parentElement.classList.remove("bad"); if (el.value) step(1); const s = check(false); if (s.full && s.ok) win(); });
  H.app.querySelector("#cw").addEventListener("keydown", e => { const k = e.key; const r = +e.target.parentElement.dataset.r, c = +e.target.parentElement.dataset.c;
    if (k === "Backspace" && !e.target.value) { e.preventDefault(); step(-1); } else if (k.startsWith("Arrow")) { e.preventDefault(); const d = { ArrowLeft: [0, -1, "A"], ArrowRight: [0, 1, "A"], ArrowUp: [-1, 0, "D"], ArrowDown: [1, 0, "D"] }[k]; let rr = r + d[0], cc = c + d[1]; while (rr >= 0 && rr < 5 && cc >= 0 && cc < 5 && isBlock(rr, cc)) { rr += d[0]; cc += d[1]; } focus(rr, cc, d[2]); } });
  H.app.querySelector("#cw").addEventListener("focusin", e => { const p = e.target.parentElement; if (!p?.dataset?.r) return; const r = +p.dataset.r, c = +p.dataset.c; if (cur.r === r && cur.c === c) return; cur = { r, c, dir: okDir(r, c, cur.dir) ? cur.dir : (cur.dir === "A" ? "D" : "A") }; paint(); });
  H.app.querySelector("#cw").addEventListener("click", e => { const p = e.target.closest(".cell"); if (!p) return; const r = +p.dataset.r, c = +p.dataset.c; if (cur.r === r && cur.c === c && okDir(r, c, cur.dir === "A" ? "D" : "A")) cur.dir = cur.dir === "A" ? "D" : "A"; paint(); });
  H.app.querySelectorAll(".cwclues li").forEach(li => li.onclick = () => li.dataset.d === "A" ? focus(+li.dataset.r, 0, "A") : focus(0, +li.dataset.c, "D"));
  H.app.querySelector("#chk").onclick = () => { const s = check(true); H.toast(s.ok && s.full ? "Perfect!" : s.ok ? "So far so good" : "Some letters are off"); if (s.ok && s.full) win(); };
  H.app.querySelector("#rev").onclick = () => { H.app.querySelectorAll(".cell").forEach(e => e.querySelector("input").value = sol(+e.dataset.r)(+e.dataset.c)); done = true; };
  focus(0, 0, "A");
};

/* ---------- Orbit Scramble ---------- */
const WORDS = [["ROCKET", "Lifts off with fire"], ["GALAXY", "Home of billions of stars"], ["COMET", "Icy visitor with a tail"], ["ORBIT", "Path around a planet"], ["MARTIAN", "Red-planet resident"], ["ASTEROID", "Rocky space leftover"], ["TELESCOPE", "Brings the stars closer"], ["GRAVITY", "What keeps your feet down"], ["NEBULA", "Cosmic cloud of dust"], ["ECLIPSE", "Shadow play of sun and moon"], ["METEOR", "Shooting star"], ["LAUNCH", "Countdown ends here"], ["CRATER", "Bowl left by an impact"], ["ASTRONAUT", "Suited space traveller"], ["SATELLITE", "Circles overhead"], ["PLANET", "Wanderer of the sky"], ["STARSHIP", "Giant stainless rocket"], ["OLYMPUS", "Tallest volcano around"], ["DUST", "Fills Martian storms"], ["HELMET", "Keeps the air in"]];
V.scramble = H => {
  const words = shuffle(WORDS).slice(0, 5); let i = 0, score = 0, tl = 25, tm, hint = 0;
  const scr = w => { let s; do s = shuffle([...w]).join(""); while (s === w); return s; };
  const round = () => {
    if (i >= words.length) { clearInterval(tm); const nb = best(H, "scramble", score); H.app.innerHTML = `<h1>Orbit Scramble</h1><div class="card summary"><div class="big">${score}<small> pts</small></div><p>${nb ? "New best!" : "Best: " + bestOf(H, "scramble")}</p><button class="btn pink" id="again">Again</button></div>`; H.app.querySelector("#again").onclick = () => V.scramble(H); if (score > 0) H.fx && H.fx("boost"); return; }
    const [w, clue] = words[i]; hint = 0; tl = 25; const sc = scr(w);
    H.app.innerHTML = `<h1>Orbit Scramble</h1><p class="sub">Word ${i + 1} of 5 · score ${score}</p><div class="card"><div class="tiles">${[...sc].map(ch => `<span>${ch}</span>`).join("")}</div><p class="sub" id="cl">${H.esc(clue)}</p><div class="timer"><div id="tm" style="width:100%"></div></div>
    <form class="guess" autocomplete="off"><input id="g" placeholder="unscramble…" autofocus><button class="btn pink">Go</button></form><div class="row"><button class="btn small ghost" id="hint">Hint (−5)</button><button class="btn small ghost" id="skip">Skip</button></div><div id="fb"></div></div>`;
    const inp = H.app.querySelector("#g"); inp.focus(); clearInterval(tm);
    tm = setInterval(() => { tl -= .1; H.app.querySelector("#tm").style.width = Math.max(0, tl / 25 * 100) + "%"; if (tl <= 0) { clearInterval(tm); H.app.querySelector("#fb").innerHTML = `<div class="result t-miss">Time! It was <b>${w}</b>.</div>`; setTimeout(() => { i++; round(); }, 1400); } }, 100);
    H.onLeave(() => clearInterval(tm));
    H.app.querySelector("form").onsubmit = e => { e.preventDefault(); if (inp.value.trim().toUpperCase() === w) { clearInterval(tm); const p = Math.max(5, 10 + Math.round(tl) - hint * 5); score += p; H.app.querySelector("#fb").innerHTML = `<div class="result t-dillion">+${p}! ${w}</div>`; setTimeout(() => { i++; round(); }, 900); } else { inp.value = ""; inp.animate([{ transform: "translateX(-8px)" }, { transform: "translateX(8px)" }, { transform: "none" }], 180); } };
    H.app.querySelector("#hint").onclick = () => { hint++; H.app.querySelector("#fb").innerHTML = `<div class="result t-schooler">Starts with <b>${w.slice(0, hint)}</b></div>`; };
    H.app.querySelector("#skip").onclick = () => { clearInterval(tm); i++; round(); };
  };
  round();
};

/* ---------- Rover Rescue (hangman) ---------- */
const RW = ["ROVER", "CRATER", "ORBIT", "GALAXY", "COMET", "ROCKET", "PLANET", "NEBULA", "GRAVITY", "SOLAR", "METEOR", "ASTRONAUT", "TITAN", "PHOBOS", "OLYMPUS", "MARINER", "LANDER", "PERSEVERANCE", "STARSHIP", "DILLION", "THRUSTER", "CAPSULE", "AIRLOCK", "HORIZON"];
V.rescue = H => {
  const w = pick(RW); const got = new Set(), bad = new Set(); const MAX = 6; let over = false;
  const draw = () => {
    const win = [...w].every(c => got.has(c)), lose = bad.size >= MAX; over = win || lose;
    H.app.innerHTML = `<h1>Rover Rescue</h1><p class="sub">Guess the word before the oxygen runs out</p><div class="card">
      <div class="o2" aria-label="oxygen ${MAX - bad.size} of ${MAX}">${"█".repeat(MAX - bad.size)}<span>${"█".repeat(bad.size)}</span></div><div class="puffer">${lose ? "💀" : win ? "🤖" : "🧑‍🚀"}</div>
      <div class="word">${[...w].map(c => `<span>${got.has(c) || lose ? c : "_"}</span>`).join("")}</div>
      <div class="kb">${[..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"].map(c => `<button data-k="${c}" ${got.has(c) || bad.has(c) || over ? "disabled" : ""} class="${got.has(c) ? "ok" : bad.has(c) ? "no" : ""}">${c}</button>`).join("")}</div>
      ${over ? `<div class="result ${win ? "t-dillion" : "t-miss"}"><div class="tier">${win ? "★ Rescued!" : "Out of air"}</div>${lose ? `<div>The word was <b>${w}</b></div>` : ""}</div><div class="row center"><button class="btn pink" id="again">Next rover</button></div>` : ""}</div>`;
    if (win) { const g = H.store.get("games", {}); g.rescue = (g.rescue || 0) + 1; H.store.set("games", g); H.fx && H.fx("boost"); }
    H.app.querySelectorAll(".kb button").forEach(b => b.onclick = () => guess(b.dataset.k));
    const a = H.app.querySelector("#again"); if (a) a.onclick = () => V.rescue(H);
  };
  const guess = c => { if (over || got.has(c) || bad.has(c)) return; (w.includes(c) ? got : bad).add(c); draw(); };
  const onKey = e => { if (/^[a-z]$/i.test(e.key) && !e.ctrlKey && !e.metaKey) guess(e.key.toUpperCase()); };
  addEventListener("keydown", onKey); H.onLeave(() => removeEventListener("keydown", onKey));
  draw();
};

/* ---------- Memory Match ---------- */
V.memory = H => {
  const faces = ["🚀", "🪐", "🌕", "☄️", "👽", "🛰️", "🔭", "🌠"]; const deck = shuffle([...faces, ...faces]); let open = [], found = new Set(), moves = 0, lock = false;
  const draw = () => {
    H.app.innerHTML = `<h1>Memory Match</h1><p class="sub">Moves: ${moves}${bestOf(H, "memory") != null ? " · best " + bestOf(H, "memory") : ""}</p><div class="mem">${deck.map((f, i) => `<button class="mc ${found.has(i) ? "f" : open.includes(i) ? "o" : ""}" data-i="${i}" aria-label="card ${i + 1}">${found.has(i) || open.includes(i) ? f : "?"}</button>`).join("")}</div>
    ${found.size === deck.length ? `<div class="result t-dillion"><div class="tier">★ Cleared in ${moves} moves</div>${best(H, "memory", moves, true) ? "<div>New best!</div>" : ""}</div><div class="row center"><button class="btn pink" id="again">Again</button></div>` : ""}`;
    H.app.querySelectorAll(".mc").forEach(b => b.onclick = () => flip(+b.dataset.i));
    const a = H.app.querySelector("#again"); if (a) { a.onclick = () => V.memory(H); H.fx && H.fx("boost"); }
  };
  const flip = i => { if (lock || open.includes(i) || found.has(i)) return; open.push(i); if (open.length === 2) { moves++; const [a, b] = open; if (deck[a] === deck[b]) { found.add(a); found.add(b); open = []; } else { lock = true; draw(); setTimeout(() => { open = []; lock = false; draw(); }, 800); return; } } draw(); };
  draw();
};

/* ---------- Higher or Lower ---------- */
const HL = [
  { q: "Which is wider?", unit: "km across", items: [["Mercury", 4879], ["Venus", 12104], ["Earth", 12742], ["Mars", 6779], ["Jupiter", 139820], ["Saturn", 116460], ["Uranus", 50724], ["Neptune", 49244], ["The Moon", 3474], ["Pluto", 2377], ["Titan", 5150], ["Ganymede", 5268], ["Europa", 3122]] },
  { q: "Which is farther from the Sun?", unit: "million km", items: [["Mercury", 58], ["Venus", 108], ["Earth", 150], ["Mars", 228], ["Jupiter", 779], ["Saturn", 1434], ["Uranus", 2871], ["Neptune", 4495], ["Pluto", 5906], ["Ceres", 414]] },
  { q: "Which has more moons?", unit: "known moons", items: [["Mercury", 0], ["Venus", 0], ["Earth", 1], ["Mars", 2], ["Jupiter", 95], ["Saturn", 146], ["Uranus", 28], ["Neptune", 16], ["Pluto", 5]] }
];
V.hilo = H => {
  const cat = pick(HL); let pool = shuffle(cat.items), a = pool.pop(), b, streak = 0, shown = false;
  const next = () => { do b = pool.length ? pool.pop() : pick(cat.items); while (b[0] === a[0] || b[1] === a[1]); };
  next();
  const draw = (msg) => {
    H.app.innerHTML = `<h1>Higher or Lower</h1><p class="sub">${cat.q} · streak ${streak}${bestOf(H, "hilo") != null ? " · best " + bestOf(H, "hilo") : ""}</p>
    <div class="vs"><div class="card"><h3>${a[0]}</h3><div class="big2">${a[1].toLocaleString()}</div><small>${cat.unit}</small></div><div class="card"><h3>${b[0]}</h3><div class="big2">${shown ? b[1].toLocaleString() : "?"}</div><small>${cat.unit}</small></div></div>
    ${msg || `<div class="row center"><button class="btn" data-g="hi">▲ ${b[0]} is higher</button><button class="btn pink" data-g="lo">▼ lower</button></div>`}`;
    H.app.querySelectorAll("[data-g]").forEach(btn => btn.onclick = () => { const right = (btn.dataset.g === "hi") === (b[1] > a[1]); shown = true;
      if (right) { streak++; best(H, "hilo", streak); draw(`<div class="result t-dillion">Correct! ${b[0]} = ${b[1].toLocaleString()}</div>`); setTimeout(() => { a = b; shown = false; next(); draw(); }, 1000); }
      else { draw(`<div class="result t-miss"><div class="tier">Wrong · streak ${streak}</div><div>${b[0]} is ${b[1].toLocaleString()}.</div></div><div class="row center"><button class="btn pink" id="again">Again</button></div>`); H.app.querySelector("#again").onclick = () => V.hilo(H); } });
  };
  draw();
};
})();
