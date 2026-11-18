#!/usr/bin/env python3
# Prepares the two cover backgrounds from a 1080 x 1620 cover background with an empty top zone
# (for example assets/cover/cover-template.png, or your own image built on the same layout).
# For 9:16, the empty zone is made taller by repeating a horizontal slice whose height is a multiple of the dot pattern
# period (43 px): the photo below is neither stretched nor cropped, and the title lands in the area kept by the
# 3:4 and 4:5 profile crops.
# If your own template has a different pattern or layout, change the constants below.
# Usage: python3 prep_cover.py "<cover background.png>" <public/reel folder>
import sys

import numpy as np
from PIL import Image

WIDTH, HEIGHT = 1080, 1620  # expected size of the cover background (2:3)
TALL_HEIGHT = 1920  # height of the 9:16 version
SLICE_START = 200  # first row of the repeated slice, inside the empty zone
SLICE_END = 243  # row after the slice: SLICE_END - SLICE_START must be a whole number of pattern periods (43 px here)
REPEAT = 7  # 7 slices of 43 px add 301 px, enough to reach TALL_HEIGHT

src = np.array(Image.open(sys.argv[1]).convert('RGB'))
out_dir = sys.argv[2]
h, w = src.shape[:2]
if (w, h) != (WIDTH, HEIGHT):
    raise SystemExit(f'image is {w} x {h}: this script expects a {WIDTH} x {HEIGHT} cover background')
band = src[SLICE_START:SLICE_END]
tall = np.vstack([src[:SLICE_END]] + [band] * REPEAT + [src[SLICE_END:]])[:TALL_HEIGHT]
if tall.shape[0] < TALL_HEIGHT:
    raise SystemExit(f'only {tall.shape[0]} px tall after repeating the slice: raise REPEAT')
Image.fromarray(tall).save(f'{out_dir}/cover_base_9x16.png')
Image.fromarray(src).save(f'{out_dir}/cover_base_2x3.png')
print('cover backgrounds ready:', tall.shape[1], 'x', tall.shape[0], 'and', w, 'x', h)
