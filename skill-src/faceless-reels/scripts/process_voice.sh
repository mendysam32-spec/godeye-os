#!/bin/zsh
# Processes the ElevenLabs voice without cutting anything: EQ, de-esser, gentle compressor, two-pass linear loudnorm to -16 LUFS.
# Usage: zsh process_voice.sh <take.mp3> <public/reel/voice.wav>
set -e
IN="${1:?usage: zsh process_voice.sh <take.mp3> <public/reel/voice.wav>}"
OUT="${2:?usage: zsh process_voice.sh <take.mp3> <public/reel/voice.wav>}"
CHAIN="highpass=f=75,equalizer=f=250:t=q:w=1.2:g=-2,equalizer=f=3200:t=q:w=1.0:g=2,equalizer=f=9000:t=q:w=1.0:g=1,deesser=i=0.3,acompressor=threshold=-21dB:ratio=2.5:attack=8:release=120:makeup=1.5"
MEAS=$(ffmpeg -hide_banner -nostats -i "$IN" -af "$CHAIN,loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json" -f null - 2>&1 | sed -n '/^{/,/^}/p')
P=$(echo "$MEAS" | python3 -I -c "import json,sys;d=json.load(sys.stdin);print(f\"measured_I={d['input_i']}:measured_TP={d['input_tp']}:measured_LRA={d['input_lra']}:measured_thresh={d['input_thresh']}:offset={d['target_offset']}\")")
ffmpeg -hide_banner -loglevel error -y -i "$IN" -af "$CHAIN,loudnorm=I=-16:TP=-1.5:LRA=11:linear=true:$P" -ar 48000 -ac 1 -c:a pcm_s24le "$OUT"
A=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$IN")
B=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT")
echo "source duration $A s, processed duration $B s"
ffmpeg -hide_banner -nostats -i "$OUT" -af loudnorm=print_format=summary -f null - 2>&1 | grep -E "Input (Integrated|True Peak)"
