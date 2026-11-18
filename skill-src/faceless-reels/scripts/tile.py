#!/usr/bin/env python3
# Review sheet of still images: python3 tile.py <output.jpg> <thumbnail width> <columns> <images...>
import os
import sys

from PIL import Image, ImageDraw, ImageFont

if len(sys.argv) < 5:
    sys.exit('usage: python3 tile.py <output.jpg> <thumbnail width> <columns> <images...>')
out, w, cols, files = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), sys.argv[4:]
ims = [Image.open(f).convert('RGB') for f in files]
h = int(w * ims[0].height / ims[0].width)
rows = (len(ims) + cols - 1) // cols
sheet = Image.new('RGB', (cols * w, rows * h), 'black')
d = ImageDraw.Draw(sheet)
try:
    font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 18)
except Exception:
    font = ImageFont.load_default()
for i, (f, im) in enumerate(zip(files, ims)):
    x, y = (i % cols) * w, (i // cols) * h
    sheet.paste(im.resize((w, h)), (x, y))
    label = os.path.basename(f).rsplit('.', 1)[0][-14:]
    d.rectangle([x, y, x + 10 + 10 * len(label), y + 24], fill=(0, 0, 0))
    d.text((x + 4, y + 2), label, fill=(255, 255, 0), font=font)
sheet.save(out, quality=85)
print(out, len(ims))
