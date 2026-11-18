#!/bin/zsh
# Renders the full reel and its cover, then assembles the final video with the cover as its first frame.
# Run it from the Remotion project, in the background. Exports go to ../exports, segments to ../render.
# A single cover frame: same options as the reel, so same H.264 headers, and the reel is never re-encoded.
# Usage: zsh scripts/render_final.sh [--skip-reel]   (--skip-reel: redoes the cover and the assembly, keeps the segment already rendered)
set -e
ID=$(python3 -c "import json;print(json.load(open('reel.json'))['id'])")
R="${PWD:h}/render"
E="${PWD:h}/exports"
B="${TMPDIR:-/tmp}/bundle-reel-$$"
mkdir -p "$R" "$E"
python3 scripts/build_reel.py > /dev/null
npx remotion bundle src/index.ts --out-dir "$B" --log=error
OPT=(--image-format=png --chrome-mode=chrome-for-testing --log=error)
npx remotion still "$B" Reel-Cover "$R/cover.png" $OPT
npx remotion still "$B" Reel-Cover-2x3 "$R/cover-2x3.png" $OPT
python3 - "$R" "$E" "$ID" <<'PY'
import sys
from PIL import Image
r, e, name = sys.argv[1:]
Image.open(f'{r}/cover.png').convert('RGB').save(f'{e}/{name}-cover.jpg', quality=95, subsampling=0)
Image.open(f'{r}/cover-2x3.png').convert('RGB').save(f'{e}/{name}-cover-2x3.jpg', quality=95, subsampling=0)
PY
npx remotion render "$B" Reel-Cover "$R/Reel-Cover.mkv" --scale=1 --codec=h264 --crf=16 --jpeg-quality=95 --concurrency=1 --timeout=180000 --audio-codec=pcm-16 --pixel-format=yuv420p --color-space=bt709 --chrome-mode=chrome-for-testing --gl=swangle --log=error
# one frame at 30 fps = 1600 samples of silence: the audio stays in sync with the video
ffmpeg -hide_banner -loglevel error -y -f lavfi -i anullsrc=r=48000:cl=stereo -af atrim=end_sample=1600 -c:a pcm_s16le "$R/Reel-Cover.audio.wav"
if [ "$1" != "--skip-reel" ]; then
  BUNDLE="$B" SCALE=1 GL=swangle CONCURRENCY=1 CHROME_MODE=chrome-for-testing TIMEOUT=180000 zsh scripts/render_parts.sh "$R" Reel
fi
zsh scripts/assemble_parts.sh "$R" "$E/$ID.mp4" Reel-Cover Reel
rm -rf "$B" "$R/video.mp4" "$R/audio.wav" "$R/video.txt" "$R/audio.txt" "$R/Reel.wav" "$R/Reel-Cover.wav"
echo "Deliverables: $E/$ID.mp4, $E/$ID-cover.jpg, $E/$ID-cover-2x3.jpg"
