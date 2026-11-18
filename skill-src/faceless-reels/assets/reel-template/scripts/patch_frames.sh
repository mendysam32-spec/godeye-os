#!/bin/zsh
# Replaces frame ranges of an already rendered segment (`<render>/<SEGMENT>.mkv`) with a new render of those ranges only,
# without re-rendering the whole segment. Useful when a few passages have a render defect (e.g. semi-transparent elements
# that vanish one frame out of three with the default GPU): the ranges are re-rendered with GL=swangle on a single tab,
# then the segment video is re-encoded with the same settings as Remotion (x264 medium, CRF 16, yuv420p tv bt709).
# The segment audio (PCM track of the MKV) is copied as is; the `.audio.wav` track is not touched.
# Usage: BUNDLE=<bundle> zsh scripts/patch_frames.sh "<render folder>" SEGMENT START-END [START-END ...]
# (ranges in segment frames, bounds included, in order and without overlap)
set -e
OUT="$1"
P="$2"
shift 2
SRC="$OUT/$P.mkv"
TMP="$OUT/_patch_$P"
mkdir -p "$TMP"
N=$(ffprobe -v error -select_streams v:0 -count_packets -show_entries stream=nb_read_packets -of csv=p=0 "$SRC")
W=$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0:s=x "$SRC")
# the longest side of the composition is 1920 px, in portrait as in landscape
SCALE=$(python3 -c "print(repr(max(${W/x/,}) / 1920))")
INPUTS=(-i "$SRC")
# each range is laid over the original video (full frame overlay, timestamps recomputed frame by frame):
# a single decode, without buffering long stretches in memory
FILTER="[0:v]settb=1/30,setpts=N[m0]"
I=1
for R in "$@"; do
  A=${R%-*}
  B=${R#*-}
  echo "=== $P: frames $A to $B ($(date +%H:%M:%S))"
  # a range already rendered (rerun after a failure) is reused if it has the right frame count
  K=$( [ -f "$TMP/p$I.mkv" ] && ffprobe -v error -select_streams v:0 -count_packets -show_entries stream=nb_read_packets -of csv=p=0 "$TMP/p$I.mkv" || echo 0)
  [ "$K" = "$((B - A + 1))" ] || npx remotion render ${BUNDLE:+"$BUNDLE"} "$P" "$TMP/p$I.mkv" --frames=$A-$B --scale=$SCALE --codec=h264 --crf=16 --jpeg-quality=95 --concurrency=1 --timeout=180000 --muted --pixel-format=yuv420p --color-space=bt709 --chrome-mode=${CHROME_MODE:-chrome-for-testing} --gl=swangle --log=error
  K=$(ffprobe -v error -select_streams v:0 -count_packets -show_entries stream=nb_read_packets -of csv=p=0 "$TMP/p$I.mkv")
  [ "$K" = "$((B - A + 1))" ] || { echo "range $R: $K frames rendered" >&2; exit 1; }
  INPUTS+=(-i "$TMP/p$I.mkv")
  FILTER+=";[${I}:v]settb=1/30,setpts=N+${A}[q$I];[m$((I - 1))][q$I]overlay=eof_action=pass:repeatlast=0:format=yuv420[m$I]"
  I=$((I + 1))
done
ffmpeg -hide_banner -loglevel error -y "${INPUTS[@]}" -filter_complex "$FILTER" -map "[m$((I - 1))]" -map 0:a -c:v libx264 -preset medium -crf 16 \
  -pix_fmt yuv420p -color_range tv -colorspace bt709 -color_primaries bt709 -color_trc bt709 -c:a copy "$TMP/$P.mkv"
M=$(ffprobe -v error -select_streams v:0 -count_packets -show_entries stream=nb_read_packets -of csv=p=0 "$TMP/$P.mkv")
[ "$M" = "$N" ] || { echo "frame count differs: $M instead of $N" >&2; exit 1; }
mv "$TMP/$P.mkv" "$SRC"
rm -rf "$TMP"
echo "=== $P: $N frames, ranges replaced ($(date +%H:%M:%S))"
