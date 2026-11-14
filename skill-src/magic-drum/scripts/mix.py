#!/usr/bin/env python3
"""Audio stage: voice + music bed + SFX -> mastered soundtrack.

Inputs: film folder (speech.json from speech.py, META events from the engine,
        sfx/*.ogg one-shots, optional user audio files).
Output: <folder>/audio/mix.wav (48k float32 internally, written as WAV).

Music beds are synthesized (no licensing): slow pads, drones, plucks per mood.
Voice always wins: sidechain ducking dips music/SFX under speech.
"""
import json, sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import ffmpeg, read_wav_f32, run, write_wav_f32

SKILL = Path(__file__).resolve().parent.parent
SFX = SKILL / "sfx"
SR = 48000

# ------------------------------ music beds --------------------------------

def _env_exp(n, decay):
    return np.exp(-np.linspace(0, decay, n))

def _pad_chord(freqs, dur, detune=0.15, level=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for f in freqs:
        for d in (-detune, detune):
            out += np.sin(2 * np.pi * (f + d) * t + f)
        out += 0.4 * np.sin(2 * np.pi * f * 2 * t)
    # slow swell handled by _seam crossfades; just normalize
    out *= level / max(1e-9, np.abs(out).max())
    return out

def _seam(a, b, xfade):
    k = min(xfade, len(a), len(b))
    n = int(k * SR)
    if n <= 0:
        return np.concatenate([a, b])
    ramp = np.linspace(0, 1, n)
    a2 = a[:-n].copy() if len(a) > n else a * 0
    a2[-n:] = a[-n:] * (1 - ramp) + b[:n] * ramp if len(a) > n else b[:n] * ramp
    return np.concatenate([a2, b[n:]])

def music_bed(mood, dur):
    n = int(dur * SR)
    if mood in (None, "", "none", "off"):
        return np.zeros(n)
    rng = np.random.default_rng(7)
    bed = np.zeros(n)

    if mood in ("warm", "cozy", "hopeful", "happy"):
        chords = [[261.6, 329.6, 392.0, 523.3], [220.0, 261.6, 329.6, 440.0], [174.6, 220.0, 261.6, 349.2], [196.0, 246.9, 293.7, 392.0]]
        step = 4.0
        t = 0.0; ci = 0
        while t < dur:
            c = _pad_chord(chords[ci % len(chords)], min(step + 0.5, dur - t), level=0.16)
            bed = _seam(bed[int(t * SR):], c, 0.5) if t > 0 else c
            if bed.size < n: bed = np.concatenate([bed, np.zeros(n - bed.size)])
            t += step; ci += 1

    elif mood in ("tense", "dark", "mystery"):
        t = np.arange(n) / SR
        drone = np.sin(2 * np.pi * 55 * t) + 0.6 * np.sin(2 * np.pi * 82.4 * t) + 0.35 * np.sin(2 * np.pi * 110.3 * t)
        wob = 0.75 + 0.25 * np.sin(2 * np.pi * 0.13 * t)
        bed = drone * wob * 0.11
        pulse = np.sin(2 * np.pi * 1.6 * t) ** 8 * 0.05 * (0.5 + 0.5 * np.sin(2 * np.pi * 0.07 * t))
        bed += pulse * (np.sin(2 * np.pi * 220 * t) * 0.5 + np.sin(2 * np.pi * 330 * t) * 0.3)

    elif mood in ("playful", "quirky", "light"):
        bpm = 104
        beat = 60 / bpm
        pent = [261.6, 293.7, 329.6, 392.0, 440.0, 523.3, 587.3]
        seq = [0, 2, 4, 2, 5, 4, 2, 0, 3, 5, 6, 5, 4, 2, 1, 0]
        t0 = 0.0; si = 0
        while t0 < dur:
            f = pent[seq[si % len(seq)]]
            ln = beat * 0.55
            m = int(ln * SR); tt = np.arange(m) / SR
            note = (np.sin(2 * np.pi * f * tt) + 0.3 * np.sin(2 * np.pi * f * 2 * tt)) * _env_exp(m, 6)
            i0 = int(t0 * SR); i1 = min(n, i0 + m)
            bed[i0:i1] += note[: i1 - i0] * 0.12
            t0 += beat / 2; si += 1

    elif mood in ("sad", "melancholy", "tender"):
        chords = [[220.0, 261.6, 329.6], [174.6, 220.0, 261.6], [164.8, 196.0, 246.9], [146.8, 174.6, 220.0]]
        step = 5.0
        t = 0.0; ci = 0
        while t < dur:
            c = _pad_chord(chords[ci % len(chords)], min(step + 1.0, dur - t), level=0.14)
            bed = _seam(bed[int(t * SR):], c, 0.8) if t > 0 else c
            if bed.size < n: bed = np.concatenate([bed, np.zeros(n - bed.size)])
            t += step; ci += 1

    if bed.size < n:
        bed = np.concatenate([bed, np.zeros(n - bed.size)])
    return bed[:n]

# --------------------------------- SFX ------------------------------------

SYNTH = {}

def synth_whoosh(dur=0.38, level=0.3):
    rng = np.random.default_rng(3)
    n = int(dur * SR)
    noise = rng.standard_normal(n)
    # crude time-varying band via chunk filtering
    out = np.zeros(n)
    chunk = SR // 12
    import scipy.signal as sp
    for i in range(0, n, chunk):
        seg = noise[i:i + chunk]
        f0 = 1800 * (1 - i / n) + 250
        b, a = sp.butter(2, [max(80, f0 - 500) / (SR / 2), min(f0 + 500, SR / 2 - 1) / (SR / 2)], btype="band")
        out[i:i + chunk] = sp.lfilter(b, a, seg)
    env = np.sin(np.linspace(0, np.pi, n)) ** 2
    return out * env * level

def synth_chime(level=0.4):
    n = int(1.1 * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for f, amp in [(1318.5, 1.0), (1975.5, 0.5), (2637.0, 0.3)]:
        out += amp * np.sin(2 * np.pi * f * t) * np.exp(-t * 4.5)
    return out * level

def synth_thud(level=0.5):
    n = int(0.35 * SR)
    t = np.arange(n) / SR
    out = np.sin(2 * np.pi * (90 - 40 * t / 0.35) * t) * np.exp(-t * 14)
    return out * level

def synth_pop(level=0.4):
    n = int(0.12 * SR)
    t = np.arange(n) / SR
    out = np.sin(2 * np.pi * (600 - 400 * t / 0.12) * t) * np.exp(-t * 40)
    return out * level

SYNTH["whoosh"] = synth_whoosh
SYNTH["chime"] = synth_chime
SYNTH["thud"] = synth_thud
SYNTH["pop"] = synth_pop

SFX_MAP = {
    "door": ["dooropen-1.ogg", "doorclose-1.ogg"],
    "doorclose": ["doorclose-2.ogg"],
    "dooropen": ["dooropen-2.ogg"],
    "bell": ["impactbell-heavy-000.ogg"],
    "glass": ["impactglass-light-000.ogg"],
    "metal": ["impactmetal-light-000.ogg"],
    "punch": ["impactpunch-medium-000.ogg"],
    "cloth": ["cloth1.ogg"],
    "creak": ["creak1.ogg"],
    "click": ["metalclick.ogg"],
    "latch": ["metallatch.ogg"],
    "book": ["bookplace1.ogg"],
}
SURFACE = {"street": "concrete", "cafe": "wood", "void": "carpet", "park": "grass", "room": "wood", "office": "concrete"}


def _load_sfx(kind, rng, surface="concrete"):
    if kind in SYNTH:
        return SYNTH[kind]()
    if kind == "step":
        names = [f"footstep-{surface}-{i:03d}.ogg" for i in range(5)]
    else:
        names = SFX_MAP.get(kind, [])
    if not names:
        return None
    f = SFX / rng.choice(names)
    if not f.exists():
        return None
    a, _ = read_wav_f32(f)
    return a


def duck_envelope(voice, dur):
    """1 -> duck amount 0..1 from voice loudness (smoothed peak follower)."""
    win = int(0.12 * SR)
    k = max(1, voice.size // win)
    e = np.abs(voice[: k * win]).reshape(k, win).max(axis=1)
    e = np.clip(e / 0.25, 0, 1)  # loud speech -> 1
    # smooth up/down
    import scipy.signal as sp
    e = sp.lfilter([0.12], [1.0, -0.88], np.concatenate([e, [0] * 12]))
    full = np.interp(np.arange(int(dur * SR)) / SR / win, np.arange(e.size), np.minimum(1, e))
    return np.clip(full, 0, 1)


def mix(folder, meta, speech_data, spec):
    folder = Path(folder)
    dur = meta["dur"] + 0.4
    n = int(dur * SR)
    voice = np.zeros(n)

    # 1. voice lines
    for ln in speech_data.get("lines", []):
        a, _ = read_wav_f32(folder / ln["file"])
        i0 = int(ln["t0"] * SR)
        seg = a[: max(0, n - i0)] * float(ln.get("gain", 1.0))
        voice[i0:i0 + seg.size] += seg
    pv = np.abs(voice).max()
    if pv > 1e-6:
        voice *= 0.72 / pv

    # 2. music with sidechain ducking
    mus = music_bed(spec.get("music", {}).get("mood", spec.get("mood", "warm")), dur)
    duck = duck_envelope(voice, dur)
    mus *= (1 - 0.75 * duck)

    # 3. sfx events
    sfx = np.zeros(n)
    rng = np.random.default_rng(11)
    surf = SURFACE.get(spec.get("surface", ""), "concrete")
    for ev in meta.get("events", []):
        kind = ev.get("kind")
        g = float(ev.get("gain") or (0.5 if kind == "step" else 0.8))
        a = _load_sfx(kind, rng, surf)
        if a is None:
            continue
        if kind == "step":
            a = a * (0.8 + 0.2 * rng.standard_normal())  # variation
        i0 = int(ev["t"] * SR)
        seg = a[: max(0, n - i0)] * g
        # duck sfx under speech too
        d0 = duck[i0:i0 + seg.size] if i0 < n else None
        if d0 is not None:
            seg = seg * (1 - 0.5 * d0)
        sfx[i0:i0 + seg.size] += seg

    # 4. master
    out = voice + mus + sfx
    out = np.tanh(out * 1.15)  # gentle glue
    # fades
    f = int(0.35 * SR)
    out[:f] *= np.linspace(0, 1, f)
    out[-f:] *= np.linspace(1, 0, f)
    p = np.abs(out).max()
    if p > 1e-6:
        out = out / p * (10 ** (-1.2 / 20))

    outp = folder / "audio" / "mix.wav"
    outp.parent.mkdir(parents=True, exist_ok=True)
    write_wav_f32(outp, out)
    print(f"mix: {outp.name} ({dur:.1f}s, peak {20*np.log10(max(p,1e-6)):.1f} dBFS)")
    return outp


if __name__ == "__main__":
    folder = sys.argv[1]
    meta = json.loads((Path(folder) / "meta.json").read_text(encoding="utf-8"))
    speech_data = json.loads((Path(folder) / "speech.json").read_text(encoding="utf-8"))
    spec = json.loads((Path(folder) / "film.json").read_text(encoding="utf-8"))
    mix(folder, meta, speech_data, spec)
