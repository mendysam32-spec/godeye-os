---
name: Deck Builder
description: Turn a topic, outline, report or data into a polished PowerPoint .pptx deck — cover, section dividers, KPI slides, charts, tables and speaker notes on every slide, in a consistent light or dark theme. Use for pitch decks, board updates, product launches, training decks, webinar slides, quarterly reviews, or any "make me a presentation/slides/deck" request.
version: 1.0.0
---

# Deck Builder

Produce a finished, presentable **.pptx** deck from a topic, an outline, a report or data. Slides are laid out from code with a consistent theme: cover, agenda, section dividers, KPI rows, matplotlib charts, styled tables, images, and speaker notes on every slide. Everything renders locally; no paid slide service is used.

Use this skill for: pitch decks, quarterly business reviews, board updates, product launches, training sessions, webinar slides, project proposals, and any "write me a presentation / make slides / turn this into a deck" request.

## How it works

A JSON spec describes the deck. `scripts/build_deck.py` renders it:

- **pptx** via `python-pptx` (16:9, 13.333 × 7.5 in)
- **HTML preview** (same theme, same layout) so you can visually verify without PowerPoint — `--preview` screenshots the cover and a content slide

Run with the skill folder as the working directory. On Windows use `python`; elsewhere `python3`. Pass a large `timeoutMs` (e.g. `600000`) to `medusa_runCommand`. `scripts/doctor.py` installs `python-pptx` and `matplotlib` if missing.

## Step 1 — Understand the request

| Field | Default if unstated |
|---|---|
| Deck type | Business / status update |
| Audience | Decision-makers or the team |
| Length | 8–14 slides |
| Theme | Dark (modern) — switch to light for print or formal decks |
| Output | .pptx (+ HTML preview for checking) |

If the user supplied data or a report, read it first with `medusa_readFile` / `medusa_fetchUrl` / `medusa_webSearch`. Never invent numbers; label assumptions.

## Step 2 — Write the spec

Create `deck.json` next to the output. Schema:

```json
{
  "title": "Q3 Business Review",
  "subtitle": "Northwind Retail",
  "client": "Northwind Retail",
  "author": "MEDUSA OS",
  "date": "2026-11-09",
  "filename": "northwind-q3-review",
  "theme": { "mode": "dark" },
  "slides": [
    { "kind": "cover" },
    {
      "kind": "bullets",
      "heading": "Agenda",
      "bullets": ["Where we landed", "**What** drove it", "Next quarter"]
    },
    { "kind": "section", "title": "Results" },
    {
      "kind": "kpi",
      "heading": "Q3 at a glance",
      "items": [
        { "value": "$34.6m", "label": "Revenue", "delta": "+14.6% QoQ" },
        { "value": "44%", "label": "Gross margin", "delta": "+3 pts" }
      ]
    },
    {
      "kind": "chart",
      "heading": "Revenue vs cost",
      "chart": { "type": "line", "labels": ["Jul", "Aug", "Sep"],
                 "series": [{ "name": "Revenue", "values": [9.2, 10.1, 12.4] }] },
      "footnote": "USD millions"
    },
    { "kind": "table", "heading": "Initiatives",
      "table": { "columns": ["Initiative", "Owner", "Status"], "rows": [["East expansion", "A. Lee", "On track"]] } },
    { "kind": "end", "message": "Questions?", "contact": "medusa@example.com" }
  ]
}
```

### Slide kinds

| kind | Purpose | Extra fields |
|---|---|---|
| `cover` | Title slide | uses top-level title/subtitle/author/date |
| `section` | Divider with big number | `title`, `kicker?` |
| `bullets` | Content slide | `heading`, `bullets[]`, `kicker?` |
| `kpi` | Row of 2–4 big stats | `heading`, `items[{value,label,delta?}]` |
| `chart` | Chart slide | `heading`, `chart{}`, `footnote?` |
| `table` | Table slide | `heading`, `table{}`, `footnote?` |
| `image` | Image slide | `heading`, `image{path, caption?}` |
| `end` | Closing slide | `message`, `contact?` |

### Rules

- `bullets[]`, `delta`, labels support `**bold**`, `*italic*`, `` `code` ``.
- `table` may load a CSV: `{ "csv": "sales.csv", "title": "Monthly detail" }` (path relative to the spec).
- `chart` may load a CSV: `{ "type": "line", "csv": "sales.csv", "x": "Month", "y": ["Revenue"] }`.
- One idea per slide. ≤ 6 bullets, each ≤ 12 words. KPI rows: 2–4 items.
- Charts: ≤ 8 points, ≤ 4 series. `type`: `bar`, `grouped_bar`, `stacked_bar`, `line`, `area`, `pie`, `donut`, `scatter`.
- `notes` on **every** slide — that is where the narration lives (speaker notes, not on-slide text).
- Sections are auto-numbered (`01`, `02`, …).

### Theme

`theme.mode` is `dark` (default) or `light`. Override any color: `primary`, `accent`, `bg`, `panel`, `text`, `muted`, `rule`. Match brand colors when the user provides them; keep text high-contrast against `bg`.

## Step 3 — Build

```bash
python scripts/doctor.py
python scripts/build_deck.py deck.json --out deck --preview
```

- `--preview` writes `preview-cover.png` and `preview-slide.png` (rendered from the HTML mirror)
- `--keep-html` keeps the standalone HTML preview next to the pptx

The script prints JSON with paths and sizes.

## Step 4 — Verify and deliver

1. Confirm the pptx exists and is non-trivial (> 30 KB with charts).
2. Read the preview PNGs; fix overflowing text, empty charts, or cramped tables and rebuild.
3. Re-open the deck with python-pptx if you need a structural check (slide count, notes, images).
4. Report the **absolute path**, slide count, and a 3–5 line summary of the deck's argument. Offer to adjust theme, length or content.

## Style bar

- Slides are headlines, not paragraphs: a slide heading states the point ("North drove 38% of Q3 revenue").
- Numbers on slides come from data; narrative and caveats go in `notes`.
- Keep the theme consistent — do not mix modes within one deck.
- No lorem ipsum, no placeholder text, no repeated slides.

## Troubleshooting

- **`ModuleNotFoundError: pptx`** → `python scripts/doctor.py`.
- **Chart empty** → check `csv` path / `x` / `y` column names; values must be numeric.
- **Text overflows a slide** → fewer/shorter bullets; split into two slides.
- **Browser-only MEDUSA (no desktop bridge)** → Python cannot run; deliver a markdown outline and tell the user to use the desktop app for the .pptx.

## Files

- `scripts/build_deck.py` — orchestrator (CLI)
- `scripts/common.py` — themes, spec helpers, CSV
- `scripts/charts.py` — matplotlib chart renderer (theme-aware)
- `scripts/pptx_deck.py` — python-pptx renderer
- `scripts/html_preview.py` — HTML mirror + Playwright screenshots
- `scripts/doctor.py` — dependency/Chromium check
- `examples/sample-deck.json` — runnable demo
