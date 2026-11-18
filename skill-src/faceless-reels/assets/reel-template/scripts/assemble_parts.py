#!/usr/bin/env python3
"""Assembles rendered segments (MKV: H.264 + PCM, plus their audio-only track
.audio.wav): video copied without re-encoding, PCM audio joined
sample-accurately, brought to -14 LUFS (peaks under -1 dBTP), encoded as AAC.

Cross-platform port of assemble_parts.sh (zsh/macOS).

Usage (run from the Remotion project):
  python scripts/assemble_parts.py "<render folder>" "<final video .mp4>" SEGMENT [SEGMENT ...]
"""
import json
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from reel_common import eprint, resolve_ffmpeg, resolve_ffprobe, require_tools, run  # noqa: E402


def measure_lufs(ff, path):
    """Return the input integrated loudness (float) or None."""
    r = subprocess.run(
        [ff, "-hide_banner", "-nostats", "-i", str(path),
         "-af", "loudnorm=print_format=json", "-f", "null", "-"],
        capture_output=True, text=True)
    m = re.search(r"\{[^{}]*\}", r.stderr, re.S)
    if not m:
        return None
    try:
        return float(json.loads(m.group(0))["input_i"])
    except Exception:
        return None


def main():
    if len(sys.argv) < 4:
        sys.exit('usage: python scripts/assemble_parts.py "<render folder>" "<final .mp4>" SEGMENT [SEGMENT ...]')
    r_dir = Path(sys.argv[1])
    out = Path(sys.argv[2])
    segments = sys.argv[3:]
    ff = require_tools()
    probe = resolve_ffprobe()

    out.parent.mkdir(parents=True, exist_ok=True)
    video_list = r_dir / "video.txt"
    audio_list = r_dir / "audio.txt"
    video_list.write_text("", encoding="utf-8")
    audio_list.write_text("", encoding="utf-8")

    for seg in segments:
        mkv = r_dir / f"{seg}.mkv"
        if not mkv.is_file():
            sys.exit(f"missing rendered segment: {mkv}")
        wav = r_dir / f"{seg}.wav"
        track = r_dir / f"{seg}.audio.wav"
        if track.is_file():
            run([ff, "-hide_banner", "-loglevel", "error", "-y", "-i", track,
                 "-c:a", "pcm_s16le", "-ar", "48000", "-ac", "2", wav], check=True)
        else:
            run([ff, "-hide_banner", "-loglevel", "error", "-y", "-i", mkv,
                 "-vn", "-c:a", "pcm_s16le", "-ar", "48000", "-ac", "2", wav], check=True)
        with video_list.open("a", encoding="utf-8") as f:
            f.write(f"file '{mkv.as_posix()}'\n")
        with audio_list.open("a", encoding="utf-8") as f:
            f.write(f"file '{wav.as_posix()}'\n")

    video_mp4 = r_dir / "video.mp4"
    audio_wav = r_dir / "audio.wav"
    run([ff, "-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0",
         "-i", video_list, "-map", "0:v", "-c", "copy", video_mp4], check=True)
    run([ff, "-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0",
         "-i", audio_list, "-c", "copy", audio_wav], check=True)

    # linear gain up to -14 LUFS, then an oversampled (x4) limiter at -3 dBFS:
    # AAC encoding pushes peaks over, sometimes by more than 2 dB on a click.
    # -aac_is 0 -aac_pns 0: without them, the ffmpeg AAC encoder once pushed a
    # hissing "x" on a single channel to +1.3 dBFS.
    ii = measure_lufs(ff, audio_wav)
    if ii is None:
        eprint("loudnorm measurement failed — assembling without gain correction")
        gain = 0.0
    else:
        gain = round(-14 - ii, 2)
        print(f"before: {ii} LUFS, gain {gain} dB")
    run([ff, "-hide_banner", "-loglevel", "error", "-y", "-i", video_mp4, "-i", audio_wav,
         "-map", "0:v", "-map", "1:a", "-c:v", "copy",
         "-af", f"volume={gain}dB,aresample=192000,alimiter=limit=0.70:attack=5:release=50:level=false,aresample=48000",
         "-c:a", "aac", "-b:a", "320k", "-ar", "48000", "-aac_is", "0", "-aac_pns", "0",
         "-movflags", "+faststart", str(out)], check=True)

    r = subprocess.run(
        [ff, "-hide_banner", "-nostats", "-i", str(out), "-vn",
         "-af", "loudnorm=print_format=summary", "-f", "null", "-"],
        capture_output=True, text=True)
    for line in r.stderr.splitlines():
        if "Input Integrated" in line or "Input True Peak" in line:
            print(line.strip())
    run([probe, "-v", "error", "-show_entries", "stream=codec_name,width,height,r_frame_rate,duration,sample_rate",
         "-of", "compact", str(out)], check=True)


if __name__ == "__main__":
    main()
