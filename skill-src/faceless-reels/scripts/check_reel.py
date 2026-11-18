#!/usr/bin/env python3
# Checks the final reel: format, loudness, voice not cut, voice over the rest of the mix, cover on the first frame, loop.
# Usage: python3 check_reel.py <reel.mp4> <public/reel/voice.wav> <render/cover.png>
import json
import os
import re
import subprocess
import sys
import tempfile

import numpy as np

if len(sys.argv) != 4:
    sys.exit('usage: python3 check_reel.py <reel.mp4> <public/reel/voice.wav> <render/cover.png>')
video, voice, cover = sys.argv[1:4]
d = tempfile.mkdtemp()


def run(*c):
    return subprocess.run(c, capture_output=True, text=True)


def psnr(a, b):
    r = run('ffmpeg', '-hide_banner', '-i', a, '-i', b, '-lavfi', 'psnr', '-f', 'null', '-').stderr
    m = re.search(r'average:([0-9.a-z]+)', r)
    return m.group(1) if m else '?'


def pcm(src, out):
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', src, '-vn', '-ac', '1', '-ar', '48000', '-f', 'f32le', out], check=True)
    return np.fromfile(out, dtype='f4')


print('=== format')
s = json.loads(run('ffprobe', '-v', 'error', '-count_frames', '-select_streams', 'v', '-show_entries', 'stream=codec_name,width,height,r_frame_rate,pix_fmt,color_range,nb_read_frames', '-of', 'json', video).stdout)['streams'][0]
print(s)
n = int(s['nb_read_frames'])
num, den = s['r_frame_rate'].split('/')
fps = float(num) / float(den)
print('duration', round(n / fps, 2), 's')

print('=== loudness')
r = run('ffmpeg', '-hide_banner', '-nostats', '-i', video, '-vn', '-af', 'loudnorm=print_format=summary', '-f', 'null', '-').stderr
print('\n'.join(x.strip() for x in r.splitlines() if re.search(r'Input (Integrated|True Peak|LRA)', x)))

print('=== frames')
subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', video, '-vf', "select='lt(n,2)'", '-vsync', '0', f'{d}/n%d.png'], check=True)
subprocess.run(['ffmpeg', '-y', '-v', 'error', '-sseof', '-0.2', '-i', video, '-update', '1', f'{d}/last.png'], check=True)
print('first frame vs cover: PSNR', psnr(f'{d}/n1.png', cover))
print('2nd frame vs last frame (loop): PSNR', psnr(f'{d}/n2.png', f'{d}/last.png'))

print('=== voice')
sr = 48000  # at 16 kHz, a one-frame offset falls between two samples and spoils the subtraction
a = pcm(video, f'{d}/a.f32')
v = pcm(voice, f'{d}/v.f32')
print('mix duration', round(len(a) / sr, 3), 's, voice duration', round(len(v) / sr, 3), 's')
win = 4 * sr
res = []
for s0 in range(0, len(v) - win, 2 * sr):
    x = v[s0:s0 + win]
    if np.sqrt(np.mean(x ** 2)) < 0.01:
        continue
    lo = max(0, s0 - sr // 4)
    hi = min(len(a), s0 + win + sr // 4)
    y = a[lo:hi]
    m = len(y) + len(x)
    c = np.fft.irfft(np.fft.rfft(y, m) * np.conj(np.fft.rfft(x, m)), m)
    k = int(np.argmax(c[:len(y) - win + 1]))
    corr = float(np.dot(y[k:k + win], x) / (np.linalg.norm(y[k:k + win]) * np.linalg.norm(x) + 1e-9))
    res.append(((lo + k - s0) / sr * 1000, corr))
if not res:
    sys.exit('no voiced 4 s window found in the voice file')
lags = [r[0] for r in res]
print(f'{len(res)} windows, offset {min(lags):.1f} to {max(lags):.1f} ms (spread {max(lags) - min(lags):.1f} ms), lowest correlation {min(r[1] for r in res):.3f}')

print('=== voice over the rest of the mix')
lag = int(round(float(np.median(lags)) / 1000 * sr))
b = a[lag:lag + len(v)]
v2 = v[:len(b)]
g = np.dot(b, v2) / np.dot(v2, v2)
rest = b - g * v2
db = lambda x: 20 * np.log10(np.sqrt(np.mean(x ** 2)) + 1e-9)
gaps = []
for t in np.arange(0, len(b) / sr - 0.5, 0.5):
    s0, e0 = int(t * sr), int((t + 0.5) * sr)
    if db(v2[s0:e0]) > -35:
        gaps.append((float(db(g * v2[s0:e0]) - db(rest[s0:e0])), float(t)))
worst = sorted(gaps)[:4]
print('median gap', round(float(np.median([e[0] for e in gaps])), 1), 'dB, tightest passages (dB, s):', [(round(e, 1), t) for e, t in worst])

print('=== silences longer than 0.8 s')
r = run('ffmpeg', '-hide_banner', '-nostats', '-i', video, '-vn', '-af', 'silencedetect=n=-50dB:d=0.8', '-f', 'null', '-').stderr
print(sum('silence_start' in x for x in r.splitlines()))

for f in os.listdir(d):
    os.remove(f'{d}/{f}')
os.rmdir(d)
