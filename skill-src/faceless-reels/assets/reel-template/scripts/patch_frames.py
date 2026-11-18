#!/usr/bin/env python3
"""Replaces frame ranges of an already rendered segment
(`<render>/<SEGMENT>.mkv`) with a new render of those ranges only, without
re-rendering the whole segment. Useful when a few passages have a render defect
(e.g. semi-transparent elements that vanish one frame out of three with the
default GPU): the ranges are re-rendered with GL=swangle on a single tab, then
the segment video is re-encoded with the same settings as Remotion (x264
medium, CRF 16, yuv420p tv bt709).

The segment audio (PCM track of the MKV) is copied as is; the `.audio.wav`
track is not touched. A range already rendered (rerun after a failure) is
reused if it has the right frame count.

Cross-platform port of patch_frames.sh (zsh/macOS).

Usage (run from the Remotion project):
  BUNDLE=<bundle> python scripts/patch_frames.py "<render folder>" SEGMENT START-END [START-END ...]
  (ranges in segment frames, bounds included, in order and without overlap)
  Optional env: CHROME_MODE (default chrome-for-testing)
"""
import os
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from reel_common import require_tools, resolve_ffprobe, run, shell  # noqa: E402


def frame_count(probe, path):
    r = subprocess.run(
        [probe, "-v", "error", "-select_streams", "v:0", "-count_packets",
         "-show_entries", "stream=nb_read_packets", "-of", "csv=p=0", str(path)],
        capture_output=True, text=True)
    return r.stdout.strip()


def main():
    if len(sys.argv) < 4:
        sys.exit('usage: python scripts/patch_frames.py "<render folder>" '
                 "SEGMENT START-END [START-END ...]")
    out = Path(sys.argv[1])
    seg = sys.argv[2]
    ranges = sys.argv[3:]
    src = out / f"{seg}.mkv"
    if not src.is_file():
        sys.exit(f"missing rendered segment: {src}")
    tmp = out / f"_patch_{seg}"
    tmp.mkdir(parents=True, exist_ok=True)
    ff = require_tools()
    probe = resolve_ffprobe()

    n = frame_count(probe, src)
    if not n.isdigit():
        sys.exit(f"could not probe frame count of {src}")
    n = int(n)
    r = subprocess.run(
        [probe, "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=width,height", "-of", "csv=p=0:s=x", str(src)],
        capture_output=True, text=True)
    w_txt = r.stdout.strip()
    m = re.match(r"(\d+)x(\d+)", w_txt)
    if not m:
        sys.exit(f"could not probe dimensions of {src}: {w_txt!r}")
    # the longest side of the composition is 1920 px, in portrait as in landscape
    scale = repr(max(int(m.group(1)), int(m.group(2))) / 1920)

    inputs = ["-i", str(src)]
    # each range is laid over the original video (full frame overlay, timestamps
    # recomputed frame by frame): a single decode, without buffering long
    # stretches in memory
    filt = "[0:v]settb=1/30,setpts=N[m0]"
    bundle = os.environ.get("BUNDLE", "")
    chrome = os.environ.get("CHROME_MODE", "chrome-for-testing")

    for i, rng in enumerate(ranges, start=1):
        m2 = re.match(r"^(\d+)-(\d+)$", rng)
        if not m2:
            sys.exit(f"bad range {rng!r} — expected START-END")
        a, b = int(m2.group(1)), int(m2.group(2))
        import datetime
        print(f"=== {seg}: frames {a} to {b} "
              f"({datetime.datetime.now().strftime('%H:%M:%S')})", flush=True)
        piece = tmp / f"p{i}.mkv"
        need = b - a + 1
        k = frame_count(probe, piece) if piece.is_file() else "0"
        if k != str(need):
            cmd = ["npx", "remotion", "render"]
            if bundle:
                cmd += [bundle]
            cmd += [seg, piece,
                    f"--frames={a}-{b}", f"--scale={scale}", "--codec=h264",
                    "--crf=16", "--jpeg-quality=95", "--concurrency=1",
                    "--timeout=180000", "--muted", "--pixel-format=yuv420p",
                    "--color-space=bt709", f"--chrome-mode={chrome}",
                    "--gl=swangle", "--log=error"]
            r = shell(cmd)
            if r.returncode != 0:
                sys.exit(f"range {rng}: render failed")
        k = frame_count(probe, piece)
        if k != str(need):
            sys.exit(f"range {rng}: {k} frames rendered")
        inputs += ["-i", str(piece)]
        filt += (f";[{i}:v]settb=1/30,setpts=N+{a}[q{i}];"
                 f"[m{i - 1}][q{i}]overlay=eof_action=pass:repeatlast=0:"
                 f"format=yuv420[m{i}]")

    run([ff, "-hide_banner", "-loglevel", "error", "-y"] + inputs +
        ["-filter_complex", filt, "-map", f"[m{len(ranges)}]", "-map", "0:a",
         "-c:v", "libx264", "-preset", "medium", "-crf", "16",
         "-pix_fmt", "yuv420p", "-color_range", "tv", "-colorspace", "bt709",
         "-color_primaries", "bt709", "-color_trc", "bt709", "-c:a", "copy",
         tmp / f"{seg}.mkv"], check=True)
    m_total = frame_count(probe, tmp / f"{seg}.mkv")
    if m_total != str(n):
        sys.exit(f"frame count differs: {m_total} instead of {n}")
    os.replace(tmp / f"{seg}.mkv", src)
    import shutil
    shutil.rmtree(tmp, ignore_errors=True)
    import datetime
    print(f"=== {seg}: {n} frames, ranges replaced "
          f"({datetime.datetime.now().strftime('%H:%M:%S')})")


if __name__ == "__main__":
    main()
