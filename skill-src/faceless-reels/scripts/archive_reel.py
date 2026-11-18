#!/usr/bin/env python3
"""Archives a finished reel: <video folder>/ in-progress becomes
<inspiration root>/done/<final name> (reference.mp4, publish/, guide/, reel/).

node_modules is removed: it is cloned again for the next reel.

Cross-platform port of archive_reel.sh (zsh/macOS).

Usage: python archive_reel.py "<in-progress folder>" "<final name, e.g. 00 - TOOLS>"
"""
import shutil
import sys
from pathlib import Path


def main():
    if len(sys.argv) != 3:
        sys.exit('usage: python archive_reel.py "<in-progress folder>" "<final name>"')
    w = Path(sys.argv[1]).expanduser().resolve()
    n = sys.argv[2]
    if not (w / "reference.mp4").is_file():
        sys.exit(f"missing {w / 'reference.mp4'}")
    if not (w / "_reel" / "exports").is_dir():
        sys.exit(f"missing {w / '_reel' / 'exports'}")
    done = w.parent.parent / "done"
    done.mkdir(parents=True, exist_ok=True)
    if (done / n).exists():
        sys.exit(f"already exists: {done / n}")
    (w / "guide").mkdir(parents=True, exist_ok=True)
    shutil.move(str(w / "_reel" / "exports"), str(w / "publish"))
    nm = w / "_reel" / "remotion" / "node_modules"
    if nm.exists():
        shutil.rmtree(nm)
    for jpg in (w / "_reel" / "render").glob("*.jpg"):
        jpg.unlink()
    f16 = w / "_reel" / "render" / "f16.wav"
    if f16.is_file():
        f16.unlink()
    ref = w / "ref"
    if ref.is_dir():
        shutil.move(str(ref), str(w / "_reel" / "reference" / "images"))
    shutil.move(str(w / "_reel"), str(w / "reel"))
    shutil.move(str(w), str(done / n))
    print(done / n)


if __name__ == "__main__":
    main()
