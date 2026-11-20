#!/usr/bin/env python3
"""Dilly Gone Mad - main theme ("Sunset in Los Pepinos"). Original composition, rendered with numpy.
104 BPM, A minor, 72 bars (~2:46). Writes theme.wav (stereo, 44.1 kHz)."""
import sys, wave
import numpy as np
import scipy.signal as sg

SR = 44100
BPM = 104
BEAT = 60 / BPM
BAR = 4 * BEAT
NB = 72
TAIL = 7.0
N = int((NB * BAR + TAIL) * SR)
rng = np.random.default_rng(7)


def mtof(m): return 440.0 * 2 ** ((m - 69) / 12)

# ---------------------------------------------------------------- oscillators
TN = 2048
TABLES = []
for b in range(10):
    ftop = 27.5 * 2 ** (b + 1)
    K = max(1, int(11000 / ftop))
    ph = np.arange(TN) / TN
    t = np.zeros(TN)
    for k in range(1, K + 1):
        t += np.sin(2 * np.pi * k * ph) / k
    t *= 2 / np.pi
    TABLES.append(np.append(t, t[0]))


def saw(freq, n, phase0=0.0):
    f = freq if np.ndim(freq) else np.full(n, float(freq))
    ph = (np.cumsum(f / SR) + phase0) % 1.0
    b = int(np.clip(np.log2(max(float(np.max(f)), 27.5) / 27.5), 0, 9))
    tab = TABLES[b]
    idx = ph * TN
    i0 = idx.astype(np.int64)
    fr = idx - i0
    return tab[i0] * (1 - fr) + tab[i0 + 1] * fr


def adsr(L, a, d, s, r):
    total = L + int(r * SR)
    t = np.arange(L) / SR
    atk = np.minimum(t / max(a, 1e-4), 1.0)
    dec = s + (1 - s) * np.exp(-np.maximum(t - a, 0) / max(d, 1e-4))
    e = np.zeros(total)
    e[:L] = atk * dec
    last = e[L - 1] if L > 0 else 0
    tr = np.arange(total - L) / SR
    e[L:] = last * np.exp(-tr / (r / 4)) * np.clip(1 - tr / r, 0, 1)
    return e


def lp(x, fc, order=2):
    return sg.sosfilt(sg.butter(order, min(fc, SR * 0.45) / (SR / 2), output="sos"), x, axis=-1)


def hp(x, fc, order=2):
    return sg.sosfilt(sg.butter(order, fc / (SR / 2), btype="high", output="sos"), x, axis=-1)


def bp(x, lo, hi, order=2):
    return sg.sosfilt(sg.butter(order, [lo / (SR / 2), hi / (SR / 2)], btype="band", output="sos"), x, axis=-1)


def supersaw(m, L, voices=7, det=14, a=0.01, d=0.3, s=0.8, r=0.25, cutoff=5000, vib=0.0):
    n = L + int(r * SR)
    f0 = mtof(m)
    t = np.arange(n) / SR
    vf = 1 + vib * np.clip(t / 0.6, 0, 1) * np.sin(2 * np.pi * 5.4 * t) if vib else 1.0
    out = np.zeros((2, n))
    offs = np.linspace(-det, det, voices)
    for i, c in enumerate(offs):
        x = saw(f0 * 2 ** (c / 1200) * vf, n, rng.random())
        pan = (i / (voices - 1)) if voices > 1 else 0.5
        out[0] += x * np.cos(pan * np.pi / 2)
        out[1] += x * np.sin(pan * np.pi / 2)
    out *= adsr(L, a, d, s, r) / voices * 1.6
    return lp(out, cutoff)


def pluck(m, L, pan=0.5):
    n = L + int(0.12 * SR)
    f0 = mtof(m)
    x = (saw(f0 * 1.003, n) + saw(f0 / 1.003, n, 0.3)) * 0.5
    t = np.arange(n) / SR
    ef = np.exp(-t / 0.10)
    y = lp(x, 1100) + (lp(x, 7000) - lp(x, 1100)) * ef
    y *= adsr(L, 0.002, 0.09, 0.2, 0.12)
    return np.stack([y * np.cos(pan * np.pi / 2), y * np.sin(pan * np.pi / 2)])


def bell(m, L, dec=1.4):
    n = L + int(dec * SR)
    t = np.arange(n) / SR
    f = mtof(m)
    idx = 3.0 * np.exp(-t / 0.5)
    y = np.sin(2 * np.pi * f * t + idx * np.sin(2 * np.pi * f * 3.5 * t)) * np.exp(-t / (dec * 0.6))
    y += 0.3 * np.sin(2 * np.pi * f * 2 * t) * np.exp(-t / 0.4)
    y *= np.minimum(t / 0.004, 1)
    return np.stack([y, y]) * 0.55


def pad(notes, L):
    n = L + int(1.0 * SR)
    out = np.zeros((2, n))
    for m in notes:
        v = supersaw(m, L, voices=5, det=11, a=0.5, d=2.0, s=0.9, r=0.9, cutoff=1600)
        out[:, : v.shape[1]] += v[:, :n]
    return out / len(notes) * 1.2


def noise(n): return rng.standard_normal(n)

# ---------------------------------------------------------------- drum one-shots
def kick():
    n = int(0.55 * SR); t = np.arange(n) / SR
    f = 46 + 130 * np.exp(-t / 0.032)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.21)
    click = hp(noise(n), 2500) * np.exp(-t / 0.004) * 0.25
    return np.tanh((body + click) * 1.6) * 0.95


def snare():
    n = int(0.6 * SR); t = np.arange(n) / SR
    nz = bp(noise(n), 1400, 9000) * np.exp(-t / 0.13)
    tone = np.sin(2 * np.pi * 185 * t * (1 + 0.2 * np.exp(-t / 0.02))) * np.exp(-t / 0.09)
    clap = np.zeros(n)
    for d in (0.0, 0.011, 0.024):
        i = int(d * SR)
        seg = bp(noise(n - i), 1100, 3200) * np.exp(-np.arange(n - i) / SR / 0.05)
        clap[i:] += seg * 0.8
    return np.tanh((nz * 0.9 + tone * 0.7 + clap * 0.8) * 1.4) * 0.8


def hat(open_=False):
    dur = 0.28 if open_ else 0.06
    n = int(dur * SR); t = np.arange(n) / SR
    return hp(noise(n), 7500) * np.exp(-t / (0.09 if open_ else 0.018)) * 0.5


def tom(f0):
    n = int(0.5 * SR); t = np.arange(n) / SR
    f = f0 * (1 + 0.5 * np.exp(-t / 0.05))
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.2) * 0.9


def crash():
    n = int(3.2 * SR); t = np.arange(n) / SR
    return hp(noise(n), 3500) * np.exp(-t / 0.9) * 0.55


def riser(bars):
    dur = bars * BAR; n = int(dur * SR); t = np.arange(n) / SR; u = t / dur
    nz = hp(noise(n), 1800) * u ** 2.2
    f = 180 * (10 ** (u))  # 180 -> 1800 Hz sweep
    sw = np.sin(2 * np.pi * np.cumsum(f) / SR) * u ** 2.5 * 0.5
    y = nz * 0.7 + sw
    return np.stack([y, y * 0.9]) * 0.6

# ---------------------------------------------------------------- helpers
def zbus(): return np.zeros((2, N))


def add(bus, sig, start, gain=1.0, pan=None):
    s = int(start * SR)
    if s >= N: return
    if sig.ndim == 1:
        p = 0.5 if pan is None else pan
        sig = np.stack([sig * np.cos(p * np.pi / 2), sig * np.sin(p * np.pi / 2)])
    e = min(N, s + sig.shape[1])
    bus[:, s:e] += sig[:, : e - s] * gain


def ir(len_s, decay, lpc=7000, hpc=200):
    n = int(len_s * SR); t = np.arange(n) / SR
    x = np.stack([noise(n), noise(n)]) * np.exp(-t / decay)
    x *= np.minimum(t / 0.01, 1)
    return hp(lp(x, lpc), hpc)


def reverb(x, impulse, wet=1.0):
    y = np.stack([sg.fftconvolve(x[c], impulse[c])[:N] for c in range(2)])
    return y * wet


def pingpong(x, delay_s, fb=0.42, taps=6):
    y = np.zeros_like(x)
    d = int(delay_s * SR)
    for k in range(1, taps + 1):
        sh = d * k
        if sh >= N: break
        a, b = (0, 1) if k % 2 else (1, 0)
        y[0, sh:] += x[a, : N - sh] * fb ** k
        y[1, sh:] += x[b, : N - sh] * fb ** k
    return y


def sidechain(kicks, depth=0.7, tau=0.14, rel=0.45):
    g = np.ones(N)
    L = int(rel * SR)
    tt = np.arange(L) / SR
    curve = 1 - depth * np.exp(-tt / tau)
    curve[: int(0.004 * SR)] *= np.linspace(0.3, 1, int(0.004 * SR))  # tiny attack
    for k in kicks:
        s = int(k * SR)
        e = min(N, s + L)
        if s < N: g[s:e] = np.minimum(g[s:e], curve[: e - s])
    return g

# ---------------------------------------------------------------- music data
AM = dict(bass=33, pad=[57, 60, 64], arp=[69, 72, 76, 81])
F_ = dict(bass=29, pad=[53, 57, 60], arp=[65, 69, 72, 77])
C_ = dict(bass=36, pad=[52, 55, 60], arp=[67, 72, 76, 79])
G_ = dict(bass=31, pad=[50, 55, 59], arp=[67, 71, 74, 79])
EM = dict(bass=28, pad=[52, 55, 59], arp=[64, 67, 71, 76])
MAIN = [AM, F_, C_, G_]
ALT = [F_, G_, AM, EM]

HOOK_A = [(0, 1.5, 76), (1.5, .5, 76), (2, 1, 81), (3, .5, 79), (3.5, .5, 76),
          (4, 1.5, 77), (5.5, .5, 77), (6, 1, 81), (7, 1, 84),
          (8, 1.5, 76), (9.5, .5, 76), (10, 1, 79), (11, 1, 79),
          (12, 1, 74), (13, 1, 71), (14, 1.5, 74), (15.5, .5, 76)]
HOOK_B = [(0, 1.5, 76), (1.5, .5, 76), (2, 1, 81), (3, 1, 83),
          (4, 1.5, 84), (5.5, .5, 81), (6, 1, 77), (7, 1, 81),
          (8, 1, 79), (9, 1, 76), (10, 1, 79), (11, 1, 84),
          (12, 1, 83), (13, 1, 79), (14, 2, 74)]

SECTIONS = [("intro", 0, 8), ("groove", 8, 24), ("chorus", 24, 40), ("break", 40, 48), ("final", 48, 64), ("outro", 64, 72)]
def section(bar):
    for name, a, b in SECTIONS:
        if a <= bar < b: return name, bar - a
    return "outro", 0

# ---------------------------------------------------------------- render
drums = zbus(); snr_bus = zbus(); bass = zbus(); padb = zbus(); arpb = zbus(); lead = zbus(); bells = zbus(); fx = zbus()
KICK, SNARE, HAT, OHAT, CRASH = kick(), snare(), hat(), hat(True), crash()
kick_times = []

ARP_PAT = [0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 2, 1, 0, 1, 2, 3]

for bar in range(NB):
    sec, i = section(bar)
    t0 = bar * BAR
    prog = ALT if sec == "break" else MAIN
    ch = prog[bar % 4]

    # pad: always
    pg = {"intro": 0.5 if bar < 4 else 0.7, "break": 0.9}.get(sec, 0.8 if sec != "outro" else 0.9)
    if sec == "outro" and i >= 4:
        pg = 0.9
    L = int(BAR * SR) if not (sec == "outro" and bar == NB - 1) else int(BAR * SR)
    add(padb, pad(ch["pad"], L), t0, pg)

    # arp
    arp_on = sec in ("groove", "chorus", "final") or (sec == "intro" and bar >= 4)
    if arp_on:
        vol = 0.5 if sec == "intro" else (0.75 if sec == "groove" else 0.85)
        for s in range(16):
            m = ch["arp"][ARP_PAT[s]]
            tn = t0 + s * BEAT / 4
            add(arpb, pluck(m, int(BEAT / 4 * SR * 0.9), pan=0.3 + 0.4 * (s % 2)), tn, vol * (1.0 if s % 4 == 0 else 0.8))

    # bass
    bass_on = sec in ("groove", "chorus", "final") or (sec == "break" and i >= 4)
    if bass_on:
        r = ch["bass"]
        if sec == "break":
            notes = [(0, 1.0, r), (1, 1.0, r), (2, 1.0, r), (3, 1.0, r)]
        else:
            notes = []
            for e8 in range(8):
                m = r + (12 if e8 in (2, 6) else 0)
                notes.append((e8 * 0.5, 0.45, m))
        for (b0, dur, m) in notes:
            n = int(dur * BEAT * SR); nn = n + int(0.07 * SR)
            x = lp(saw(mtof(m), nn), 650) * 0.9 + np.sin(2 * np.pi * mtof(m - 12 if m > 28 else m) * np.arange(nn) / SR) * 0.6
            x *= adsr(n, 0.004, 0.12, 0.7, 0.07)
            add(bass, x, t0 + b0 * BEAT, 0.75)

    # drums
    drums_on = sec in ("groove", "chorus", "final")
    if drums_on:
        full = sec != "groove" or i >= 8
        for bt in (0, 2):
            add(drums, KICK, t0 + bt * BEAT, 0.95); kick_times.append(t0 + bt * BEAT)
        add(drums, KICK, t0 + 2.5 * BEAT, 0.7); kick_times.append(t0 + 2.5 * BEAT)
        if bar % 2 == 1:
            add(drums, KICK, t0 + 3.5 * BEAT, 0.6); kick_times.append(t0 + 3.5 * BEAT)
        for bt in (1, 3):
            add(snr_bus, SNARE, t0 + bt * BEAT, 0.9)
        for e8 in range(8):
            add(drums, HAT, t0 + e8 * BEAT / 2, 0.45 if e8 % 2 == 0 else 0.7)
        add(drums, OHAT, t0 + 1.5 * BEAT, 0.35); add(drums, OHAT, t0 + 3.5 * BEAT, 0.35)
        if full:
            for s16 in (3, 7, 11, 15):
                add(drums, HAT, t0 + s16 * BEAT / 4, 0.25)
        # fills every 8th bar end
        if i % 8 == 7:
            for k, f0 in enumerate([210, 180, 150, 120]):
                add(drums, tom(f0), t0 + (3 + k * 0.25) * BEAT, 0.85)
        if i == 0 and sec in ("chorus", "final"):
            add(fx, CRASH, t0, 0.9)
    if sec == "groove" and i == 0:
        add(fx, CRASH, t0, 0.8)
    if sec == "intro" and bar == 7:  # snare roll into groove
        for k in range(16):
            add(snr_bus, SNARE, t0 + 2 * BEAT + k * BEAT / 4 * (2 / 4) * 2 / 2, 0.25 + 0.04 * k)
    if sec == "break" and i == 7:
        for k in range(8):
            add(snr_bus, SNARE, t0 + 2 * BEAT + k * BEAT / 4, 0.25 + 0.07 * k)
    if sec == "outro" and i == 0:
        add(fx, CRASH, t0, 0.6)

# risers
add(fx, riser(2), 6 * BAR, 0.8); add(fx, riser(2), 22 * BAR, 0.9); add(fx, riser(2), 38 * BAR, 0.9)
add(fx, riser(2), 46 * BAR, 1.0)
add(fx, CRASH, 40 * BAR, 0.7); add(fx, CRASH, 48 * BAR, 1.0)

# lead hooks (4-bar phrases)
def play_hook(phrase, start_bar, octave=0, vol=0.8, double=False, vib=0.004):
    for (b0, dur, m) in phrase:
        L = int(dur * BEAT * SR * 0.95)
        v = supersaw(m + octave, L, voices=7, det=13, a=0.012, d=0.25, s=0.85, r=0.3, cutoff=5200, vib=vib if dur >= 1 else 0)
        add(lead, v, start_bar * BAR + b0 * BEAT, vol)
        if double:
            v2 = supersaw(m + 12, L, voices=5, det=9, a=0.012, d=0.25, s=0.75, r=0.3, cutoff=6500)
            add(lead, v2, start_bar * BAR + b0 * BEAT, vol * 0.45)

for sb, dbl in ((24, False), (48, True)):
    for k, ph in enumerate((HOOK_A, HOOK_B, HOOK_A, HOOK_B)):
        play_hook(ph, sb + 4 * k, 0, 0.85, dbl)

# intro tease: bells play hook A over bars 4-7, soft
for (b0, dur, m) in HOOK_A:
    add(bells, bell(m + 12, int(dur * BEAT * SR)), 4 * BAR + b0 * BEAT, 0.55)
# break: slow bell melody
for k, (b0, dur, m) in enumerate([(0, 3, 77), (4, 3, 79), (8, 3, 81), (12, 3, 76)]):
    add(bells, bell(m + 12, int(dur * BEAT * SR), 2.2), 40 * BAR + b0 * BEAT * 2, 0.6)
for k, (b0, dur, m) in enumerate([(0, 3, 77), (4, 3, 79), (8, 4, 81), (12, 4, 83)]):
    add(lead, supersaw(m, int(dur * BEAT * 2 * SR * 0.9), voices=5, det=10, a=0.2, d=0.5, s=0.8, r=0.6, cutoff=3500, vib=0.003), 44 * BAR + b0 * BEAT * 2 - 0 * BAR, 0.55)
# outro: lingering bells then low boom
for k, m in enumerate([81, 76, 72, 69, 76, 72, 69, 64]):
    add(bells, bell(m, int(BEAT * SR)), 64 * BAR + k * BEAT * 2, 0.5 * (1 - k * 0.09))
boom_n = int(4.0 * SR); tb = np.arange(boom_n) / SR
add(fx, np.sin(2 * np.pi * 36 * tb) * np.exp(-tb / 1.4) * 0.9, 64 * BAR, 0.8)

# ---------------------------------------------------------------- mix
sc = sidechain(kick_times)
sc_soft = 1 - (1 - sc) * 0.55
padb *= sc_soft; arpb *= sc_soft ** 1.3; bass *= sc

R_big = ir(2.8, 0.9, 6500, 250)
R_snare = ir(0.5, 0.12, 8000, 300)
R_short = ir(1.1, 0.3, 7500, 250)

delay_lead = pingpong(lead, BEAT * 0.75, 0.45)
delay_arp = pingpong(arpb, BEAT * 0.75, 0.35, 4)

mix = (drums * 0.85 + snr_bus * 0.8 + reverb(snr_bus, R_snare, 0.7) + bass * 0.95 + padb * 0.55 + arpb * 0.55 + delay_arp * 0.28
       + lead * 0.7 + delay_lead * 0.35 + bells * 0.7 + fx * 0.7)
wet = reverb(padb, R_big, 0.35) + reverb(arpb, R_short, 0.3) + reverb(lead + delay_lead * 0.5, R_big, 0.45) + reverb(bells, R_big, 0.8) + reverb(fx, R_big, 0.3)
mix = mix + wet * 0.85

# --- section leveler: shape the dynamics so the song builds (targets in dBFS RMS per section)
TARGET = {"intro": -17.5, "groove": -15.0, "chorus": -13.2, "break": -16.0, "final": -12.4, "outro": -18.0}
centers, gdb = [], []
for b in range(NB):
    seg = mix[:, int(b * BAR * SR):int((b + 1) * BAR * SR)]
    rms = 20 * np.log10(np.sqrt((seg ** 2).mean()) + 1e-9)
    name, _ = section(b)
    gdb.append(TARGET[name] - rms)
    centers.append((b + 0.5) * BAR * SR)
gdb = np.clip(np.array(gdb) - np.mean(gdb), -9, 9)  # relative balance only (overall level is set later)
gdb = np.convolve(np.pad(gdb, 1, mode="edge"), [0.25, 0.5, 0.25], mode="valid")  # smooth across bars
gain = 10 ** (np.interp(np.arange(N), centers, gdb) / 20)
mix = mix * gain
mix = hp(mix, 28)
# gentle stereo glue and master saturation
peak = np.max(np.abs(mix))
mix = np.tanh(mix / peak * 1.35) / np.tanh(1.35)
# fade out last 5 s
fo = int(5 * SR)
mix[:, -fo:] *= np.linspace(1, 0, fo)
mix *= 0.92

out = np.clip(mix.T, -1, 1)
pcm = (out * 32767).astype("<i2")
with wave.open(sys.argv[1] if len(sys.argv) > 1 else "theme.wav", "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print("rendered", N / SR, "s")
