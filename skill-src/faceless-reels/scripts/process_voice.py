#!/usr/bin/env python3
"""Processes the ElevenLabs voice without cutting anything: EQ, de-esser,
gentle compressor, two-pass linear loudnorm to -16 LUFS. The duration does not
change by a single sample.

Cross-platform port of process_voice.sh (zsh/macOS).

Usage: python process_voice.py <take.mp3> <public/reel/voice.wav>
"""
import json
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from reel_common import eprint, resolve_ffmpeg, resolve_ffprobe, require_tools, run  # noqa: E402

CHAIN = ("highpass=f=75,"
         "equalizer=f=250:t=q:w=1.2:g=-2,"
         "equalizer=f=3200:t=q:w=1.0:g=2,"
         "equalizer=f=9000:t=q:w=1.0:g=1,"
         "deesser=i=0.3,"
         "acompressor=threshold=-21dB:ratio=2.5:attack=8:release=120:makeup=1.5")
NORM = "loudnorm=I=-16:TP=-1.5:LRA=11"


def ffprobe_duration(ffprobe, path):
    r = subprocess.run([ffprobe, "-v", "error", "-show_entries", "format=duration",
                        "-of", "csv=p=0", str(path)], capture_output=True, text=True)
    return r.stdout.strip()


def main():
    if len(sys.argv) != 3:
        sys.exit("usage: python process_voice.py <take.mp3> <public/reel/voice.wav>")
    src, out = Path(sys.argv[1]), Path(sys.argv[2])
    if not src.is_file():
        sys.exit(f"input not found: {src}")
    out.parent.mkdir(parents=True, exist_ok=True)
    ff = require_tools()
    probe = resolve_ffprobe()

    # pass 1: measure
    print(f"pass 1: measuring {src.name}")
    r = subprocess.run(
        [ff, "-hide_banner", "-nostats", "-i", str(src),
         "-af", f"{CHAIN},{NORM}:print_format=json", "-f", "null", "-"],
        capture_output=True, text=True)
    m = re.search(r"\{[^{}]*\}", r.stderr, re.S)
    if not m:
        eprint(r.stderr[-2000:])
        sys.exit("loudnorm measurement failed")
    d = json.loads(m.group(0))
    linear = (f"measured_I={d['input_i']}:measured_TP={d['input_tp']}:"
              f"measured_LRA={d['input_lra']}:measured_thresh={d['input_thresh']}:"
              f"offset={d['target_offset']}")

    # pass 2: linear apply (sample-accurate duration)
    print("pass 2: applying linear loudnorm")
    run([ff, "-hide_banner", "-loglevel", "error", "-y", "-i", str(src),
         "-af", f"{CHAIN},{NORM}:linear=true:{linear}",
         "-ar", "48000", "-ac", "1", "-c:a", "pcm_s24le", str(out)], check=True)

    a = ffprobe_duration(probe, src)
    b = ffprobe_duration(probe, out)
    print(f"source duration {a} s, processed duration {b} s")

    # verify
    r = subprocess.run(
        [ff, "-hide_banner", "-nostats", "-i", str(out),
         "-af", "loudnorm=print_format=summary", "-f", "null", "-"],
        capture_output=True, text=True)
    for line in r.stderr.splitlines():
        if "Input Integrated" in line or "Input True Peak" in line:
            print(line.strip())


if __name__ == "__main__":
    main()
