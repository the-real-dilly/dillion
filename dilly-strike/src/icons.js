/* ==========================================================================
   DILLY STRIKE — original inline-SVG icon set
   Weapon silhouettes drawn from our own fictional guns (Dill-47, Adder-S,
   Apex-50, Kodiak .50, Dilly Fang), gear, role glyphs and rank emblems.
   Everything here is drawn for this project; no third-party artwork.
   ========================================================================== */

// weapon silhouettes, viewBox 0 0 240 80 (barrel to the right)
const WEP = {
  // Dill-47: wood-stock assault rifle, curved magazine, gas tube
  vandal: `<path d="M4 34 9 26l44-3 5 6-5 11-36 6H6z"/><path d="M52 21h78v15H52z"/><path d="M130 24h46v10h-46z"/><path d="M128 18h52v4h-52z"/>
    <path d="M176 27h46v4h-46z"/><path d="M209 18h4v9h-4zM117 15h7v6h-7z"/><path d="M74 36h12l-4 21H70z"/>
    <path d="M97 36h18c1 11 4 20 10 28l-16 5c-6-10-10-21-12-33z"/><path d="M86 36h10v3c0 5-4 8-8 8h-3v-3h3c2 0 4-2 4-5z"/>`,
  // Adder-S: suppressed carbine, skeleton stock, flat-top rail, red-dot
  phantom: `<path d="M5 27h36v8H15l-6 10H4z"/><path d="M38 28h22v5H38z"/><path d="M58 22h68v14H58z"/><path d="M62 18h62v4H62z"/>
    <path d="M88 10h20v8H88z"/><path d="M92 6h12v4H92z"/><path d="M126 23h44v12h-44z"/><path d="M168 24h62a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3h-62z"/>
    <path d="M72 36h12l-4 21H68z"/><path d="M95 36h16l2 25H97z"/><path d="M84 36h9v2c0 5-3 8-7 8h-3v-3h3c2 0 3-2 3-4z"/>`,
  // Apex-50: bolt-action long rifle, thumbhole stock, long optic, brake
  operator: `<path d="M2 31 10 22l52 2 5 8-6 11H41l-6-7H25l-6 10H4z"/><path d="M60 24h74v10H60z"/><path d="M134 26h92v4h-92z"/><path d="M222 23h14v10h-14z"/>
    <path d="M74 11h50v7H74z"/><path d="M64 8h12v13H64zM120 9h12v11h-12z"/><path d="M84 18h4v6h-4zM108 18h4v6h-4z"/>
    <path d="M118 34h6l5 9-6 2z"/><path d="M64 34h12l-4 18H60z"/><path d="M92 34h13v11H92z"/><path d="M150 30h42v3h-42z"/>`,
  // Kodiak .50: heavy long-barrel revolver
  sheriff: `<path d="M70 20h104v12H70z"/><path d="M72 15h96v5H72z"/><path d="M168 12h5v8h-5z"/><path d="M50 17h38a4 4 0 0 1 4 4v15a4 4 0 0 1-4 4H50z"/>
    <path d="M38 16h14v24H38z"/><path d="M30 10h12l4 8H34z"/><path d="M38 38h22l2 8-12 26H28l4-20z"/>
    <path d="M62 40h8c0 8-5 13-12 13v-4c4 0 7-4 7-9z"/>`,
  // Dilly Fang: curved blade with finger ring
  knife: `<path d="M96 44c26-24 74-32 128-20-44-2-82 8-110 30z"/><path d="M62 40h40a6 6 0 0 1 0 12H62z"/>
    <path d="M52 34a12 12 0 1 1 0 24 12 12 0 0 1 0-24zm0 5a7 7 0 1 0 0 14 7 7 0 0 0 0-14z"/>`
};
const GEAR = {
  armor: '<path d="M120 6 92 16v20c0 18 12 32 28 38 16-6 28-20 28-38V16z"/><path d="M120 16v48c-10-5-18-15-18-28V23z" fill="rgba(0,0,0,.28)"/>',
  util: '<path d="m120 4 7 20 20-8-9 19 20 5-20 5 9 19-20-8-7 20-7-20-20 8 9-19-20-5 20-5-9-19 20 8z"/><circle cx="120" cy="40" r="7" fill="rgba(0,0,0,.35)"/>'
};
export function weaponSVG(id, cls = 'w-sil') {
  const body = WEP[id] || GEAR[id];
  if (!body) return '';
  return `<svg class="${cls}" viewBox="0 0 240 80" fill="currentColor" aria-hidden="true">${body}</svg>`;
}

// role glyphs, viewBox 0 0 24 24
const ROLE = {
  Duelist: '<path d="M12 2 4 10l3 1-3 11 8-7 8 7-3-11 3-1z"/>',
  Controller: '<path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 3a6 6 0 0 1 0 12V6z"/>',
  Sentinel: '<path d="M12 2 3 6v6c0 5 4 9 9 10 5-1 9-5 9-10V6zm0 6a4 4 0 1 1 0 8 4 4 0 0 1 0-8z"/>',
  Initiator: '<path d="M3 12 12 3l9 9-9 9zm9-5-5 5 5 5 5-5z"/><path d="M11 10h2v4h-2z"/>'
};
export function roleSVG(role) { return `<svg class="role-ico" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${ROLE[role] || ROLE.Duelist}</svg>`; }

// rank emblem: tier 0 = unranked, 1..6 climbing
const TIER_COL = ['#7d8794', '#9b7a5a', '#a9b4bf', '#e2bd5a', '#5fd0c0', '#8f7bff', '#ff5d6c'];
export function rankEmblem(tier = 0, cls = 'rank-ico') {
  const t = Math.max(0, Math.min(6, tier | 0)), c = TIER_COL[t];
  const chev = t === 0 ? '<path d="M8 11h8v2H8z" fill="#0f1923"/>'
    : Array.from({ length: Math.min(3, 1 + Math.floor((t - 1) / 2)) }, (_, i) => `<path d="m12 ${6 + i * 4} 5 3v2l-5-3-5 3v-2z" fill="#0f1923"/>`).join('');
  return `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1 21 6v12l-9 5-9-5V6z" fill="${c}"/><path d="M12 3.5 18.8 7.3v9.4L12 20.5 5.2 16.7V7.3z" fill="none" stroke="rgba(15,25,35,.35)"/>${chev}</svg>`;
}

// ultimate ring: n of max points
export function ultRing(n, max = 7) {
  const r = 20, C = 2 * Math.PI * r, seg = C / max, gap = 3;
  let arcs = '';
  for (let i = 0; i < max; i++) arcs += `<circle cx="24" cy="24" r="${r}" fill="none" stroke-width="3" class="${i < n ? 'on' : ''}" stroke-dasharray="${(seg - gap).toFixed(2)} ${(C - seg + gap).toFixed(2)}" stroke-dashoffset="${(-i * seg).toFixed(2)}" transform="rotate(-90 24 24)"/>`;
  return `<svg class="ult-ring" viewBox="0 0 48 48" aria-hidden="true">${arcs}</svg>`;
}

export const ICONS = { weaponSVG, roleSVG, rankEmblem, ultRing };
window.DillyIcons = ICONS;
