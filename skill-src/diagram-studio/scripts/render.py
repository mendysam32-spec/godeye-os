#!/usr/bin/env python3
"""Render Mermaid diagrams to SVG + PNG.

usage: render.py diagram.mmd [options]
       render.py diagrams.json [options]

options:
  --out DIR       output directory (default: ./diagrams)
  --theme NAME    default | dark | neutral | forest (default: default)
  --scale N       PNG device scale (default: 2)
  --format F      both | svg | png (default: both)
"""
import argparse
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

import mermaid_renderer

VALID_FORMATS = ("both", "svg", "png")
VALID_THEMES = ("default", "dark", "neutral", "forest", "base")


def _load_input(path):
    """Return (default_name, theme, scale, items[(name, code)])."""
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"input not found: {path}")
    if path.suffix.lower() == ".json":
        spec = json.loads(path.read_text(encoding="utf-8-sig"))
        items = []
        for index, entry in enumerate(spec.get("diagrams") or []):
            if isinstance(entry, dict) and str(entry.get("code") or "").strip():
                name = str(entry.get("name") or f"diagram-{index + 1}").strip()
                items.append((name, str(entry["code"])))
        theme = spec.get("theme") or "default"
        scale = spec.get("scale") or 2
        if not items:
            raise ValueError("spec has no diagrams: entries need a 'code' field")
        return None, theme, scale, items
    code = path.read_text(encoding="utf-8-sig")
    if not code.strip():
        raise ValueError(f"diagram source is empty: {path}")
    return path.stem, "default", 2, [(path.stem, code)]


def main():
    parser = argparse.ArgumentParser(description="Render Mermaid diagrams.")
    parser.add_argument("input", help=".mmd file or batch .json spec")
    parser.add_argument("--out", default="diagrams", help="output directory (default ./diagrams)")
    parser.add_argument("--theme", default=None, choices=VALID_THEMES)
    parser.add_argument("--scale", type=int, default=None)
    parser.add_argument("--format", default="both", choices=VALID_FORMATS)
    args = parser.parse_args()

    try:
        default_name, spec_theme, spec_scale, items = _load_input(args.input)
    except (FileNotFoundError, ValueError, json.JSONDecodeError) as error:
        sys.exit(str(error))

    theme = args.theme or spec_theme
    scale = args.scale or spec_scale
    out_dir = Path(args.out).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    want_svg = args.format in ("both", "svg")
    want_png = args.format in ("both", "png")

    results, errors = [], []
    for name, code in items:
        safe_name = "".join(ch if ch.isalnum() or ch in "-_" else "-" for ch in name) or "diagram"
        out_base = out_dir / safe_name
        try:
            rendered = mermaid_renderer.render_one(
                code, out_base, theme=theme, scale=scale, want_svg=want_svg, want_png=want_png
            )
            results.append({"name": name, "ok": True, **rendered})
        except Exception as error:  # per-diagram failure must not kill the batch
            errors.append({"name": name, "error": str(error)[:500]})

    if not results and not errors:
        sys.exit("nothing rendered")
    print(json.dumps({
        "ok": not errors,
        "theme": theme,
        "scale": scale,
        "rendered": results,
        "errors": errors,
    }, indent=2))
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
