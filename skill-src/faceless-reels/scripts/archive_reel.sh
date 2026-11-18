#!/bin/zsh
# Archives a finished reel: inspiration/in-progress/<folder> becomes inspiration/done/<final name>.
# Usage: zsh archive_reel.sh "<in-progress folder>" "<final name, e.g. 00 - TOOLS>"
# Result: reference.mp4, publish/, guide/, reel/, report.md. node_modules is removed: it is cloned again for the next reel.
set -e
W="${1:?usage: zsh archive_reel.sh <in-progress folder> <final name>}"
N="${2:?usage: zsh archive_reel.sh <in-progress folder> <final name>}"
W="${W:A}"
I="${W:h:h}"
[ -f "$W/reference.mp4" ] || { echo "missing $W/reference.mp4" >&2; exit 1; }
[ -d "$W/_reel/exports" ] || { echo "missing $W/_reel/exports" >&2; exit 1; }
mkdir -p "$I/done"
[ ! -e "$I/done/$N" ] || { echo "already exists: $I/done/$N" >&2; exit 1; }
mkdir -p "$W/guide"
mv "$W/_reel/exports" "$W/publish"
rm -rf "${W:?}/_reel/remotion/node_modules"
rm -f "$W/_reel/render/"*.jpg(N) "$W/_reel/render/f16.wav"
[ -d "$W/ref" ] && mv "$W/ref" "$W/_reel/reference/images"
mv "$W/_reel" "$W/reel"
mv "$W" "$I/done/$N"
echo "$I/done/$N"
