"""Shared helpers for Report Studio: theme, CSV reading, section preparation."""
import csv
import os
from pathlib import Path

DEFAULT_THEME = {
    "primary": "#0f766e",
    "accent": "#f59e0b",
    "text": "#111827",
    "muted": "#6b7280",
    "surface": "#ffffff",
    "rule": "#e5e7eb",
}


def merged_theme(spec):
    """Spec theme overrides the defaults; empty values are ignored."""
    theme = dict(DEFAULT_THEME)
    for key, value in (spec.get("theme") or {}).items():
        if value:
            theme[key] = value
    return theme


def read_csv_table(path):
    """Return (header, rows) from a CSV file. Rows are lists of strings."""
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"CSV not found: {path}")
    with open(path, "r", encoding="utf-8-sig", newline="") as fh:
        reader = csv.reader(fh)
        rows = [row for row in reader]
    if not rows:
        return [], []
    header = [str(cell).strip() for cell in rows[0]]
    body = [row for row in rows[1:] if any(str(cell).strip() for cell in row)]
    return header, body


def prepare_sections(spec, base_dir, work_dir, theme):
    """Resolve charts/tables/images once so both renderers share the work.

    Adds private keys (prefixed with `_`) to each section:
      _chart      absolute PNG path
      _figure_no  figure number
      _table      {columns, rows, title, align}
      _table_no   table number
      _image      absolute image path (or None)
    """
    from charts import render_chart  # imported lazily; matplotlib is heavy

    base_dir = Path(base_dir)
    work_dir = Path(work_dir)
    sections = []
    figure_no = 0
    table_no = 0

    for raw in spec.get("sections") or []:
        section = dict(raw or {})

        chart = section.get("chart")
        if isinstance(chart, dict) and chart.get("type"):
            figure_no += 1
            out_png = work_dir / f"figure-{figure_no}.png"
            render_chart(chart, out_png, theme, base_dir)
            section["_chart"] = str(out_png)
            section["_figure_no"] = figure_no

        table = section.get("table")
        if isinstance(table, dict):
            table_no += 1
            columns = table.get("columns")
            rows = table.get("rows")
            if table.get("csv"):
                columns, rows = read_csv_table(base_dir / str(table["csv"]))
            section["_table"] = {
                "columns": list(columns or []),
                "rows": list(rows or []),
                "title": str(table.get("title") or ""),
                "align": list(table.get("align") or []),
            }
            section["_table_no"] = table_no

        image = section.get("image")
        if isinstance(image, dict) and image.get("path"):
            candidate = Path(str(image["path"]))
            if not candidate.is_absolute():
                candidate = base_dir / candidate
            section["_image"] = str(candidate) if candidate.exists() else None
            section["_image_caption"] = str(image.get("caption") or "")

        sections.append(section)

    return sections


def pdf_page_count(path):
    """Best-effort page count for Chromium PDFs (returns None if unknown)."""
    try:
        data = Path(path).read_bytes()
    except OSError:
        return None
    if not data.startswith(b"%PDF"):
        return None
    count = len([m for m in _PAGE_RE.finditer(data)])
    return count or None


import re as _re

_PAGE_RE = _re.compile(rb"/Type\s*/Page(?![s\w])")
