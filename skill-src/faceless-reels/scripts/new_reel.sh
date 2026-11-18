#!/bin/zsh
# Creates the working folder of a new reel next to the video: _reel/{remotion,voice,hook,reference,render,exports}.
# Usage: zsh new_reel.sh "<video folder>" [<cover image>]
# Cover image: the one given, else "<video folder>/cover.png", else the skill's assets/cover/cover-template.png.
# node_modules: cloned from the most recent project under projects_root (config.json) when possible, else npm install.
set -e
V="${1:?usage: zsh new_reel.sh <video folder> [<cover image>]}"
V="${V:A}"
SK="${0:A:h:h}"
M="$V/_reel"
mkdir -p "$M"/{voice,hook,reference,render,exports}
rsync -a "$SK/assets/reel-template/" "$M/remotion/"

C="${2:-$V/cover.png}"
[ -f "$C" ] || C="$SK/assets/cover/cover-template.png"
python3 "$SK/scripts/prep_cover.py" "$C" "$M/remotion/public/reel"

# Sound effects and music are generated, not shipped (except the small sfx kept in the template).
NEED_SOUNDS=0
for s in pop pop-high tick key click stamp ding chime whoosh whoosh-short sparkles impact riser swoosh-up power-off; do
  [ -f "$M/remotion/public/sfx/$s.wav" ] || NEED_SOUNDS=1
done
[ -f "$M/remotion/public/music/soft.wav" ] || NEED_SOUNDS=1
if [ "$NEED_SOUNDS" = 1 ]; then
  python3 "$SK/scripts/make_sounds.py" "$M/remotion/public"
fi

# projects_root from config.json, else config.example.json, else empty (plain npm install).
CFG="$SK/config.json"
[ -f "$CFG" ] || CFG="$SK/config.example.json"
ROOT=""
if [ -f "$CFG" ]; then
  ROOT="$(python3 -I -c 'import json,os,sys; print(os.path.expanduser(json.load(open(sys.argv[1])).get("projects_root") or ""))' "$CFG" 2>/dev/null || true)"
fi

cd "$M/remotion"
PREV=""
if [ -n "$ROOT" ] && [ -d "$ROOT" ]; then
  # Most recent node_modules of another project, up to two levels below projects_root.
  CANDIDATES=("$ROOT"/*/_reel/remotion/node_modules(N/) "$ROOT"/*/*/_reel/remotion/node_modules(N/))
  (( ${#CANDIDATES} )) && CANDIDATES=("${(@f)$(ls -dt -- $CANDIDATES)}")
  for c in $CANDIDATES; do
    [[ "$c" == "$M/"* ]] && continue
    PREV="$c"; break
  done
fi
if [ ! -d node_modules ] && [ -n "$PREV" ] && [ -d "$PREV/remotion" ] && [ -d "$PREV/@remotion/media" ]; then
  # APFS clone on macOS (instant, no extra disk space); plain copy elsewhere.
  cp -cR "$PREV" node_modules 2>/dev/null || { rm -rf node_modules; cp -R "$PREV" node_modules; }
fi
npm install --no-audit --no-fund
echo "Project ready: $M/remotion"
