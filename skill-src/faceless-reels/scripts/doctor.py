#!/usr/bin/env python3
"""Doctor for the faceless-reels skill: checks the machine once and says what
is missing. Cross-platform (Windows / macOS / Linux).

Usage: python doctor.py
Exit code 0 = everything required is present; 1 = at least one required item
is missing (the list tells you exactly what to install).
"""
import importlib.util
import shutil
import sys

sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent))
from reel_common import SKILL_DIR, config_value, load_config, resolve_ffmpeg, resolve_ffprobe  # noqa: E402


def has_module(name):
    try:
        return importlib.util.find_spec(name) is not None
    except Exception:
        return False


def main():
    cfg = load_config()
    required, optional = [], []

    ver = sys.version_info
    required.append(("python >= 3.9", ver >= (3, 9), f"{ver.major}.{ver.minor}"))

    required.append(("pip: numpy", has_module("numpy"),
                     "pip install numpy  (sound + video checks)"))
    required.append(("pip: pillow", has_module("PIL"),
                     "pip install pillow  (cover + contact sheets)"))
    required.append(("ffmpeg", bool(resolve_ffmpeg()),
                     "install ffmpeg and add to PATH (Windows: winget install Gyan.FFmpeg)"))
    required.append(("ffprobe", bool(resolve_ffprobe()),
                     "install a full ffmpeg build (bundles ffprobe)"))

    node = shutil.which("node")
    npm = shutil.which("npm") or shutil.which("npm.cmd")
    required.append(("node (Remotion render)", bool(node), "install Node 18+ from nodejs.org"))
    required.append(("npm", bool(npm), "ships with Node"))

    optional.append(("curl (ElevenLabs API calls)", bool(shutil.which("curl")),
                     "Windows 10+ ships curl.exe; otherwise install curl"))
    optional.append(("whisper-cli (local take checks)", bool(shutil.which("whisper-cli")),
                     "optional: ElevenLabs Scribe timestamps are the source of truth"))
    optional.append(("imageio-ffmpeg (ffmpeg fallback)", bool(resolve_ffmpeg()) or bool(has_module("imageio_ffmpeg")),
                     "pip install imageio-ffmpeg"))

    print("== faceless-reels doctor ==")
    ok = True
    for name, good, hint in required:
        print(f"  [{'ok' if good else 'MISSING'}] {name}" + ("" if good else f"  -> {hint}"))
        ok = ok and good
    for name, good, hint in optional:
        print(f"  [{'ok' if good else 'skip'}] {name}" + ("" if good else f"  ({hint})"))

    voice = config_value("elevenlabs_voice_id", "")
    print(f"  [{'ok' if voice and 'YOUR' not in voice.upper() else 'TODO'}] "
          f"elevenlabs_voice_id in config.json"
          + ("" if voice and "YOUR" not in voice.upper()
             else "  -> copy config.example.json to config.json and fill in your cloned voice id"))
    print(f"  [{'ok' if (SKILL_DIR / 'config.json').is_file() else 'TODO'}] config.json "
          "(using config.example.json fallback)" if not (SKILL_DIR / 'config.json').is_file()
          else "  [ok] config.json present")
    projects = config_value("projects_root", "")
    if projects:
        print(f"  [info] projects_root: {projects} (reuses node_modules between reels)")

    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
