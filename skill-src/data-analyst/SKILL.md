---
name: Data Analyst
description: Profile and analyze a CSV or JSON dataset — column types, ranges, missing values, outliers, correlations, top categories and trends — then produce a findings pack (profile.json, findings.md, chart PNGs) that feeds directly into Report Studio or Deck Builder. Use for "analyze this data", "what does this CSV say", data exploration, sanity checks before a report, or any quick statistical look at a dataset.
version: 1.0.0
---

# Data Analyst

Turn a raw dataset into a verified findings pack: a machine-readable **profile**, a **findings.md** with the story and numbers, and ready-made **chart PNGs**. Run it first; rewrite its findings in your own words; then hand the numbers to Report Studio (PDF/DOCX) or Deck Builder (.pptx) for the deliverable. No pandas needed — stdlib `csv`/`statistics` plus matplotlib for charts.

Use this skill for: "analyze this file", "what stands out in this data", pre-report data sanity checks, KPI extraction, correlation hunting, data quality audits (missing values, duplicates, outliers).

## How it works

```bash
python scripts/doctor.py
python scripts/analyze.py <data.csv|data.json> --out analysis --charts
```

Input: **CSV** (first row = header) or **JSON** (array of objects, or object of arrays). Paths may be absolute; output paths are created for you.

Output (in the `--out` directory):

| File | What it is |
|---|---|
| `profile.json` | Full column-by-column profile: types, stats, missing, uniques, outliers, correlations |
| `findings.md` | Markdown narrative raw material — highlights, tables, chart references |
| `charts/*.png` | Up to 6 charts: histograms, top-category bars, trend line, top-correlation scatter |

The script prints a JSON summary (`ok`, rows, columns, output paths). Pass `timeoutMs: 600000` on first run (matplotlib cold start).

## Step 1 — Get the data

- **File provided on desktop**: use the absolute path from `medusa_listDir` / the user's message.
- **Data in chat**: write it to a temp CSV first (`medusa_editFile`), then analyze.
- **Data behind a URL**: `medusa_fetchUrl` → save → analyze. CSVs from exports (Google Sheets, Stripe, bank CSVs) usually work as-is.
- If the file has semicolons or weird encodings, open it with `medusa_readFile` first; re-save clean UTF-8 if needed.

## Step 2 — Run the analysis

```bash
python scripts/analyze.py sales.csv --out analysis --charts
```

Options: `--top 5` (top categories shown), `--max-charts 6`, `--no-charts`, `--out DIR` (default `analysis`).

## Step 3 — Read and verify

1. Read `profile.json` (or `findings.md`) with `medusa_readFile`.
2. **Sanity-check before believing anything**: row count plausible? dates parsed as dates (not text)? the headline number matches the user's expectation of the dataset? outliers aren't data errors?
3. Look at `charts/*.png` if previews are needed.

## Step 4 — Deliver the insight

Lead with the answer, then the evidence. A good delivery:

- **Headline**: the 1–3 findings that matter, each with a concrete number ("Revenue is concentrated: North = 38% of total").
- **Data quality**: missing values, duplicates, outlier counts — say what you'd exclude and why.
- **Suggested next step**: offer Report Studio for a full PDF or Deck Builder for slides, reusing these exact numbers and charts.

Never invent numbers — everything you state must exist in `profile.json`. If the dataset is too small to support a claim, say so.

## profile.json schema (what you'll read)

```json
{
  "source": "sales.csv",
  "rows": 24,
  "columns": 6,
  "duplicate_rows": 0,
  "columns_detail": {
    "revenue": {
      "type": "numeric", "non_empty": 24, "missing": 0, "missing_pct": 0.0,
      "unique": 22,
      "min": 120.0, "median": 480.5, "mean": 512.3, "max": 980.0,
      "stdev": 210.4, "q1": 330.0, "q3": 690.0,
      "outliers": { "count": 1, "values": [980.0] }
    },
    "region": {
      "type": "categorical", "non_empty": 24, "missing": 0, "unique": 4,
      "top": [ ["North", 9], ["South", 6] ]
    },
    "date": { "type": "date", "min": "2026-08-01", "max": "2026-10-31", "span_days": 91 }
  },
  "correlations": [ { "a": "units", "b": "revenue", "r": 0.94 } ]
}
```

`type` is one of `numeric`, `date`, `categorical` (≤ 25 uniques among short values), `text`. Correlations are Pearson, computed only between numeric columns, |r| ≥ 0.3 reported.

## Troubleshooting

- **"No usable columns"** → the file may be semicolon-separated or have no header; inspect with `medusa_readFile` and re-save.
- **Dates came out `text`** → non-ISO formats; re-save dates as `YYYY-MM-DD` for trend charts.
- **Chart missing** → needs that column type (trend needs a date column; scatter needs two correlated numerics).
- **Browser-only MEDUSA** → Python cannot run; ask the user to use the desktop app, or analyze small pasted data by hand.

## Files

- `scripts/analyze.py` — CLI orchestrator
- `scripts/profile.py` — column profiling, stats, outliers, correlations
- `scripts/charts_da.py` — matplotlib chart set
- `scripts/narrative.py` — findings.md writer
- `scripts/doctor.py` — dependency check
- `examples/sample-sales.csv` — runnable demo
