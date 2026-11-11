"""Shared helpers for Deck Builder: themes, spec normalization, CSV."""
import csv
from pathlib import Path

LIGHT = {
    "mode": "light",
    "bg": "#FFFFFF",
    "panel": "#F1F5F9",
    "text": "#0F172A",
    "muted": "#64748B",
    "primary": "#0F766E",
    "accent": "#F59E0B",
    "rule": "#E2E8F0",
}

DARK = {
    "mode": "dark",
    "bg": "#0B1220",
    "panel": "#16213A",
    "text": "#E8EEF9",
    "muted": "#8CA3C7",
    "primary": "#2DD4BF",
    "accent": "#FBBF24",
    "rule": "#24324E",
}

CHART_PALETTE = [
    "#2DD4BF", "#FBBF24", "#818CF8", "#F87171", "#34D399",
    "#A78BFA", "#38BDF8", "#FB923C", "#A3E635", "#F472B6",
]
CHART_PALETTE_LIGHT = [
    "#0F766E", "#F59E0B", "#6366F1", "#EF4444", "#14B8A6",
    "#8B5CF6", "#0EA5E9", "#F97316", "#84CC16", "#EC4899",
]


def theme(spec):
    """Base palette by mode, then per-color overrides from the spec."""
    base = dict(LIGHT if str((spec.get("theme") or {}).get("mode", "dark")).lower() == "light" else dict(DARK))
    base["mode"] = "light" if base["bg"] in ("#FFFFFF", "#ffffff") else "dark"
    for key, value in (spec.get("theme") or {}).items():
        if key == "mode" or not value:
            continue
        base[key] = value
    return base


def chart_palette(theme):
    return list(CHART_PALETTE_LIGHT) if theme["mode"] == "light" else list(CHART_PALETTE)


def read_csv_table(path):
    """Return (header, rows) from a CSV file."""
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"CSV not found: {path}")
    with open(path, "r", encoding="utf-8-sig", newline="") as fh:
        rows = [row for row in csv.reader(fh)]
    if not rows:
        return [], []
    header = [str(cell).strip() for cell in rows[0]]
    body = [row for row in rows[1:] if any(str(cell).strip() for cell in row)]
    return header, body


def section_numbering(slides):
    """Assign 01, 02, ... to section slides in order (mutates and returns)."""
    counter = 0
    for slide in slides:
        if slide.get("kind") == "section":
            counter += 1
            slide.setdefault("number", f"{counter:02d}")
    return slides


def prepare_slides(spec, base_dir, work_dir, theme):
    """Render chart PNGs once so pptx and html preview share them.

    Adds `_chart` (png path) to chart slides and `_table` (columns/rows/title/align)
    to table slides. Image paths are resolved to absolute (or dropped).
    """
    from charts import render_chart  # matplotlib is heavy; import lazily

    base_dir = Path(base_dir)
    work_dir = Path(work_dir)
    out = []
    figure_no = 0

    for raw in spec.get("slides") or []:
        slide = dict(raw or {})
        kind = str(slide.get("kind") or "bullets")

        chart = slide.get("chart")
        if kind == "chart" and isinstance(chart, dict) and chart.get("type"):
            figure_no += 1
            spec_chart = dict(chart)
            spec_chart.pop("title", None)  # the slide heading carries the title
            png = work_dir / f"chart-{figure_no}.png"
            render_chart(spec_chart, png, theme, base_dir)
            slide["_chart"] = str(png)
            slide["_figure_no"] = figure_no

        table = slide.get("table")
        if kind == "table" and isinstance(table, dict):
            columns, rows = table.get("columns"), table.get("rows")
            if table.get("csv"):
                columns, rows = read_csv_table(base_dir / str(table["csv"]))
            slide["_table"] = {
                "columns": list(columns or []),
                "rows": list(rows or []),
                "title": str(table.get("title") or ""),
                "align": list(table.get("align") or []),
            }

        image = slide.get("image")
        if kind == "image" and isinstance(image, dict) and image.get("path"):
            candidate = Path(str(image["path"]))
            if not candidate.is_absolute():
                candidate = base_dir / candidate
            slide["_image"] = str(candidate) if candidate.exists() else None
            slide["_image_caption"] = str(image.get("caption") or "")

        out.append(slide)
    return out
