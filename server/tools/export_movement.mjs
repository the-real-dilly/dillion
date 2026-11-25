// Records a scripted input sequence through the JS sim (one player, no bots) and the resulting
// positions, so the Rust port can replay it (cargo test --test movement).
// Usage: node server/tools/export_movement.mjs
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const here = dirname(fileURLToPath(import.meta.url));
const lz = join(here, "../../last-zone/");
const Wm = await import(lz + "world.js");
const Sm = await import(lz + "sim.js");
const W = Wm.buildWorld();
const traces = [];
function run(name, seed, setup, script, ticks) {
  const M = Sm.createMatch(W, { seed });
  const p = Sm.addPlayer(M, "Dilly", { human: true });
  setup && setup(M, p);
  const start = setup ? [p.x, p.y, p.z] : null;
  const frames = [];
  for (let k = 0; k < ticks; k++) {
    const i = script(k, p, M), q = (v) => Math.round(v * 1e4) / 1e4;
    for (const key of ["mx", "mz", "yaw"]) if (i[key] != null) i[key] = q(i[key]);
    Object.assign(p.inp, { mx: 0, mz: 0, yaw: p.inp.yaw, pitch: 0, sprint: false, crouch: false, jump: false }, i);
    const rec = [p.inp.mx, p.inp.mz, p.inp.yaw, p.inp.pitch, p.inp.jump ? 1 : 0, p.inp.sprint ? 1 : 0, p.inp.crouch ? 1 : 0];
    Sm.step(M, Sm.DT);
    const st = ["plane", "fall", "chute", "ground", "dead"].indexOf(p.st);
    frames.push(k % 10 === 9 ? [...rec, +p.x.toFixed(5), +p.y.toFixed(5), +p.z.toFixed(5), st, p.onGround ? 1 : 0] : rec);
  }
  traces.push({ name, seed, start, frames });
}
// 1. plane -> jump -> free-fall steering -> chute -> landing -> running about
run("drop", 5, null, (k, p, M) => {
  const yaw = Math.sin(k * 0.01) * 2;
  if (k < 300) return { yaw, jump: k === 260 };
  if (p.st === "fall") return { yaw, mz: 1, sprint: k % 400 < 200, mx: Math.sin(k * 0.05) };
  if (p.st === "chute") return { yaw, mz: k % 300 < 200 ? 1 : 0, mx: Math.cos(k * 0.03) * 0.5 };
  return { yaw: yaw + k * 0.002, mz: 1, sprint: k % 240 < 160, jump: k % 90 === 0, crouch: k % 500 > 450, mx: Math.sin(k * 0.02) * 0.6 };
}, 3600);
// 2. Los Pepinos street level: kerbs, doorways, walls, a pier
run("town", 9, (M, p) => { Object.assign(p, { st: "ground", x: 437, z: 470, y: Wm.groundAt(W, 437, 470, 999), onGround: true }); }, (k) => {
  const yaw = k < 600 ? 0.3 : k < 1200 ? 1.9 : k < 1800 ? -2.4 : 3.0 + Math.sin(k * 0.01);
  return { yaw, mz: 1, sprint: k % 300 < 220, jump: k % 75 === 0, mx: Math.sin(k * 0.013), crouch: k % 400 > 360 };
}, 2400);
// 3. compound: walls, buildings, sandbags, hillside
run("compound", 11, (M, p) => { Object.assign(p, { st: "ground", x: -40, z: 60, y: Wm.groundAt(W, -40, 60, 999), onGround: true }); }, (k) => {
  return { yaw: k * 0.004, mz: k % 200 < 150 ? 1 : -1, sprint: k % 500 < 300, jump: k % 60 === 0, mx: Math.cos(k * 0.021) };
}, 2400);
writeFileSync(join(here, "../tests/golden/movement.json"), JSON.stringify(traces));
console.log(traces.map((t) => t.name + ":" + t.frames.length + " last " + t.frames[t.frames.length - 1].slice(7, 10).map((v) => v.toFixed(2)).join(",")).join("  "));
