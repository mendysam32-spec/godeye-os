#!/usr/bin/env python3
"""Generates the sound effects and the background music of the reel template, from scratch.

Every sound is synthesized here (sines, filtered noise, envelopes), so the files are original and free to share.
The output is deterministic: the same command always writes the same files.

Writes 48 kHz 16-bit stereo WAV files:
  <public>/sfx/pop.wav, pop-high, tick, key, click, stamp, ding, chime, whoosh, whoosh-short,
               sparkles, impact, riser, swoosh-up, power-off
  <public>/music/soft.wav   calm ambient pad, 180 s, loops seamlessly, peak about -6 dBFS

Usage: python3 make_sounds.py <public dir> [--force] [--only NAME ...]
  Existing files are kept unless --force is given.
"""
import argparse
import sys
import wave
from pathlib import Path

import numpy as np

SR = 48000
SEED = 20261104


# ---------------------------------------------------------------- helpers

def t_axis(dur):
    return np.arange(int(round(dur * SR))) / SR


def rng_for(name):
    return np.random.default_rng([SEED, sum(ord(c) * (i + 1) for i, c in enumerate(name))])


def db(x):
    return 10 ** (x / 20)


def fade(x, fade_in=0.0, fade_out=0.0):
    """Short raised-cosine fades so no file starts or ends with a click."""
    x = x.copy()
    n = x.shape[-1]
    if fade_in > 0:
        k = min(n, max(1, int(fade_in * SR)))
        x[..., :k] *= 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, k))
    if fade_out > 0:
        k = min(n, max(1, int(fade_out * SR)))
        x[..., n - k:] *= 0.5 + 0.5 * np.cos(np.linspace(0, np.pi, k))
    return x


def sweep(f0, f1, dur, curve='exp'):
    """Phase of a sine whose frequency glides from f0 to f1 over dur."""
    t = t_axis(dur)
    if curve == 'exp':
        f = f0 * (f1 / f0) ** (t / dur)
    else:
        f = f0 + (f1 - f0) * (t / dur)
    return 2 * np.pi * np.cumsum(f) / SR, f


def fft_filter(x, gain_fn):
    """Zero-phase filter in the frequency domain. gain_fn maps an array of Hz to linear gain."""
    n = x.shape[-1]
    spec = np.fft.rfft(x, axis=-1)
    spec *= gain_fn(np.fft.rfftfreq(n, 1 / SR))
    return np.fft.irfft(spec, n, axis=-1)


def lowpass(fc, order=2):
    return lambda f: 1 / np.sqrt(1 + (f / fc) ** (2 * order))


def highpass(fc, order=2):
    return lambda f: 1 / np.sqrt(1 + (fc / np.maximum(f, 1e-3)) ** (2 * order))


def bandpass(fc, octaves):
    return lambda f: np.exp(-0.5 * (np.log2(np.maximum(f, 1e-3) / fc) / (octaves / 2)) ** 2)


def moving_noise(dur, center, width_oct, rng, nfft=1024, hop=256):
    """Noise whose pass band follows center(t) (Hz). Built frame by frame with overlap-add."""
    n = int(round(dur * SR))
    win = np.hanning(nfft)
    frames = (n + nfft) // hop + 1
    out = np.zeros(frames * hop + nfft)
    freqs = np.fft.rfftfreq(nfft, 1 / SR)
    times = (np.arange(frames) * hop - nfft / 2) / SR
    fc = np.clip(center(np.clip(times, 0, dur)), 40, SR / 2 - 500)
    for i in range(frames):
        spec = np.fft.rfft(rng.standard_normal(nfft) * win)
        g = np.exp(-0.5 * (np.log2(np.maximum(freqs, 1) / fc[i]) / (width_oct / 2)) ** 2)
        out[i * hop:i * hop + nfft] += np.fft.irfft(spec * g, nfft) * win
    out = out[nfft // 2:nfft // 2 + n]
    return out / (np.abs(out).max() + 1e-12)


def stereo(left, right=None):
    return np.vstack([left, left if right is None else right])


def widen(mono, rng, amount=0.15, delay_ms=0.4):
    """Light stereo width: a tiny delay and a bit of decorrelated noise color between channels."""
    d = int(delay_ms * SR / 1000)
    r = np.concatenate([np.zeros(d), mono[:len(mono) - d]]) if d else mono
    l = mono * (1 - amount) + r * amount
    r = r * (1 - amount) + mono * amount
    return stereo(l, r)


def normalize(x, peak_db=-1.0):
    return x / (np.abs(x).max() + 1e-12) * db(peak_db)


def write_wav(path, x):
    x = np.atleast_2d(x)
    if x.shape[0] == 1:
        x = np.vstack([x, x])
    pcm = np.clip(np.round(x.T * 32767), -32768, 32767).astype('<i2')
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


# ---------------------------------------------------------------- sound effects

def pop_sound(name, f_start, f_end):
    rng = rng_for(name)
    dur = 0.14
    t = t_axis(dur)
    ph, _ = sweep(f_start, f_end, 0.05)
    ph = np.concatenate([ph, ph[-1] + 2 * np.pi * f_end * np.arange(1, len(t) - len(ph) + 1) / SR])
    body = np.sin(ph) * np.exp(-t / 0.045)
    body += 0.25 * np.sin(2 * ph) * np.exp(-t / 0.015)
    click = fft_filter(rng.standard_normal(len(t)), highpass(3000)) * np.exp(-t / 0.002) * 0.35
    x = body + click
    return stereo(fade(normalize(x), 0.0005, 0.01))


def sfx_pop():
    return pop_sound('pop', 620, 300)


def sfx_pop_high():
    return pop_sound('pop-high', 1100, 540)


def sfx_tick():
    rng = rng_for('tick')
    dur = 0.03
    t = t_axis(dur)
    tone = np.sin(2 * np.pi * 3800 * t) * np.exp(-t / 0.008)
    noise = fft_filter(rng.standard_normal(len(t)), highpass(5000)) * np.exp(-t / 0.003)
    x = tone * 0.8 + noise * 0.5
    return stereo(fade(normalize(x), 0.0002, 0.004))


def sfx_key():
    rng = rng_for('key')
    dur = 0.06
    t = t_axis(dur)
    thump = np.sin(2 * np.pi * 140 * t) * np.exp(-t / 0.012)
    clack = fft_filter(rng.standard_normal(len(t)), bandpass(3500, 2.0)) * np.exp(-t / 0.004)
    # the key bottoms out a few ms later: a second, softer clack
    t2 = np.clip(t - 0.018, 0, None)
    clack2 = fft_filter(rng.standard_normal(len(t)), bandpass(2200, 2.0)) * np.exp(-t2 / 0.004) * (t > 0.018)
    x = thump * 0.7 + clack * 0.9 + clack2 * 0.4
    return stereo(fade(normalize(x), 0.0002, 0.008))


def sfx_click():
    rng = rng_for('click')
    dur = 0.05
    t = t_axis(dur)
    noise = fft_filter(rng.standard_normal(len(t)), highpass(4000)) * np.exp(-t / 0.0028)
    tone = np.sin(2 * np.pi * 2300 * t) * np.exp(-t / 0.008)
    x = noise + tone * 0.45
    return stereo(fade(normalize(x), 0.0002, 0.01))


def sfx_stamp():
    rng = rng_for('stamp')
    dur = 0.4
    t = t_axis(dur)
    ph, _ = sweep(110, 55, 0.12)
    ph = np.concatenate([ph, ph[-1] + 2 * np.pi * 55 * np.arange(1, len(t) - len(ph) + 1) / SR])
    boom = np.sin(ph) * np.exp(-t / 0.07)
    slap = fft_filter(rng.standard_normal(len(t)), bandpass(900, 2.5)) * np.exp(-t / 0.018)
    thud = fft_filter(rng.standard_normal(len(t)), lowpass(400, 2)) * np.exp(-t / 0.05)
    x = boom * 1.0 + slap * 0.6 + thud * 0.5
    x = np.tanh(1.8 * x / np.abs(x).max())
    return widen(fade(normalize(x), 0.0005, 0.05), rng, 0.12)


def bell(freq, t, decay, partials=((1, 1.0), (2.76, 0.35), (5.4, 0.15), (8.93, 0.06))):
    x = np.zeros_like(t)
    for ratio, amp in partials:
        x += amp * np.sin(2 * np.pi * freq * ratio * t) * np.exp(-t * ratio ** 0.7 / decay)
    attack = 1 - np.exp(-t / 0.0015)
    return x * attack


def sfx_ding():
    rng = rng_for('ding')
    dur = 1.6
    t = t_axis(dur)
    x = bell(1319, t, 1.1) + 0.25 * bell(1319 * 2.0, t, 0.5, ((1, 1.0),))
    left = x + 0.15 * bell(1321.5, t, 1.0, ((1, 1.0),))
    right = x + 0.15 * bell(1316.5, t, 1.0, ((1, 1.0),))
    return fade(normalize(stereo(left, right)), 0.0005, 0.3)


def sfx_chime():
    dur = 1.01
    t = t_axis(dur)
    notes = [(0.00, 659.25, -0.4), (0.07, 987.77, 0.0), (0.14, 1318.5, 0.4)]  # E5, B5, E6 rising arpeggio
    left = np.zeros_like(t)
    right = np.zeros_like(t)
    for start, f, pan in notes:
        tt = np.clip(t - start, 0, None)
        v = bell(f, tt, 0.45, ((1, 1.0), (2.0, 0.2), (3.0, 0.08))) * (t >= start)
        left += v * (1 - pan) / 2
        right += v * (1 + pan) / 2
    return fade(normalize(stereo(left, right)), 0.0005, 0.25)


def whoosh(name, dur, peak_at, f_lo, f_hi):
    rng = rng_for(name)
    t = t_axis(dur)
    u = t / dur
    p = peak_at / dur
    # pass band rises toward the peak then falls, like an object passing by
    center = lambda tt: f_lo + (f_hi - f_lo) * np.exp(-0.5 * ((tt / dur - p) / 0.28) ** 2)
    nl = moving_noise(dur, center, 1.6, rng)
    nr = moving_noise(dur, center, 1.6, rng)
    env = np.where(u < p, (u / p) ** 1.6, np.exp(-(u - p) / ((1 - p) * 0.45)))
    pan = np.clip((u - p) * 1.2, -0.6, 0.6)  # moves from left to right
    x = stereo(nl * env * (1 - pan), nr * env * (1 + pan))
    return fade(normalize(x), 0.005, 0.03)


def sfx_whoosh():
    return whoosh('whoosh', 0.7, 0.38, 900, 4500)


def sfx_whoosh_short():
    return whoosh('whoosh-short', 0.4, 0.2, 1100, 5000)


def sfx_sparkles():
    rng = rng_for('sparkles')
    dur = 1.0
    t = t_axis(dur)
    left = np.zeros_like(t)
    right = np.zeros_like(t)
    count = 26
    starts = np.sort(rng.uniform(0.0, 0.72, count) ** 1.3)
    for s in starts:
        f = rng.uniform(2400, 7500)
        amp = rng.uniform(0.35, 1.0) * (1 - 0.6 * s / 0.8)
        pan = rng.uniform(-0.9, 0.9)
        tt = np.clip(t - s, 0, None)
        v = (np.sin(2 * np.pi * f * tt) + 0.3 * np.sin(2 * np.pi * f * 2.01 * tt)) * np.exp(-tt / rng.uniform(0.02, 0.06))
        v *= (t >= s) * (1 - np.exp(-tt / 0.0008))
        left += v * amp * (1 - pan) / 2
        right += v * amp * (1 + pan) / 2
    air = moving_noise(dur, lambda tt: 7000 + 0 * tt, 1.2, rng) * np.exp(-((t - 0.25) / 0.25) ** 2) * 0.08
    x = stereo(left + air, right + air)
    return fade(normalize(x, -1.6), 0.002, 0.15)


def sfx_impact():
    rng = rng_for('impact')
    dur = 2.2
    t = t_axis(dur)
    ph, _ = sweep(85, 32, 0.6)
    ph = np.concatenate([ph, ph[-1] + 2 * np.pi * 32 * np.arange(1, len(t) - len(ph) + 1) / SR])
    sub = np.sin(ph) * np.exp(-t / 0.55)
    hit = fft_filter(rng.standard_normal(len(t)), lowpass(1800, 2)) * np.exp(-t / 0.035)
    rumble_l = fft_filter(rng.standard_normal(len(t)), bandpass(180, 2.0)) * np.exp(-t / 0.5)
    rumble_r = fft_filter(rng.standard_normal(len(t)), bandpass(180, 2.0)) * np.exp(-t / 0.5)
    base = sub * 1.0 + hit * 0.55
    x = stereo(base + rumble_l * 0.35, base + rumble_r * 0.35)
    x = np.tanh(1.5 * x / np.abs(x).max())
    return fade(normalize(x), 0.0005, 0.4)


def sfx_riser():
    rng = rng_for('riser')
    dur = 3.0
    t = t_axis(dur)
    u = t / dur
    center = lambda tt: 500 * (14000 / 500) ** ((tt / dur) ** 1.4)
    nl = moving_noise(dur, center, 1.4, rng)
    nr = moving_noise(dur, center, 1.4, rng)
    ph, _ = sweep(180, 1400, dur)
    tone = np.sin(ph) + 0.4 * np.sin(2 * ph + 0.3) + 0.2 * np.sin(3 * ph)
    trem = 1 - 0.25 * (0.5 + 0.5 * np.sin(2 * np.pi * np.cumsum(4 + 14 * u) / SR))
    env = u ** 2.6
    left = (nl * 0.8 + tone * 0.35) * env * trem
    right = (nr * 0.8 + tone * 0.35) * env * trem
    return fade(normalize(stereo(left, right), -0.5), 0.01, 0.04)


def sfx_swoosh_up():
    rng = rng_for('swoosh-up')
    dur = 0.9
    t = t_axis(dur)
    u = t / dur
    p = 0.68 / dur
    center = lambda tt: 700 * (6500 / 700) ** np.clip(tt / 0.7, 0, 1)
    nl = moving_noise(dur, center, 1.3, rng)
    nr = moving_noise(dur, center, 1.3, rng)
    env = np.where(u < p, (u / p) ** 1.8, np.exp(-(u - p) / 0.06))
    return fade(normalize(stereo(nl * env, nr * env), -0.5), 0.005, 0.04)


def sfx_power_off():
    rng = rng_for('power-off')
    dur = 0.55
    t = t_axis(dur)
    ph, f = sweep(640, 45, dur)
    tone = np.sin(ph) + 0.35 * np.sin(2 * ph) + 0.15 * np.sin(3 * ph)
    env = np.exp(-t / 0.22)
    hum = fft_filter(rng.standard_normal(len(t)), lowpass(900, 2)) * np.exp(-t / 0.08) * 0.15
    x = tone * env + hum
    return widen(fade(normalize(x), 0.0005, 0.05), rng, 0.1)


SFX = {
    'pop': sfx_pop,
    'pop-high': sfx_pop_high,
    'tick': sfx_tick,
    'key': sfx_key,
    'click': sfx_click,
    'stamp': sfx_stamp,
    'ding': sfx_ding,
    'chime': sfx_chime,
    'whoosh': sfx_whoosh,
    'whoosh-short': sfx_whoosh_short,
    'sparkles': sfx_sparkles,
    'impact': sfx_impact,
    'riser': sfx_riser,
    'swoosh-up': sfx_swoosh_up,
    'power-off': sfx_power_off,
}


# ---------------------------------------------------------------- music

def midi_hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def music_soft(dur=180.0):
    """Slow, calm pad: four soft chords, long crossfades, a few felt notes, circular reverb.

    Every event is placed on a circle of length dur and every modulation period divides dur,
    so the end of the file joins its start without a seam.
    """
    rng = rng_for('soft')
    n = int(round(dur * SR))
    left = np.zeros(n)
    right = np.zeros(n)
    t_full = np.arange(n) / SR

    # Fmaj9, Cmaj7/G, Am9, Gsus2: bass + four close voices
    chords = [
        [41, 57, 60, 64, 67],
        [43, 55, 59, 62, 64],
        [45, 55, 60, 64, 71],
        [43, 55, 57, 62, 67],
    ]
    slots = 16  # 16 chords of 11.25 s = 180 s
    slot = dur / slots
    xfade = 4.0

    def add_wrapped(start, sig_l, sig_r):
        idx = (int(round(start * SR)) + np.arange(len(sig_l))) % n
        np.add.at(left, idx, sig_l)
        np.add.at(right, idx, sig_r)

    for k in range(slots):
        chord = chords[k % len(chords)]
        start = k * slot - xfade / 2
        length = slot + xfade
        tt = np.arange(int(round(length * SR))) / SR
        # raised-cosine in and out, flat in between: neighbors sum to a steady level
        env = np.ones_like(tt)
        ramp = int(xfade * SR)
        env[:ramp] = 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, ramp))
        env[-ramp:] = 0.5 + 0.5 * np.cos(np.linspace(0, np.pi, ramp))
        sl = np.zeros_like(tt)
        sr = np.zeros_like(tt)
        for j, m in enumerate(chord):
            f = midi_hz(m)
            if j == 0:  # bass: a plain sine, centered
                v = 0.55 * np.sin(2 * np.pi * f * tt + rng.uniform(0, 2 * np.pi))
                sl += v
                sr += v
                continue
            pan = (-0.6, -0.2, 0.2, 0.6)[(j - 1) % 4]
            amp = 0.32 if m < 70 else 0.22
            for cents in (-6.0, 0.0, 6.0):  # three detuned voices per note
                fd = f * 2 ** (cents / 1200)
                ph = rng.uniform(0, 2 * np.pi)
                v = np.sin(2 * np.pi * fd * tt + ph) + 0.18 * np.sin(4 * np.pi * fd * tt + ph) + 0.05 * np.sin(6 * np.pi * fd * tt + ph)
                p = np.clip(pan + cents / 30, -1, 1)
                sl += v * amp / 3 * (1 - p) / 2 * 2
                sr += v * amp / 3 * (1 + p) / 2 * 2
        add_wrapped(start, sl * env, sr * env)

        # two soft felt notes per chord, from the upper voicing, an octave up
        for i in range(2):
            m = chord[1 + int(rng.integers(0, 4))] + 12
            f = midi_hz(m)
            at = k * slot + 1.0 + i * slot / 2 + rng.uniform(-0.4, 0.4)
            nl_ = int(4.0 * SR)
            tn = np.arange(nl_) / SR
            v = (np.sin(2 * np.pi * f * tn) + 0.12 * np.sin(4 * np.pi * f * tn)) * np.exp(-tn / 1.1) * (1 - np.exp(-tn / 0.012))
            v = fade(v, 0, 0.5) * 0.13
            pan = rng.uniform(-0.5, 0.5)
            add_wrapped(at, v * (1 - pan), v * (1 + pan))

    # slow breathing of the level, periods that divide 180 s
    breath = 1 - 0.12 * (0.5 + 0.5 * np.sin(2 * np.pi * t_full / 22.5)) - 0.05 * (0.5 + 0.5 * np.sin(2 * np.pi * t_full / 9.0 + 1.0))
    left *= breath
    right *= breath

    # very soft air, so the pad is not too sterile
    air = rng.standard_normal((2, n))
    air = fft_filter(air, lambda f: bandpass(2500, 3.0)(f)) * 0.004
    left += air[0]
    right += air[1]

    # circular reverb: decaying noise impulse, convolved with the whole loop through one FFT
    ir_len = int(3.2 * SR)
    ti = np.arange(ir_len) / SR
    out = []
    for ch, sig in enumerate((left, right)):
        ir = rng.standard_normal(ir_len) * np.exp(-ti / 0.9)
        ir = fft_filter(ir, lowpass(3500, 1))
        ir[0] = 0
        ir /= np.sqrt(np.sum(ir ** 2))
        irn = np.zeros(n)
        irn[:ir_len] = ir
        wet = np.fft.irfft(np.fft.rfft(sig) * np.fft.rfft(irn), n)
        out.append(0.6 * sig + 0.55 * wet)
    x = np.vstack(out)

    # warm tone: gentle low-pass, remove sub rumble (circular, so the loop stays seamless)
    x = fft_filter(x, lambda f: lowpass(4200, 2)(f) * highpass(38, 2)(f))
    return x / np.abs(x).max() * db(-6.0)


MUSIC = {'soft': music_soft}


# ---------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser(description='Generate the reel sound effects and background music.')
    ap.add_argument('public', help='the public/ folder of the Remotion project')
    ap.add_argument('--force', action='store_true', help='overwrite files that already exist')
    ap.add_argument('--only', nargs='*', default=None, help='generate only these names (e.g. pop soft)')
    a = ap.parse_args()

    public = Path(a.public).expanduser()
    if not public.is_dir():
        sys.exit(f'not a folder: {public}')
    jobs = [(public / 'sfx' / f'{k}.wav', f) for k, f in SFX.items()] + [(public / 'music' / f'{k}.wav', f) for k, f in MUSIC.items()]
    if a.only:
        jobs = [j for j in jobs if j[0].stem in a.only]
    made = skipped = 0
    for path, fn in jobs:
        if path.exists() and not a.force:
            skipped += 1
            continue
        write_wav(path, fn())
        made += 1
        print(f'wrote {path} ({path.stat().st_size / 1024:.0f} KB)')
    print(f'{made} written, {skipped} already there')


if __name__ == '__main__':
    main()
