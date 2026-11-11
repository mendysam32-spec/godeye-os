#!/usr/bin/env python3
"""Build a polished PowerPoint deck from a JSON spec.

usage: build_deck.py deck.json [--out NAME] [--preview] [--keep-html]

The spec and any CSV/image paths are resolved relative to the spec file.
"""
import argparse
import json
import shutil
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

import common
import html_preview
import pptx_deck


def main():
    parser = argparse.ArgumentParser(description="Render a Deck Builder deck.")
    parser.add_argument("spec", help="path to deck.json")
    parser.add_argument("--out", default=None, help="output base path (without extension)")
    parser.add_argument("--preview", action="store_true", help="write preview PNGs")
    parser.add_argument("--keep-html", action="store_true", help="keep the HTML mirror next to the pptx")
    args = parser.parse_args()

    spec_path = Path(args.spec).resolve()
    if not spec_path.exists():
        sys.exit(f"spec not found: {spec_path}")
    try:
        spec = json.loads(spec_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        sys.exit(f"spec is not valid JSON: {error}")

    base_dir = spec_path.parent
    out_base = Path(args.out).resolve() if args.out else base_dir / (spec.get("filename") or "deck")
    out_base.parent.mkdir(parents=True, exist_ok=True)
    theme = common.theme(spec)
    slides = common.section_numbering(list(spec.get("slides") or []))
    if not slides:
        sys.exit("spec has no slides")

    outputs = {}
    work_dir = Path(tempfile.mkdtemp(prefix="deck-builder-"))
    try:
        slides = common.prepare_slides(spec, base_dir, work_dir, theme)

        pptx_path = out_base.with_suffix(".pptx")
        pptx_deck.build_pptx(spec, slides, theme, pptx_path)
        outputs["pptx"] = str(pptx_path)
        outputs["pptx_bytes"] = pptx_path.stat().st_size

        html_path = work_dir / "deck.html"
        html_preview.build_html(spec, slides, theme, html_path)
        if args.keep_html:
            html_copy = out_base.with_suffix(".html")
            shutil.copyfile(html_path, html_copy)
            outputs["html"] = str(html_copy)
        if args.preview:
            outputs["previews"] = html_preview.render_previews(html_path, out_base.parent)

        summary = {
            "ok": True,
            "title": spec.get("title"),
            "slides": len(slides),
            "theme": theme["mode"],
            "outputs": outputs,
        }
        print(json.dumps(summary, indent=2))
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


if __name__ == "__main__":
    main()
