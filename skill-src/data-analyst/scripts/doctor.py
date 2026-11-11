#!/usr/bin/env python3
"""Check (and install) Data Analyst dependencies. Core analysis is stdlib-only;
matplotlib is needed for charts."""
import importlib.util
import subprocess
import sys

NEED = {
    "matplotlib": "matplotlib",
}


def pip(*packages):
    for extra in ([], ["--user"], ["--break-system-packages"]):
        result = subprocess.run(
            [sys.executable, "-m", "pip", "install", "-q", *extra, *packages],
            capture_output=True,
            text=True,
        )
        if result.returncode == 0:
            return True
    print(result.stderr[-600:])
    return False


def main():
    missing = [package for module, package in NEED.items() if importlib.util.find_spec(module) is None]
    if missing:
        print("installing:", *missing)
        if not pip(*missing):
            sys.exit("could not install " + " ".join(missing))
    print("data-analyst ready: stdlib profiling + matplotlib charts")


if __name__ == "__main__":
    main()
