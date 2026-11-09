#!/usr/bin/env python3
"""Build a polished PDF + Word report from a JSON spec.

usage: build_report.py report.json [--out NAME] [--format pdf|docx|both] [--preview] [--keep-html]

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
import docx_report
import html_report


def main():
    parser = argparse.ArgumentParser(description="Render a Report Studio report.")
    parser.add_argument("spec", help="path to report.json")
    parser.add_argument("--out", default=None, help="output base path (without extension)")
    parser.add_argument("--format", default="both", choices=["pdf", "docx", "both"])
    parser.add_argument("--preview", action="store_true", help="write preview PNGs")
    parser.add_argument("--keep-html", action="store_true", help="keep the intermediate HTML")
    args = parser.parse_args()

    spec_path = Path(args.spec).resolve()
    if not spec_path.exists():
        sys.exit(f"spec not found: {spec_path}")
    try:
        spec = json.loads(spec_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        sys.exit(f"spec is not valid JSON: {error}")

    base_dir = spec_path.parent
    out_base = Path(args.out).resolve() if args.out else base_dir / (spec.get("filename") or "report")
    out_base.parent.mkdir(parents=True, exist_ok=True)
    theme = common.merged_theme(spec)

    work_dir = Path(tempfile.mkdtemp(prefix="report-studio-"))
    outputs = {}
    try:
        sections = common.prepare_sections(spec, base_dir, work_dir, theme)
        if not sections:
            sys.exit("spec has no sections")

        if args.format in ("pdf", "both"):
            html_path = work_dir / "report.html"
            html_report.build_html(spec, sections, theme, html_path)
            pdf_path = out_base.with_suffix(".pdf")
            html_report.render_pdf(html_path, pdf_path, spec, theme)
            outputs["pdf"] = str(pdf_path)
            if args.keep_html:
                html_copy = out_base.with_suffix(".html")
                shutil.copyfile(html_path, html_copy)
                outputs["html"] = str(html_copy)
            if args.preview:
                outputs["previews"] = html_report.render_preview(html_path, out_base.parent, spec)

        if args.format in ("docx", "both"):
            docx_path = out_base.with_suffix(".docx")
            docx_report.build_docx(spec, sections, theme, docx_path)
            outputs["docx"] = str(docx_path)

        summary = {
            "ok": True,
            "title": spec.get("title"),
            "sections": len(sections),
            "outputs": outputs,
        }
        for key in ("pdf", "docx"):
            if key in outputs:
                path = Path(outputs[key])
                summary[f"{key}_bytes"] = path.stat().st_size
        if "pdf" in outputs:
            summary["pdf_pages"] = common.pdf_page_count(outputs["pdf"])
        print(json.dumps(summary, indent=2))
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


if __name__ == "__main__":
    main()
