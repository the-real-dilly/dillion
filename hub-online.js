/* ==========================================================================
   DILLY GAMING ONLINE HUB — Unified Accounts, Roleplay Servers,
   Private Hosted Games with Shareable Codes & Global Cross-Game Leaderboard
   ========================================================================== */
(() => {
  const API_BASE = window.DILLY_HUB_API || "https://apibuild.dillonmay.com";

  const DEFAULT_ROOMS = [
    { code: "RP-CITY", name: "Los Pepinos Serious RP — Main City", game: "dilly-gone-mad", mode: "Roleplay (RP)", host: "Dilly Gaming Official", is_private: false, is_rp: true, max_players: 32, players: 14 },
    { code: "RP-DRFT", name: "Midnight Street Racing & Car Meets RP", game: "dilly-gone-mad", mode: "Roleplay (RP)", host: "Los Pepinos Auto Club", is_private: false, is_rp: true, max_players: 24, players: 9 },
    { code: "STRK-01", name: "de_dustline Competitive 5v5 Ranked", game: "dilly-strike", mode: "Competitive 5v5", host: "Dilly Gaming Official", is_private: false, is_rp: false, max_players: 10, players: 8 },
    { code: "VRS-KNG", name: "Dillyverse Kingdoms — Faction Survival RP", game: "dillyverse", mode: "Survival RP", host: "Dilly Gaming Official", is_private: false, is_rp: true, max_players: 24, players: 11 }
  ];

  const DEFAULT_LEADERBOARD = [
    { callsign: "DillyBoss", rp_job: "Crime Boss", xp: 14800, strike_kills: 142, strike_hs: 68, mad_cash: 48500, verse_blocks: 1420 },
    { callsign: "OfficerBrine", rp_job: "LPPD Officer", xp: 11200, strike_kills: 98, strike_hs: 41, mad_cash: 29400, verse_blocks: 860 },
    { callsign: "DriftQueen", rp_job: "Street Racer", xp: 9650, strike_kills: 76, strike_hs: 33, mad_cash: 36200, verse_blocks: 540 },
    { callsign: "VoxelArchitect", rp_job: "Civilian", xp: 8900, strike_kills: 44, strike_hs: 18, mad_cash: 12800, verse_blocks: 2910 },
    { callsign: "MedicMay", rp_job: "EMS Medic", xp: 7400, strike_kills: 62, strike_hs: 29, mad_cash: 19500, verse_blocks: 720 }
  ];

  const STATE = {
    account: null,
    rooms: DEFAULT_ROOMS.slice(),
    leaderboard: DEFAULT_LEADERBOARD.slice(),
    roomTab: "rp",     // "rp" | "all" | "host" | "code"
    lbTab: "xp",       // "xp" | "strike" | "mad" | "verse"
    lastHosted: null
  };

  try {
    const saved = JSON.parse(localStorage.getItem("dilly_account_v1") || "null");
    if (saved && saved.callsign) STATE.account = saved;
  } catch (_) {}

  function gameUrl(game, code, isRp) {
    const q = new URLSearchParams();
    if (code) q.set("room", code);
    if (isRp) q.set("rp", "1");
    if (STATE.account) {
      q.set("name", STATE.account.callsign);
      if (STATE.account.rp_job) q.set("job", STATE.account.rp_job);
    }
    const qs = q.toString() ? "?" + q.toString() : "";
    if (game === "dilly-strike") return `dilly-strike/index.html${qs}`;
    if (game === "dillyverse") return `dillyverse/index.html${qs}`;
    return `dilly-gone-mad.html${qs}#play`;
  }

  function gameLabel(g) {
    if (g === "dilly-strike") return "🎯 Dilly Strike";
    if (g === "dillyverse") return "🧊 DillyVerse";
    return "🚗 Dilly Gone Mad";
  }

  function genLocalCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let s = "DL-";
    for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  }

  // Inject Obsidian/Gold Hub Styles
  const css = document.createElement("style");
  css.textContent = `
    #dilly-online-hub{max-width:1180px;margin:18px auto 56px;padding:0 20px;font-family:'Inter',system-ui,sans-serif;color:#f1f5f9;}
    .dg-hub-shell{background:linear-gradient(180deg,rgba(14,18,28,.92),rgba(9,12,18,.96));border:1px solid rgba(250,204,21,.22);border-radius:20px;padding:24px;box-shadow:0 24px 64px rgba(0,0,0,.55);}
    .dg-hub-top{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:14px;padding-bottom:18px;border-bottom:1px solid rgba(255,255,255,.08);margin-bottom:20px;}
    .dg-hub-kicker{font-size:11px;font-weight:800;letter-spacing:.18em;color:#facc15;text-transform:uppercase;}
    .dg-hub-top h2{margin:4px 0 0;font-family:'Space Grotesk',sans-serif;font-size:26px;letter-spacing:-.02em;color:#fff;}
    .dg-acct-bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);border-radius:14px;padding:10px 14px;}
    .dg-acct-bar input,.dg-acct-bar select,.dg-form input,.dg-form select{background:rgba(6,9,15,.85);border:1px solid rgba(255,255,255,.16);color:#fff;border-radius:9px;padding:8px 11px;font-size:13px;outline:none;}
    .dg-acct-bar input:focus,.dg-form input:focus{border-color:#facc15;}
    .dg-hub-grid{display:grid;grid-template-columns:1.35fr 1fr;gap:22px;}
    @media(max-width:920px){.dg-hub-grid{grid-template-columns:1fr;}}
    .dg-panel{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:18px;}
    .dg-tabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;}
    .dg-tab{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#cbd5e1;border-radius:999px;padding:6px 13px;font-size:12px;font-weight:700;cursor:pointer;transition:.14s;}
    .dg-tab.on,.dg-tab:hover{background:rgba(250,204,21,.18);border-color:#facc15;color:#fef08a;}
    .dg-room-list{display:flex;flex-direction:column;gap:9px;}
    .dg-room{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 14px;border-radius:12px;background:rgba(10,14,22,.78);border:1px solid rgba(255,255,255,.08);}
    .dg-room:hover{border-color:rgba(250,204,21,.4);}
    .dg-room-title{font-weight:800;font-size:14px;color:#fff;display:flex;align-items:center;gap:7px;flex-wrap:wrap;}
    .hub-pill{font-size:10px;font-weight:800;letter-spacing:.08em;padding:2px 7px;border-radius:999px;text-transform:uppercase;}
    .hub-pill.rp{background:rgba(56,189,248,.18);color:#7dd3fc;border:1px solid rgba(56,189,248,.4);}
    .hub-pill.code{background:rgba(250,204,21,.14);color:#fde047;border:1px solid rgba(250,204,21,.35);font-family:monospace;}
    .dg-room-meta{font-size:12px;color:#94a3b8;margin-top:3px;}
    .dg-btn{background:linear-gradient(180deg,#facc15,#ca8a04);color:#090b10;border:none;border-radius:9px;padding:8px 14px;font-size:12.5px;font-weight:800;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;gap:6px;white-space:nowrap;}
    .dg-btn.sec{background:rgba(255,255,255,.08);color:#f8fafc;border:1px solid rgba(255,255,255,.15);}
    .dg-btn.sec:hover{border-color:#facc15;color:#fde047;}
    .dg-form{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
    @media(max-width:560px){.dg-form{grid-template-columns:1fr;}}
    .dg-form label{display:flex;flex-direction:column;gap:4px;font-size:11.5px;font-weight:700;color:#94a3b8;}
    .dg-share-box{margin-top:12px;padding:12px 14px;border-radius:12px;background:rgba(34,197,94,.12);border:1px solid rgba(34,197,94,.45);display:flex;flex-direction:column;gap:8px;}
    .dg-lb-table{width:100%;border-collapse:collapse;font-size:13px;}
    .dg-lb-table th,.dg-lb-table td{padding:9px 8px;border-bottom:1px solid rgba(255,255,255,.07);text-align:left;}
    .dg-lb-table th{font-size:10.5px;letter-spacing:.12em;color:#94a3b8;text-transform:uppercase;}
    .dg-rank{font-weight:900;color:#facc15;width:28px;}
  `;
  document.head.appendChild(css);

  async function syncFromApi() {
    try {
      const [rRes, lRes] = await Promise.all([
        fetch(`${API_BASE}/api/rooms`, { cache: "no-store" }),
        fetch(`${API_BASE}/api/leaderboard`, { cache: "no-store" })
      ]);
      if (rRes.ok) {
        const j = await rRes.json();
        if (Array.isArray(j.rooms) && j.rooms.length) STATE.rooms = j.rooms;
      }
      if (lRes.ok) {
        const j = await lRes.json();
        if (Array.isArray(j.players) && j.players.length) STATE.leaderboard = j.players;
      }
      renderHub();
    } catch (_) {
      // Offline / local fallback already populated
    }
  }

  async function saveAccount(callsign, pin, rpJob) {
    const clean = String(callsign || "").trim().slice(0, 18) || "DillyPlayer";
    let profile = { callsign: clean, rp_job: rpJob || "Civilian", xp: 100, strike_kills: 0, strike_hs: 0, mad_cash: 250, verse_blocks: 0 };
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callsign: clean, pin: pin || "0000", rp_job: profile.rp_job })
      });
      if (res.ok) profile = await res.json();
    } catch (_) {}
    STATE.account = profile;
    try {
      localStorage.setItem("dilly_account_v1", JSON.stringify(profile));
      localStorage.setItem("dgm_mp_name", profile.callsign);
    } catch (_) {}
    renderHub();
    return profile;
  }

  async function createHostedRoom(opts) {
    const host = (STATE.account && STATE.account.callsign) || "DillyHost";
    let room = {
      code: genLocalCode(),
      name: opts.name || `${host}'s Lobby`,
      game: opts.game || "dilly-gone-mad",
      mode: opts.mode || "Roleplay (RP)",
      host,
      is_private: !!opts.is_private,
      is_rp: opts.mode.toLowerCase().includes("rp") || opts.mode.toLowerCase().includes("roleplay"),
      max_players: Number(opts.max_players) || 16,
      players: 1
    };
    try {
      const res = await fetch(`${API_BASE}/api/rooms/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(room)
      });
      if (res.ok) room = await res.json();
    } catch (_) {}
    STATE.lastHosted = room;
    if (!room.is_private) STATE.rooms.unshift(room);
    renderHub();
    return room;
  }

  async function resolveAndJoinCode(rawCode, fallbackGame) {
    const code = String(rawCode || "").trim().toUpperCase();
    if (!code) return null;
    let found = STATE.rooms.find((r) => r.code.toUpperCase() === code) || (STATE.lastHosted && STATE.lastHosted.code === code ? STATE.lastHosted : null);
    if (!found) {
      try {
        const res = await fetch(`${API_BASE}/api/rooms/code/${encodeURIComponent(code)}`);
        if (res.ok) found = await res.json();
      } catch (_) {}
    }
    const game = (found && found.game) || fallbackGame || "dilly-gone-mad";
    const isRp = found ? !!found.is_rp : code.startsWith("RP-");
    return { code, game, url: gameUrl(game, code, isRp), found };
  }

  function renderHub() {
    const root = document.getElementById("dilly-online-hub");
    if (!root) return;

    const acct = STATE.account;
    const acctHtml = acct
      ? `
        <div class="dg-acct-bar">
          <span class="hub-pill code">LVL ${Math.max(1, Math.floor(acct.xp / 500) + 1)}</span>
          <strong style="color:#fff;">${acct.callsign}</strong>
          <span class="hub-pill rp">${acct.rp_job}</span>
          <span style="font-size:12px;color:#94a3b8;">${acct.xp.toLocaleString()} XP</span>
          <button class="dg-btn sec" id="dg-acct-switch" style="padding:5px 10px;font-size:11.5px;">Switch</button>
        </div>
      `
      : `
        <div class="dg-acct-bar">
          <input id="dg-login-name" type="text" maxlength="16" placeholder="Callsign (e.g. DillyPro)" style="width:150px;">
          <select id="dg-login-job">
            <option value="Civilian">👤 Civilian</option>
            <option value="LPPD Officer">🚔 LPPD Officer</option>
            <option value="EMS Medic">🚑 EMS Medic</option>
            <option value="Mechanic">🔧 Mechanic</option>
            <option value="Crime Boss">💼 Crime Boss</option>
            <option value="Street Racer">🏎️ Street Racer</option>
          </select>
          <button class="dg-btn" id="dg-login-btn">Sign In / Save Profile</button>
        </div>
      `;

    // Left Panel: Roleplay Servers, All Servers, Host Private, Join by Code
    let leftBody = "";
    if (STATE.roomTab === "rp" || STATE.roomTab === "all") {
      const list = STATE.roomTab === "rp" ? STATE.rooms.filter((r) => r.is_rp) : STATE.rooms;
      leftBody = `<div class="dg-room-list">${list.map((r) => `
        <div class="dg-room">
          <div>
            <div class="dg-room-title">
              ${r.name}
              ${r.is_rp ? '<span class="hub-pill rp">RP SERVER</span>' : ''}
              <span class="hub-pill code">${r.code}</span>
            </div>
            <div class="dg-room-meta">${gameLabel(r.game)} · ${r.mode} · Host: ${r.host} · ${r.players}/${r.max_players} Online</div>
          </div>
          <a class="dg-btn" href="${gameUrl(r.game, r.code, r.is_rp)}">Join Server →</a>
        </div>
      `).join("")}</div>`;
    } else if (STATE.roomTab === "host") {
      const h = STATE.lastHosted;
      const inviteUrl = h ? new URL(gameUrl(h.game, h.code, h.is_rp), location.href).href : "";
      leftBody = `
        <div class="dg-form">
          <label>Lobby Name<input id="dg-h-name" type="text" maxlength="36" placeholder="Friday Night RP / 1v1"></label>
          <label>Game
            <select id="dg-h-game">
              <option value="dilly-gone-mad">🚗 Dilly Gone Mad</option>
              <option value="dilly-strike">🎯 Dilly Strike</option>
              <option value="dillyverse">🧊 DillyVerse</option>
            </select>
          </label>
          <label>Mode / Ruleset
            <select id="dg-h-mode">
              <option value="Roleplay (RP)">🚔 Roleplay (RP)</option>
              <option value="Free Roam">🌴 Free Roam</option>
              <option value="Competitive 5v5">🎯 Competitive 5v5</option>
              <option value="Survival RP">🧱 Survival RP</option>
            </select>
          </label>
          <label>Visibility
            <select id="dg-h-priv">
              <option value="true">🔒 Private (Shareable Code Only)</option>
              <option value="false">🌍 Public (Listed in Server Browser)</option>
            </select>
          </label>
        </div>
        <div style="margin-top:12px;">
          <button class="dg-btn" id="dg-h-submit">🚀 Create Hosted Lobby &amp; Generate Code</button>
        </div>
        ${h ? `
          <div class="dg-share-box" id="dg-hosted-box">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
              <div>
                <div style="font-size:11px;font-weight:800;color:#86efac;letter-spacing:.1em;">LOBBY READY · SHARE THIS CODE</div>
                <div style="font-size:24px;font-weight:900;font-family:monospace;color:#fff;letter-spacing:.12em;" id="dg-hosted-code">${h.code}</div>
              </div>
              <div style="display:flex;gap:6px;flex-wrap:wrap;">
                <button class="dg-btn sec" id="dg-copy-code">📋 Copy Code</button>
                <button class="dg-btn sec" id="dg-copy-link">🔗 Copy Invite Link</button>
                <a class="dg-btn" href="${gameUrl(h.game, h.code, h.is_rp)}">▶ Enter Lobby</a>
              </div>
            </div>
            <div style="font-size:11.5px;color:#bbf7d0;word-break:break-all;">Invite URL: ${inviteUrl}</div>
          </div>
        ` : ""}
      `;
    } else {
      leftBody = `
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
          <input id="dg-join-code-inp" type="text" maxlength="12" placeholder="Enter Code (e.g. DL-7K9P or RP-CITY)" style="flex:1;min-width:200px;background:rgba(6,9,15,.85);border:1px solid rgba(255,255,255,.18);color:#fff;border-radius:9px;padding:10px 12px;font-size:14px;font-family:monospace;text-transform:uppercase;">
          <select id="dg-join-game-fb" style="background:rgba(6,9,15,.85);border:1px solid rgba(255,255,255,.18);color:#fff;border-radius:9px;padding:10px 12px;font-size:13px;">
            <option value="dilly-gone-mad">🚗 Dilly Gone Mad</option>
            <option value="dilly-strike">🎯 Dilly Strike</option>
            <option value="dillyverse">🧊 DillyVerse</option>
          </select>
          <button class="dg-btn" id="dg-join-code-btn">🔑 Join Private Room</button>
        </div>
        <div id="dg-join-msg" style="margin-top:10px;font-size:12px;color:#94a3b8;">Have a friend's invite code? Paste it above to jump straight into their private server.</div>
      `;
    }

    // Right Panel: Global Leaderboard
    const sorted = STATE.leaderboard.slice().sort((a, b) => {
      if (STATE.lbTab === "strike") return b.strike_kills - a.strike_kills;
      if (STATE.lbTab === "mad") return b.mad_cash - a.mad_cash;
      if (STATE.lbTab === "verse") return b.verse_blocks - a.verse_blocks;
      return b.xp - a.xp;
    });
    const metricHdr = STATE.lbTab === "strike" ? "Kills (HS)" : STATE.lbTab === "mad" ? "Cash" : STATE.lbTab === "verse" ? "Blocks" : "Studio XP";
    const metricVal = (p) => {
      if (STATE.lbTab === "strike") return `<b>${p.strike_kills}</b> <span style="color:#94a3b8;font-size:11px;">(${p.strike_hs} HS)</span>`;
      if (STATE.lbTab === "mad") return `<b style="color:#4ade80;">$${p.mad_cash.toLocaleString()}</b>`;
      if (STATE.lbTab === "verse") return `<b>${p.verse_blocks.toLocaleString()}</b>`;
      return `<b style="color:#facc15;">${p.xp.toLocaleString()}</b>`;
    };

    root.innerHTML = `
      <div class="dg-hub-shell">
        <div class="dg-hub-top">
          <div>
            <div class="dg-hub-kicker">HA RUST + POSTGRESQL + REDIS · LIVE STUDIO NETWORK</div>
            <h2>Dilly Online Hub · Roleplay, Private Lobbies &amp; Leaderboards</h2>
          </div>
          ${acctHtml}
        </div>

        <div class="dg-hub-grid">
          <div class="dg-panel">
            <div class="dg-tabs">
              <button class="dg-tab${STATE.roomTab === "rp" ? " on" : ""}" data-rt="rp">🚔 Roleplay Servers</button>
              <button class="dg-tab${STATE.roomTab === "all" ? " on" : ""}" data-rt="all">🌍 All Servers</button>
              <button class="dg-tab${STATE.roomTab === "host" ? " on" : ""}" data-rt="host">🔒 Host Private Game</button>
              <button class="dg-tab${STATE.roomTab === "code" ? " on" : ""}" data-rt="code">🔑 Join by Code</button>
            </div>
            ${leftBody}
          </div>

          <div class="dg-panel">
            <div class="dg-tabs">
              <button class="dg-tab${STATE.lbTab === "xp" ? " on" : ""}" data-lt="xp">🏆 Global XP</button>
              <button class="dg-tab${STATE.lbTab === "strike" ? " on" : ""}" data-lt="strike">🎯 Strike</button>
              <button class="dg-tab${STATE.lbTab === "mad" ? " on" : ""}" data-lt="mad">🚗 Gone Mad</button>
              <button class="dg-tab${STATE.lbTab === "verse" ? " on" : ""}" data-lt="verse">🧊 DillyVerse</button>
            </div>
            <table class="dg-lb-table">
              <thead><tr><th>#</th><th>Player</th><th>RP Role</th><th>${metricHdr}</th></tr></thead>
              <tbody>
                ${sorted.slice(0, 7).map((p, i) => `
                  <tr>
                    <td class="dg-rank">${i + 1}</td>
                    <td><b>${p.callsign}</b></td>
                    <td><span class="hub-pill rp">${p.rp_job || "Civilian"}</span></td>
                    <td>${metricVal(p)}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    // Bind events
    root.querySelectorAll("[data-rt]").forEach((b) => { b.onclick = () => { STATE.roomTab = b.dataset.rt; renderHub(); }; });
    root.querySelectorAll("[data-lt]").forEach((b) => { b.onclick = () => { STATE.lbTab = b.dataset.lt; renderHub(); }; });

    const loginBtn = document.getElementById("dg-login-btn");
    if (loginBtn) {
      loginBtn.onclick = () => {
        const nm = document.getElementById("dg-login-name").value;
        const jb = document.getElementById("dg-login-job").value;
        saveAccount(nm, "0000", jb);
      };
    }
    const switchBtn = document.getElementById("dg-acct-switch");
    if (switchBtn) {
      switchBtn.onclick = () => { STATE.account = null; localStorage.removeItem("dilly_account_v1"); renderHub(); };
    }
    const hostBtn = document.getElementById("dg-h-submit");
    if (hostBtn) {
      hostBtn.onclick = () => {
        createHostedRoom({
          name: document.getElementById("dg-h-name").value,
          game: document.getElementById("dg-h-game").value,
          mode: document.getElementById("dg-h-mode").value,
          is_private: document.getElementById("dg-h-priv").value === "true"
        });
      };
    }
    const copyCodeBtn = document.getElementById("dg-copy-code");
    if (copyCodeBtn && STATE.lastHosted) {
      copyCodeBtn.onclick = () => {
        navigator.clipboard?.writeText(STATE.lastHosted.code).catch(() => {});
        copyCodeBtn.textContent = "✓ Copied!";
      };
    }
    const copyLinkBtn = document.getElementById("dg-copy-link");
    if (copyLinkBtn && STATE.lastHosted) {
      copyLinkBtn.onclick = () => {
        const u = new URL(gameUrl(STATE.lastHosted.game, STATE.lastHosted.code, STATE.lastHosted.is_rp), location.href).href;
        navigator.clipboard?.writeText(u).catch(() => {});
        copyLinkBtn.textContent = "✓ Link Copied!";
      };
    }
    const joinCodeBtn = document.getElementById("dg-join-code-btn");
    if (joinCodeBtn) {
      joinCodeBtn.onclick = async () => {
        const code = document.getElementById("dg-join-code-inp").value;
        const fb = document.getElementById("dg-join-game-fb").value;
        const res = await resolveAndJoinCode(code, fb);
        if (res) location.href = res.url;
        else document.getElementById("dg-join-msg").textContent = "Please enter a valid room code (e.g. DL-7K9P).";
      };
    }
  }

  window.DillyHub = {
    saveAccount,
    createHostedRoom,
    resolveAndJoinCode,
    get state() { return STATE; }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => { renderHub(); syncFromApi(); });
  } else {
    renderHub();
    syncFromApi();
  }
})();
