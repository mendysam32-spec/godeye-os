#!/bin/zsh
# Renders segments in one pass: H.264 video + lossless PCM audio (MKV), then the audio-only track of each segment
# (WAV, "-audio" composition).
# Usage: zsh scripts/render_parts.sh "<render folder>" SEGMENT [SEGMENT ...]
# SCALE=1 (optional): vertical 1080 x 1920 rendered at its own size; 1440p by default.
# BUNDLE=<folder> (optional): a bundle already made by "npx remotion bundle", reused for every segment
# (otherwise each render copies the whole project, about 3 GB, into the system temp folder).
# CHROME_MODE=chrome-for-testing (optional): if "headless-shell" hangs on "Waiting for root component to load".
# GL=swangle (optional) with CONCURRENCY=1: software rendering. With the default GPU (and with angle), semi-transparent
# elements vanish one frame out of three; swangle on two tabs sometimes gives a damaged frame.
# --pixel-format=yuv420p --color-space=bt709: limited range (tv) output; without these options Chrome for Testing gave
# full range (pc) yuvj420p, which does not join with the other segments.
set -e
OUT="$1"
shift
mkdir -p "$OUT"
for P in "$@"; do
  echo "=== $P: start $(date +%H:%M:%S)"
  # CONCURRENCY / TIMEOUT (optional): on an 8 GB Mac, 2 and 180000 avoid timeouts on long renders;
  # each render is retried twice on failure
  for TRY in 1 2 3; do
    npx remotion render ${BUNDLE:+"$BUNDLE"} "$P" "$OUT/$P.mkv" --scale=${SCALE:-1.3333333333333333} --codec=h264 --crf=16 --jpeg-quality=95 --concurrency=${CONCURRENCY:-3} --timeout=${TIMEOUT:-30000} --audio-codec=pcm-16 --pixel-format=yuv420p --color-space=bt709 --chrome-mode=${CHROME_MODE:-headless-shell} ${GL:+--gl=$GL} --log=error && break
    [ $TRY = 3 ] && exit 1
    echo "=== $P: retry $(date +%H:%M:%S)"
  done
  for TRY in 1 2 3; do
    npx remotion render ${BUNDLE:+"$BUNDLE"} "$P-audio" "$OUT/$P.audio.wav" --codec=wav --timeout=${TIMEOUT:-30000} --chrome-mode=${CHROME_MODE:-headless-shell} --log=error && break
    [ $TRY = 3 ] && exit 1
  done
  echo "=== $P: done $(date +%H:%M:%S)"
done
echo "=== ALL RENDERED $(date +%H:%M:%S)"
