#!/usr/bin/env python3
"""Check (and install) Deck Builder dependencies: python-pptx, matplotlib; Chromium optional."""
import importlib.util
import subprocess
import sys

NEED = {
    "pptx": "python-pptx",
    "matplotlib": "matplotlib",
    "PIL": "pillow",
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


def chromium_ok():
    try:
        from playwright.sync_api import sync_playwright

        with sync_playwright() as playwright:
            browser = playwright.chromium.launch()
            browser.close()
        return True
    except Exception:
        return False


def main():
    missing = [package for module, package in NEED.items() if importlib.util.find_spec(module) is None]
    if missing:
        print("installing:", *missing)
        if not pip(*missing):
            sys.exit("could not install " + " ".join(missing))

    message = "deck-builder ready: python-pptx, matplotlib, pillow"
    if importlib.util.find_spec("playwright") is None:
        print(message, "(no playwright - html previews unavailable, pptx still works)")
        return
    if not chromium_ok():
        print("installing Playwright Chromium (for html previews)...")
        subprocess.run([sys.executable, "-m", "playwright", "install", "chromium"], check=False)
        if not chromium_ok():
            print(message, "(chromium unavailable - html previews unavailable, pptx still works)")
            return
    print(message + ", playwright/chromium")


if __name__ == "__main__":
    main()
