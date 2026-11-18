#!/usr/bin/env python3
"""Sends a Telegram message to the creator (autonomous mode notifications).

The bot token stays in the env file named by config.json "telegram_env"
(default ~/.config/faceless-reels/telegram.env, with TELEGRAM_TOKEN and
TELEGRAM_CHAT_ID) and is never printed.

Cross-platform port of telegram.sh (zsh/macOS).

Usage: python telegram.py "text"   or   python telegram.py --file message.txt
"""
import os
import sys
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from reel_common import config_value, eprint  # noqa: E402


def read_env_file(path):
    out = {}
    for line in Path(path).read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        out[k.strip()] = v.strip().strip('"').strip("'")
    return out


def main():
    if len(sys.argv) < 2:
        sys.exit('usage: python telegram.py "text"   or   python telegram.py --file message.txt')
    if sys.argv[1] == "--file":
        p = Path(sys.argv[2])
        if not p.is_file():
            sys.exit(f"message file not found: {p}")
        text = p.read_text(encoding="utf-8")
    else:
        text = sys.argv[1]

    envf = config_value("telegram_env", "")
    if envf:
        envf = os.path.expanduser(envf)
    if not envf or not Path(envf).is_file():
        envf = os.path.join(os.path.expanduser("~"), ".config", "faceless-reels", "telegram.env")
    if not Path(envf).is_file():
        sys.exit(f"telegram: env file not found: {envf}")

    env = read_env_file(envf)
    token, chat = env.get("TELEGRAM_TOKEN", ""), env.get("TELEGRAM_CHAT_ID", "")
    if not token or not chat:
        sys.exit(f"telegram: TELEGRAM_TOKEN or TELEGRAM_CHAT_ID missing in {envf}")

    data = urllib.parse.urlencode({
        "chat_id": chat,
        "disable_web_page_preview": "true",
        "text": text,
    }).encode()
    req = urllib.request.Request(
        f"https://api.telegram.org/bot{token}/sendMessage", data=data)
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            code = r.status
    except Exception as e:
        eprint(f"telegram: request failed: {e}")
        sys.exit(1)
    print("telegram", code)
    sys.exit(0 if code == 200 else 1)


if __name__ == "__main__":
    main()
