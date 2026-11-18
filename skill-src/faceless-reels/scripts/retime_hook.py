#!/usr/bin/env python3
# Retimes the generated opening shot (e.g. a Kling clip) to the hook: the voice leads, the picture adapts.
# Output at 30 fps, duration = end of the hook + 6 frames.
# Phases: calm, fast build up to the complete shape, slow back and forth while the voice talks, reverse playback during the dive.
# Usage: python3 retime_hook.py <clip.mp4> <public/reel/hook.mp4> --hook-end 234 --shape 105 [--t-shape 6.2]
import argparse
import os
import shutil
import subprocess
import tempfile

ap = argparse.ArgumentParser(description='Retime the opening shot to the hook of the voice.')
ap.add_argument('input')
ap.add_argument('output')
ap.add_argument('--hook-end', type=int, required=True, help='frame where the stakes section starts')
ap.add_argument('--shape', type=int, default=105, help='frame where the shape must be complete')
ap.add_argument('--t-shape', type=float, default=6.2, help='time in the source clip where the shape is complete')
a = ap.parse_args()

fps_txt = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v', '-show_entries', 'stream=r_frame_rate', '-of', 'csv=p=0', a.input], capture_output=True, text=True).stdout.strip()
num, den = fps_txt.split('/')
SRC_FPS = float(num) / float(den)
N = a.hook_end + 6
DIVE = a.hook_end - 36  # start of the dive into the screen
T = a.t_shape


def source_time(n):
    if n < 30:
        return n / 30 * 0.70  # calm: the empty room
    if n < a.shape:
        return 0.70 + (n - 30) / (a.shape - 30) * (T - 0.70)  # the shape builds up
    if n < DIVE:
        return T + 1.55 - abs((n - a.shape) / 30 - 1.55)  # it stays, back and forth over the last seconds
    if n < DIVE + 24:
        return T - (n - DIVE) / 24 * (T - 0.90)  # it goes back into the screen
    return max(0.0, 0.90 - (n - DIVE - 24) / 30 * 0.2)


d = tempfile.mkdtemp()
try:
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', a.input, '-q:v', '1', f'{d}/f_%04d.jpg'], check=True)
    last = len([x for x in os.listdir(d) if x.startswith('f_')]) - 1
    with open(f'{d}/list.txt', 'w') as f:
        for n in range(N):
            m = min(last, int(round(source_time(n) * SRC_FPS)))
            f.write(f"file 'f_{m + 1:04d}.jpg'\nduration {1 / 30:.6f}\n")
        f.write("file 'f_0001.jpg'\n")
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', f'{d}/list.txt', '-vf', 'fps=30,scale=1080:1920,format=yuv420p', '-frames:v', str(N), '-c:v', 'libx264', '-crf', '14', '-preset', 'medium', '-an', a.output], check=True)
finally:
    shutil.rmtree(d)
print(f'{a.output}: {N} frames, shape complete at frame {a.shape}, dive at frame {DIVE}')
