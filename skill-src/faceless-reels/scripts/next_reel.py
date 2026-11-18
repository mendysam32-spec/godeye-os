#!/usr/bin/env python3
# Prints the next file to process in inspiration/: the smallest leading number in the file name, read as a number.
# Files without a number come after, in alphabetical order. Prints nothing if there is no .mp4.
# Usage: python3 next_reel.py "<inspiration folder>"
import re
import sys
from pathlib import Path

if len(sys.argv) != 2:
    sys.exit('usage: python3 next_reel.py "<inspiration folder>"')
d = Path(sys.argv[1]).expanduser()


def key(p):
    m = re.match(r'\s*(\d+)', p.name)
    return (0, int(m.group(1)), p.name) if m else (1, 0, p.name)


mp4 = sorted((p for p in d.iterdir() if p.is_file() and p.suffix.lower() == '.mp4' and not p.name.startswith('.')), key=key)
if mp4:
    print(mp4[0])
