#!/usr/bin/env python3
"""Check Diagram Studio dependencies: Playwright/Chromium + the bundled Mermaid."""
import importlib.util
import subprocess
import sys
from pathlib import Path

VENDOR = Path(__file__).resolve().parent.parent / "vendor" / "mermaid.min.js"


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
    if importlib.util.find_spec("playwright") is None:
        print("installing playwright...")
        result = subprocess.run([sys.executable, "-m", "pip", "install", "-q", "playwright"], check=False)
        if result.returncode != 0 or importlib.util.find_spec("playwright") is None:
            sys.exit("could not install playwright - run: python -m pip install playwright")

    if not chromium_ok():
        print("installing Playwright Chromium...")
        subprocess.run([sys.executable, "-m", "playwright", "install", "chromium"], check=False)
        if not chromium_ok():
            sys.exit("Chromium is still unavailable - run: python -m playwright install chromium")

    if not VENDOR.exists() or VENDOR.stat().st_size < 1_000_000:
        sys.exit(f"bundled Mermaid missing or truncated: {VENDOR} - reinstall the skill")

    print(f"diagram-studio ready: playwright/chromium + mermaid ({VENDOR.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
