(() => {
const $ = (s, r = document) => r.querySelector(s);
const app = $("#app"), sky = $("#sky"), chip = $("#depthChip");
const P = window.PROMPTS, T = Object.fromEntries(window.TIERS.map(t => [t.id, t]));
const MAXDEPTH = 1600; // km from Earth
const QUIPS = ["To Mars!","Hello from the crater!","Rare answers only.","Next stop: Olympus Mons.","Pop quiz time.","Is this thing on?","Humanity, but on two planets."];

/* ---------- utils ---------- */
const norm = s => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/^the\s+/, "").replace(/[^a-z0-9]/g, "");
const lev = (a, b) => { const m = [...Array(a.length + 1)].map((_, i) => [i]); for (let j = 1; j <= b.length; j++) m[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) m[i][j] = Math.min(m[i-1][j] + 1, m[i][j-1] + 1, m[i-1][j-1] + (a[i-1] === b[j-1] ? 0 : 1)); return m[a.length][b.length]; };
const hash = s => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const rng = seed => () => (seed = Math.imul(seed ^ (seed >>> 15), 2246822507) + 0x6d2b79f5 >>> 0) / 4294967296;
const today = () => new Date().toISOString().slice(0, 10);
const esc = s => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const store = { get(k, d) { try { return JSON.parse(localStorage.getItem("dillion:" + k)) ?? d; } catch { return d; } }, set(k, v) { try { localStorage.setItem("dillion:" + k, JSON.stringify(v)); } catch {} } };
const toast = msg => { const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; document.body.append(t); setTimeout(() => t.remove(), 1800); };
const rankOf = d => [...window.RANKS].reverse().find(r => d >= r.min).name;
const TW = { none: { name: "Clear skies", desc: "No twist today. Pure thrust." }, gravity: { name: "Gravity Well", desc: "A miss costs you 30 km." }, flare: { name: "Solar Flare", desc: "Dust answers score nothing." }, jackpot: { name: "Jackpot Burn", desc: "The final prompt counts double." } };
const TWK = ["gravity", "flare", "jackpot"];
const twistFor = seed => TWK[hash("twist" + seed) % 3];
const twistBanner = run => { const t = TW[run.twist || "none"]; return `<div class="twist"><b>Twist · ${t.name}</b> ${t.desc} <span>Boulder-or-better streaks add ×0.25 each.</span></div>`; };
const dayNo = d => Math.floor((Date.parse(d) - Date.parse("2026-01-01")) / 864e5) + 1;

function pixel(art, px = 8) {
  const w = art.rows[0].length, h = art.rows.length; let r = "";
  art.rows.forEach((row, y) => [...row].forEach((c, x) => { if (art.pal[c]) r += `<rect x="${x}" y="${y}" width="1" height="1" fill="${art.pal[c]}"/>`; }));
  return `<svg class="mascot" viewBox="0 0 ${w} ${h}" width="${w * px}" height="${h * px}" shape-rendering="crispEdges" role="img" aria-label="Dill, the Dillion mascot">${r}</svg>`;
}

/* ---------- game engine ---------- */
function setFor(seedStr, n = 7) { const r = rng(hash(seedStr)); const idx = P.map((_, i) => i); for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; } return idx.slice(0, n); }
function judge(p, guess) {
  const g = norm(guess); if (!g) return null; const L = p.a.length; let hit = -1, best = 9;
  p.a.forEach((e, i) => [].concat(e).forEach(n => { const k = norm(n); const d = k === g ? 0 : (g.length > 4 && lev(k, g) <= (g.length > 8 ? 2 : 1) ? 1 : 9); if (d < best) { best = d; hit = i; } }));
  if (hit < 0 || best > 1) return { tier: "miss", pts: 0, idx: -1 };
  const f = hit / (L - 1); const tier = hit === L - 1 ? "dillion" : f < .25 ? "plankton" : f < .5 ? "schooler" : f < .75 ? "rare" : "deepcut";
  return { tier, pts: T[tier].pts, idx: hit, name: [].concat(p.a[hit])[0], rank: hit + 1 };
}
const gem = p => [].concat(p.a[p.a.length - 1])[0];
const depthOf = run => Math.max(0, run.res.reduce((s, r) => s + r.pts, 0));
function setDepth(m) { const f = Math.min(1, m / MAXDEPTH); document.documentElement.style.setProperty("--depth", f); chip.textContent = m + " km"; }

function dust() { const b = $(".dust"); b.innerHTML = ""; for (let i = 0; i < 26; i++) { const e = document.createElement("i"); e.style.cssText = `top:${Math.random() * 90}%;--dy:${(Math.random() * 60 - 30) | 0}px;animation-duration:${10 + Math.random() * 18}s;animation-delay:-${Math.random() * 28}s;opacity:${.25 + Math.random() * .5};width:${2 + (Math.random() * 4 | 0)}px;height:${2 + (Math.random() * 3 | 0)}px`; b.append(e); } }

/* ---------- views ---------- */
const views = {};
function route() {
  const [, name = "", arg] = location.hash.slice(1).split("/");
  closeMenu(); document.querySelectorAll(".drawer nav a").forEach(a => a.classList.toggle("on", a.getAttribute("href") === "#/" + name || (!name && a.getAttribute("href") === "#/")));
  cleanup(); (views[name || "home"] || views.nf)(arg); window.scrollTo(0, 0);
  if (!["dive", "unl"].includes(name)) setDepth(name === "home" || !name ? (store.get("run:" + today())?.res ? depthOf(store.get("run:" + today())) : 0) : 0);
}
let cleanup = () => {}; const onLeave = f => { cleanup = f; };

views.home = () => {
  const d = today(), run = store.get("run:" + d), done = run && run.res.length >= 7;
  app.innerHTML = `<section class="hero">
    <div class="mascot-wrap">${pixel(window.MASCOT, 11)}<div class="glow"></div></div>
    <p class="eyebrow">Mission #${dayNo(d)} · ${d}</p>
    <h1>The daily <em>landing</em></h1>
    <p class="lede">Seven prompts. Same for everyone. <b>Rare answers launch you farther from Earth.</b> Obvious ones barely count.</p>
    <p class="twist"><b>Today's twist · ${TW[twistFor(d)].name}</b> ${TW[twistFor(d)].desc}</p>
    <div class="row center"><a class="btn big" href="#/dive">${done ? "View your mission" : run ? "Resume mission" : "Launch"}</a><a class="btn ghost" href="#/unlimited">∞ Unlimited</a></div>
    ${done ? `<p class="done">Today's distance: <b>${depthOf(run)} m</b> · ${rankOf(depthOf(run))}</p>` : ""}
  </section>
  <section class="card legend"><h3>How far can you go?</h3><ul class="tierlist">${window.TIERS.map(t => `<li class="t-${t.id}"><span><i class="sw" style="background:currentColor"></i>${t.name}</span><b>${t.pts ? "+" + t.pts + " km" : "0 km"}</b></li>`).join("")}</ul>
  <p class="sub">Type any answer. The more people would say it, the shallower it lands.</p></section>
  <section class="card promo">
    <a class="promo-shot" href="dilly-goes-wild.html#play"><img src="img/dilly-goes-wild.png" width="1512" height="798" loading="lazy" alt="Dilly Goes Wild: Dilly the pickle on a rainy night street, with headlights, lit windows and a police car closing in."></a>
    <div class="promo-copy">
      <p class="eyebrow">New game <span class="tag">NEW</span></p>
      <h2>Dilly Goes Wild</h2>
      <p>Dilly the pickle has had enough of the jar. Steal a car, tear through a rain-soaked city after dark, bonk pedestrians for cash, and shake off the cops.</p>
      <div class="row"><a class="btn big" href="dilly-goes-wild.html#play">Play now</a><a class="btn ghost" href="dilly-goes-wild.html#trailer">▶ Trailer</a></div>
      <p class="sub small-note">Desktop browser + keyboard. Cartoon chaos: nobody gets hurt, they just see stars.</p>
    </div>
  </section>
  <section class="card promo">
    <a class="promo-shot" href="dilly-gone-mad.html#trailer"><img src="img/dilly-gone-mad.jpg" width="960" height="430" loading="lazy" alt="Dilly Gone Mad: Dilly waves next to a cherry-red convertible on a sunset city street lined with palms and high-rises."></a>
    <div class="promo-copy">
      <p class="eyebrow">Coming soon <span class="tag">TRAILER</span></p>
      <h2>Dilly Gone Mad</h2>
      <p>A cinematic 3D open-world romp through the sunset city of Los Pepinos. Chase cams, police pursuits, stunt jumps and a radio full of brine.</p>
      <div class="row"><a class="btn big" href="dilly-gone-mad.html#trailer">▶ Watch the trailer</a></div>
      <p class="sub small-note">Coming soon. Best on a desktop browser.</p>
    </div>
  </section>
  <a class="card pack link" href="#/games"><div><h3>✚ More games</h3><p>Dilly Gone Mad (soon) · Dilly Goes Wild · Crossword · Orbit Scramble · Rover Rescue · Memory · Higher or Lower</p></div><b class="t-dillion">play</b></a>
  <footer class="foot">one in a dillion.</footer>`;
};

function diveView(run, save, opts) {
  const set = run.set; let i = run.res.length;
  const render = () => {
    setDepth(depthOf(run));
    if (i >= set.length) return summary();
    const p = P[set[i]];
    app.innerHTML = `${gauge(run)}${twistBanner(run)}<div class="prog">${set.map((_, k) => `<span class="${k < i ? "d t-" + run.res[k].tier : k === i ? "cur" : ""}"></span>`).join("")}</div>
      <div class="prompt"><small>Prompt ${i + 1} of ${set.length}</small>${esc(p.q)}</div>
      <form class="guess" autocomplete="off"><input id="g" placeholder="type your answer…" autofocus enterkeyhint="go"><button class="btn">Launch</button></form>
      <div id="out"></div><div class="row"><button class="btn ghost small" id="skip">Skip (0 km)</button></div>`;
    const f = $("form"), inp = $("#g"); inp.focus();
    f.onsubmit = e => { e.preventDefault(); const r = judge(p, inp.value); if (!r) return; reveal(p, r, inp.value); };
    $("#skip").onclick = () => reveal(p, { tier: "miss", pts: 0, idx: -1 }, "—");
  };
  const reveal = (p, r, guess) => {
    const HOT = ["rare", "deepcut", "dillion"], hot = HOT.includes(r.tier), notes = []; let streak = 0, pts = r.pts;
    for (let k = run.res.length - 1; k >= 0 && HOT.includes(run.res[k].tier); k--) streak++;
    if (hot && streak) { const m = 1 + .25 * Math.min(streak, 4); pts = Math.round(pts * m); notes.push(`Thrust streak ×${m}`); }
    const tw = run.twist || "none";
    if (tw === "gravity" && r.tier === "miss") { pts = -30; notes.push("Gravity well −30 km"); }
    if (tw === "flare" && r.tier === "plankton") { pts = 0; notes.push("Solar flare wiped it out"); }
    if (tw === "jackpot" && i === run.set.length - 1) { pts *= 2; notes.push("Jackpot burn ×2"); }
    r = { ...r, pts }; run.res.push({ ...r, guess }); save(run); const t = T[r.tier], total = depthOf(run);
    const msg = { plankton: "Everyone's here. Just dust on the wind.", schooler: "Solid. You're in the pebble field.", rare: "Now we're getting somewhere.", deepcut: "Crater-sized answer. Impressive.", dillion: "ONE IN A DILLION. You found the gem!", miss: "Nothing out here but red dust." }[r.tier];
    $("form").remove(); $("#skip").remove();
    $("#out").innerHTML = `<div class="result t-${r.tier}"><div class="tier">${t.glyph} ${t.name}${r.name ? " · " + esc(r.name) : ""}</div><div class="meters">${r.pts < 0 ? "−" : "+"}<span id="cnt">0</span> km</div><div>${msg}</div>${notes.length ? `<div class="notes">${notes.join(" · ")}</div>` : ""}
      ${r.tier !== "dillion" ? `<div class="gem">The gem here was <b>${esc(gem(p))}</b>.</div>` : ""}</div>
      <div class="row center"><button class="btn big" id="next">${i + 1 >= run.set.length ? "Touch down" : "Next ▲"}</button></div>`;
    countUp($("#cnt"), Math.abs(r.pts)); setDepth(total); fx(hot ? "boost" : ""); const g = $(".gauge .mark"); if (g) g.style.top = Math.min(100, total / MAXDEPTH * 100) + "%";
    $("#next").focus(); $("#next").onclick = () => { i++; render(); };
  };
  const summary = () => {
    const total = depthOf(run), counts = {}; run.res.forEach(r => counts[r.tier] = (counts[r.tier] || 0) + 1);
    const grid = run.res.map(r => T[r.tier].sq).join("");
    const share = `Dillion ${opts.label}\n${grid}\n${total} km · ${rankOf(total)}\n${location.origin}${location.pathname}`;
    app.innerHTML = `<section class="summary card"><p class="eyebrow">${opts.label}</p><div class="mascot-wrap sm">${pixel(window.MASCOT, 6)}</div>
      <div class="big"><span id="cnt">0</span><small> km</small></div><h2>${rankOf(total)}</h2><div class="grid">${grid}</div>
      <div class="bars">${window.TIERS.map(t => `<div class="bar t-${t.id}"><span>${t.name}</span><i style="width:${(counts[t.id] || 0) / run.set.length * 100}%"></i><b>${counts[t.id] || 0}</b></div>`).join("")}</div>
      <ol class="review">${run.res.map((r, k) => `<li class="t-${r.tier}"><span>${esc(P[run.set[k]].q)}</span><b>${esc(r.guess)} · ${r.pts} km</b></li>`).join("")}</ol>
      <div class="row center"><button class="btn" id="share">Copy result</button>${opts.again ? `<button class="btn pink" id="again">Launch again</button>` : `<a class="btn ghost" href="#/unlimited">∞ Keep launching</a>`}</div></section>`;
    countUp($("#cnt"), total, 1200); setDepth(total);
    $("#share").onclick = async () => { try { await navigator.clipboard.writeText(share); toast("Copied! Share your distance."); } catch { toast("Copy failed"); } };
    if (opts.again) $("#again").onclick = opts.again;
    if (opts.record) opts.record(total);
  };
  render();
}
const gauge = run => `<div class="gauge" aria-hidden="true"><i class="mark" style="top:${Math.min(100, depthOf(run) / MAXDEPTH * 100)}%"></i><span>0</span><span>${MAXDEPTH}</span></div>`;
function countUp(el, to, ms = 600) { const t0 = performance.now(); (function f(t) { const k = Math.min(1, (t - t0) / ms); el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(f); })(t0); }

function recordStats(key, depth) { const s = store.get("stats", { dives: 0, best: 0, total: 0, days: [] }); if (!s.days.includes(key)) { s.days.push(key); s.dives++; s.total += depth; s.best = Math.max(s.best, depth); store.set("stats", s); } }

views.dive = date => {
  const d = date || today(), key = "run:" + d; let run = store.get(key) || { set: setFor("dillion-" + d), res: [], twist: twistFor(d) };
  diveView(run, r => store.set(key, r), { label: `Mission #${dayNo(d)}`, record: depth => recordStats(d, depth) });
};
views.unlimited = () => {
  const seed = Date.now().toString(36); let run = { set: setFor(seed), res: [], twist: TWK[Math.floor(Math.random() * 3)] };
  const start = () => { run = { set: setFor(Math.random().toString(36)), res: [], twist: TWK[Math.floor(Math.random() * 3)] }; diveView(run, () => {}, { label: "Unlimited", again: start }); };
  diveView(run, () => {}, { label: "Unlimited", again: start });
};
views.archive = () => {
  const days = [...Array(14)].map((_, k) => new Date(Date.now() - k * 864e5).toISOString().slice(0, 10));
  app.innerHTML = `<h1>The logbook</h1><p class="sub">Every past mission, ready to re-fly.</p>${days.map(d => { const r = store.get("run:" + d); const done = r && r.res.length >= 7;
    return `<a class="card pack link" href="#/dive/${d}"><div><h3>Mission #${dayNo(d)}${d === today() ? '<span class="tag">TODAY</span>' : ""}</h3><p>${d}</p></div><b class="${done ? "t-dillion" : ""}">${done ? depthOf(r) + " km" : r ? "in progress" : "unplayed"}</b></a>`; }).join("")}`;
};
views.packs = () => {
  const packs = [["Words & Language", "30 chapters · fill the notebook, word by word", 1], ["Now Showing", "30 pictures · a night drive down the boulevard", 1], ["Game On", "30 games · run the gauntlet, court to podium", 1], ["Passport Ready", "30 expeditions · around the world in seven answers", 1], ["Music", "from the charts to the deep cuts", 0]];
  app.innerHTML = `<h1>Themed packs</h1><p class="sub">beyond the daily landing <span class="tag">BETA</span></p>${packs.map(([n, d, on]) => `<div class="card pack ${on ? "" : "soon"}"><div><h3>${n}</h3><p>${d}</p></div>${on ? '<a class="btn small" href="#/unlimited">Open →</a>' : '<span class="tag">SOON</span>'}</div>`).join("")}`;
};
views.me = () => {
  const s = store.get("stats", { dives: 0, best: 0, total: 0, days: [] });
  app.innerHTML = `<h1>My Dillion</h1><p class="sub">your flight record</p><div class="card stats"><div><b>${s.dives}</b><span>missions</span></div><div><b>${s.best}</b><span>best distance (km)</span></div><div><b>${s.dives ? Math.round(s.total / s.dives) : 0}</b><span>avg distance (km)</span></div></div>
  <div class="card"><h3>Current rank</h3><p class="t-dillion" style="font-size:34px;margin:6px 0">${rankOf(s.best)}</p><p class="sub">Next: ${(window.RANKS.find(r => r.min > s.best) || {}).name || "you're on the summit"}</p></div>
  <button class="btn ghost" id="reset">Reset progress</button>`;
  $("#reset").onclick = () => { if (confirm("Erase all Dillion progress on this device?")) { Object.keys(localStorage).filter(k => k.startsWith("dillion:")).forEach(k => localStorage.removeItem(k)); route(); } };
};
views.friends = () => {
  app.innerHTML = `<h1>Friends</h1><p class="sub">fly together</p><div class="card"><p>Leaderboards are in orbit soon. Until then, challenge a friend: send them your result and see who flies farther.</p><button class="btn" id="link">Copy invite link</button></div>`;
  $("#link").onclick = async () => { try { await navigator.clipboard.writeText(location.href.split("#")[0]); toast("Link copied"); } catch { toast("Copy failed"); } };
};
views.faq = () => {
  const qa = [["how does scoring work?", "Every answer sits somewhere on a popularity ladder. Common answers land in Dust and add few kilometers; rarer ones carry you farther. The single rarest answer in a set is the Dillion."], ["why is autocorrect so generous?", "A one or two letter slip shouldn't cost you a prompt, so near-matches are accepted. Some answers also have aliases (Da Vinci / Leonardo)."], ["why was my answer not listed?", "The answer sets are curated by hand and can miss a fair answer. If yours did, that's on us."], ["is it the same for everyone?", "Yes. The daily landing is seeded by the date, so every diver gets the same seven prompts."], ["where is my progress saved?", "In this browser only. Clearing site data resets it."]];
  app.innerHTML = `<div class="faq"><h1>FAQ</h1>${qa.map(([q, a]) => `<h3>${q}</h3><p>${a}</p>`).join("")}</div>`;
};
views.nf = () => { app.innerHTML = `<h1>Lost in space</h1><p class="sub">That page doesn't exist.</p><a class="btn" href="#/">Back to Earth</a>`; };

/* ---------- Rocket Relay (solo) ---------- */
views.party = () => {
  const mk = () => {
    const p = P[Math.floor(Math.random() * P.length)], used = new Set(); let score = 0, ms = 7000, last = performance.now(), dead = false, size = 1;
    app.innerHTML = `<h1>Rocket Relay</h1><p class="sub">pass the rocket · don't let it blow up on you</p><div class="card"><div class="prompt"><small>Name as many as you can</small>${esc(p.q)}</div>
      <div class="puffer" id="pf">🚀</div><div class="timer"><div id="tm"></div></div><form class="guess" autocomplete="off"><input id="g" placeholder="quick!" autofocus><button class="btn pink">Pass</button></form><p class="sub">Score: <b id="sc">0</b> · each answer must be new</p><div class="chips" id="ch"></div></div>`;
    const inp = $("#g"), tm = $("#tm"), pf = $("#pf"); inp.focus();
    const tick = () => { if (dead) return; const now = performance.now(); ms -= now - last; last = now; tm.style.width = Math.max(0, ms / 70) + "%"; pf.style.transform = `scale(${size + (1 - ms / 7000) * .5})`;
      if (ms <= 0) { dead = true; pf.textContent = "💥"; $("form").insertAdjacentHTML("afterend", `<div class="row center"><button class="btn pink" id="again">Again</button></div>`); $("form").remove(); $("#again").onclick = mk; return; } raf = requestAnimationFrame(tick); };
    let raf = requestAnimationFrame(tick); onLeave(() => { dead = true; cancelAnimationFrame(raf); });
    $("form").onsubmit = e => { e.preventDefault(); const r = judge(p, inp.value); inp.value = ""; if (!r || r.idx < 0 || used.has(r.idx)) { pf.animate([{ transform: "translateX(-8px)" }, { transform: "translateX(8px)" }, { transform: "none" }], 180); return; }
      used.add(r.idx); score++; ms = Math.max(2500, 7000 - score * 250); size = Math.min(1.6, size + .02); $("#sc").textContent = score; $("#ch").insertAdjacentHTML("beforeend", `<span class="t-${r.tier}">${esc(r.name)}</span>`); };
  }; mk();
};

/* ---------- starship + game wiring ---------- */
const ship = $("#ship");
function fx(kind) { if (!ship || !kind) return; ship.classList.remove("launch", "boost"); void ship.offsetWidth; ship.classList.add(kind === "boost" ? "boost" : "launch"); }
if (ship) { $("#shipSvg").innerHTML = pixel(window.STARSHIP, 6); ship.addEventListener("animationend", e => { if (e.target === ship) ship.classList.remove("launch", "boost"); }); ship.onclick = () => fx("launch");
  setInterval(() => { if (!document.hidden) fx("launch"); }, 45000); setTimeout(() => fx("launch"), 2500); }
const H = { app, esc, store, toast, onLeave, pixel, setDepth, today, dayNo, fx };
Object.entries(window.GAME_VIEWS || {}).forEach(([k, f]) => { views[k] = a => f(H, a); });

/* ---------- chrome ---------- */
const drawer = $("#drawer"), scrim = $("#scrim");
function openMenu() { drawer.classList.add("open"); scrim.classList.add("show"); $("#menuBtn").setAttribute("aria-expanded", "true"); drawer.setAttribute("aria-hidden", "false"); }
function closeMenu() { drawer.classList.remove("open"); scrim.classList.remove("show"); $("#menuBtn").setAttribute("aria-expanded", "false"); drawer.setAttribute("aria-hidden", "true"); }
$("#menuBtn").onclick = openMenu; $("#closeBtn").onclick = closeMenu; scrim.onclick = closeMenu;
addEventListener("keydown", e => { if (e.key === "Escape") closeMenu(); });
const peek = $("#peek"); if (peek) { $("#peekSvg").innerHTML = pixel(window.ELON, 6); const say = $("#peekSay");
  peek.onclick = () => { say.textContent = QUIPS[Math.floor(Math.random() * QUIPS.length)]; peek.classList.add("talk"); setTimeout(() => peek.classList.remove("talk"), 2200); }; }
addEventListener("hashchange", route); dust(); route();
})();
