#!/usr/bin/env python3
# Timestamped contact sheet: python3 contact_sheet.py <video> <output.jpg> <start> <end> <step> [columns] [width]
import io
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont

if len(sys.argv) < 6:
    sys.exit('usage: python3 contact_sheet.py <video> <output.jpg> <start s> <end s> <step s> [columns] [width]')
src, out, t0, t1, step = sys.argv[1], sys.argv[2], float(sys.argv[3]), float(sys.argv[4]), float(sys.argv[5])
cols = int(sys.argv[6]) if len(sys.argv) > 6 else 5
w = int(sys.argv[7]) if len(sys.argv) > 7 else 384
times = []
t = t0
while t <= t1 + 1e-6:
    times.append(round(t, 3))
    t += step
tiles = []
for t in times:
    png = subprocess.run(['ffmpeg', '-v', 'error', '-ss', str(t), '-i', src, '-frames:v', '1', '-vf', f'scale={w}:-1', '-f', 'image2pipe', '-vcodec', 'png', '-'], capture_output=True).stdout
    if not png:
        continue
    tiles.append((t, Image.open(io.BytesIO(png)).convert('RGB')))
if not tiles:
    sys.exit(f'no frame could be read from {src} between {t0} and {t1} s')
h = tiles[0][1].height
rows = (len(tiles) + cols - 1) // cols
sheet = Image.new('RGB', (cols * w, rows * h), 'black')
try:
    font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 20)
except Exception:
    font = ImageFont.load_default()
d = ImageDraw.Draw(sheet)
for i, (t, im) in enumerate(tiles):
    x, y = (i % cols) * w, (i // cols) * h
    sheet.paste(im, (x, y))
    label = f'{t:.1f}s'
    d.rectangle([x, y, x + 8 + 11 * len(label), y + 26], fill=(0, 0, 0))
    d.text((x + 4, y + 2), label, fill=(255, 255, 0), font=font)
sheet.save(out, quality=82)
print(out, len(tiles), 'frames')
