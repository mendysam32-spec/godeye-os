#!/usr/bin/env python3
"""Looks for faulty frames in a rendered video, frame by frame.

- Isolated frames: a frame very different from both neighbors while the neighbors look alike
  (an element that vanishes for one frame, a damaged frame).
- "One frame in three" series: at least 4 isolated frames spaced 3 apart. This is the signature of the Chrome GPU
  rendering bug (semi-transparent elements missing one frame in three); re-render with GL=swangle CONCURRENCY=1.

The video is scaled down to 320 px wide in gray and cut into 10 x 10 px cells. Counters, wipes and fast animations
also come out as "isolated frames": look at the flagged frames before concluding. Series are almost always a real bug.

Usage: python3 scan_flicker.py <video> [--start N] [--frames N] [--skip-band Y0:Y1]
  --skip-band: ignores a horizontal band (pixels of the original video), e.g. 1120:1440 for the captions of a Short.
Exit code 1 if a "one frame in three" series is found.
"""
import argparse
import json
import subprocess
import sys

import numpy as np

ap = argparse.ArgumentParser(description='Find flickering or faulty frames in a rendered video.')
ap.add_argument('video')
ap.add_argument('--start', type=int, default=0, help='first frame to analyze')
ap.add_argument('--frames', type=int, default=0, help='number of frames to analyze (0 = all)')
ap.add_argument('--skip-band', default='', help='horizontal band to ignore, Y0:Y1 in source pixels')
a = ap.parse_args()

info = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height',
                                           '-of', 'json', a.video]))['streams'][0]
W = 320
H = int(round(info['height'] * W / info['width'] / 10)) * 10
k = info['height'] / H
cmd = ['nice', '-n', '10', 'ffmpeg', '-hide_banner', '-loglevel', 'error', '-i', a.video]
vf = f'scale={W}:{H}'
if a.start:
    vf = f"select='gte(n,{a.start})'," + vf
cmd += ['-vf', vf, '-fps_mode', 'passthrough']
if a.frames:
    cmd += ['-frames:v', str(a.frames)]
cmd += ['-f', 'rawvideo', '-pix_fmt', 'gray', '-']
p = subprocess.Popen(cmd, stdout=subprocess.PIPE)
grids = []
n = W * H
while True:
    b = p.stdout.read(n)
    if len(b) < n:
        break
    img = np.frombuffer(b, np.uint8).reshape(H, W).astype(np.float32)
    grids.append(img.reshape(H // 10, 10, W // 10, 10).mean(axis=(1, 3)))
g = np.array(grids)
if len(g) < 3:
    sys.exit(f'{a.video}: only {len(g)} frames read, nothing to analyze')
if a.skip_band:
    y0, y1 = (int(v) for v in a.skip_band.split(':'))
    g[:, int(y0 / k / 10):int(np.ceil(y1 / k / 10)), :] = 0
d1 = np.abs(g[1:-1] - g[:-2])
d2 = np.abs(g[1:-1] - g[2:])
d0 = np.abs(g[2:] - g[:-2])
iso = np.where(d0 < 4, np.minimum(d1, d2), 0).reshape(len(d1), -1).max(axis=1)
flags = [int(i) + 1 + a.start for i in np.where(iso > 5)[0]]
runs, cur = [], []
for f in flags:
    if cur and f - cur[-1] == 3:
        cur.append(f)
    else:
        if len(cur) >= 4:
            runs.append((cur[0], cur[-1], len(cur)))
        cur = [f]
if len(cur) >= 4:
    runs.append((cur[0], cur[-1], len(cur)))
strong = [int(i) + 1 + a.start for i in np.where(np.minimum(d1, d2).reshape(len(d1), -1).max(axis=1) > 60)[0]]
print(f'{a.video}: {len(g)} frames analyzed (from frame {a.start})')
print('"one frame in three" series (start, end, count):', runs or 'none')
print(f'isolated frames: {len(flags)}; very different from both neighbors (> 60):', strong[:60] or 'none')
sys.exit(1 if runs else 0)
