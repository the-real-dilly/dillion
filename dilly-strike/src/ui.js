/* ==========================================================================
   DILLY STRIKE — menus & match-flow UI
   Main menu (live agent stage, news carousel, season contract, social rail),
   play screen (mode tabs, party banners, START with a matchmaking state),
   agents roster, agent select, match loading, the competitive round loop
   (round / buy-phase / match-point banners, MVP, economy, first bloods,
   round timeline), end-of-match tabs, shop + kill-feed + weapon-list
   decoration with original weapon silhouettes, chat channels, settings
   (crosshair editor, interface) and UI sounds. Talks to the game only
   through window.DillyStrike (enterMatch, getState, trailer.engine) and the
   DOM. All agent names, portraits and icons are original.
   ========================================================================== */
import { Menu3D } from './menuscene.js';
import { weaponSVG, roleSVG, rankEmblem, ultRing } from './icons.js';

const $ = (id) => document.getElementById(id);
const DS = () => window.DillyStrike || null;
const ENG = () => (DS() && DS().trailer && DS().trailer.engine) || null;
const store = {
  get(k, d) { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? d : v; } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* private mode */ } }
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtKey = (c) => !c ? '?' : c.startsWith('Key') ? c.slice(3) : c.startsWith('Digit') ? c.slice(5) : c.replace('Left', '').replace('Right', '').toUpperCase();

/* ---------------- profile ---------------- */
const profile = Object.assign({ xp: 0, credits: 0, agent: 'sprig', matches: 0, wins: 0 }, store.get('ds_profile_v1', {}));
const saveProfile = () => store.set('ds_profile_v1', profile);
const LVL_XP = 1000;
const level = () => 1 + Math.floor(profile.xp / LVL_XP);
const myTier = () => Math.min(6, Math.floor(profile.wins / 3) + (profile.matches > 0 ? 1 : 0));
function syncProfile() {
  const pct = (profile.xp % LVL_XP) / LVL_XP * 100;
  const f = $('mm-xp-fill'); if (f) f.style.width = Math.max(4, pct).toFixed(1) + '%';
  const c = $('mm-credits'); if (c) c.textContent = profile.credits.toLocaleString();
  const lv = $('mm-level'); if (lv) lv.textContent = level();
  const r = document.querySelector('.mm-rank'); if (r) r.title = `Account level ${level()} · ${profile.wins} wins`;
  const hl = $('hm-lvl'); if (hl) hl.textContent = level();
  const hx = $('hm-xp-fill'); if (hx) hx.style.width = pct.toFixed(1) + '%';
  const ht = $('hm-xp-txt'); if (ht) ht.textContent = `${profile.xp % LVL_XP} / ${LVL_XP} XP · next tier`;
  const tiers = $('hm-tiers');
  if (tiers) { const cur = (level() - 1) % 10; tiers.innerHTML = Array.from({ length: 10 }, (_, i) => `<i class="${i < cur ? 'on' : i === cur ? 'cur' : ''}"></i>`).join(''); }
}

/* ---------------- agents (original roster) ---------------- */
const AGENTS = [
  { id: 'sprig', name: 'Sprig', role: 'Duelist', ac: '#ff4f5e', hood: 0, bio: 'Entry fragger who lives on the first contact. Dashes in before the site knows the round has started.',
    abil: [['flash', 'Snap Flare', 'Blind defenders around the corner.'], ['smoke', 'Cover Puff', 'Short smoke to cross an angle.'], ['dash', 'Burst Step', 'Explosive forward dash.']] },
  { id: 'brine', name: 'Brine', role: 'Controller', ac: '#40d1c2', hood: 1, bio: 'Reads the map like a tide chart. Drowns sightlines in thick sea fog and plays the clock.',
    abil: [['flash', 'Salt Glare', 'Bright burst over walls.'], ['smoke', 'Fog Bank', 'Dense, long-lasting smoke.'], ['dash', 'Undertow', 'Slip out of a peek.']] },
  { id: 'vanta', name: 'Vanta', role: 'Sentinel', ac: '#a08cff', hood: 2, bio: 'Locks a site down alone. Patient, precise and impossible to rush through.',
    abil: [['flash', 'Null Flash', 'Disorienting pulse.'], ['smoke', 'Shade Wall', 'Blocks the choke for a retake.'], ['dash', 'Phase Step', 'Reposition after a pick.']] },
  { id: 'ember', name: 'Ember', role: 'Initiator', ac: '#ff9f43', hood: 3, bio: 'Sets the pace for the team. Lights the way in and flushes defenders from cover.',
    abil: [['flash', 'Spark Pop', 'Wide flash for the whole team.'], ['smoke', 'Cinder Veil', 'Smoke that buys the plant.'], ['dash', 'Flashover', 'Fast push into space.']] },
  { id: 'relay', name: 'Relay', role: 'Initiator', ac: '#5ab0ff', hood: 4, bio: 'Comms specialist. Calls every rotation and arrives exactly where the fight is.',
    abil: [['flash', 'Signal Burst', 'Quick pop flash.'], ['smoke', 'Static Screen', 'Cuts the long sightline.'], ['dash', 'Handoff', 'Close distance to a teammate.']] }
];
const ABIL_ICON = { flash: 'i-ab-flash', smoke: 'i-ab-smoke', dash: 'i-ab-dash' };
const ABIL_ORDER = ['dash', 'flash', 'smoke']; // ability bar reads C · Q · E
const agentById = (id) => AGENTS.find((a) => a.id === id) || AGENTS[0];
// flat vector fallback (used until the 3D portraits are rendered, or without WebGL)
function agentVector(a, mini = false) {
  const c = a.ac, hoods = [
    `<path d="M30 46c0-20 13-32 30-32s30 12 30 32v8H30z" fill="#1c222c"/><path d="M36 40h48v10H36z" fill="${c}"/>`,
    `<path d="M24 58c0-30 16-46 36-46s36 16 36 46l-10-4c-2-20-12-30-26-30S36 34 34 54z" fill="#173236"/><rect x="40" y="42" width="40" height="8" rx="4" fill="${c}"/>`,
    `<path d="M30 50l8-34 22-6 22 6 8 34z" fill="#211c33"/><path d="M42 40h36l-4 12H46z" fill="${c}"/>`,
    `<path d="M32 44c2-18 14-28 28-28s26 10 28 28l-6 2H38z" fill="#2c2016"/><path d="M60 8l6 10H54z" fill="${c}"/><rect x="40" y="40" width="40" height="7" fill="${c}" opacity=".9"/>`,
    `<path d="M30 48c0-20 12-34 30-34s30 14 30 34z" fill="#18222f"/><rect x="38" y="38" width="44" height="12" rx="2" fill="${c}"/><rect x="86" y="20" width="3" height="24" fill="${c}"/>`
  ];
  return `<svg viewBox="0 0 120 130" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    ${mini ? '' : `<circle cx="60" cy="56" r="52" fill="${c}" opacity=".10"/>`}
    <path d="M14 130c2-30 18-44 46-44s44 14 46 44z" fill="#242b36"/>
    <path d="M30 130l6-34 24 10 24-10 6 34z" fill="#1a2029"/>
    <path d="M14 130c2-30 18-44 46-44s44 14 46 44h-8c-2-24-14-36-38-36S24 106 22 130z" fill="${c}" opacity=".85"/>
    <rect x="50" y="70" width="20" height="20" fill="#c99d7c"/>
    <rect x="38" y="30" width="44" height="46" rx="12" fill="#e0b392"/>
    <rect x="44" y="52" width="10" height="4" rx="2" fill="#2a1e17"/><rect x="66" y="52" width="10" height="4" rx="2" fill="#2a1e17"/>
    ${hoods[a.hood % hoods.length]}
  </svg>`;
}
// portrait markup: rendered 3D bust / full body when ready, vector otherwise
function agentSVG(a, mini = false) {
  const src = Menu3D.portrait(a.id, mini ? 'bust' : 'full');
  return src ? `<img class="ag-shot ${mini ? 'bust' : 'full'}" alt="" src="${src}" draggable="false">` : agentVector(a, mini);
}

/* ---------------- weapons ---------------- */
const WMETA = { vandal: ['Assault rifle', '#e8a33a'], phantom: ['Suppressed carbine', '#5ab0ff'], operator: ['Sniper rifle', '#ff4f5e'], sheriff: ['Heavy sidearm', '#a08cff'], knife: ['Melee', '#ffd257'] };
const STARTER = new Set(['vandal', 'sheriff', 'knife']);
const wepIdByName = (name) => { const E = ENG(); if (!E) return null; const w = Object.values(E.WEAPONS).find((x) => x.name.toLowerCase() === String(name || '').trim().toLowerCase()); return w ? w.id : null; };
function renderLoadout() {
  const host = $('mm-loadout'), E = ENG(); if (!host || !E) return;
  host.innerHTML = Object.values(E.WEAPONS).map((w, i) => {
    const [cat, rar] = WMETA[w.id] || ['Weapon', '#8e99a8'], s = w.stats || {};
    const stat = (l, v) => `<div class="lo-stat"><span>${l}</span><i style="--v:${v}%"></i><b>${v}</b></div>`;
    const ico = DS() && DS().weaponIcon && DS().weaponIcon(w.id, 'shade');
    return `<div class="lo-card${STARTER.has(w.id) ? ' equipped' : ''}" style="--rar:${rar};animation-delay:${i * 0.035}s">
      ${STARTER.has(w.id) ? '<span class="lo-badge">Starter</span>' : ''}
      <div class="lo-cat">Slot ${w.slot} · ${cat}</div>
      <div class="lo-art">${ico ? `<img class="lo-render" alt="" src="${ico}">` : weaponSVG(w.id)}</div>
      <div class="lo-name">${esc(w.name)}</div>
      <div class="lo-meta"><span>${w.melee ? 'Free' : 'Mag ' + w.mag}</span>${w.cost ? `<b class="cr">${w.cost}</b>` : '<b>Default</b>'}</div>
      ${stat('Damage', s.dmg | 0)}${stat('Fire rate', s.rpm | 0)}${stat('Pen.', s.pen | 0)}${stat('Accuracy', s.acc | 0)}
    </div>`;
  }).join('');
}

/* ---------------- HUD / scoreboard portraits ---------------- */
function agentFor(idx, foe, isMe) { return isMe ? agentById(profile.agent) : AGENTS[(idx + (foe ? 2 : 1)) % AGENTS.length]; }
function face(idx, foe, isMe) { return agentSVG(agentFor(idx, foe, isMe), true); }
function rankIcon(r) { return rankEmblem(r && r.me ? myTier() : 0); }

/* ---------------- UI sounds (hooks into the game's synth; only after a user gesture) ---------------- */
let gestured = false;
const tone = (...a) => { if (!gestured || !IFS.uisfx) return; const E = ENG(); if (E && E.sfxTone) E.sfxTone(...a); };
const sfx = { hover: () => tone(1760, 0.03, 'sine', 0.012), click: () => tone(980, 0.05, 'triangle', 0.035, 1480), back: () => tone(620, 0.06, 'triangle', 0.03, 420), lock: () => tone(520, 0.22, 'triangle', 0.06, 1040), found: () => tone(660, 0.3, 'triangle', 0.06, 1320) };
function bindSounds() {
  window.addEventListener('pointerdown', () => { gestured = true; }, { capture: true, once: true });
  window.addEventListener('keydown', () => { gestured = true; }, { capture: true, once: true });
  const SEL = '.mm-tab, .pl-tab, .btn-start, .map-chip, .ag-card, .as-tile, .btn, .btn-play, .wheel-node, .me-tabs button, .set-tab, .hm-agent-btn, .soc-toggle, .mm-icon, .hm-dots button';
  let lastHover = null;
  document.addEventListener('pointerover', (e) => { const t = e.target.closest && e.target.closest(SEL); if (t && t !== lastHover && !t.disabled) { lastHover = t; sfx.hover(); } if (!t) lastHover = null; });
  document.addEventListener('click', (e) => { const t = e.target.closest && e.target.closest(SEL); if (t && !t.disabled && !t.classList.contains('btn-lock') && t.id !== 'pl-start') sfx.click(); }, true);
}

/* ---------------- home: stage, carousel, roster art ---------------- */
function syncAgentStage() {
  const a = agentById(profile.agent);
  document.documentElement.style.setProperty('--stage-ac', a.ac);
  Menu3D.setAgent(a.id);
  const set = (id, t) => { const e = $(id); if (e) e.textContent = t; };
  set('mm-bg-name', a.name); set('hm-agent-name', a.name); set('hm-agent-role', a.role);
  const fb = $('home-hero'); if (fb) fb.innerHTML = agentVector(a);
  const sa = $('soc-av'); if (sa) sa.innerHTML = agentSVG(a, true);
  const ra = $('hm-roster-art'); if (ra) ra.innerHTML = AGENTS.map((x) => agentSVG(x, false)).join('');
  const ha = $('hud-agent'); if (ha) { ha.innerHTML = agentSVG(a, true); ha.style.setProperty('--ac', a.ac); }
}
let slideI = 0, slideT = 0;
function showSlide(i) {
  const slides = document.querySelectorAll('.hm-slide'); if (!slides.length) return;
  slideI = (i + slides.length) % slides.length;
  slides.forEach((s, k) => s.classList.toggle('on', k === slideI));
  document.querySelectorAll('#hm-dots button').forEach((d, k) => d.classList.toggle('on', k === slideI));
}
function bindHome() {
  document.querySelectorAll('#hm-dots button').forEach((d) => d.addEventListener('click', (e) => { e.stopPropagation(); showSlide(+d.dataset.i); clearInterval(slideT); slideT = setInterval(() => showSlide(slideI + 1), 7000); }));
  slideT = setInterval(() => { const mm = document.querySelector('.mm'); if (mm && mm.dataset.view === 'home') showSlide(slideI + 1); }, 7000);
  const soc = $('mm-social'), st = $('soc-toggle');
  if (st) st.addEventListener('click', () => { const on = !soc.classList.contains('open'); soc.classList.toggle('open', on); st.setAttribute('aria-expanded', on ? 'true' : 'false'); });
  const nm = $('agent-name'); if (nm) nm.addEventListener('input', () => { const s = $('soc-name'); if (s) s.textContent = nm.value || 'DillyAgent'; renderParty(); });
}

/* ---------------- agents view ---------------- */
let agView = profile.agent;
function renderRoster() {
  const host = $('mm-agents'); if (!host) return;
  host.innerHTML = AGENTS.map((a) => `<button class="ag-card${a.id === agView ? ' sel' : ''}" data-id="${a.id}" style="--ac:${a.ac}"><div class="ag-art">${agentSVG(a, true)}</div><div class="ag-body"><div class="ag-role">${roleSVG(a.role)}${a.role}</div><div class="ag-name">${a.name}</div></div></button>`).join('');
  host.querySelectorAll('.ag-card').forEach((b) => b.addEventListener('click', () => { agView = b.dataset.id; profile.agent = agView; saveProfile(); syncAgentStage(); renderRoster(); renderParty(); }));
  const a = agentById(agView), d = $('ag-detail'), binds = (DS() && DS().getBinds) ? DS().getBinds() : {};
  if (d) {
    d.style.setProperty('--ac', a.ac);
    d.innerHTML = `<div class="agd-role">${roleSVG(a.role)}${a.role}</div><div class="agd-name">${a.name}</div><p>${esc(a.bio)}</p>
      <div class="agd-abil">${ABIL_ORDER.map((k) => a.abil.find((x) => x[0] === k)).map(([k, n, s]) => `<div><kbd>${fmtKey(binds[k])}</kbd><b>${esc(n)}</b><small>${esc(s)}</small></div>`).join('')}</div>
      ${a.id === profile.agent ? '<small class="agd-pick" style="font:600 11px var(--f-disp);letter-spacing:.3em;text-transform:uppercase;color:var(--ally)">Selected for your next match</small>' : ''}`;
  }
}

/* ---------------- play: mode tabs · party · START ---------------- */
const MODES = {
  bots: { k: 'Offline · vs bots', t: 'Bot match', d: 'First to 7 rounds against five hostiles. Buy phase every round, eliminate them all or hold until time runs out.', r: ['5 hostiles', 'First to 7', 'Buy phase', 'Any map'], go: 'Start' },
  online: { k: 'Online · dedicated server', t: 'Casual', d: 'Drop into the authoritative server with other players on the map you pick. Team chat and a live kill feed.', r: ['Drop in', 'No rank', 'Server rounds'], go: 'Start' },
  ranked: { k: 'Online · hub account', t: 'Ranked', d: '5v5 first to 13 with five placement matches, then climb from Seedling to Legend. Sign in on the Career tab.', r: ['5v5', 'First to 13', 'Placements', 'RR ladder'], go: 'Open ranked' },
  custom: { k: 'Offline · your rules', t: 'Custom', d: 'Choose the map, then play the bot ruleset there. Your map choice is remembered for every mode that supports it.', r: ['Pick a map', 'Bots', 'First to 7'], go: 'Start' }
};
const PL = { mode: 'bots', state: 'idle', t0: 0, iv: 0, to: 0 };
function renderPlayHead() {
  const m = MODES[PL.mode], sec = document.querySelector('.mm-view[data-view="play"]');
  $('pl-kicker').textContent = m.k; $('pl-title').textContent = m.t; $('pl-desc').textContent = m.d;
  $('pl-rules').innerHTML = m.r.map((x) => `<span>${x}</span>`).join('');
  if (sec) { sec.dataset.mode = PL.mode; const h = sec.querySelector('.pl-head'); if (h) { h.style.animation = 'none'; void h.offsetWidth; h.style.animation = ''; } }
  document.querySelectorAll('.pl-tab').forEach((t) => t.classList.toggle('active', t.dataset.mode === PL.mode));
  setMM('idle');
}
function renderParty() {
  const host = $('pl-party'); if (!host) return;
  const a = agentById(profile.agent), name = ($('agent-name') && $('agent-name').value.trim()) || 'DillyAgent';
  const me = `<div class="pc me" style="--ac:${a.ac}"><div class="pc-lvl">Lv ${level()}</div><svg class="pc-lead" viewBox="0 0 24 24"><use href="#i-star"/></svg><div class="pc-art">${agentSVG(a, false)}</div>
    <div class="pc-card"><b>${esc(name)}</b><small>${rankEmblem(myTier())}${esc(a.name)} · ${esc(a.role)}</small></div></div>`;
  const empty = (lbl) => `<div class="pc empty"><div><svg viewBox="0 0 24 24"><use href="#i-plus"/></svg>${lbl}</div></div>`;
  const lbl = PL.mode === 'ranked' ? 'Matched<br>by queue' : PL.mode === 'online' ? 'Open<br>slot' : 'Solo<br>queue';
  host.innerHTML = empty(lbl) + empty(lbl) + me + empty(lbl) + empty(lbl);
}
function setMM(state, label) {
  PL.state = state;
  const sec = document.querySelector('.mm-view[data-view="play"]'); if (!sec) return;
  sec.classList.toggle('searching', state === 'search'); sec.classList.toggle('found', state === 'found');
  clearInterval(PL.iv); clearTimeout(PL.to);
  const l = $('pl-mm-l'), t = $('pl-mm-t'), b = $('pl-start-l');
  if (state === 'idle') { l.textContent = label || (PL.mode === 'ranked' ? 'Queue from the Career tab' : 'Party ready'); t.textContent = ''; b.textContent = MODES[PL.mode].go; return; }
  if (state === 'found') { l.textContent = 'Match found'; t.textContent = ''; b.textContent = 'Match found'; return; }
  PL.t0 = performance.now(); l.textContent = label || 'Finding match'; b.textContent = 'Cancel';
  const upd = () => { const s = Math.floor((performance.now() - PL.t0) / 1000); t.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  upd(); PL.iv = setInterval(upd, 250);
}
function startPressed() {
  if (PL.state === 'search') { sfx.back(); setMM('idle', 'Search cancelled'); return; }
  if (PL.state === 'found') return;
  if (PL.mode === 'ranked') { sfx.click(); $('btn-play-ranked').click(); return; }
  sfx.lock();
  if (PL.mode === 'online') {
    setMM('search', 'Connecting');
    const msg = $('mp-msg'), before = msg ? msg.textContent : '';
    $('btn-play-mp').click();
    const t0 = performance.now();
    PL.to = setInterval(() => {
      const st = DS() && DS().getState ? DS().getState() : {};
      if (st.inMatch) { setMM('idle'); return; }
      if (msg && msg.textContent !== before && /⚠/.test(msg.textContent)) { setMM('idle', 'Server unreachable · try a bot match'); return; }
      if (performance.now() - t0 > 15000) setMM('idle', 'No response from server');
    }, 300);
    return;
  }
  setMM('search');
  PL.to = setTimeout(() => {
    setMM('found'); sfx.found();
    PL.to = setTimeout(() => { setMM('idle'); openAgentSelect(); }, 650);
  }, 1300 + Math.random() * 700);
}
function bindPlay() {
  document.querySelectorAll('.pl-tab').forEach((t) => t.addEventListener('click', () => {
    if (PL.state === 'search') setMM('idle');
    PL.mode = t.dataset.mode; renderPlayHead(); renderParty();
  }));
  $('pl-start').addEventListener('click', startPressed);
  renderPlayHead(); renderParty();
}

/* ---------------- menu navigation ---------------- */
function mountStage() {
  const mm = document.querySelector('.mm'), v = mm ? mm.dataset.view : 'home';
  if ($('agent-select') && $('agent-select').classList.contains('on')) { Menu3D.mount($('as-stage'), 'select'); return; }
  Menu3D.mount($('mm-stage'), v === 'agents' ? 'agents' : 'home');
}
function setView(v) {
  document.querySelectorAll('.mm-tab[data-view]').forEach((t) => t.classList.toggle('active', t.dataset.view === v));
  document.querySelectorAll('.mm-view').forEach((s) => s.classList.toggle('active', s.dataset.view === v));
  const mm = document.querySelector('.mm'); if (mm) mm.dataset.view = v;
  if (v !== 'play' && PL.state === 'search') setMM('idle');
  if (v === 'agents') { agView = profile.agent; renderRoster(); }
  if (v === 'play') renderParty();
  mountStage();
}
function bindMenu() {
  document.querySelectorAll('.mm-tab[data-view]').forEach((t) => t.addEventListener('click', () => setView(t.dataset.view)));
  document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.go === 'trailer') { const t = $('btn-watch-trailer'); if (t) t.click(); } else setView(b.dataset.go);
  }));
  setView('home');
}

/* ---------------- agent select -> loading -> match ---------------- */
const AS = { timer: 0, left: 30, pick: profile.agent, locked: false };
function showScreen(id, on) { const el = $(id); if (el) { el.classList.toggle('on', on); el.setAttribute('aria-hidden', on ? 'false' : 'true'); } }
function renderAgentSelect() {
  const a = agentById(AS.pick), binds = (DS() && DS().getBinds) ? DS().getBinds() : {};
  const scr = $('agent-select');
  $('as-portrait').innerHTML = agentVector(a);
  scr.style.setProperty('--ac', a.ac); scr.classList.toggle('locked', AS.locked);
  const bgn = $('as-bg-name'); if (bgn && bgn.textContent !== a.name) { bgn.textContent = a.name; bgn.style.animation = 'none'; void bgn.offsetWidth; bgn.style.animation = ''; }
  $('as-role').innerHTML = roleSVG(a.role) + esc(a.role);
  $('as-name').textContent = a.name;
  $('as-bio').textContent = a.bio;
  $('as-abil').innerHTML = ABIL_ORDER.map((k) => a.abil.find((x) => x[0] === k)).map(([k, n, d]) => `<div class="as-ab"><div class="as-ab-ico"><svg><use href="#${ABIL_ICON[k]}"/></svg><kbd>${fmtKey(binds[k])}</kbd></div><b>${esc(n)}</b><small>${esc(d)}</small></div>`).join('');
  $('as-tiles').innerHTML = AGENTS.map((x) => `<button class="as-tile${x.id === AS.pick ? ' sel' : ''}" data-id="${x.id}" style="--ac:${x.ac}" title="${x.name} · ${x.role}">${agentSVG(x, true)}${roleSVG(x.role)}</button>`).join('');
  $('as-tiles').querySelectorAll('.as-tile').forEach((b) => b.addEventListener('click', () => { if (!AS.locked && AS.pick !== b.dataset.id) { AS.pick = b.dataset.id; Menu3D.setAgent(AS.pick); renderAgentSelect(); } }));
  const name = ($('agent-name') && $('agent-name').value.trim()) || 'DillyAgent';
  $('as-team').innerHTML = `<div class="as-slot${AS.locked ? ' locked' : ''}"><div class="mini">${agentSVG(a, true)}</div><div><b>${esc(name)}</b><small>${AS.locked ? a.name + ' · locked in' : 'Selecting · ' + a.name}</small></div></div>` +
    [1, 2, 3, 4].map(() => '<div class="as-slot empty"><div class="mini"></div><div><b>Open slot</b><small>Solo queue</small></div></div>').join('');
  const lock = $('as-lock'); lock.textContent = AS.locked ? 'Deploy' : 'Lock in'; lock.classList.toggle('done', AS.locked);
}
function openAgentSelect() {
  if (window.DillyStrikeTrailer && window.DillyStrikeTrailer.state().playing) return;
  AS.left = 30; AS.locked = false; AS.pick = profile.agent;
  const mode = PL.mode === 'custom' ? 'Custom · vs bots' : 'Bot match · vs bots';
  const sm = document.querySelector('.as-map small'); if (sm) sm.textContent = mode;
  renderAgentSelect(); showScreen('agent-select', true); Menu3D.setAgent(AS.pick); mountStage();
  $('as-time').textContent = AS.left; $('as-time').parentElement.classList.remove('low');
  clearInterval(AS.timer);
  AS.timer = setInterval(() => {
    AS.left = Math.max(0, AS.left - 1); $('as-time').textContent = AS.left;
    $('as-time').parentElement.classList.toggle('low', AS.left <= 5);
    if (AS.left === 0) { clearInterval(AS.timer); if (!AS.locked) { AS.locked = true; profile.agent = AS.pick; saveProfile(); renderAgentSelect(); } }
  }, 1000);
}
function closeAgentSelect() { clearInterval(AS.timer); showScreen('agent-select', false); Menu3D.setAgent(profile.agent); mountStage(); }
const TIPS = ['Crouching tightens your spread — stop, crouch, then tap.', 'Credits carry over: losing streaks pay more each round.', 'The Kodiak .50 rewards a single clean headshot.', 'Smoke a long sightline before you cross it.', 'Buy a Full Shield before upgrading your rifle on a tight economy.'];
function mlCard(a, name, sub) { return `<div class="ml-card" style="--ac:${a.ac}"><div class="ml-shot">${agentSVG(a, false)}</div><div class="ml-n"><b>${esc(name)}</b><small>${esc(sub)}</small></div></div>`; }
function deploy() {
  // called from a click so the game's pointer-lock request is allowed
  profile.agent = AS.pick; saveProfile(); syncAgentStage(); renderRoster(); renderParty();
  closeAgentSelect();
  const d = DS(); if (d && d.enterMatch) d.enterMatch(false);
  const a = agentById(AS.pick), E = ENG(), name = ($('agent-name') && $('agent-name').value.trim()) || 'DillyAgent';
  const bots = E ? E.bots().filter((b) => b.team !== E.me.team) : [];
  $('ml-ct').innerHTML = mlCard(a, name, a.name) + [1, 2, 3, 4].map(() => '<div class="ml-card empty"></div>').join('');
  $('ml-t').innerHTML = Array.from({ length: 5 }, (_, i) => { const x = agentFor(i, true, false); return mlCard(x, bots[i] ? bots[i].name.replace(/^BOT-/, 'Bot ') : 'Hostile', x.name); }).join('');
  const m = d && d.getMap ? d.getMap() : { id: 'dustline' };
  $('match-load').dataset.map = m.id;
  const art = document.querySelector('.map-card .map-art'); $('ml-art').innerHTML = art ? art.innerHTML : '';
  $('ml-tip').textContent = 'Tip: ' + TIPS[Math.floor(Math.random() * TIPS.length)];
  showScreen('match-load', true);
  // stays up (max ~8 s) while photo materials are still streaming; photomat.js drives its bar meanwhile
  const M = window.DillyStrikeMaterials, t0 = performance.now();
  const hide = () => { if (!M || M.state().done || performance.now() - t0 > 8000) showScreen('match-load', false); else setTimeout(hide, 150); };
  setTimeout(hide, 2400);
}
function bindAgentSelect() {
  const solo = $('btn-play-solo'); if (solo) solo.onclick = openAgentSelect; // replaces the direct enterMatch(false)
  $('as-lock').addEventListener('click', () => {
    if (!AS.locked) { AS.locked = true; sfx.lock(); profile.agent = AS.pick; saveProfile(); renderAgentSelect(); setTimeout(() => { if (AS.locked && $('agent-select').classList.contains('on')) $('as-lock').focus(); }, 0); return; }
    sfx.click(); deploy();
  });
  $('as-cancel').addEventListener('click', () => { sfx.back(); closeAgentSelect(); });
}

/* ---------------- competitive round loop (solo vs bots) ---------------- */
const FIRST_TO = 7, ELIMS = 5, BUY_MS = 12000;
const R = { on: false, round: 1, ct: 0, t: 0, k0: 0, d0: 0, kStart: 0, dStart: 0, mvps: 0, earned: 0, buyUntil: 0, ending: false, lastSec: 115, wasIn: false, hs: 0, fb: 0, fbDone: false, hist: [] };
const timerSecs = () => { const m = /(\d+):(\d+)/.exec(($('round-timer') || {}).textContent || ''); return m ? (+m[1]) * 60 + (+m[2]) : 115; };
function isOnline() { return /RUST/i.test(($('sc-mode') || {}).textContent || '') || !!(DS() && DS().ranked && DS().ranked.active()); } // RANKED: server runs the rounds
function startRounds() {
  const E = ENG(); if (!E) return;
  Object.assign(R, { on: true, round: 1, ct: 0, t: 0, k0: E.me.kills, d0: E.me.deaths, kStart: E.me.kills, dStart: E.me.deaths, mvps: 0, earned: 0, buyUntil: performance.now() + BUY_MS + 2400, ending: false, lastSec: 115, fb: 0, fbDone: false, hist: [] });
  E.setRoundTime(115);
  $('hud').classList.add('rounds');
  const a = agentById(profile.agent), ha = $('hud-agent'); if (ha) { ha.innerHTML = agentSVG(a, true); ha.style.setProperty('--ac', a.ac); ha.classList.add('on'); }
  ['q', 'e', 'c'].forEach((k) => { const n = document.querySelector(`#ab-${k} span`), ab = a.abil.find((x) => x[0] === ({ q: 'flash', e: 'smoke', c: 'dash' })[k]); if (n && ab) n.textContent = ab[1]; });
  syncRoundHud();
  setTimeout(() => { if (R.on && R.round === 1) roundIntro(); }, 2500);
}
function stopRounds() { R.on = false; R.ending = false; $('hud').classList.remove('rounds', 'buying'); $('buy-phase').classList.remove('on'); hideBanner(); }
function syncRoundHud() {
  $('rs-ct').textContent = R.ct; $('rs-t').textContent = R.t;
  const point = R.ct === FIRST_TO - 1 || R.t === FIRST_TO - 1;
  $('rs-obj-txt').textContent = `Round ${R.round} · ${point ? (R.ct === R.t ? 'Last round' : 'Match point') : 'First to ' + FIRST_TO}`;
  const sbr = $('sb-round'); if (sbr) sbr.textContent = `Round ${R.round} · ${R.ct}–${R.t}`;
}
let bannerT = 0;
function hideBanner() { const b = $('round-banner'); if (b) b.classList.remove('on', 'win', 'loss', 'info', 'point'); const c = $('rb-cash'); if (c) c.classList.remove('cr'); }
function showBanner(win, kicker, title, sub, mvp, why, cash, kind, mvpAgent) {
  const b = $('round-banner');
  $('rb-kicker').textContent = kicker; $('rb-title').textContent = title; $('rb-sub').textContent = sub;
  $('rb-mvp-name').textContent = mvp || ''; $('rb-mvp-why').textContent = why || ''; $('rb-cash').textContent = cash || '';
  const art = $('rb-mvp-art'); if (art) art.innerHTML = mvpAgent ? agentSVG(mvpAgent, true) : '';
  $('rb-cash').classList.toggle('cr', /^\+\d/.test(cash || ''));
  b.classList.remove('win', 'loss', 'info', 'point', 'on'); void b.offsetWidth; b.classList.add('on', kind || (win ? 'win' : 'loss'));
  clearTimeout(bannerT); bannerT = setTimeout(hideBanner, kind ? 2000 : 3200);
}
function roundIntro() {
  const point = R.ct === FIRST_TO - 1 || R.t === FIRST_TO - 1;
  if (point) showBanner(true, `Round ${R.round}`, R.ct === R.t ? 'Last round' : 'Match point', R.ct === R.t ? 'Winner takes the match' : (R.ct > R.t ? 'One more round to win' : 'Hold on — they need one more'), '', '', '', 'point');
  else showBanner(true, `Round ${R.round}`, 'Buy phase', `Press ${fmtKey((DS() && DS().getBinds && DS().getBinds().buy) || 'KeyB')} to open the shop`, '', '', '', 'info');
}
function endRound(win, reason) {
  const E = ENG(); if (!E || R.ending) return;
  R.ending = true;
  const kills = E.me.kills - R.k0, award = win ? 3250 : 1900 + Math.min(3, R.t) * 500;
  E.me.cash = Math.min(16000, E.me.cash + award); R.earned += award; E.syncHud();
  if (win) R.ct++; else R.t++;
  R.hist.push({ win, reason, kills });
  const bots = E.bots(), foeI = bots.length ? Math.floor(Math.random() * bots.length) : 0, foe = bots.length ? bots[foeI].name : 'Hostile';
  const name = E.me.name || 'DillyAgent';
  const mvpMe = win || kills >= 2; if (mvpMe) R.mvps++;
  const sub = win ? (reason === 'time' ? 'Defenders held the site until time expired' : 'Enemy team eliminated') : 'Your team was eliminated';
  showBanner(win, `Round ${R.round}`, win ? 'Round won' : 'Round lost', sub, mvpMe ? name : foe,
    mvpMe ? `${kills} elimination${kills === 1 ? '' : 's'} this round` : 'Most eliminations', `+${award}`, null, mvpMe ? agentById(profile.agent) : agentFor(foeI, true, false));
  E.sfxTone(win ? 660 : 330, 0.35, 'triangle', 0.08, win ? 990 : 220);
  syncRoundHud();
  setTimeout(() => {
    if (!R.on) return;
    if (R.ct >= FIRST_TO || R.t >= FIRST_TO) { endMatch(R.ct > R.t); return; }
    R.round++; R.k0 = E.me.kills; R.d0 = E.me.deaths; R.ending = false; R.fbDone = false; R.buyUntil = performance.now() + BUY_MS;
    E.setRoundTime(115); R.lastSec = 115; syncRoundHud(); roundIntro();
  }, 3400);
}
let lastMatch = null;
function endMatch(win) {
  const E = ENG(); if (!E) return;
  const kills = E.me.kills - R.kStart, deaths = E.me.deaths - R.dStart, ct = R.ct, t = R.t, mvps = R.mvps, earned = R.earned, hist = R.hist.slice(), fb = R.fb;
  const rows = [{ name: E.me.name || 'DillyAgent', me: true, team: E.me.team, k: kills, d: deaths, cash: E.me.cash }]
    .concat(E.bots().map((b) => ({ name: b.name, team: b.team, k: b.kills || 0, d: b.deaths || 0, cash: b.cash || 800 })));
  stopRounds();
  const xp = (win ? 500 : 150) + ct * 100 + kills * 20;
  profile.xp += xp; profile.credits += Math.round(xp / 4); profile.matches++; if (win) profile.wins++; saveProfile(); syncProfile();
  if (document.pointerLockElement) document.exitPointerLock();
  const leave = $('btn-leave'); if (leave) leave.click(); // back to lobby state underneath
  const me = $('match-end'); me.classList.remove('win', 'loss'); me.classList.add(win ? 'win' : 'loss');
  $('me-result').textContent = win ? 'Victory' : 'Defeat';
  $('me-ct').textContent = ct; $('me-t').textContent = t;
  const a = agentById(profile.agent);
  document.querySelector('.me-mvp').style.setProperty('--ac', a.ac);
  $('me-mvp-art').innerHTML = agentSVG(a); $('me-mvp-name').textContent = E.me.name || 'DillyAgent'; $('me-mvp-agent').textContent = `${a.name} · ${mvps} MVP${mvps === 1 ? '' : 's'}`;
  const kd = deaths ? (kills / deaths).toFixed(2) : kills.toFixed(2);
  const rounds = Math.max(1, ct + t), acs = Math.round((kills * 150 + deaths * 10) / rounds);
  const stats = [['ACS', acs], ['Kills', kills], ['Deaths', deaths], ['K/D', kd], ['First bloods', fb], ['Credits earned', `<span class="cr">${earned.toLocaleString()}</span>`]];
  $('me-stats').innerHTML = stats.map(([l, v], i) => `<div class="me-stat" style="animation-delay:${0.2 + i * 0.04}s"><small>${l}</small><b>${v}</b></div>`).join('');
  $('me-sb').innerHTML = `<table><thead><tr><th></th><th>Player</th><th>K</th><th>D</th><th>K/D</th><th>Econ</th></tr></thead><tbody>${rows.map((r, i) => {
    const foe = r.team !== E.me.team, ag = r.me ? a : agentFor(i - 1, foe, false);
    return `<tr class="${foe ? 'enemy' : 'ally'}${r.me ? ' me' : ''}"><td>${agentSVG(ag, true)}</td><td>${esc(r.name)}</td><td>${r.k}</td><td>${r.d}</td><td>${(r.d ? r.k / r.d : r.k).toFixed(2)}</td><td><span class="cr">${r.cash}</span></td></tr>`;
  }).join('')}</tbody></table>`;
  $('me-tl').innerHTML = hist.length ? hist.map((h, i) => `<div class="tl-r ${h.win ? 'w' : 'l'}" style="animation-delay:${i * 0.03}s"><small>R${i + 1}</small><i><svg><use href="#${h.win ? (h.reason === 'time' ? 'i-shield' : 'i-target') : 'i-x'}"/></svg></i><b>${h.kills}</b><small>${h.win ? (h.reason === 'time' ? 'Time' : 'Elim') : 'Lost'}</small></div>`).join('') : '<p class="me-tl-empty">No rounds were played.</p>';
  setMeTab('summary');
  $('me-xp-gain').textContent = `+${xp} XP`; $('me-xp-fill').style.width = '0%';
  lastMatch = { win, ct, t };
  showScreen('match-end', true);
  setTimeout(() => { $('me-xp-fill').style.width = ((profile.xp % LVL_XP) / 10).toFixed(1) + '%'; }, 250);
}
function setMeTab(t) {
  document.querySelectorAll('#me-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === t));
  document.querySelectorAll('#match-end .me-pane').forEach((p) => p.classList.toggle('on', p.dataset.t === t));
}
function tick() {
  const d = DS(), E = ENG(); if (!d || !E || !d.getState) return;
  const st = d.getState(), inM = !!st.inMatch;
  if (inM && !R.wasIn) { if (!isOnline()) startRounds(); }
  if (!inM && R.wasIn) stopRounds();
  R.wasIn = inM;
  const secs = timerSecs();
  const rt = $('round-timer'); if (rt) rt.classList.toggle('low', inM && secs <= 10);
  // signature ring: one point per elimination or death, seven to fill
  if (inM) {
    const pts = Math.min(7, Math.max(0, (E.me.kills - (R.on ? R.kStart : 0)) + Math.floor((E.me.deaths - (R.on ? R.dStart : 0)) / 2)));
    const ab = $('ab-x');
    if (ab && ab.dataset.p !== String(pts)) { ab.dataset.p = pts; $('ult-ring').innerHTML = ultRing(pts); $('ult-n').textContent = `${pts}/7`; ab.classList.toggle('full', pts >= 7); }
  }
  if (!R.on || !inM) return;
  const now = performance.now(), bp = $('buy-phase'), left = Math.max(0, R.buyUntil - now);
  const buying = left > 0 && !R.ending;
  bp.classList.toggle('on', buying); $('hud').classList.toggle('buying', buying);
  if (left > 0) $('buy-phase-t').textContent = `0:${String(Math.min(12, Math.ceil(left / 1000))).padStart(2, '0')}`;
  const bk = $('buy-kicker'); if (bk) bk.textContent = left > 0 ? `Buy phase · ${Math.min(12, Math.ceil(left / 1000))}s left` : `Round ${R.round} · ${(DS() && DS().getMap) ? DS().getMap().name : 'Dustline'}`;
  const key = $('buy-key'); if (key && d.getBinds) key.textContent = fmtKey(d.getBinds().buy || 'KeyB');
  if (R.ending) { R.lastSec = secs; return; }
  if (!R.fbDone) { if (E.me.kills > R.k0) { R.fb++; R.fbDone = true; } else if (E.me.deaths > R.d0) R.fbDone = true; }
  if (E.me.kills - R.k0 >= ELIMS) endRound(true, 'elim');
  else if (E.me.deaths > R.d0) endRound(false, 'elim');
  else if (secs > R.lastSec + 30) endRound(true, 'time'); // clock wrapped: defenders hold
  R.lastSec = secs;
}

/* ---------------- shop, kill feed and weapon list: original silhouettes ---------------- */
const BUY_IDS = ['vandal', 'phantom', 'operator', 'sheriff', 'armor', 'util'];
function decorateShop() {
  const wheel = $('buy-wheel'); if (!wheel) return;
  wheel.querySelectorAll('.wheel-node').forEach((n) => {
    if (n.querySelector('.w-sil')) return;
    const i = parseInt((n.querySelector('small') || {}).textContent, 10) - 1, id = BUY_IDS[i];
    if (!id) return;
    n.insertAdjacentHTML('beforeend', weaponSVG(id));
    n.style.animationDelay = `${(i % 6) * 0.025}s`;
    n.addEventListener('mouseenter', () => { const a = $('insp-art'); if (a) a.innerHTML = weaponSVG(id); });
  });
  const art = $('insp-art'); if (art && !art.querySelector('.w-sil')) { const n = ($('insp-name') || {}).textContent; art.innerHTML = weaponSVG(wepIdByName(n) || (/shield/i.test(n) ? 'armor' : /utility/i.test(n) ? 'util' : 'vandal')); }
  const mel = $('shop-melee'); if (mel && !mel.firstChild) mel.innerHTML = `<div><small>5</small><strong>Dilly Fang</strong>${weaponSVG('knife')}<span>Always equipped</span></div>`;
  renderShopTeam();
}
function renderShopTeam() {
  const host = $('shop-team'), E = ENG(); if (!host || !E) return;
  const a = agentById(profile.agent), w = E.WEAPONS[E.me.weaponId] || {};
  host.innerHTML = `<div class="shop-team-h">Team loadouts</div><div class="shop-team-row"><div class="st-card"><div class="st-av">${agentSVG(a, true)}</div><div><b>${esc(E.me.name || 'DillyAgent')}</b><small>Shield ${E.me.shield} · <span class="cr">${E.me.cash}</span></small></div>${weaponSVG(w.id || 'vandal')}</div>${'<div class="st-card empty">Open slot</div>'.repeat(4)}</div>`;
}
function decorateKillfeed(row) {
  const w = row.querySelector('.kf-wep'); if (!w || w.querySelector('.w-sil')) return;
  const id = wepIdByName(w.getAttribute('title') || w.textContent); if (!id) return;
  w.classList.add('has-ico'); w.title = w.getAttribute('title') || w.textContent;
  if (!w.querySelector('img')) w.textContent = '';
  w.insertAdjacentHTML('afterbegin', weaponSVG(id));
}
function decorateSlots() {
  const host = $('wep-slots'); if (!host) return;
  host.querySelectorAll('.lo-slot').forEach((r) => {
    if (r.querySelector('.w-sil')) return;
    const nm = r.querySelector('span:not(.lo-num)'), id = nm && wepIdByName(nm.textContent); if (id) r.insertAdjacentHTML('afterbegin', weaponSVG(id));
  });
}
let chatCh = 'all', pendingTeam = false;
function decorateChat(line) {
  const b = line.querySelector('b'); if (!b) return;
  const who = b.textContent.replace(/:$/, '');
  if (/^SYSTEM$/i.test(who)) line.classList.add('sys');
  else if (pendingTeam && ENG() && who === (ENG().me.name || '')) { line.classList.add('team'); pendingTeam = false; }
}
function bindObservers() {
  const obs = (el, fn, opts = { childList: true }) => { if (el) new MutationObserver(fn).observe(el, opts); };
  obs($('buy-wheel'), decorateShop);
  obs($('killfeed'), (recs) => recs.forEach((r) => r.addedNodes.forEach((n) => n.nodeType === 1 && decorateKillfeed(n))));
  obs($('wep-slots'), decorateSlots);
  obs($('chat-log'), (recs) => recs.forEach((r) => r.addedNodes.forEach((n) => n.nodeType === 1 && decorateChat(n))));
  // portraits in the HUD pips / scoreboard come from main.js via DillyStrikeUI.face(); rerender menus when they arrive
  window.addEventListener('dillystrike:portraits', () => { syncAgentStage(); renderRoster(); renderParty(); if ($('agent-select').classList.contains('on')) renderAgentSelect(); const E = ENG(); if (E && DS().getState().inMatch) E.syncHud(); });
}
function setChatChannel(ch) {
  chatCh = ch;
  const wrap = $('chat-wrap'); if (wrap) wrap.dataset.ch = ch;
  document.querySelectorAll('#chat-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.ch === ch));
  const inp = $('chat-inp'); if (inp) inp.placeholder = ch === 'team' ? 'Say (team) — Enter to send' : 'Say (all) — Enter to send';
}
function bindChat() {
  document.querySelectorAll('#chat-tabs button').forEach((b) => b.addEventListener('mousedown', (e) => { e.preventDefault(); setChatChannel(b.dataset.ch); $('chat-inp').focus(); }));
  const inp = $('chat-inp'); if (!inp) return;
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') { e.preventDefault(); e.stopPropagation(); setChatChannel(chatCh === 'all' ? 'team' : 'all'); }
    if (e.key === 'Enter' && chatCh === 'team' && inp.value.trim()) pendingTeam = true;
  }, true);
  setChatChannel('all');
}

/* ---------------- map names: show the plain map name ("Dustline") wherever a map code is printed ---------------- */
const prettyMap = (t) => t.replace(/\bde_([a-z0-9]+)/gi, (_, n) => n.charAt(0).toUpperCase() + n.slice(1).toLowerCase());
function fixMapText(node) {
  if (node.nodeType === 3) { if (/de_/i.test(node.nodeValue)) node.nodeValue = prettyMap(node.nodeValue); return; }
  if (node.nodeType !== 1 || !/de_/i.test(node.textContent || '')) return;
  const w = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) if (/de_/i.test(n.nodeValue)) n.nodeValue = prettyMap(n.nodeValue);
}
function bindMapNames() {
  fixMapText(document.body);
  new MutationObserver((recs) => {
    for (const r of recs) {
      if (r.type === 'characterData') fixMapText(r.target);
      else for (const n of r.addedNodes) fixMapText(n);
    }
  }).observe(document.body, { subtree: true, childList: true, characterData: true });
  window.addEventListener('dillystrike:map', (e) => {
    const nm = e.detail && e.detail.name; if (!nm) return;
    document.querySelectorAll('.as-map b, .ml-map').forEach((el) => { el.textContent = nm; });
  });
}

/* ---------------- settings tabs, crosshair editor, interface ---------------- */
const XH_DEF = { style: 'classic', col: '#5ff5c8', len: 5, thick: 2, gap: 0, out: 1, dot: 0, dyn: 1, alpha: 100 };
const XH = Object.assign({}, XH_DEF, store.get('ds_xhair_v1', {}));
const IF_DEF = { hints: 1, callouts: 1, motion: 0, uisfx: 1 };
const IFS = Object.assign({}, IF_DEF, store.get('ds_iface_v1', {}));
function applyXhair() {
  const r = document.documentElement.style, cls = XH.style === 'dot';
  r.setProperty('--xh-col', XH.col);
  r.setProperty('--xh-len', (cls ? 0 : XH.len) + 'px');
  r.setProperty('--xh-thick', XH.thick + 'px');
  r.setProperty('--xh-gapoff', XH.gap + 'px');
  r.setProperty('--xh-out', XH.out ? '1px' : '0px');
  r.setProperty('--xh-dot', (XH.dot || cls || XH.style === 'crossdot') ? 'block' : 'none');
  r.setProperty('--xh-dyn', XH.dyn && XH.style !== 'static' ? '1' : '0');
  r.setProperty('--xh-alpha', (XH.alpha / 100).toFixed(2));
  store.set('ds_xhair_v1', XH);
  const code = $('xe-code'); if (code) code.textContent = 'DSX-' + [XH.style, XH.col.slice(1), XH.len, XH.thick, XH.gap, XH.out, XH.dot, XH.dyn, XH.alpha].join('-');
}
function applyIface() {
  const hint = $('wep-hints'); if (hint) hint.style.display = IFS.hints ? '' : 'none';
  const co = $('radar-callout'); if (co) co.style.display = IFS.callouts ? '' : 'none';
  document.body.classList.toggle('reduce-motion', !!IFS.motion);
  store.set('ds_iface_v1', IFS);
}
function rangeRow(label, key, min, max, step, obj, apply, unit = '') {
  const id = 'xr-' + key;
  return { html: `<label class="xe-row"><span>${label}</span><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${obj[key]}"><output id="${id}-o">${obj[key]}${unit}</output></label>`,
    bind() { const el = $(id); el.addEventListener('input', () => { obj[key] = +el.value; $(id + '-o').textContent = el.value + unit; apply(); }); } };
}
function segRow(label, key, opts, obj, apply) {
  const id = 'xs-' + key;
  return { html: `<div class="xe-row full"><span>${label}</span><div class="xe-seg" id="${id}">${opts.map(([v, l]) => `<button data-v="${v}" class="${String(obj[key]) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div></div>`,
    bind() { $(id).querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { const v = b.dataset.v; obj[key] = isNaN(+v) ? v : +v; $(id).querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); apply(); })); } };
}
function buildSettings() {
  document.querySelectorAll('.set-tab').forEach((t) => t.addEventListener('click', () => {
    document.querySelectorAll('.set-tab').forEach((x) => x.classList.toggle('active', x === t));
    document.querySelectorAll('.set-pane').forEach((p) => p.classList.toggle('active', p.dataset.tab === t.dataset.tab));
  }));
  const COLS = ['#5ff5c8', '#3dff6e', '#2ef2ff', '#ffe14d', '#ffffff', '#ff4f5e', '#ff6bd6'];
  const rows = [
    segRow('Style', 'style', [['classic', 'Classic'], ['crossdot', 'Cross + dot'], ['dot', 'Dot'], ['static', 'Static']], XH, applyXhair),
    { html: `<div class="xe-row full"><span>Colour</span><div class="xe-swatches" id="xe-sw">${COLS.map((c) => `<button style="--c:${c}" data-c="${c}" class="${XH.col === c ? 'on' : ''}" aria-label="Colour ${c}"></button>`).join('')}</div></div>`,
      bind() { $('xe-sw').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { XH.col = b.dataset.c; $('xe-sw').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); applyXhair(); })); } },
    rangeRow('Length', 'len', 2, 20, 1, XH, applyXhair, 'px'),
    rangeRow('Thickness', 'thick', 1, 6, 0.5, XH, applyXhair, 'px'),
    rangeRow('Gap', 'gap', -3, 12, 1, XH, applyXhair, 'px'),
    rangeRow('Opacity', 'alpha', 30, 100, 5, XH, applyXhair, '%'),
    segRow('Outline', 'out', [[1, 'On'], [0, 'Off']], XH, applyXhair),
    segRow('Centre dot', 'dot', [[1, 'On'], [0, 'Off']], XH, applyXhair),
    segRow('Movement spread', 'dyn', [[1, 'Dynamic'], [0, 'Fixed']], XH, applyXhair),
    segRow('Preview', 'pv', [['day', 'Day'], ['night', 'Night']], { pv: 'day' }, () => {})
  ];
  const host = $('xe-controls');
  host.innerHTML = rows.map((r) => r.html).join('') + '<div class="xe-row full"><span>Share code</span><div class="xe-code" id="xe-code"></div></div><div><button class="btn sm ghost" id="xe-reset">Reset crosshair</button></div>';
  rows.forEach((r) => r.bind());
  $('xs-pv').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => $('xe-preview').classList.toggle('dark', b.dataset.v === 'night')));
  $('xe-reset').addEventListener('click', () => { Object.assign(XH, XH_DEF); applyXhair(); buildSettingsCrosshairOnly(); });
  const irows = [
    segRow('Weapon key hints', 'hints', [[1, 'Show'], [0, 'Hide']], IFS, applyIface),
    segRow('Minimap callouts', 'callouts', [[1, 'Show'], [0, 'Hide']], IFS, applyIface),
    segRow('Menu sounds', 'uisfx', [[1, 'On'], [0, 'Off']], IFS, applyIface),
    segRow('Reduce motion', 'motion', [[0, 'Off'], [1, 'On']], IFS, applyIface)
  ];
  $('if-controls').innerHTML = irows.map((r) => r.html).join('');
  irows.forEach((r) => r.bind());
}
function buildSettingsCrosshairOnly() {
  for (const k of ['len', 'thick', 'gap', 'alpha']) { const el = $('xr-' + k); if (el) { el.value = XH[k]; $('xr-' + k + '-o').textContent = XH[k] + ({ alpha: '%' }[k] || 'px'); } }
  for (const k of ['style', 'out', 'dot', 'dyn']) { const s = $('xs-' + k); if (s) s.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === String(XH[k]))); }
  const sw = $('xe-sw'); if (sw) sw.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.c === XH.col));
}

/* ---------------- end-of-match buttons ---------------- */
function bindEnd() {
  $('me-again').addEventListener('click', () => { showScreen('match-end', false); openAgentSelect(); });
  $('me-lobby').addEventListener('click', () => { showScreen('match-end', false); setView('home'); });
  document.querySelectorAll('#me-tabs button').forEach((b) => b.addEventListener('click', () => setMeTab(b.dataset.t)));
}

/* ---------------- boot ---------------- */
function boot() {
  bindMenu(); bindHome(); bindPlay(); bindAgentSelect(); bindEnd(); buildSettings(); bindChat(); bindObservers(); bindSounds();
  applyXhair(); applyIface();
  syncAgentStage(); renderRoster(); renderLoadout(); syncProfile(); bindMapNames();
  if (!ENG()) setTimeout(renderLoadout, 400);
  window.addEventListener('dillystrike:icons', renderLoadout); // 3D-rendered weapon icons for the collection
  setInterval(tick, 150);
  // Esc closes the full-screen menus (the game ignores keys outside a match)
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Escape') return;
    if ($('agent-select').classList.contains('on')) closeAgentSelect();
    else if ($('match-end').classList.contains('on')) { showScreen('match-end', false); setView('home'); }
    else if ($('mm-social').classList.contains('open')) $('soc-toggle').click();
  });
  window.DillyStrikeUI = { setView, openAgentSelect, deploy, endRound, endMatch, rounds: () => ({ ...R }), AGENTS, agentSVG, showScreen, agent: () => profile.agent, agentById, agentFor, face, rankIcon, playMode: (m) => { if (MODES[m]) { PL.mode = m; renderPlayHead(); renderParty(); } }, lastMatch: () => lastMatch, buyPhase: (ms) => { R.buyUntil = performance.now() + ms; } }; // RANKED: AGENTS/agentSVG/showScreen used by ranked.js
}
if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', boot); else boot();
