#!/bin/zsh
# Assembles rendered segments (MKV: H.264 + PCM, plus their audio-only track .audio.wav): video copied without re-encoding,
# PCM audio joined sample-accurately, brought to -14 LUFS (peaks under -1 dBTP), encoded as AAC.
# Usage: zsh scripts/assemble_parts.sh "<render folder>" "<final video .mp4>" SEGMENT [SEGMENT ...]
set -e
R="$1"
OUT="$2"
shift 2
: > "$R/video.txt"
: > "$R/audio.txt"
for P in "$@"; do
  if [ -f "$R/$P.audio.wav" ]; then
    ffmpeg -hide_banner -loglevel error -y -i "$R/$P.audio.wav" -c:a pcm_s16le -ar 48000 -ac 2 "$R/$P.wav"
  else
    ffmpeg -hide_banner -loglevel error -y -i "$R/$P.mkv" -vn -c:a pcm_s16le -ar 48000 -ac 2 "$R/$P.wav"
  fi
  echo "file '$R/$P.mkv'" >> "$R/video.txt"
  echo "file '$R/$P.wav'" >> "$R/audio.txt"
done
ffmpeg -hide_banner -loglevel error -y -f concat -safe 0 -i "$R/video.txt" -map 0:v -c copy "$R/video.mp4"
ffmpeg -hide_banner -loglevel error -y -f concat -safe 0 -i "$R/audio.txt" -c copy "$R/audio.wav"
# linear gain up to -14 LUFS, then an oversampled (x4) limiter at -3 dBFS: AAC encoding pushes peaks over,
# sometimes by more than 2 dB on a click. If the peak measured at the end is above -1 dBTP, lower the gain by a few hundredths.
# -aac_is 0 -aac_pns 0: with intensity stereo, the ffmpeg AAC encoder once pushed a hissing "x" on a single channel
# to +1.3 dBFS (limiter at -3.1 dBFS); without it, the final peak was -3.0 dBTP.
II=$(ffmpeg -hide_banner -nostats -i "$R/audio.wav" -af loudnorm=print_format=json -f null - 2>&1 | sed -n '/^{/,/^}/p' | python3 -I -c "import json,sys;print(json.load(sys.stdin)['input_i'])")
G=$(python3 -c "print(round(-14 - ($II), 2))")
echo "before: ${II} LUFS, gain ${G} dB"
ffmpeg -hide_banner -loglevel error -y -i "$R/video.mp4" -i "$R/audio.wav" -map 0:v -map 1:a -c:v copy \
  -af "volume=${G}dB,aresample=192000,alimiter=limit=0.70:attack=5:release=50:level=false,aresample=48000" \
  -c:a aac -b:a 320k -ar 48000 -aac_is 0 -aac_pns 0 -movflags +faststart "$OUT"
ffmpeg -hide_banner -nostats -i "$OUT" -vn -af loudnorm=print_format=summary -f null - 2>&1 | grep -E "Input (Integrated|True Peak)"
ffprobe -v error -show_entries stream=codec_name,width,height,r_frame_rate,duration,sample_rate -of compact "$OUT"
