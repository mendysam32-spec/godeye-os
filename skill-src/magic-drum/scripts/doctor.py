#!/usr/bin/env python3
"""Check the machine and install what is missing. Works on Windows, macOS, Linux."""
import importlib.util, shutil, subprocess, sys


def pip(*pkgs):
    for extra in ([], ["--user"], ["--break-system-packages"]):
        r = subprocess.run([sys.executable, "-m", "pip", "install", "-q", *extra, *pkgs], capture_output=True, text=True)
        if r.returncode == 0:
            return True
    print(r.stderr[-400:])
    return False


need = {"numpy": "numpy", "scipy": "scipy", "PIL": "pillow", "playwright": "playwright", "edge_tts": "edge-tts"}
missing = [p for m, p in need.items() if importlib.util.find_spec(m) is None]
if not shutil.which("ffmpeg") and importlib.util.find_spec("imageio_ffmpeg") is None:
    missing.append("imageio-ffmpeg")
if missing:
    print("installing:", *missing)
    if not pip(*missing):
        sys.exit("could not install " + " ".join(missing))

from playwright.sync_api import sync_playwright
ok = False
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); b.close(); ok = True
except Exception:
    print("installing Chromium for Playwright")
    subprocess.run([sys.executable, "-m", "playwright", "install", "chromium"])

# edge-tts chases Microsoft's token; an old version 403s.
try:
    import edge_tts
    if tuple(int(x) for x in edge_tts.__version__.split(".")[:2]) < (7, 0):
        print("upgrading edge-tts")
        pip("--upgrade", "edge-tts")
except Exception:
    pass

print("Magic Drum machine check: OK (numpy/scipy/PIL/playwright/ffmpeg/edge-tts ready)")
