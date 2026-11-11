#!/usr/bin/env python3
"""Analyze a CSV/JSON dataset: profile, findings.md, charts.

usage: analyze.py <data.csv|data.json> [--out DIR] [--charts] [--no-charts]
                  [--top N] [--max-charts N]
"""
import argparse
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

import narrative
import profile as profiler


def pick_charts(header, rows, prof, charts_dir, top_n, max_charts):
    """Build a prioritized chart set; returns list of written paths."""
    import charts_da

    columns = prof["columns_detail"]
    numeric = [n for n, d in columns.items() if d["type"] == "numeric"]
    dates = [n for n, d in columns.items() if d["type"] == "date"]
    cats = [n for n, d in columns.items() if d["type"] == "categorical"]
    correlations = prof.get("correlations") or []

    def column_values(name):
        index = header.index(name)
        return [row[index] if index < len(row) else "" for row in rows]

    def numeric_values(name):
        return [profiler._parse_number(v) for v in column_values(name)]

    written = []

    def add(call):
        if len(written) >= max_charts:
            return
        path = call()
        if path:
            written.append(str(path))

    # 1) histograms of the first numeric columns
    for name in numeric[:3]:
        add(lambda name=name: charts_da.histogram(numeric_values(name), name, charts_dir / f"{len(written)+1:02d}-hist-{name}.png"))

    # 2) top categories
    for name in cats[:2]:
        counts = columns[name].get("top") or []
        add(lambda name=name, counts=counts: charts_da.bar_top(counts, name, charts_dir / f"{len(written)+1:02d}-top-{name}.png", top=top_n))

    # 3) trend over the first date column
    if dates and numeric:
        date_name = dates[0]
        xs = [profiler._parse_date(v) for v in column_values(date_name)]
        ys = numeric_values(numeric[0])
        add(lambda: charts_da.trend(xs, ys, date_name, numeric[0], charts_dir / f"{len(written)+1:02d}-trend-{numeric[0]}.png"))

    # 4) scatter of the strongest correlation
    if correlations:
        corr = correlations[0]
        add(lambda: charts_da.scatter(numeric_values(corr["a"]), numeric_values(corr["b"]), corr["a"], corr["b"], corr["r"], charts_dir / f"{len(written)+1:02d}-scatter-{corr['a']}-{corr['b']}.png"))

    # 5) boxplot of the first numeric grouped by the first categorical
    if cats and numeric:
        cat_index = header.index(cats[0])
        groups = {}
        for row in rows:
            key = str(row[cat_index]).strip() if cat_index < len(row) else ""
            value = profiler._parse_number(row[header.index(numeric[0])]) if header.index(numeric[0]) < len(row) else None
            if key and value is not None:
                groups.setdefault(key, []).append(value)
        keys = sorted(groups, key=lambda k: -len(groups[k]))[:6]
        if keys:
            add(lambda: charts_da.boxplot([groups[k] for k in keys], keys, charts_dir / f"{len(written)+1:02d}-box-{numeric[0]}-by-{cats[0]}.png", f"{numeric[0]} by {cats[0]}"))

    return written


def main():
    parser = argparse.ArgumentParser(description="Profile and analyze a dataset.")
    parser.add_argument("data", help="path to .csv or .json")
    parser.add_argument("--out", default="analysis", help="output directory (default: ./analysis)")
    parser.add_argument("--no-charts", action="store_true", help="skip chart generation")
    parser.add_argument("--top", type=int, default=5, help="top categories to show (default 5)")
    parser.add_argument("--max-charts", type=int, default=6, help="chart budget (default 6)")
    args = parser.parse_args()

    try:
        header, rows = profiler.load_rows(args.data)
    except (FileNotFoundError, ValueError) as error:
        sys.exit(str(error))
    if not header or not rows:
        sys.exit("dataset has no header or no rows")

    out_dir = Path(args.out).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    prof = profiler.profile(header, rows)
    prof["source"] = Path(args.data).name
    profile_path = out_dir / "profile.json"
    profile_path.write_text(json.dumps(prof, indent=2, ensure_ascii=False), encoding="utf-8")

    chart_paths = []
    if not args.no_charts:
        try:
            chart_paths = pick_charts(header, rows, prof, out_dir / "charts", args.top, args.max_charts)
        except Exception as error:  # charts are best-effort; profiling still stands
            print(f"chart generation skipped: {error}", file=sys.stderr)

    findings_path = out_dir / "findings.md"
    narrative.write_findings(findings_path, prof["source"], prof, [Path(p).name for p in chart_paths])

    types = {}
    for detail in prof["columns_detail"].values():
        types[detail["type"]] = types.get(detail["type"], 0) + 1
    print(json.dumps({
        "ok": True,
        "source": prof["source"],
        "rows": prof["rows"],
        "columns": prof["columns"],
        "types": types,
        "correlations": len(prof.get("correlations") or []),
        "outputs": {
            "profile": str(profile_path),
            "findings": str(findings_path),
            "charts": chart_paths,
        },
    }, indent=2))


if __name__ == "__main__":
    main()
