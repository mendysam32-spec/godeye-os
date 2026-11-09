---
name: Report Studio
description: Turn a brief, dataset or research question into a polished, branded PDF and Word report with cover page, table of contents, charts, tables and page numbers. Use for reports, proposals, analyses, whitepapers, business reviews, client deliverables, or any "make me a report/document" request.
version: 1.0.0
---

# Report Studio

Produce a finished, client-ready document — **PDF + DOCX** — from a short brief, a dataset, or research you gather. Output has a cover page, contents, styled headings, charts, tables, captions and page numbers. Everything is rendered locally from code; no paid document service is used.

Use this skill for: quarterly/business reviews, market or competitor analyses, proposals, whitepapers, research summaries, audit reports, project post-mortems, policy briefs, and any "write me a report / make a document / turn this into a PDF" request.

## How it works

A JSON spec describes the report. Two scripts render it:

- `scripts/build_report.py` — the entry point. Reads the spec, draws charts, writes **PDF** (via Playwright/Chromium) and **DOCX** (via python-docx).
- `scripts/doctor.py` — checks/installs `python-docx`, `matplotlib` and Playwright Chromium.

Run everything with the skill folder as the working directory (`cwd`). On Windows use `python`; elsewhere `python3`. Pass a large `timeoutMs` (e.g. `600000`) to `medusa_runCommand` — first-time dependency installs and PDF rendering can take a minute.

## Step 1 — Understand the request

Infer what you can; ask at most one short question only if the deliverable is genuinely ambiguous. Decide:

| Field | Default if unstated |
|---|---|
| Report type | Analytical/business report |
| Audience | Decision-maker / client |
| Length | 4–8 sections, ~1–2 pages each |
| Tone | Clear, professional, evidence-led |
| Brand colors | Teal + amber (see theme below) |
| Output | Both PDF and DOCX |

If the user supplied a file (CSV, notes, transcript, PDF text, URL), read it first with `medusa_readFile`, `medusa_fetchUrl`, or `medusa_webSearch`. Never invent numbers — if data is missing, either gather it or label assumptions explicitly.

## Step 2 — Gather content

- **Data provided** (CSV/XLSX exported to CSV): inspect the columns, then point charts at the CSV rather than retyping values.
- **Research request**: use `medusa_webSearch` / `medusa_fetchUrl` and cite sources inline as `[1]`, `[2]` with a final "Sources" section.
- **User notes**: restructure into sections; keep their facts, improve the prose.
- **Images/logo**: reference an absolute path in `image.path`; missing images are skipped safely.

Write real analysis, not filler. Every section should make a point, support it, and state the implication.

## Step 3 — Write the spec

Create `report.json` next to the output (or in a work folder). Schema:

```json
{
  "title": "Q3 Performance Review",
  "subtitle": "Northwind Retail — Strategy & Operations",
  "client": "Northwind Retail",
  "author": "MEDUSA OS",
  "date": "2026-11-09",
  "filename": "northwind-q3-review",
  "page_size": "A4",
  "page_numbers": true,
  "theme": {
    "primary": "#0f766e",
    "accent": "#f59e0b",
    "text": "#111827",
    "muted": "#6b7280",
    "rule": "#e5e7eb"
  },
  "sections": [
    {
      "heading": "Executive summary",
      "level": 1,
      "body": "One or two tight paragraphs.\n\n- Finding one\n- Finding two\n\n**Bottom line:** a sentence with the decision.",
      "chart": {
        "type": "bar",
        "title": "Revenue by region",
        "labels": ["North", "South", "East", "West"],
        "series": [{ "name": "Q3", "values": [12.4, 9.1, 7.3, 5.8] }],
        "y_label": "USD m"
      },
      "table": {
        "title": "Key metrics",
        "columns": ["Metric", "Q2", "Q3", "Change"],
        "rows": [
          ["Revenue", "$30.2m", "$34.6m", "+14.6%"],
          ["Gross margin", "41%", "44%", "+3 pts"]
        ],
        "align": ["left", "right", "right", "right"]
      }
    }
  ]
}
```

### Section rules

- `level` 1 starts a new page; `level` 2 is a subheading. Use 4–8 level-1 sections.
- `body` accepts paragraphs separated by blank lines, `-` bullets, `1.` numbered lists, `**bold**`, `*italic*` and `` `code` ``.
- Put exactly one `chart`, `table` or `image` per section for clean layout; split the section if you need two.
- Keep chart series to ≤ 8 points and ≤ 4 series for legibility.

### Charts

`type` is one of: `bar`, `grouped_bar`, `stacked_bar`, `line`, `area`, `pie`, `donut`, `scatter`.

Explicit data:

```json
{ "type": "line", "title": "Monthly revenue", "labels": ["Jul","Aug","Sep"],
  "series": [{ "name": "Revenue", "values": [9.2, 10.1, 12.4] }] }
```

From a CSV (path relative to the spec; `x` is the label column, `y` the value columns):

```json
{ "type": "line", "title": "Monthly revenue", "csv": "sales.csv", "x": "Month", "y": ["Revenue", "Cost"] }
```

A table can also read a CSV directly: `{ "csv": "sales.csv", "title": "Monthly detail" }`.

### Theme

Defaults are teal `#0f766e` + amber `#f59e0b`. Match the user's brand if they mention colors. Keep text dark (`#111827`) and muted labels gray (`#6b7280`) for print legibility.

## Step 4 — Build

```bash
python scripts/doctor.py
python scripts/build_report.py report.json --out report --preview
```

- `--format pdf|docx|both` (default `both`)
- `--preview` writes `preview-cover.png` and `preview-content.png` next to the output so you can check the layout
- `--keep-html` keeps the intermediate HTML

The script prints JSON with the output paths and byte sizes. Read the preview PNGs to verify the cover, headings, charts and tables before delivering.

## Step 5 — Verify and deliver

1. Confirm both files exist and are non-trivial in size (PDF > 20 KB, DOCX > 10 KB).
2. Open the preview images; fix anything that looks broken (overflowing chart, empty table, wall of text) and rebuild.
3. Report the **absolute paths** to the PDF and DOCX, the page/section count, and a 3–5 line summary of what the report argues.
4. If a file should be surfaced in chat, offer to save/export it; on desktop the user can open the path directly.

## Style bar

- Lead with the answer; put the conclusion in the executive summary.
- Use short paragraphs, concrete numbers, and active voice.
- Every chart needs a title and a `y_label` where relevant; every table needs a caption.
- No placeholder text, no "lorem ipsum", no repeated sentences.
- Number sections automatically; keep heading casing consistent (sentence case).
- End with "Sources" when you used web research, and "Assumptions" when you inferred data.

## Troubleshooting

- **`ModuleNotFoundError`** → run `python scripts/doctor.py`.
- **Playwright/Chromium error** → `python -m playwright install chromium`.
- **PDF missing, DOCX fine** → the HTML engine failed; rebuild with `--format docx`, then tell the user to install Chromium for PDF output.
- **Chart empty** → check `csv` path, `x`/`y` column names, and that values are numeric.
- **Browser-only MEDUSA (no desktop bridge)** → Python cannot run. Use the built-in `medusa_createPdf` / `medusa_createDocx` tools with the same section content (no charts), or tell the user to use the desktop app for full reports.

## Files

- `scripts/build_report.py` — orchestrator (CLI)
- `scripts/common.py` — theme, CSV and section preparation
- `scripts/charts.py` — matplotlib chart renderer
- `scripts/docx_report.py` — Word renderer
- `scripts/html_report.py` — HTML + Playwright PDF renderer
- `scripts/doctor.py` — dependency/Chromium check
- `examples/sample-report.json`, `examples/quarterly-sales.csv` — runnable demo
