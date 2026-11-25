/* ==========================================================================
   DILLY STRIKE — RANKED (client)
   Ranked tab (profile card, rank badge, placements, match history, leaderboard),
   hub sign-in, queue with timer/cancel, match-found accept prompt, ranked agent
   select, server-authoritative in-match rounds and the end-of-match rank change.
   Talks to the authoritative Rust server (server/src/ranked.rs) and to the game
   only through window.DillyStrike.ranked (hooks in main.js) and DillyStrikeUI.
   Tier names and badges are original artwork.
   ========================================================================== */

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const DS = () => window.DillyStrike || null;
const RK = () => (DS() && DS().ranked) || null;
const UI = () => window.DillyStrikeUI || null;
const qs = new URLSearchParams(location.search);
const lsGet = (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } };
const lsSet = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (_) { /* private mode */ } };

/* ---------------- endpoints (override: ?ranked=ws://localhost:8081/ranked&hub=http://localhost:8083) ---------------- */
const WS_URL = qs.get('ranked') || window.DILLY_RANKED_URL || 'wss://apibuild.dillonmay.com/strike/ranked';
const HTTP_BASE = WS_URL.replace(/^ws(s?):/, 'http$1:').replace(/\/+$/, '');
const HUB_API = (qs.get('hub') || window.DILLY_HUB_API || 'https://apibuild.dillonmay.com').replace(/\/+$/, '');

/* ---------------- tiers + original SVG badges ---------------- */
export const TIERS = [
  { name: 'Seedling', c1: '#9be07a', c2: '#3f8f3a' },
  { name: 'Sprout', c1: '#6fe0a0', c2: '#1f8a58' },
  { name: 'Gherkin', c1: '#c4e05a', c2: '#5f7d1c' },
  { name: 'Dill', c1: '#e7e36a', c2: '#8a8a22' },
  { name: 'Brine', c1: '#6fe3f0', c2: '#1b7f95' },
  { name: 'Kosher', c1: '#c9b4ff', c2: '#6a4bc4' },
  { name: 'Pickle Master', c1: '#ffcf6a', c2: '#c06a12' },
  { name: 'Legend', c1: '#ff8fb0', c2: '#b0234f' }
];
const EMBLEM = [
  // Seedling: two tiny leaves on a stem
  '<path d="M50 70V48" stroke="#fff" stroke-width="4" stroke-linecap="round"/><path d="M50 52c-12 0-18-8-18-16 10 0 18 6 18 16z" fill="#fff"/><path d="M50 48c10 0 16-7 16-14-9 0-16 5-16 14z" fill="#fff" opacity=".85"/>',
  // Sprout: taller shoot with three leaves
  '<path d="M50 74V34" stroke="#fff" stroke-width="4" stroke-linecap="round"/><path d="M50 58c-13 0-20-9-20-18 11 0 20 7 20 18zM50 48c13 0 20-9 20-18-11 0-20 7-20 18z" fill="#fff"/><circle cx="50" cy="32" r="6" fill="#fff"/>',
  // Gherkin: bumpy pickle
  '<rect x="34" y="28" width="32" height="48" rx="16" fill="#fff"/><g fill="currentColor" opacity=".55"><circle cx="44" cy="40" r="3"/><circle cx="56" cy="48" r="3"/><circle cx="45" cy="58" r="3"/><circle cx="56" cy="66" r="2.5"/></g>',
  // Dill: frond starburst
  '<g stroke="#fff" stroke-width="3.5" stroke-linecap="round"><path d="M50 76V30"/><path d="M50 40l-14-10M50 40l14-10M50 52l-17-8M50 52l17-8M50 64l-14-5M50 64l14-5"/></g><circle cx="50" cy="28" r="4" fill="#fff"/>',
  // Brine: droplet with wave
  '<path d="M50 24c10 15 18 25 18 36a18 18 0 0 1-36 0c0-11 8-21 18-36z" fill="#fff"/><path d="M38 62c4 4 8 4 12 0s8-4 12 0" stroke="currentColor" stroke-width="3.5" fill="none" stroke-linecap="round" opacity=".6"/>',
  // Kosher: salt crystal
  '<path d="M50 22l18 16-18 40-18-40z" fill="#fff"/><path d="M32 38h36M50 22v56" stroke="currentColor" stroke-width="2.5" opacity=".45"/>',
  // Pickle Master: crowned pickle
  '<path d="M34 34l6-12 10 9 10-9 6 12z" fill="#fff"/><rect x="38" y="36" width="24" height="40" rx="12" fill="#fff"/><g fill="currentColor" opacity=".5"><circle cx="46" cy="48" r="2.6"/><circle cx="54" cy="58" r="2.6"/><circle cx="46" cy="66" r="2.2"/></g>',
  // Legend: winged star
  '<path d="M50 26l6 14 15 1-12 9 4 15-13-8-13 8 4-15-12-9 15-1z" fill="#fff"/><path d="M30 52c-10-2-16-10-18-20 8 4 14 6 20 6M70 52c10-2 16-10 18-20-8 4-14 6-20 6" fill="#fff" opacity=".8"/>'
];
const FRAME = [
  'M50 6l36 16v28c0 22-16 38-36 44C30 88 14 72 14 50V22z', // shield
  'M50 6l38 22v44L50 94 12 72V28z', // hexagon
  'M50 4l40 40-40 52L10 44z', // kite
  'M50 6l38 14-6 52-32 22-32-22-6-52z' // crest
];
export function badgeSVG(tierIndex, division, placed = true, size = 96) {
  const uid = `rkb${tierIndex}_${division}_${size}`;
  if (!placed || tierIndex == null) {
    return `<svg class="rk-badge" width="${size}" height="${size}" style="width:${size}px;height:${size}px;flex:none" viewBox="0 0 100 100" aria-label="Unranked"><path d="${FRAME[0]}" fill="#2a313c" stroke="#5c6878" stroke-width="3"/><text x="50" y="62" text-anchor="middle" font-family="Barlow Condensed, sans-serif" font-weight="800" font-size="34" fill="#8e99a8">?</text></svg>`;
  }
  const t = TIERS[tierIndex] || TIERS[0];
  const frame = FRAME[tierIndex < 2 ? 1 : tierIndex < 4 ? 0 : tierIndex < 6 ? 2 : 3];
  const pips = division > 0 ? Array.from({ length: 3 }, (_, i) => `<rect x="${34 + i * 12}" y="90" width="8" height="6" rx="1.5" fill="${i < division ? '#fff' : 'rgba(255,255,255,.22)'}"/>`).join('') : '';
  const glow = tierIndex >= 6 ? `<path d="${frame}" fill="none" stroke="${t.c1}" stroke-width="8" opacity=".25" transform="translate(50 50) scale(1.08) translate(-50 -50)"/>` : '';
  return `<svg class="rk-badge" width="${size}" height="${size}" viewBox="0 0 100 100" style="color:${t.c2};width:${size}px;height:${size}px;flex:none" aria-label="${esc(t.name)}${division ? ' ' + division : ''}">
    <defs><linearGradient id="${uid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${t.c1}"/><stop offset="1" stop-color="${t.c2}"/></linearGradient></defs>
    ${glow}<path d="${frame}" fill="url(#${uid})" stroke="rgba(255,255,255,.7)" stroke-width="2.5"/>
    <path d="${frame}" fill="none" stroke="rgba(0,0,0,.25)" stroke-width="1" transform="translate(50 50) scale(.86) translate(-50 -50)"/>
    <g transform="translate(50 50) scale(.78) translate(-50 -50)">${EMBLEM[tierIndex]}</g>${pips}
  </svg>`;
}
const rankLabel = (r) => (r && r.placed ? r.label : 'Unranked');

/* ---------------- state ---------------- */
const S = {
  server: 'checking', // checking | ok | unreachable | disabled
  status: null,
  account: null,
  profile: null,
  history: [],
  leaderboard: [],
  tab: 'history',
  ws: null,
  wsReady: false,
  queued: false,
  queueSince: 0,
  queueWindow: 0,
  inQueueCount: 0,
  cooldownUntil: 0,
  cooldownReason: '',
  match: null, // live match model
  error: '',
  reconnects: 0
};
function loadAccount() {
  try {
    const a = JSON.parse(lsGet('dilly_account_v1') || 'null');
    S.account = a && a.callsign ? a : null;
  } catch (_) { S.account = null; }
}
const tokenValid = () => !!(S.account && S.account.token && (!S.account.token_exp || S.account.token_exp * 1000 > Date.now() + 60000));

/* ---------------- styles for overlays live in ranked.css ---------------- */
function el(html) { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild; }
function ensureOverlays() {
  if ($('rk-overlays')) return;
  const wrap = el(`<div id="rk-overlays">
    <div class="rk-qpill" id="rk-qpill" hidden><span class="rk-spin"></span><b>Finding ranked match</b><span id="rk-qpill-t">0:00</span><button id="rk-qpill-x" title="Cancel">Cancel</button></div>
    <div class="rk-screen" id="rk-accept" aria-hidden="true">
      <div class="rk-accept-card">
        <div class="rk-kicker">Ranked · de_dustline</div>
        <h2>Match found</h2>
        <div class="rk-ring"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" class="bg"/><circle cx="60" cy="60" r="52" class="fg" id="rk-ring-fg"/></svg><span id="rk-accept-t">15</span></div>
        <div class="rk-dots" id="rk-accept-dots"></div>
        <div class="rk-accept-btns"><button class="rk-btn go" id="rk-accept-yes">Accept</button><button class="rk-btn ghost" id="rk-accept-no">Decline</button></div>
        <small class="rk-muted">Declining or ignoring the prompt puts you on a matchmaking cooldown.</small>
      </div>
    </div>
    <div class="rk-screen" id="rk-select" aria-hidden="true">
      <div class="rk-sel-top"><div><small id="rk-sel-side">Ranked</small><b>de_dustline</b></div><div class="rk-sel-title">Choose your agent</div><div class="rk-sel-timer"><span id="rk-sel-t">30</span><small>seconds</small></div></div>
      <div class="rk-sel-main"><div class="rk-sel-team" id="rk-sel-team"></div><div class="rk-sel-hero" id="rk-sel-hero"></div></div>
      <div class="rk-sel-bottom"><div class="rk-sel-tiles" id="rk-sel-tiles"></div><button class="rk-btn go big" id="rk-sel-lock">Lock in</button></div>
      <small class="rk-sel-warn">Leaving agent select is a dodge: matchmaking cooldown and a small RR penalty.</small>
    </div>
    <div class="rk-screen" id="rk-deploy" aria-hidden="true">
      <div class="rk-accept-card"><div class="rk-kicker" id="rk-deploy-k">Ranked · first to 13</div><h2 id="rk-deploy-h">Match ready</h2><div class="rk-vs" id="rk-deploy-vs"></div><button class="rk-btn go big" id="rk-deploy-go">Deploy</button><small class="rk-muted">Click to enter (captures your mouse).</small></div>
    </div>
    <div id="rk-hud" hidden><div class="rk-hud-phase" id="rk-hud-phase"></div><div class="rk-hud-sub" id="rk-hud-sub"></div></div>
    <div class="rk-screen" id="rk-end" aria-hidden="true"></div>
    <div class="rk-toast" id="rk-toast" hidden></div>
  </div>`);
  document.body.appendChild(wrap);
  $('rk-qpill-x').onclick = () => cancelQueue();
  $('rk-accept-yes').onclick = () => { send({ type: 'accept' }); $('rk-accept-yes').disabled = true; $('rk-accept-yes').textContent = 'Accepted'; };
  $('rk-accept-no').onclick = () => {
    if (confirm('Decline this ranked match? You will be put on a matchmaking cooldown.')) send({ type: 'decline' });
  };
  $('rk-sel-lock').onclick = () => { if (S.match && S.match.pick) send({ type: 'lock' }); };
  $('rk-deploy-go').onclick = deploy;
}
function screen(id, on) { const e = $(id); if (e) { e.classList.toggle('on', !!on); e.setAttribute('aria-hidden', on ? 'false' : 'true'); } }
let toastT = 0;
function toast(msg, kind = '') {
  ensureOverlays();
  const t = $('rk-toast'); t.textContent = msg; t.className = 'rk-toast ' + kind; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 4200);
}
const fmtT = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

/* ---------------- HTTP ---------------- */
async function getJSON(path, ms = 4000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(HTTP_BASE + path, { signal: ctl.signal, cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}
async function checkServer() {
  S.server = 'checking'; render();
  try {
    const st = await getJSON('/status');
    S.status = st; S.server = st.enabled ? 'ok' : 'disabled';
  } catch (_) { S.server = 'unreachable'; }
  render();
  if (S.server === 'ok') { refreshLeaderboard(); refreshProfile(); }
}
async function refreshProfile() {
  if (!S.account || S.server !== 'ok') return;
  try {
    const p = await getJSON('/profile/' + encodeURIComponent(S.account.callsign));
    S.profile = p.player; S.history = p.history || [];
  } catch (_) { /* keep last */ }
  render();
}
async function refreshLeaderboard() {
  try { S.leaderboard = (await getJSON('/leaderboard?limit=25')).players || []; } catch (_) { S.leaderboard = null; }
  render();
}
async function signIn(callsign, pin) {
  S.error = '';
  try {
    const r = await fetch(HUB_API + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ callsign, pin, rp_job: (S.account && S.account.rp_job) || 'Civilian' }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { S.error = j.error || ('Sign-in failed (' + r.status + ')'); render(); return; }
    if (!j.token) { S.error = 'The hub did not issue a session token (DILLY_SESSION_SECRET not configured on the hub).'; render(); return; }
    S.account = j;
    lsSet('dilly_account_v1', JSON.stringify(j)); lsSet('dgm_mp_name', j.callsign);
    const nm = $('agent-name'); if (nm) nm.value = String(j.callsign).slice(0, 16);
    render(); refreshProfile();
  } catch (_) { S.error = 'Could not reach the Dilly Online Hub at ' + HUB_API + '.'; render(); }
}
function signOut() {
  disconnect(); S.account = null; S.profile = null; S.history = [];
  lsSet('dilly_account_v1', null); render();
}

/* ---------------- socket ---------------- */
let pingT = 0;
function connect() {
  return new Promise((resolve, reject) => {
    if (S.ws && S.wsReady) return resolve();
    if (!tokenValid()) return reject(new Error('Sign in with your Dilly Online Hub account first.'));
    let ws, done = false;
    try { ws = new WebSocket(WS_URL); } catch (e) { return reject(e); }
    S.ws = ws;
    const fail = (msg) => { if (!done) { done = true; reject(new Error(msg)); } };
    const to = setTimeout(() => { fail('Ranked server unreachable'); try { ws.close(); } catch (_) {} }, 5000);
    ws.onopen = () => ws.send(JSON.stringify({ type: 'hello', token: S.account.token }));
    ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch (_) { return; }
      if (m.type === 'hello_ok') { clearTimeout(to); S.wsReady = true; S.reconnects = 0; done = true; resolve(); }
      else if (m.type === 'error' && !S.wsReady) { clearTimeout(to); fail(m.msg || m.code); }
      onMsg(m);
    };
    ws.onerror = () => { clearTimeout(to); fail('Ranked server unreachable at ' + WS_URL); };
    ws.onclose = () => {
      clearTimeout(to); const was = S.wsReady; S.ws = null; S.wsReady = false; clearInterval(pingT);
      fail('Connection closed');
      if (S.queued) { S.queued = false; showQueuePill(); }
      if (was && S.match && !S.match.ended) {
        toast('Lost connection to the ranked server — reconnecting…', 'bad');
        if (S.reconnects++ < 5) setTimeout(() => connect().catch(() => {}), 1500 * S.reconnects);
      }
      render();
    };
    clearInterval(pingT);
    pingT = setInterval(() => send({ type: 'ping' }), 15000);
  });
}
function disconnect() { if (S.ws) { try { S.ws.close(); } catch (_) {} } S.ws = null; S.wsReady = false; }
function send(o) { if (S.ws && S.wsReady) S.ws.send(JSON.stringify(o)); }

async function findMatch() {
  if (S.cooldownUntil > Date.now()) { toast(`Matchmaking cooldown: ${fmtT(S.cooldownUntil - Date.now())} left`, 'bad'); return; }
  try {
    await connect();
    send({ type: 'queue' });
  } catch (e) {
    toast(e.message, 'bad');
    if (/unreachable/i.test(e.message)) { S.server = 'unreachable'; render(); }
  }
}
function cancelQueue() { send({ type: 'cancel' }); S.queued = false; showQueuePill(); render(); }

let qTimer = 0;
function showQueuePill() {
  ensureOverlays();
  $('rk-qpill').hidden = !S.queued;
  clearInterval(qTimer);
  if (S.queued) {
    const upd = () => {
      const t = fmtT(Date.now() - S.queueSince);
      $('rk-qpill-t').textContent = t;
      const big = $('rk-q-time'); if (big) big.textContent = t;
    };
    upd(); qTimer = setInterval(upd, 250);
  }
}

/* ---------------- match model + server messages ---------------- */
const teamName = (t) => (t === 'a' ? 'alpha' : 'omega');
function newMatch(id) {
  return { id, phase: 'ready', roster: new Map(), myTeam: 'a', side: 'def', alive: true, deployed: false, ended: false, pick: null, round: 0, score: [0, 0], used: 0, endsAt: 0, weapons: ['knife', 'sheriff'] };
}
function myKey() { return S.account ? String(S.account.callsign).toLowerCase() : ''; }

function onMsg(m) {
  switch (m.type) {
    case 'hello_ok':
      S.profile = m.profile;
      if (m.cooldown_ms > 0) { S.cooldownUntil = Date.now() + m.cooldown_ms; S.cooldownReason = m.cooldown_reason; }
      render(); break;
    case 'queue_status':
      if (m.queued) {
        if (!S.queued) S.queueSince = Date.now() - (m.elapsed_ms || 0);
        S.queued = true; S.queueWindow = m.window; S.inQueueCount = m.in_queue;
      } else S.queued = false;
      showQueuePill(); render(); break;
    case 'cooldown':
      S.cooldownUntil = Date.now() + m.cooldown_ms; S.cooldownReason = m.reason; S.queued = false; showQueuePill();
      toast(`Matchmaking cooldown (${m.reason}): ${fmtT(m.cooldown_ms)}`, 'bad'); render(); break;
    case 'match_found':
      S.queued = false; showQueuePill();
      S.match = newMatch(m.match_id);
      openAccept(m.accept_ms, m.total); break;
    case 'ready_update': renderDots(m.accepted, m.total); break;
    case 'match_cancelled':
      screen('rk-accept', false); screen('rk-select', false); S.match = null;
      if (m.penalized) { S.cooldownUntil = Date.now() + (m.cooldown_ms || 0); S.cooldownReason = m.reason; toast(`Match cancelled — you ${m.reason === 'dodged' ? 'left agent select' : 'did not accept'}. Cooldown ${fmtT(m.cooldown_ms || 0)}.`, 'bad'); }
      else { toast('A player did not accept — you are back in the queue with priority.'); S.queued = true; S.queueSince = Date.now(); }
      showQueuePill(); render(); break;
    case 'agent_select': onSelect(m); break;
    case 'match_start': onStart(m); break;
    case 'match_state': onSnapshot(m); break;
    case 'round': onRound(m); break;
    case 'state': if (S.match && S.match.deployed && RK()) { ensureRemote(m.id); RK().moveRemote(m.id, m.x, m.y, m.z, m.yaw); } break;
    case 'damaged': onDamaged(m); break;
    case 'kill': onKill(m); break;
    case 'econ': onEcon(m); break;
    case 'round_end': onRoundEnd(m); break;
    case 'halftime': banner(true, 'Half-time', 'Switching sides', 'Economy reset · new side', '', ''); break;
    case 'smoke': if (RK() && m.by !== myKey()) RK().smoke(m.x, m.y, m.z); break;
    case 'flash': onFlash(m); break;
    case 'chat': if (RK()) RK().chat((m.team ? '[TEAM] ' : '') + m.name, m.text); break;
    case 'correct': if (RK()) { const me = RK().me; me.pos.set(m.x, m.y, m.z); } break;
    case 'player_left': if (RK() && S.match) { RK().chat('SYSTEM', `${nameOf(m.id)} ${m.reason === 'afk' ? 'was removed for being AFK' : 'abandoned the match'}.`); RK().showRemote(m.id, false); } break;
    case 'player_conn': if (RK() && S.match && m.id !== myKey()) RK().chat('SYSTEM', `${nameOf(m.id)} ${m.up ? 'reconnected' : 'disconnected'}.`); break;
    case 'abandoned':
      toast(m.msg + ` Cooldown ${fmtT(m.cooldown_ms)}.`, 'bad');
      S.cooldownUntil = Date.now() + m.cooldown_ms; S.cooldownReason = 'abandoned'; break;
    case 'match_end': onEnd(m); break;
    case 'error':
      if (m.code === 'replaced') { toast('Ranked opened in another window.', 'bad'); }
      else if (m.code !== 'rate_limited') toast(m.msg || m.code, 'bad');
      break;
    default: break;
  }
}
const nameOf = (id) => (S.match && S.match.roster.get(id) ? S.match.roster.get(id).name : id);

/* accept prompt */
let acceptT = 0;
function openAccept(ms, total) {
  ensureOverlays();
  S.match.endsAt = Date.now() + ms;
  const yes = $('rk-accept-yes'); yes.disabled = false; yes.textContent = 'Accept';
  renderDots(0, total || 2);
  screen('rk-accept', true);
  try { const R = RK(); if (R) R.sfx(880, 0.18, 'triangle', 0.1, 1320); } catch (_) {}
  clearInterval(acceptT);
  const upd = () => {
    const left = Math.max(0, S.match ? S.match.endsAt - Date.now() : 0);
    $('rk-accept-t').textContent = Math.ceil(left / 1000);
    $('rk-ring-fg').style.strokeDashoffset = String(327 * (1 - left / ms));
    if (!S.match || S.match.phase !== 'ready' || left <= 0) clearInterval(acceptT);
  };
  upd(); acceptT = setInterval(upd, 100);
}
function renderDots(acc, total) {
  const d = $('rk-accept-dots'); if (!d) return;
  d.innerHTML = Array.from({ length: total }, (_, i) => `<i class="${i < acc ? 'on' : ''}"></i>`).join('');
}

/* ranked agent select */
let selT = 0;
function onSelect(m) {
  if (!S.match) S.match = newMatch(m.match_id);
  const M = S.match; M.phase = 'select'; M.myTeam = m.team; M.side = m.side; M.allies = m.allies; M.enemyCount = m.enemies;
  M.endsAt = Date.now() + m.left_ms;
  const mine = (m.allies || []).find((a) => a.id === myKey());
  if (mine && mine.agent) M.pick = mine.agent;
  M.locked = !!(mine && mine.locked);
  screen('rk-accept', false); screen('rk-select', true);
  renderSelect();
  clearInterval(selT);
  selT = setInterval(() => {
    const left = Math.max(0, M.endsAt - Date.now());
    $('rk-sel-t').textContent = Math.ceil(left / 1000);
    $('rk-sel-t').parentElement.classList.toggle('low', left < 6000);
    if (M.phase !== 'select') clearInterval(selT);
  }, 200);
}
function renderSelect() {
  const M = S.match, ui = UI(); if (!M || !ui) return;
  const A = ui.AGENTS, svg = ui.agentSVG, cur = A.find((a) => a.id === M.pick) || null;
  const takenByMate = new Set((M.allies || []).filter((a) => a.locked && a.id !== myKey()).map((a) => a.agent));
  $('rk-sel-side').textContent = `Ranked · you start ${M.side === 'def' ? 'defending' : 'attacking'}`;
  $('rk-sel-team').innerHTML = (M.allies || []).map((a) => {
    const ag = A.find((x) => x.id === a.agent);
    return `<div class="rk-slot${a.locked ? ' locked' : ''}${a.id === myKey() ? ' me' : ''}"><div class="mini">${ag ? svg(ag, true) : ''}</div><div><b>${esc(a.name)}</b><small>${ag ? esc(ag.name) + (a.locked ? ' · locked' : ' · hovering') : 'Selecting…'}</small></div></div>`;
  }).join('') + `<div class="rk-enemies">vs ${M.enemyCount || 0} hidden opponent${M.enemyCount === 1 ? '' : 's'}</div>`;
  $('rk-sel-hero').innerHTML = cur
    ? `<div class="rk-hero-art">${svg(cur)}</div><div><div class="rk-role" style="--ac:${cur.ac}">${esc(cur.role)}</div><div class="rk-hero-name">${esc(cur.name)}</div><p>${esc(cur.bio)}</p><div class="rk-abil">${cur.abil.map(([, n, d]) => `<div><b>${esc(n)}</b><small>${esc(d)}</small></div>`).join('')}</div></div>`
    : '<p class="rk-muted">Pick an agent below. Each agent can be locked once per team.</p>';
  $('rk-sel-tiles').innerHTML = A.map((a) => `<button class="rk-tile${a.id === M.pick ? ' sel' : ''}${takenByMate.has(a.id) ? ' taken' : ''}" data-id="${a.id}" style="--ac:${a.ac}" ${takenByMate.has(a.id) || M.locked ? 'disabled' : ''} title="${esc(a.name)} · ${esc(a.role)}">${svg(a, true)}</button>`).join('');
  $('rk-sel-tiles').querySelectorAll('.rk-tile').forEach((b) => b.addEventListener('click', () => { M.pick = b.dataset.id; send({ type: 'pick', agent: b.dataset.id }); renderSelect(); }));
  const lock = $('rk-sel-lock'); lock.disabled = !M.pick || M.locked; lock.textContent = M.locked ? 'Locked' : 'Lock in';
}

/* match start -> deploy (pointer lock needs a click) */
function onStart(m) {
  const M = S.match || (S.match = newMatch(m.match_id));
  M.phase = 'starting'; M.rtw = m.rounds_to_win;
  M.roster = new Map(m.players.map((p) => [p.id, p]));
  const me = M.roster.get(myKey()); if (me) M.myTeam = me.team;
  screen('rk-select', false); screen('rk-accept', false);
  showDeploy(`Ranked · first to ${m.rounds_to_win}${m.overtime ? ' · overtime' : ''}`, 'Match ready');
}
function showDeploy(kicker, title) {
  const M = S.match, ui = UI(); ensureOverlays();
  $('rk-deploy-k').textContent = kicker; $('rk-deploy-h').textContent = title;
  const side = (t) => [...M.roster.values()].filter((p) => p.team === t).map((p) => {
    const ag = ui && ui.AGENTS.find((a) => a.id === p.agent);
    return `<div class="rk-vs-p">${ag ? `<div class="mini">${ui.agentSVG(ag, true)}</div>` : ''}<b>${esc(p.name)}</b></div>`;
  }).join('');
  $('rk-deploy-vs').innerHTML = `<div class="rk-vs-side a">${side(M.myTeam)}</div><i>VS</i><div class="rk-vs-side b">${side(M.myTeam === 'a' ? 'b' : 'a')}</div>`;
  screen('rk-deploy', true);
}
function deploy() {
  const M = S.match, R = RK(); if (!M || !R) return;
  screen('rk-deploy', false);
  R.attach(netHook);
  R.enter();
  M.deployed = true;
  const scm = $('sc-mode'); if (scm) scm.textContent = 'RANKED · DE_DUSTLINE';
  const me = R.me; me.team = teamName(M.myTeam); me.kills = 0; me.deaths = 0;
  for (const p of M.roster.values()) if (p.id !== myKey()) ensureRemote(p.id);
  if (M.lastRound) applyRound(M.lastRound, true);
  send({ type: 'sync' });
  $('rk-hud').hidden = false;
}
function ensureRemote(id) {
  const M = S.match, R = RK(); if (!M || !R || id === myKey()) return;
  const p = M.roster.get(id); if (!p) return;
  R.addRemote({ id, name: p.name, team: teamName(p.team), x: p.x || 0, y: 0, z: p.z || 0, yaw: p.yaw || 0 });
}

const netHook = {
  send(o) {
    if (o.type === 'smoke') send({ type: 'ability', kind: 'smoke', x: o.x, z: o.z });
    else send(o);
  },
  frozen: () => !S.match || S.match.phase !== 'live' || !S.match.alive,
  blockFire: () => !S.match || S.match.phase !== 'live' || !S.match.alive,
  ability(kind) {
    const M = S.match; if (!M || !M.alive || (M.phase !== 'live' && M.phase !== 'buy')) return false;
    const bit = { smoke: 1, flash: 2, dash: 4 }[kind];
    if (M.used & bit) { toast('Ability already used this round', 'bad'); return false; }
    M.used |= bit;
    if (kind !== 'smoke') { const p = RK().me.pos; send({ type: 'ability', kind, x: p.x, z: p.z }); }
    return true;
  },
  buy(item, owned) {
    const M = S.match; if (!M || M.phase !== 'buy') { toast('You can only buy during the buy phase', 'bad'); return; }
    if (owned && item.kind === 'wep') { RK().equip(item.id); send({ type: 'buy', item: item.id }); return; }
    send({ type: 'buy', item: item.kind === 'wep' ? item.id : item.id });
  }
};

function applyYou(y, teleport) {
  const R = RK(); if (!R) return;
  const me = R.me, M = S.match;
  me.hp = y.hp; me.shield = y.armor; me.cash = y.cash;
  me.owned = new Set(y.weapons); M.weapons = y.weapons; M.used = y.abilities || 0;
  M.alive = y.alive; M.side = y.side;
  if (teleport) { me.pos.set(y.x, y.y, y.z); me.vel.set(0, 0, 0); me.yaw = y.yaw; me.pitch = 0; }
  if (me.owned.has(y.weapon)) R.equip(y.weapon); else if (!me.owned.has(me.weaponId)) R.equip('sheriff');
  R.syncHud(); R.rerenderBuy();
}
function applyRound(m, teleport) {
  const M = S.match, R = RK(); if (!M) return;
  M.lastRound = m; M.phase = m.phase; M.round = m.round; M.score = m.score;
  M.endsAt = Date.now() + m.left_ms;
  if (!R || !M.deployed) return;
  R.setScore(m.score[0], m.score[1]);
  R.setRoundTime(m.left_ms / 1000);
  applyYou(m.you, teleport);
  const alive = new Set(m.alive || []);
  for (const id of M.roster.keys()) if (id !== myKey()) { ensureRemote(id); R.showRemote(id, alive.has(id)); }
  if (m.phase === 'live') R.closeBuy();
  setHud();
}
function onRound(m) {
  if (!S.match) return;
  applyRound(m, m.phase === 'buy');
  if (S.match.deployed && m.phase === 'buy') {
    const sideTxt = m.you.side === 'def' ? 'Defend' : 'Attack';
    if (m.round === 1 || m.ot) banner(true, m.ot ? 'Overtime' : `Round ${m.round}`, sideTxt, m.ot ? 'Win by two · credits reset' : 'Buy phase — press B', '', '');
  }
}
function onSnapshot(m) {
  if (!S.match) S.match = newMatch(m.match_id);
  const M = S.match; M.roster = new Map(m.players.map((p) => [p.id, p]));
  const me = M.roster.get(myKey()); if (me) M.myTeam = me.team;
  M.rtw = m.rounds_to_win;
  if (m.phase === 'ready') { M.phase = 'ready'; if (!m.accepted) openAccept(m.left_ms, m.players.length); return; }
  if (m.phase === 'select') { send({ type: 'sync' }); return; }
  const fake = { phase: m.phase, round: m.round, left_ms: m.left_ms, score: m.score, you: m.you, alive: m.players.filter((p) => p.alive).map((p) => p.id), ot: m.ot };
  M.lastRound = fake; M.phase = m.phase;
  if (!M.deployed) showDeploy('Ranked · match in progress', 'Rejoin match');
  else { applyRound(fake, true); for (const p of m.players) if (p.id !== myKey() && RK()) RK().moveRemote(p.id, p.x, p.y, p.z, p.yaw, true); }
}
function onDamaged(m) {
  const R = RK(); if (!R || m.id !== myKey()) return;
  R.me.hp = m.hp; R.me.shield = m.armor;
  const h = $('hurt-fx'); if (h) { h.style.opacity = '1'; setTimeout(() => { h.style.opacity = '0'; }, 160); }
  R.syncHud();
}
function onKill(m) {
  const R = RK(), M = S.match; if (!R || !M) return;
  const mine = m.killer_id === myKey();
  R.killfeed(m.killer, m.victim, m.weapon, m.hs, teamName(m.killer_team), teamName(m.victim_team), mine);
  if (mine) R.me.kills++;
  if (m.victim_id === myKey()) { M.alive = false; R.me.hp = 0; R.me.deaths++; R.syncHud(); setHud(); }
  else R.showRemote(m.victim_id, false);
}
function onEcon(m) {
  const R = RK(), M = S.match; if (!R || !M || !M.deployed) return;
  R.me.cash = m.cash; R.me.shield = m.armor; R.me.owned = new Set(m.weapons); M.used = m.abilities || 0;
  if (m.weapon && R.me.owned.has(m.weapon) && R.me.weaponId !== m.weapon && M.phase === 'buy') R.equip(m.weapon);
  R.syncHud(); R.rerenderBuy();
}
function onFlash(m) {
  const R = RK(); if (!R || m.by === myKey()) return;
  const p = R.me.pos, d = Math.hypot(p.x - m.x, p.z - m.z);
  if (d < 18) { const f = $('flash-fx'); if (f) { f.style.opacity = String(Math.min(0.95, 1.2 - d / 18)); setTimeout(() => { f.style.opacity = '0'; }, 900); } }
}
function onRoundEnd(m) {
  const M = S.match; if (!M) return;
  M.phase = 'round_end'; M.score = m.score;
  const R = RK(); if (R) R.setScore(m.score[0], m.score[1]);
  const win = m.winner === M.myTeam;
  const sub = m.reason === 'time' ? (win ? 'Held until time expired' : 'Time expired') : (win ? 'Enemy team eliminated' : 'Your team was eliminated');
  const mine = M.myTeam === 'a' ? m.score : [m.score[1], m.score[0]];
  banner(win, `Round ${m.round} · ${mine[0]}–${mine[1]}`, win ? 'Round won' : 'Round lost', sub, m.mvp || '—', m.mvp ? `${m.mvp_kills} elimination${m.mvp_kills === 1 ? '' : 's'}` : '', m.final ? 'Final round' : m.match_point ? 'Match point' : '');
  setHud();
}
let bannerT = 0;
function banner(win, kicker, title, sub, mvp, why, cash) {
  const b = $('round-banner'); if (!b) return;
  $('rb-kicker').textContent = kicker; $('rb-title').textContent = title; $('rb-sub').textContent = sub;
  $('rb-mvp-name').textContent = mvp; $('rb-mvp-why').textContent = why; $('rb-cash').textContent = cash;
  b.classList.remove('win', 'loss'); void b.offsetWidth; b.classList.add('on', win ? 'win' : 'loss');
  clearTimeout(bannerT); bannerT = setTimeout(() => b.classList.remove('on', 'win', 'loss'), 3000);
}
function setHud() {
  const M = S.match; if (!M) return;
  const ph = $('rk-hud-phase'), sub = $('rk-hud-sub'); if (!ph) return;
  const side = M.side === 'def' ? 'Defending' : 'Attacking';
  const mine = M.myTeam === 'a' ? M.score : [M.score[1], M.score[0]];
  if (!M.alive && M.phase === 'live') { ph.textContent = 'Eliminated'; sub.textContent = 'Spectating until the next round'; }
  else if (M.phase === 'buy') { ph.textContent = `Buy phase · ${Math.ceil(Math.max(0, M.endsAt - Date.now()) / 1000)}s`; sub.textContent = `Round ${M.round} · ${side} · press B to buy`; }
  else if (M.phase === 'live') { ph.textContent = `Round ${M.round}`; sub.textContent = `${side} · ${mine[0]}–${mine[1]} · first to ${M.rtw || 13}`; }
  else if (M.phase === 'round_end') { ph.textContent = `${mine[0]}–${mine[1]}`; sub.textContent = 'Next round starting…'; }
  $('rk-hud').classList.toggle('dead', !M.alive);
}
setInterval(() => { if (S.match && S.match.deployed && !S.match.ended) setHud(); }, 250);

/* match end + rank change animation */
function onEnd(m) {
  const M = S.match; if (M) { M.ended = true; M.phase = 'ended'; }
  const R = RK();
  screen('rk-deploy', false); screen('rk-select', false); screen('rk-accept', false);
  const hud = $('rk-hud'); if (hud) hud.hidden = true;
  if (R && R.active()) {
    R.detach();
    if (document.pointerLockElement) document.exitPointerLock();
    const leave = $('btn-leave'); if (leave) { leaving = true; leave.click(); leaving = false; }
  }
  showEnd(m);
  S.match = null;
  setTimeout(() => { refreshProfile(); refreshLeaderboard(); }, 600);
}
export function showEnd(m) {
  ensureOverlays();
  const ui = UI(), host = $('rk-end');
  const res = m.result, title = res === 'win' ? 'Victory' : res === 'draw' ? 'Draw' : 'Defeat';
  const mine = m.your_team === 'a' ? m.score : [m.score[1], m.score[0]];
  const b = m.rank_before, a = m.rank_after;
  const placing = !a.placed;
  const delta = m.rr_delta;
  let headline = '';
  if (m.revealed) headline = '<div class="rk-flag promo">Rank revealed</div>';
  else if (m.promoted) headline = '<div class="rk-flag promo">Promoted</div>';
  else if (m.demoted) headline = '<div class="rk-flag demo">Demoted</div>';
  const pips = Array.from({ length: a.placements_total }, (_, i) => `<i class="${i < a.placements ? 'on' : ''}"></i>`).join('');
  const rows = (m.players || []).slice().sort((x, y) => (x.team === m.your_team ? -1 : 1) - (y.team === m.your_team ? -1 : 1) || y.kills - x.kills).map((p) => {
    const ag = ui && ui.AGENTS.find((x) => x.id === p.agent);
    return `<tr class="${p.team === m.your_team ? 'ally' : 'enemy'}${p.id === myKey() ? ' me' : ''}"><td>${ag ? `<span class="mini">${ui.agentSVG(ag, true)}</span>` : ''}${esc(p.name)}${p.abandoned ? ' <em>left</em>' : ''}</td><td>${p.kills}</td><td>${p.deaths}</td><td>${p.headshots}</td><td>${p.damage}</td><td>${p.mvps}</td></tr>`;
  }).join('');
  host.className = 'rk-screen on ' + res;
  host.innerHTML = `<div class="rk-end">
    <div class="rk-end-res">${title}</div>
    <div class="rk-end-score"><span class="a">${mine[0]}</span><i>:</i><span class="b">${mine[1]}</span></div>
    <div class="rk-muted">Ranked · de_dustline${m.overtime ? ' · overtime' : ''}${m.forfeit ? ' · forfeit' : ''}${m.abandoned ? ' · you left (counts as a loss)' : ''}</div>
    <div class="rk-end-rank">
      <div class="rk-end-badge" id="rk-end-badge">${badgeSVG(b.tier_index, b.division, b.placed, 132)}</div>
      <div class="rk-end-info">
        ${headline}
        <div class="rk-end-label" id="rk-end-label">${esc(rankLabel(b))}</div>
        ${placing ? `<div class="rk-place">Placement match ${a.placements} of ${a.placements_total}</div><div class="rk-pips">${pips}</div><small class="rk-muted">Your rank is revealed after ${a.placements_total} placement matches.</small>`
    : `<div class="rk-rr-bar"><i id="rk-rr-fill" style="width:${b.placed ? b.rr_in_div % 100 : 0}%"></i></div>
        <div class="rk-rr-row"><span id="rk-rr-num">${b.placed ? b.rr_in_div : 0}</span><small>/100 RR</small><b class="rk-delta ${delta >= 0 ? 'up' : 'down'}" id="rk-delta">${delta >= 0 ? '+' : ''}0 RR</b></div>`}
      </div>
    </div>
    <table class="rk-end-table"><thead><tr><th>Player</th><th>K</th><th>D</th><th>HS</th><th>DMG</th><th>MVP</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="rk-end-btns"><button class="rk-btn go" id="rk-end-again">Queue again</button><button class="rk-btn ghost" id="rk-end-menu">Ranked overview</button></div>
    ${m.saved === false ? '<small class="rk-muted">Warning: the server could not save this result.</small>' : ''}
  </div>`;
  host.setAttribute('aria-hidden', 'false');
  $('rk-end-again').onclick = () => { screen('rk-end', false); openRankedView(); findMatch(); };
  $('rk-end-menu').onclick = () => { screen('rk-end', false); openRankedView(); };
  if (!placing) animateRR(b, a, delta, m);
  else if (m.revealed) setTimeout(() => {
    $('rk-end-badge').innerHTML = badgeSVG(a.tier_index, a.division, true, 132); $('rk-end-badge').classList.add('pop');
    $('rk-end-label').textContent = rankLabel(a);
  }, 900);
}
function animateRR(b, a, delta, m) {
  const reduce = document.body.classList.contains('reduce-motion');
  const startAbs = b.rr, endAbs = a.rr, dur = reduce ? 1 : 1400, t0 = performance.now() + 500;
  const step = (now) => {
    const k = Math.min(1, Math.max(0, (now - t0) / dur)), e = 1 - Math.pow(1 - k, 3);
    const cur = Math.round(startAbs + (endAbs - startAbs) * e);
    const inDiv = a.tier_index === 7 && cur >= 2100 ? cur - 2100 : ((cur % 100) + 100) % 100;
    const fill = $('rk-rr-fill'), num = $('rk-rr-num'), d = $('rk-delta');
    if (!fill) return;
    fill.style.width = (a.tier_index === 7 && cur >= 2100 ? 100 : inDiv) + '%';
    num.textContent = inDiv;
    d.textContent = `${delta >= 0 ? '+' : ''}${Math.round(delta * e)} RR`;
    if (k < 1) requestAnimationFrame(step);
    else if (m.promoted || m.demoted) {
      $('rk-end-badge').innerHTML = badgeSVG(a.tier_index, a.division, true, 132);
      $('rk-end-badge').classList.add(m.promoted ? 'pop' : 'drop');
      $('rk-end-label').textContent = rankLabel(a);
    }
  };
  requestAnimationFrame(step);
}

/* leaving a live ranked match = abandon (confirm first) */
let leaving = false;
document.addEventListener('click', (e) => {
  const t = e.target && e.target.closest && e.target.closest('#btn-leave');
  if (!t || leaving || !S.match || !S.match.deployed || S.match.ended) return;
  if (!confirm('Leave this ranked match? Leaving counts as a loss, costs extra RR and starts a matchmaking cooldown.')) {
    e.preventDefault(); e.stopImmediatePropagation(); return;
  }
  send({ type: 'abandon' });
  S.match.ended = true;
  const R = RK(); if (R) R.detach();
  const hud = $('rk-hud'); if (hud) hud.hidden = true;
}, true);

/* ---------------- ranked tab rendering ---------------- */
function openRankedView() { const ui = UI(); if (ui && ui.setView) ui.setView('ranked'); render(); }
function profileCard() {
  const p = S.profile, r = p && p.rank;
  const placed = !!(r && r.placed);
  const pips = r ? Array.from({ length: r.placements_total }, (_, i) => `<i class="${i < r.placements ? 'on' : ''}"></i>`).join('') : '';
  const cd = S.cooldownUntil > Date.now();
  let action;
  if (S.server !== 'ok') action = `<button class="rk-btn go big" disabled>Find ranked match</button>`;
  else if (S.queued) action = `<div class="rk-queue-box"><span class="rk-spin"></span><div><b>Searching · <span id="rk-q-time">${fmtT(Date.now() - S.queueSince)}</span></b><small>MMR window ±${Math.round(S.queueWindow || 0)} · ${S.inQueueCount || 1} in queue · ${S.status ? S.status.team_size + 'v' + S.status.team_size : ''}</small></div><button class="rk-btn ghost" id="rk-cancel">Cancel</button></div>`;
  else if (cd) action = `<button class="rk-btn go big" disabled>Cooldown · ${fmtT(S.cooldownUntil - Date.now())}</button><small class="rk-muted">Reason: ${esc(S.cooldownReason || 'penalty')}</small>`;
  else action = `<button class="rk-btn go big" id="rk-find">Find ranked match</button>`;
  return `<div class="rk-card rk-profile">
    <div class="rk-prof-top">
      <div class="rk-prof-badge">${badgeSVG(r ? r.tier_index : null, r ? r.division : 0, placed, 112)}</div>
      <div class="rk-prof-meta">
        <small class="rk-muted">Signed in as</small>
        <div class="rk-prof-name">${esc(S.account.callsign)}</div>
        <div class="rk-prof-rank">${esc(rankLabel(r))}</div>
        ${placed ? `<div class="rk-rr-bar"><i style="width:${Math.min(100, r.rr_in_div)}%"></i></div><small>${r.rr_in_div} RR${r.tier_index === 7 ? '' : ' / 100'}</small>`
    : `<div class="rk-place">Placements ${r ? r.placements : 0}/${r ? r.placements_total : 5}</div><div class="rk-pips">${pips}</div>`}
      </div>
    </div>
    <div class="rk-stats">
      <div><small>Wins</small><b>${p ? p.wins : 0}</b></div><div><small>Losses</small><b>${p ? p.losses : 0}</b></div>
      <div><small>Draws</small><b>${p ? p.draws : 0}</b></div><div><small>Peak</small><b>${esc(p ? p.peak_label : '—')}</b></div>
    </div>
    <div class="rk-action">${action}</div>
    <div class="rk-foot"><small class="rk-muted">${S.status ? `${S.status.team_size}v${S.status.team_size} · first to ${S.status.rounds_to_win}${S.status.overtime ? ' · overtime' : ''}` : ''}</small><button class="rk-link" id="rk-signout">Sign out</button></div>
  </div>`;
}
function signInCard() {
  return `<div class="rk-card rk-signin">
    <h3>Sign in to play ranked</h3>
    <p class="rk-muted">Ranked uses your Dilly Online Hub account so your rank follows you. New callsigns are registered on first sign-in.</p>
    <form id="rk-signin-form" autocomplete="on">
      <label>Callsign<input id="rk-cs" maxlength="18" required value="${esc((S.account && S.account.callsign) || '')}" autocomplete="username"></label>
      <label>PIN<input id="rk-pin" type="password" inputmode="numeric" maxlength="12" required autocomplete="current-password"></label>
      <button class="rk-btn go" type="submit">Sign in</button>
    </form>
    ${S.error ? `<p class="rk-err">${esc(S.error)}</p>` : ''}
  </div>`;
}
function serverCard() {
  if (S.server === 'checking') return '<div class="rk-card rk-state"><span class="rk-spin"></span> Contacting the ranked server…</div>';
  if (S.server === 'disabled') return '<div class="rk-card rk-state warn"><h3>Ranked is switched off on this server</h3><p class="rk-muted">The server is online but has no <code>DILLY_SESSION_SECRET</code> configured, so it cannot verify hub accounts.</p></div>';
  if (S.server === 'unreachable') return `<div class="rk-card rk-state bad" id="rk-unreachable">
    <h3>Ranked server unreachable</h3>
    <p>Ranked matches are run by the Dilly Strike Rust server at <code>${esc(WS_URL)}</code>, which isn't responding.
    This site is static hosting, so it can't run the server itself.</p>
    <p class="rk-muted">To play locally: <code>DILLY_SESSION_SECRET=… docker compose -f deploy/docker-compose.ha.yml up --build</code>, then open this page with
    <code>?ranked=ws://localhost:8081/ranked&amp;hub=http://localhost:8083</code>. Solo and casual modes still work.</p>
    <button class="rk-btn ghost" id="rk-retry">Retry</button>
  </div>`;
  return '';
}
function rightPanel() {
  const tabs = `<div class="rk-tabs"><button data-rt="history" class="${S.tab === 'history' ? 'on' : ''}">Match history</button><button data-rt="ladder" class="${S.tab === 'ladder' ? 'on' : ''}">Leaderboard</button><button data-rt="tiers" class="${S.tab === 'tiers' ? 'on' : ''}">Tiers</button></div>`;
  let body = '';
  if (S.tab === 'history') {
    if (!S.account) body = '<p class="rk-muted">Sign in to see your ranked matches.</p>';
    else if (S.server !== 'ok') body = '<p class="rk-muted">Match history is unavailable while the ranked server is offline.</p>';
    else if (!S.history.length) body = '<p class="rk-muted">No ranked matches yet. Your first five are placement matches.</p>';
    else body = `<div class="rk-hist">${S.history.map((h) => {
      const ag = UI() && UI().AGENTS.find((a) => a.id === h.agent);
      return `<div class="rk-hrow ${h.result}"><span class="rk-hres">${h.result === 'win' ? 'W' : h.result === 'draw' ? 'D' : 'L'}</span>${ag ? `<span class="mini">${UI().agentSVG(ag, true)}</span>` : ''}<span class="rk-hscore">${h.score[0]}–${h.score[1]}</span><span>${h.kills}/${h.deaths} · ${h.headshots} HS</span><span class="rk-muted">${new Date(h.ended_ms).toLocaleDateString()}</span><b class="${h.rr_delta >= 0 ? 'up' : 'down'}">${h.placement ? 'Placement' : (h.rr_delta >= 0 ? '+' : '') + h.rr_delta + ' RR'}</b>${h.abandoned ? '<em>left</em>' : ''}</div>`;
    }).join('')}</div>`;
  } else if (S.tab === 'ladder') {
    if (S.server !== 'ok' || S.leaderboard == null) body = '<p class="rk-muted">The leaderboard is read from the ranked server, which is offline right now.</p>';
    else if (!S.leaderboard.length) body = '<p class="rk-muted">Nobody has finished placements yet — be the first Legend.</p>';
    else body = `<table class="rk-lb"><thead><tr><th>#</th><th>Player</th><th>Rank</th><th>RR</th><th>W–L</th></tr></thead><tbody>${S.leaderboard.map((p, i) => `<tr class="${S.account && p.name.toLowerCase() === myKey() ? 'me' : ''}"><td>${i + 1}</td><td>${esc(p.name)}</td><td><span class="rk-lb-rank">${badgeSVG(p.rank.tier_index, p.rank.division, true, 26)}${esc(p.rank.label)}</span></td><td>${p.rank.rr}</td><td>${p.wins}–${p.losses}</td></tr>`).join('')}</tbody></table>`;
  } else {
    body = `<div class="rk-tiers">${TIERS.map((t, i) => `<div class="rk-tier">${badgeSVG(i, i === 7 ? 0 : 3, true, 64)}<b>${t.name}</b><small>${i === 7 ? '2100+ RR' : `${i * 300}–${i * 300 + 299} RR · I–III`}</small></div>`).join('')}</div>
      <p class="rk-muted">Each division is 100 RR. Wins always gain RR and losses always cost RR; how much depends on how your hidden Glicko-2 MMR compares to your rank. Leaving a match counts as a loss plus an extra penalty.</p>`;
  }
  return `<div class="rk-card rk-right">${tabs}${body}</div>`;
}
let lastHtml = '';
function render() {
  const root = $('rk-root'); if (!root) return;
  loadAccount();
  const left = (S.server !== 'ok' ? serverCard() : '') + (S.account && tokenValid() ? (S.server === 'ok' || S.profile ? profileCard() : '') : (S.server === 'unreachable' ? '' : signInCard()));
  const html = `<div class="rk-grid"><div class="rk-left">${left || serverCard()}</div>${rightPanel()}</div>`;
  if (html === lastHtml && root.firstElementChild) return; // nothing changed: keep focus + typed input
  // keep what the player is typing in the sign-in form across async re-renders
  const keep = ['rk-cs', 'rk-pin'].map((id) => [id, $(id) && $(id).value]).filter(([, v]) => v);
  const focus = document.activeElement && document.activeElement.id;
  lastHtml = html;
  root.innerHTML = html;
  for (const [id, v] of keep) if ($(id)) $(id).value = v;
  if (focus && $(focus)) $(focus).focus();
  const on = (id, fn) => { const e = $(id); if (e) e.onclick = fn; };
  on('rk-find', findMatch); on('rk-cancel', cancelQueue); on('rk-signout', signOut); on('rk-retry', checkServer);
  const f = $('rk-signin-form'); if (f) f.onsubmit = (e) => { e.preventDefault(); signIn($('rk-cs').value.trim(), $('rk-pin').value); };
  root.querySelectorAll('[data-rt]').forEach((b) => { b.onclick = () => { S.tab = b.dataset.rt; render(); }; });
}

/* ---------------- boot ---------------- */
function boot() {
  ensureOverlays();
  loadAccount();
  render();
  checkServer();
  // re-render the tab when it is opened (keeps cooldown timers fresh)
  document.querySelectorAll('[data-view="ranked"], [data-go="ranked"]').forEach((b) => b.addEventListener('click', () => { render(); if (S.server !== 'ok') checkServer(); }));
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && $('rk-end') && $('rk-end').classList.contains('on')) { screen('rk-end', false); openRankedView(); }
  });
  window.DillyRanked = { state: () => S, badgeSVG, showEnd, render, checkServer, findMatch, urls: { WS_URL, HTTP_BASE, HUB_API } };
}
if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', boot); else boot();
