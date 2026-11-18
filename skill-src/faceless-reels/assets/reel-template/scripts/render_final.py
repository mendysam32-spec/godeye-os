#!/usr/bin/env python3
"""Renders the full reel and its cover, then assembles the final video with the
cover as its first frame.

Run it from the Remotion project (or from anywhere: paths resolve relative to
this file's project). Exports go to ../exports, segments to ../render. A single
cover frame is rendered with the same options as the reel, so same H.264
headers, and the reel is never re-encoded.

Cross-platform port of render_final.sh (zsh/macOS).

Usage: python scripts/render_final.py [--skip-reel]
  (--skip-reel: redoes the cover and the assembly, keeps segments already rendered)

Env vars honored by the segment render (see render_parts.py): BUNDLE, SCALE,
GL, CONCURRENCY, CHROME_MODE, TIMEOUT.
"""
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from reel_common import (python_bin, resolve_ffmpeg, require_tools, run,  # noqa: E402
                         shell)

HERE = Path(__file__).resolve().parent          # <project>/scripts
PROJECT = HERE.parent                            # the Remotion project
REEL_DIR = PROJECT.parent                        # _reel/
RENDER = REEL_DIR / "render"
EXPORTS = REEL_DIR / "exports"


def main():
    argv = sys.argv[1:]
    skip_reel = "--skip-reel" in argv
    if [a for a in argv if not a.startswith("--")]:
        sys.exit("usage: python scripts/render_final.py [--skip-reel]")

    reel_json = PROJECT / "reel.json"
    if not reel_json.is_file():
        sys.exit(f"run from the Remotion project — missing {reel_json}")
    import json
    reel = json.loads(reel_json.read_text(encoding="utf-8"))
    reel_id = reel.get("id") or "Reel"
    ff = require_tools()

    RENDER.mkdir(parents=True, exist_ok=True)
    EXPORTS.mkdir(parents=True, exist_ok=True)

    bundle = Path(tempfile.mkdtemp(prefix="bundle-reel-"))

    # regenerate data.ts + CUES.md from reel.json (quiet unless it fails)
    r = run([python_bin(), HERE / "build_reel.py"], cwd=PROJECT,
            stdout=subprocess.DEVNULL)
    if r.returncode != 0:
        sys.exit("build_reel.py failed")

    print("bundling the Remotion project (this copies the project — a few minutes)")
    r = shell(["npx", "remotion", "bundle", "src/index.ts", "--out-dir", bundle,
               "--log=error"], cwd=PROJECT)
    if r.returncode != 0:
        sys.exit("remotion bundle failed")

    still_opts = ["--image-format=png", "--chrome-mode=chrome-for-testing",
                  "--log=error"]
    for comp, out_name in (("Reel-Cover", "cover.png"),
                           ("Reel-Cover-2x3", "cover-2x3.png")):
        r = shell(["npx", "remotion", "still", bundle, comp,
                   RENDER / out_name] + still_opts, cwd=PROJECT)
        if r.returncode != 0:
            sys.exit(f"remotion still {comp} failed")

    # JPEG covers for publishing
    from PIL import Image
    cover = Image.open(RENDER / "cover.png").convert("RGB")
    cover.save(EXPORTS / f"{reel_id}-cover.jpg", quality=95, subsampling=0)
    cover2 = Image.open(RENDER / "cover-2x3.png").convert("RGB")
    cover2.save(EXPORTS / f"{reel_id}-cover-2x3.jpg", quality=95, subsampling=0)

    # the cover MKV: same encoder options as the reel so the segments join
    r = shell(["npx", "remotion", "render", bundle, "Reel-Cover",
               RENDER / "Reel-Cover.mkv",
               "--scale=1", "--codec=h264", "--crf=16", "--jpeg-quality=95",
               "--concurrency=1", "--timeout=180000", "--audio-codec=pcm-16",
               "--pixel-format=yuv420p", "--color-space=bt709",
               "--chrome-mode=chrome-for-testing", "--gl=swangle", "--log=error"],
              cwd=PROJECT)
    if r.returncode != 0:
        sys.exit("cover render failed")

    # one frame at 30 fps = 1600 samples of silence: the audio stays in sync
    run([ff, "-hide_banner", "-loglevel", "error", "-y",
         "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo",
         "-af", "atrim=end_sample=1600", "-c:a", "pcm_s16le",
         RENDER / "Reel-Cover.audio.wav"], check=True)

    if not skip_reel:
        import os
        env = dict(os.environ)
        env.update({
            "BUNDLE": str(bundle), "SCALE": "1", "GL": "swangle",
            "CONCURRENCY": "1", "CHROME_MODE": "chrome-for-testing",
            "TIMEOUT": "180000",
        })
        print("=== rendering the reel segments (segment-wise: safe with a 10-15"
              " min software render — call again per segment if the tool times"
              " out) ===")
        r = run([python_bin(), HERE / "render_parts.py", RENDER, "Reel"],
                cwd=PROJECT, env=env)
        if r.returncode != 0:
            sys.exit("segment render failed — resume with: python"
                     " scripts/render_parts.py \"../render\" Reel  (then:"
                     " render_final.py --skip-reel)")

    run([python_bin(), HERE / "assemble_parts.py", RENDER,
         EXPORTS / f"{reel_id}.mp4", "Reel-Cover", "Reel"], cwd=PROJECT,
        check=True)

    shutil.rmtree(bundle, ignore_errors=True)
    for name in ("video.mp4", "audio.wav", "video.txt", "audio.txt",
                 "Reel.wav", "Reel-Cover.wav"):
        p = RENDER / name
        if p.exists():
            p.unlink()

    print(f"Deliverables: {EXPORTS / (reel_id + '.mp4')}, "
          f"{EXPORTS / (reel_id + '-cover.jpg')}, "
          f"{EXPORTS / (reel_id + '-cover-2x3.jpg')}")


if __name__ == "__main__":
    main()
