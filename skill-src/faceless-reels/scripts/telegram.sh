#!/bin/zsh
# Sends a Telegram message to the creator. The bot token stays in the env file (config.json "telegram_env",
# default ~/.config/faceless-reels/telegram.env, with TELEGRAM_TOKEN and TELEGRAM_CHAT_ID) and is never printed.
# Usage: zsh telegram.sh "text"   or   zsh telegram.sh --file message.txt
set -e
SK="${0:A:h:h}"
CFG="$SK/config.json"
[ -f "$CFG" ] || CFG="$SK/config.example.json"
ENVF=""
if [ -f "$CFG" ]; then
  ENVF="$(python3 -I -c 'import json,os,sys; print(os.path.expanduser(json.load(open(sys.argv[1])).get("telegram_env") or ""))' "$CFG" 2>/dev/null || true)"
fi
[ -n "$ENVF" ] || ENVF="$HOME/.config/faceless-reels/telegram.env"
[ -f "$ENVF" ] || { echo "telegram: env file not found: $ENVF" >&2; exit 1; }
source "$ENVF"
[ -n "$TELEGRAM_TOKEN" ] && [ -n "$TELEGRAM_CHAT_ID" ] || { echo "telegram: TELEGRAM_TOKEN or TELEGRAM_CHAT_ID missing in $ENVF" >&2; exit 1; }
if [ "$1" = "--file" ]; then T="$(<"${2:?usage: zsh telegram.sh --file message.txt}")"; else T="${1:?usage: zsh telegram.sh \"text\"}"; fi
# The URL holding the token is passed to curl on stdin, so it never shows in the process list or the output.
C=$(print -r -- "url = \"https://api.telegram.org/bot$TELEGRAM_TOKEN/sendMessage\"" | curl -s -o /dev/null -w "%{http_code}" -K - -d chat_id="$TELEGRAM_CHAT_ID" -d disable_web_page_preview=true --data-urlencode text="$T")
echo "telegram $C"
[ "$C" = "200" ]
