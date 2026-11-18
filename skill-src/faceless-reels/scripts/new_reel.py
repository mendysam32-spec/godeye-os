#!/usr/bin/env python3
"""Creates the working folder of a new reel next to the video:
_reel/{voice,hook,reference,render,exports,remotion}.

Cross-platform port of new_reel.sh (zsh/macOS). Cover image: the one given,
else "<video folder>/cover.png", else the skill's cover template. node_modules
is cloned from the most recent project under projects_root (config.json) when
possible, else npm install runs.

Usage: python new_reel.py "<video folder>" [<cover image>]
"""
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from reel_common import (SKILL_DIR, newest_under, python_bin, run, shell,  # noqa: E402
                         config_value)

SFX = ["pop", "pop-high", "tick", "key", "click", "stamp", "ding", "chime",
       "whoosh", "whoosh-short", "sparkles", "impact", "riser", "swoosh-up",
       "power-off"]


def main():
    if len(sys.argv) < 2:
        sys.exit('usage: python new_reel.py "<video folder>" [<cover image>]')
    v = Path(sys.argv[1]).expanduser().resolve()
    if not v.is_dir():
        sys.exit(f"video folder not found: {v}")
    sk = SKILL_DIR
    m = v / "_reel"

    for sub in ("voice", "hook", "reference", "render", "exports"):
        (m / sub).mkdir(parents=True, exist_ok=True)

    remotion = m / "remotion"
    if not remotion.exists():
        shutil.copytree(sk / "assets" / "reel-template", remotion)

    cover = Path(sys.argv[2]).expanduser() if len(sys.argv) > 2 else v / "cover.png"
    if not cover.is_file():
        cover = sk / "assets" / "cover" / "cover-template.png"
    run([python_bin(), sk / "scripts" / "prep_cover.py", cover, remotion / "public" / "reel"])

    # Sound effects and music are generated, not shipped (except the small sfx
    # kept in the template).
    need_sounds = any(not (remotion / "public" / "sfx" / f"{s}.wav").is_file() for s in SFX)
    if not (remotion / "public" / "music" / "soft.wav").is_file():
        need_sounds = True
    if need_sounds:
        run([python_bin(), sk / "scripts" / "make_sounds.py", remotion / "public"])

    # node_modules: clone from the most recent sibling project when possible.
    if not (remotion / "node_modules").is_dir():
        root = config_value("projects_root", "")
        prev = newest_under(root, "_reel/remotion/node_modules", exclude_prefix=m)
        if prev and (prev / "remotion").is_dir() and (prev / "@remotion" / "media").is_dir():
            print(f"cloning node_modules from {prev} (plain copy — this can take a minute)")
            shutil.copytree(prev, remotion / "node_modules")

    r = shell(["npm", "install", "--no-audit", "--no-fund"], cwd=remotion)
    if r.returncode != 0:
        sys.exit("npm install failed — check node/npm, then run it manually in "
                 f"{remotion}")
    print(f"Project ready: {m / 'remotion'}")


if __name__ == "__main__":
    main()
