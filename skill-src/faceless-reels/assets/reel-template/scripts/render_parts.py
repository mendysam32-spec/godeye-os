#!/usr/bin/env python3
"""Renders segments in one pass: H.264 video + lossless PCM audio (MKV), then
the audio-only track of each segment (WAV, "-audio" composition).

Cross-platform port of render_parts.sh (zsh/macOS).

Usage (run from the Remotion project):
  python scripts/render_parts.py "<render folder>" SEGMENT [SEGMENT ...]

Optional env vars:
  SCALE=1            vertical 1080x1920 at its own size; 1440p by default
  BUNDLE=<folder>    reuse a bundle made by "npx remotion bundle" for every
                     segment (otherwise each render copies the whole project)
  CHROME_MODE=chrome-for-testing   if headless-shell hangs
  GL=swangle + CONCURRENCY=1       software rendering (GPU makes elements
                     vanish one frame out of three)
  TIMEOUT=180000     per-render timeout in ms
"""
import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from reel_common import shell  # noqa: E402


def stamp():
    return datetime.now().strftime("%H:%M:%S")


def main():
    if len(sys.argv) < 3:
        sys.exit('usage: python scripts/render_parts.py "<render folder>" SEGMENT [SEGMENT ...]')
    out = Path(sys.argv[1])
    segments = sys.argv[2:]
    out.mkdir(parents=True, exist_ok=True)

    bundle = os.environ.get("BUNDLE", "")
    scale = os.environ.get("SCALE", "1.3333333333333333")
    gl = os.environ.get("GL", "")
    concurrency = os.environ.get("CONCURRENCY", "3")
    timeout = os.environ.get("TIMEOUT", "30000")
    chrome = os.environ.get("CHROME_MODE", "headless-shell")

    for seg in segments:
        print(f"=== {seg}: start {stamp()}", flush=True)
        base = ["npx", "remotion", "render"]
        if bundle:
            base += [bundle]
        base += [seg, str(out / f"{seg}.mkv"),
                 f"--scale={scale}", "--codec=h264", "--crf=16", "--jpeg-quality=95",
                 f"--concurrency={concurrency}", f"--timeout={timeout}",
                 "--audio-codec=pcm-16", "--pixel-format=yuv420p", "--color-space=bt709",
                 f"--chrome-mode={chrome}", "--log=error"]
        if gl:
            base += [f"--gl={gl}"]
        # on an 8 GB machine, CONCURRENCY=2 and TIMEOUT=180000 avoid timeouts on
        # long renders; each render is retried twice on failure
        ok = False
        for attempt in range(1, 4):
            r = shell(base)
            if r.returncode == 0:
                ok = True
                break
            print(f"=== {seg}: retry {stamp()}", flush=True)
        if not ok:
            sys.exit(f"{seg}: video render failed after 3 attempts")

        audio = ["npx", "remotion", "render"]
        if bundle:
            audio += [bundle]
        audio += [f"{seg}-audio", str(out / f"{seg}.audio.wav"),
                  "--codec=wav", f"--timeout={timeout}", f"--chrome-mode={chrome}", "--log=error"]
        ok = False
        for attempt in range(1, 4):
            r = shell(audio)
            if r.returncode == 0:
                ok = True
                break
        if not ok:
            sys.exit(f"{seg}: audio render failed after 3 attempts")
        print(f"=== {seg}: done {stamp()}", flush=True)
    print(f"=== ALL RENDERED {stamp()}", flush=True)


if __name__ == "__main__":
    main()
