/* ==========================================================================
   DILLY STRIKE — menus & match-flow UI
   Main-menu navigation, play/mode select, loadout & agent roster, agent
   select + match loading, competitive round loop (round banners, MVP,
   buy phase, round economy), end-of-match screen, settings tabs with a
   crosshair editor and interface options. Talks to the game only through
   window.DillyStrike (enterMatch, getState, trailer.engine) and the DOM.
   All agent names, portraits and icons are original.
   ========================================================================== */

const $ = (id) => document.getElementById(id);
const DS = () => window.DillyStrike || null;
const ENG = () => (DS() && DS().trailer && DS().trailer.engine) || null;
const store = {
  get(k, d) { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? d : v; } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* private mode */ } }
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------------- profile ---------------- */
const profile = Object.assign({ xp: 0, credits: 0, agent: 'sprig', matches: 0, wins: 0 }, store.get('ds_profile_v1', {}));
const saveProfile = () => store.set('ds_profile_v1', profile);
function syncProfile() {
  const lvlXp = 1000, pct = (profile.xp % lvlXp) / lvlXp * 100;
  const f = $('mm-xp-fill'); if (f) f.style.width = Math.max(4, pct).toFixed(1) + '%';
  const c = $('mm-credits'); if (c) c.textContent = profile.credits.toLocaleString();
  const r = document.querySelector('.mm-rank'); if (r) r.title = `Level ${1 + Math.floor(profile.xp / lvlXp)} · ${profile.wins} wins`;
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
const agentById = (id) => AGENTS.find((a) => a.id === id) || AGENTS[0];
function agentSVG(a, mini = false) {
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

/* ---------------- weapons (original silhouettes) ---------------- */
const WSVG = {
  vandal: '<path d="M6 31 40 27l6-5h74l4-4h10v4h52v5h-48l-4 5h-34l-6 15-10 13-10-3 9-16-9-6H58l-5 11H41l4-9-39 4z"/>',
  phantom: '<path d="M8 30h30l4-7h70l4-4h8v4h26v3h40v6h-40v2h-34l-4 4h-22l-3 18-10 2 1-20h-14l-5 11H43l3-12H8z"/>',
  operator: '<path d="M4 33l42-7 6-5h46v-7h44v7h-12v4h68v5h-68l-6 5H96l-6 11H80l3-11H58l-6 9H40l2-8-38 4z"/><circle cx="120" cy="17" r="5"/>',
  sheriff: '<path d="M60 18h86v12h-6v3h-46l-10 30H66l10-30h-8l-8-6z"/>',
  knife: '<path d="M70 44c22-26 64-30 90-16-26-4-52 4-70 24z"/><circle cx="62" cy="50" r="9" fill="none" stroke="currentColor" stroke-width="4"/><path d="M66 44l12 4-6 8z"/>'
};
const WMETA = { vandal: ['Assault rifle', '#e8a33a'], phantom: ['Silenced rifle', '#5ab0ff'], operator: ['Sniper rifle', '#ff4f5e'], sheriff: ['Heavy pistol', '#a08cff'], knife: ['Melee', '#ffd257'] };
const STARTER = new Set(['vandal', 'sheriff', 'knife']);
function renderLoadout() {
  const host = $('mm-loadout'), E = ENG(); if (!host || !E) return;
  host.innerHTML = Object.values(E.WEAPONS).map((w) => {
    const [cat, rar] = WMETA[w.id] || ['Weapon', '#8e99a8'], s = w.stats || {};
    const stat = (l, v) => `<div class="lo-stat"><span>${l}</span><i style="--v:${v}%"></i><b>${v}</b></div>`;
    return `<div class="lo-card${STARTER.has(w.id) ? ' equipped' : ''}" style="--rar:${rar}">
      ${STARTER.has(w.id) ? '<span class="lo-badge">Starter</span>' : ''}
      <div class="lo-cat">Slot ${w.slot} · ${cat}</div>
      <div class="lo-art"><svg viewBox="0 0 200 70" fill="currentColor">${WSVG[w.id] || ''}</svg></div>
      <div class="lo-name">${esc(w.name)}</div>
      <div class="lo-meta"><span>${w.melee ? 'Free' : 'Mag ' + w.mag}</span><b>${w.cost ? '$' + w.cost : 'Default'}</b></div>
      ${stat('Damage', s.dmg | 0)}${stat('Fire rate', s.rpm | 0)}${stat('Pen.', s.pen | 0)}${stat('Accuracy', s.acc | 0)}
    </div>`;
  }).join('');
}
function renderRoster() {
  const host = $('mm-agents'); if (!host) return;
  host.innerHTML = AGENTS.map((a) => `<div class="ag-card" style="--ac:${a.ac}"><div class="ag-art">${agentSVG(a)}</div><div class="ag-body"><div class="ag-role">${a.role}</div><div class="ag-name">${a.name}</div><p>${esc(a.bio)}</p></div></div>`).join('');
}

/* ---------------- menu navigation ---------------- */
function setView(v) {
  document.querySelectorAll('.mm-tab[data-view]').forEach((t) => t.classList.toggle('active', t.dataset.view === v));
  document.querySelectorAll('.mm-view').forEach((s) => s.classList.toggle('active', s.dataset.view === v));
  const mm = document.querySelector('.mm'); if (mm) mm.dataset.view = v;
}
function bindMenu() {
  document.querySelectorAll('.mm-tab[data-view]').forEach((t) => t.addEventListener('click', () => setView(t.dataset.view)));
  document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.go === 'trailer') { const t = $('btn-watch-trailer'); if (t) t.click(); } else setView(b.dataset.go);
  }));
  setView('home');
}

/* ---------------- agent select -> loading -> match ---------------- */
const AS = { timer: 0, left: 15, pick: profile.agent, locked: false };
function showScreen(id, on) { const el = $(id); if (el) { el.classList.toggle('on', on); el.setAttribute('aria-hidden', on ? 'false' : 'true'); } }
function renderAgentSelect() {
  const a = agentById(AS.pick), E = ENG(), binds = (DS() && DS().getBinds) ? DS().getBinds() : {};
  const fmt = (c) => !c ? '?' : c.startsWith('Key') ? c.slice(3) : c.startsWith('Digit') ? c.slice(5) : c.replace('Left', '').toUpperCase();
  const keyFor = { flash: binds.flash, smoke: binds.smoke, dash: binds.dash };
  $('as-portrait').innerHTML = agentSVG(a);
  $('as-role').textContent = a.role; $('as-role').style.setProperty('--ac', a.ac);
  $('as-name').textContent = a.name;
  $('as-bio').textContent = a.bio;
  $('as-abil').innerHTML = a.abil.map(([k, n, d]) => `<div class="as-ab"><kbd>${fmt(keyFor[k])}</kbd><b>${esc(n)}</b><small>${esc(d)}</small></div>`).join('');
  $('as-tiles').innerHTML = AGENTS.map((x) => `<button class="as-tile${x.id === AS.pick ? ' sel' : ''}" data-id="${x.id}" style="--ac:${x.ac}" title="${x.name} · ${x.role}">${agentSVG(x, true)}</button>`).join('');
  $('as-tiles').querySelectorAll('.as-tile').forEach((b) => b.addEventListener('click', () => { if (!AS.locked) { AS.pick = b.dataset.id; renderAgentSelect(); } }));
  const name = ($('agent-name') && $('agent-name').value.trim()) || 'DillyAgent';
  $('as-team').innerHTML = `<div class="as-slot${AS.locked ? ' locked' : ''}"><div class="mini">${agentSVG(a, true)}</div><div><b>${esc(name)}</b><small>${AS.locked ? a.name + ' · locked' : 'Selecting…'}</small></div></div>` +
    ['Open slot', 'Open slot', 'Open slot', 'Open slot'].map((s) => `<div class="as-slot empty"><div class="mini"></div><div><b>${s}</b><small>Solo queue</small></div></div>`).join('');
  const lock = $('as-lock'); lock.textContent = AS.locked ? 'Deploy' : 'Lock in'; lock.classList.toggle('done', AS.locked);
  void E;
}
function openAgentSelect() {
  if (window.DillyStrikeTrailer && window.DillyStrikeTrailer.state().playing) return;
  AS.left = 15; AS.locked = false; AS.pick = profile.agent;
  renderAgentSelect(); showScreen('agent-select', true);
  $('as-time').textContent = AS.left; $('as-time').parentElement.classList.remove('low');
  clearInterval(AS.timer);
  AS.timer = setInterval(() => {
    AS.left = Math.max(0, AS.left - 1); $('as-time').textContent = AS.left;
    $('as-time').parentElement.classList.toggle('low', AS.left <= 5);
    if (AS.left === 0) { clearInterval(AS.timer); if (!AS.locked) { AS.locked = true; profile.agent = AS.pick; saveProfile(); renderAgentSelect(); } }
  }, 1000);
}
function closeAgentSelect() { clearInterval(AS.timer); showScreen('agent-select', false); }
function deploy() {
  // called from a click so the game's pointer-lock request is allowed
  profile.agent = AS.pick; saveProfile();
  closeAgentSelect();
  const a = agentById(AS.pick), ct = $('ml-ct'), t = $('ml-t');
  ct.innerHTML = `<div class="mini">${agentSVG(a, true)}</div>`;
  t.innerHTML = AGENTS.filter((x) => x.id !== a.id).concat(AGENTS[0]).slice(0, 5).map((x) => `<div class="mini">${agentSVG(x, true)}</div>`).join('');
  showScreen('match-load', true);
  const d = DS(); if (d && d.enterMatch) d.enterMatch(false);
  setTimeout(() => showScreen('match-load', false), 1500);
}
function bindAgentSelect() {
  const solo = $('btn-play-solo'); if (solo) solo.onclick = openAgentSelect; // replaces the direct enterMatch(false)
  $('as-lock').addEventListener('click', () => {
    if (!AS.locked) { AS.locked = true; clearInterval(AS.timer); profile.agent = AS.pick; saveProfile(); renderAgentSelect(); setTimeout(() => { if (AS.locked && $('agent-select').classList.contains('on')) $('as-lock').focus(); }, 0); return; }
    deploy();
  });
  $('as-cancel').addEventListener('click', closeAgentSelect);
}

/* ---------------- competitive round loop (solo vs bots) ---------------- */
const FIRST_TO = 7, ELIMS = 5, BUY_MS = 12000;
const R = { on: false, round: 1, ct: 0, t: 0, k0: 0, d0: 0, kStart: 0, dStart: 0, mvps: 0, earned: 0, buyUntil: 0, ending: false, lastSec: 115, wasIn: false, hs: 0 };
const timerSecs = () => { const m = /(\d+):(\d+)/.exec(($('round-timer') || {}).textContent || ''); return m ? (+m[1]) * 60 + (+m[2]) : 115; };
function isOnline() { return /RUST/i.test(($('sc-mode') || {}).textContent || ''); }
function startRounds() {
  const E = ENG(); if (!E) return;
  Object.assign(R, { on: true, round: 1, ct: 0, t: 0, k0: E.me.kills, d0: E.me.deaths, kStart: E.me.kills, dStart: E.me.deaths, mvps: 0, earned: 0, buyUntil: performance.now() + BUY_MS, ending: false, lastSec: 115 });
  E.setRoundTime(115);
  $('hud').classList.add('rounds');
  const a = agentById(profile.agent), ha = $('hud-agent'); if (ha) { ha.innerHTML = agentSVG(a, true); ha.classList.add('on'); }
  syncRoundHud();
}
function stopRounds() { R.on = false; R.ending = false; $('hud').classList.remove('rounds'); $('buy-phase').classList.remove('on'); hideBanner(); }
function syncRoundHud() {
  $('rs-ct').textContent = R.ct; $('rs-t').textContent = R.t;
  $('rs-obj-txt').textContent = `Round ${R.round} · First to ${FIRST_TO}`;
  const sbr = $('sb-round'); if (sbr) sbr.textContent = `Round ${R.round} · ${R.ct}–${R.t}`;
}
let bannerT = 0;
function hideBanner() { const b = $('round-banner'); if (b) b.classList.remove('on', 'win', 'loss'); }
function showBanner(win, kicker, title, sub, mvp, why, cash) {
  const b = $('round-banner');
  $('rb-kicker').textContent = kicker; $('rb-title').textContent = title; $('rb-sub').textContent = sub;
  $('rb-mvp-name').textContent = mvp; $('rb-mvp-why').textContent = why; $('rb-cash').textContent = cash;
  b.classList.remove('win', 'loss'); void b.offsetWidth; b.classList.add('on', win ? 'win' : 'loss');
  clearTimeout(bannerT); bannerT = setTimeout(hideBanner, 3200);
}
function endRound(win, reason) {
  const E = ENG(); if (!E || R.ending) return;
  R.ending = true;
  const kills = E.me.kills - R.k0, award = win ? 3250 : 1900 + Math.min(3, R.t) * 500;
  E.me.cash = Math.min(16000, E.me.cash + award); R.earned += award; E.syncHud();
  if (win) R.ct++; else R.t++;
  const bots = E.bots(), foe = bots.length ? bots[Math.floor(Math.random() * bots.length)].name : 'Hostile';
  const name = E.me.name || 'DillyAgent';
  const mvpMe = win || kills >= 2; if (mvpMe) R.mvps++;
  const sub = win ? (reason === 'time' ? 'Alpha held the site until time expired' : 'All hostiles eliminated') : 'Alpha eliminated';
  showBanner(win, `Round ${R.round}`, win ? 'Round won' : 'Round lost', sub, mvpMe ? name : foe,
    mvpMe ? `${kills} elimination${kills === 1 ? '' : 's'} this round` : 'Most eliminations', `+$${award} credits`);
  E.sfxTone(win ? 660 : 330, 0.35, 'triangle', 0.08, win ? 990 : 220);
  syncRoundHud();
  setTimeout(() => {
    if (!R.on) return;
    if (R.ct >= FIRST_TO || R.t >= FIRST_TO) { endMatch(R.ct > R.t); return; }
    R.round++; R.k0 = E.me.kills; R.d0 = E.me.deaths; R.ending = false; R.buyUntil = performance.now() + BUY_MS;
    E.setRoundTime(115); R.lastSec = 115; syncRoundHud();
  }, 3400);
}
function endMatch(win) {
  const E = ENG(); if (!E) return;
  const kills = E.me.kills - R.kStart, deaths = E.me.deaths - R.dStart, ct = R.ct, t = R.t, mvps = R.mvps, earned = R.earned;
  stopRounds();
  const xp = (win ? 500 : 150) + ct * 100 + kills * 20;
  profile.xp += xp; profile.credits += Math.round(xp / 4); profile.matches++; if (win) profile.wins++; saveProfile(); syncProfile();
  if (document.pointerLockElement) document.exitPointerLock();
  const leave = $('btn-leave'); if (leave) leave.click(); // back to lobby state underneath
  const me = $('match-end'); me.classList.remove('win', 'loss'); me.classList.add(win ? 'win' : 'loss');
  $('me-result').textContent = win ? 'Victory' : 'Defeat';
  $('me-ct').textContent = ct; $('me-t').textContent = t;
  const a = agentById(profile.agent);
  $('me-mvp-art').innerHTML = agentSVG(a); $('me-mvp-name').textContent = E.me.name || 'DillyAgent'; $('me-mvp-agent').textContent = `${a.name} · ${mvps} MVP${mvps === 1 ? '' : 's'}`;
  const kd = deaths ? (kills / deaths).toFixed(2) : kills.toFixed(2);
  const stats = [['Kills', kills], ['Deaths', deaths], ['K/D', kd], ['Rounds won', ct], ['MVPs', mvps], ['Credits earned', '$' + earned.toLocaleString()]];
  $('me-stats').innerHTML = stats.map(([l, v]) => `<div class="me-stat"><small>${l}</small><b>${v}</b></div>`).join('');
  $('me-xp-gain').textContent = `+${xp} XP`; $('me-xp-fill').style.width = '0%';
  showScreen('match-end', true);
  setTimeout(() => { $('me-xp-fill').style.width = ((profile.xp % 1000) / 10).toFixed(1) + '%'; }, 200);
}
function tick() {
  const d = DS(), E = ENG(); if (!d || !E || !d.getState) return;
  const st = d.getState(), inM = !!st.inMatch;
  if (inM && !R.wasIn) { if (!isOnline()) startRounds(); }
  if (!inM && R.wasIn) stopRounds();
  R.wasIn = inM;
  const secs = timerSecs();
  const rt = $('round-timer'); if (rt) rt.classList.toggle('low', inM && secs <= 10);
  if (!R.on || !inM) return;
  const now = performance.now(), bp = $('buy-phase'), left = Math.max(0, R.buyUntil - now);
  bp.classList.toggle('on', left > 0 && !R.ending);
  if (left > 0) $('buy-phase-t').textContent = `0:${String(Math.ceil(left / 1000)).padStart(2, '0')}`;
  const bk = $('buy-kicker'); if (bk) bk.textContent = left > 0 ? `Buy phase · ${Math.ceil(left / 1000)}s left` : `Round ${R.round} · de_dustline`;
  const key = $('buy-key'); if (key && d.getBinds) { const c = d.getBinds().buy || 'KeyB'; key.textContent = c.startsWith('Key') ? c.slice(3) : c; }
  if (R.ending) { R.lastSec = secs; return; }
  if (E.me.kills - R.k0 >= ELIMS) endRound(true, 'elim');
  else if (E.me.deaths > R.d0) endRound(false, 'elim');
  else if (secs > R.lastSec + 30) endRound(true, 'time'); // clock wrapped: defenders hold
  R.lastSec = secs;
}

/* ---------------- settings tabs, crosshair editor, interface ---------------- */
const XH_DEF = { style: 'classic', col: '#3dff6e', len: 9, thick: 3, gap: 0, out: 1, dot: 0, dyn: 1, alpha: 100 };
const XH = Object.assign({}, XH_DEF, store.get('ds_xhair_v1', {}));
const IF_DEF = { hints: 1, callouts: 1, motion: 0 };
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
  const COLS = ['#3dff6e', '#2ef2ff', '#ffe14d', '#ffffff', '#ff4f5e', '#ff6bd6'];
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
  $('xe-reset').addEventListener('click', () => { Object.assign(XH, XH_DEF); applyXhair(); buildSettingsCrosshairOnly(rows); });
  const irows = [
    segRow('Weapon key hints', 'hints', [[1, 'Show'], [0, 'Hide']], IFS, applyIface),
    segRow('Radar callouts', 'callouts', [[1, 'Show'], [0, 'Hide']], IFS, applyIface),
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
}

/* ---------------- boot ---------------- */
function boot() {
  bindMenu(); bindAgentSelect(); bindEnd(); buildSettings();
  applyXhair(); applyIface();
  renderRoster(); renderLoadout(); syncProfile();
  if (!ENG()) setTimeout(renderLoadout, 400);
  setInterval(tick, 150);
  // Esc closes the full-screen menus (the game ignores keys outside a match)
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Escape') return;
    if ($('agent-select').classList.contains('on')) closeAgentSelect();
    else if ($('match-end').classList.contains('on')) { showScreen('match-end', false); setView('home'); }
  });
  window.DillyStrikeUI = { setView, openAgentSelect, deploy, endRound, endMatch, rounds: () => ({ ...R }) };
}
if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', boot); else boot();
