#!/usr/bin/env python3
"""Shared helpers for the faceless-reels skill scripts.

Cross-platform (Windows / macOS / Linux): no zsh, no rsync, no APFS clones.
ffmpeg/ffprobe are resolved from PATH, with imageio-ffmpeg as a fallback for
ffmpeg. npm/npx run through the shell (npm is npm.cmd on Windows).

The zsh originals (macOS) are kept next to these ports as upstream reference.
"""
import glob
import json
import os
import shlex
import shutil
import subprocess
import sys
from pathlib import Path

SKILL_DIR = Path(__file__).resolve().parent.parent


def load_config():
    """config.json at the skill root, else config.example.json."""
    for name in ("config.json", "config.example.json"):
        p = SKILL_DIR / name
        if p.is_file():
            try:
                cfg = json.loads(p.read_text(encoding="utf-8"))
                return cfg if isinstance(cfg, dict) else {}
            except Exception as e:
                print(f"config: could not parse {p.name}: {e}", file=sys.stderr)
    return {}


def config_value(key, default=""):
    raw = load_config().get(key) or default
    if isinstance(raw, str) and raw.startswith("~"):
        raw = os.path.expanduser(raw)
    return raw


def _imageio_ffmpeg():
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return None


def resolve_ffmpeg():
    return shutil.which("ffmpeg") or _imageio_ffmpeg()


def resolve_ffprobe():
    return shutil.which("ffprobe")


def require_tools(need_probe=True):
    ff = resolve_ffmpeg()
    if not ff:
        sys.exit("ffmpeg not found. Install it and add it to PATH "
                 "(Windows: winget install Gyan.FFmpeg | macOS: brew install ffmpeg).")
    if need_probe and not resolve_ffprobe():
        sys.exit("ffprobe not found. Install a full ffmpeg build (it bundles ffprobe).")
    return ff


def run(cmd, **kw):
    """subprocess.run with clean list args; echoes the command first."""
    cmd = [str(c) for c in cmd]
    print("+ " + " ".join(cmd), flush=True)
    return subprocess.run(cmd, **kw)


def shell(args, cwd=None, env=None):
    """Run a command through the system shell — required for npm/npx on Windows
    (CreateProcess does not resolve npm.cmd)."""
    args = [str(a) for a in args]
    if os.name == "nt":
        cmd = subprocess.list2cmdline(args)
    else:
        cmd = " ".join(shlex.quote(a) for a in args)
    print("+ " + cmd, flush=True)
    return subprocess.run(cmd, shell=True, cwd=str(cwd) if cwd else None, env=env)


def python_bin():
    """The interpreter running this script (never assume python3 exists)."""
    return sys.executable or "python"


def eprint(*a):
    print(*a, file=sys.stderr, flush=True)


def newest_under(root, rel_pattern, exclude_prefix=None):
    """Newest directory matching `<root>/<rel_pattern with one level of glob>`,
    two levels deep, skipping anything under exclude_prefix. Returns a Path or
    None. Mirrors the zsh `($ROOT/*/_reel/remotion/node_modules(N/))` candidates."""
    if not root or not Path(root).is_dir():
        return None
    cands = []
    base = Path(os.path.expanduser(root))
    for pat in (rel_pattern, "*/" + rel_pattern):
        cands += [Path(p) for p in glob.glob(str(base / pat)) if Path(p).is_dir()]
    cands = sorted(set(cands), key=lambda p: p.stat().st_mtime, reverse=True)
    if exclude_prefix:
        excl = str(Path(exclude_prefix).resolve())
        cands = [c for c in cands if not str(c.resolve()).startswith(excl)]
    return cands[0] if cands else None
