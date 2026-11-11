"""findings.md writer for Data Analyst."""
import re

def _esc(value):
    return str(value if value is not None else "").replace("|", "\\|")


def _fmt(value, max_len=42):
    text = str(value)
    if len(text) > max_len:
        text = text[: max_len - 1] + "…"
    return _esc(text)


def write_findings(path, source, prof, chart_paths):
    """Write findings.md from the profile. Returns the path."""
    columns = prof.get("columns_detail") or {}
    lines = []
    lines.append(f"# Data profile: {_esc(source)}")
    lines.append("")
    lines.append(
        f"- **Rows:** {prof.get('rows')} · **Columns:** {prof.get('columns')} · "
        f"**Duplicate rows:** {prof.get('duplicate_rows')}"
    )
    numeric = [n for n, d in columns.items() if d.get("type") == "numeric"]
    dates = [n for n, d in columns.items() if d.get("type") == "date"]
    cats = [n for n, d in columns.items() if d.get("type") == "categorical"]
    lines.append(f"- **Column types:** {len(numeric)} numeric, {len(dates)} date, {len(cats)} categorical, "
                 f"{sum(1 for d in columns.values() if d.get('type') == 'text')} text, "
                 f"{sum(1 for d in columns.values() if d.get('type') == 'empty')} empty")
    for name in dates[:2]:
        d = columns[name]
        lines.append(f"- `{name}` spans {d.get('min')} → {d.get('max')} ({d.get('span_days')} days)")
    lines.append("")

    lines.append("## Data quality")
    quality = []
    for name, detail in columns.items():
        if detail.get("missing"):
            quality.append(f"- `{name}` — {detail['missing']} missing ({detail['missing_pct']}%)")
    if prof.get("duplicate_rows"):
        quality.append(f"- {prof['duplicate_rows']} duplicate row(s) present")
    empty = [n for n, d in columns.items() if d.get("type") == "empty"]
    if empty:
        quality.append("- empty columns: " + ", ".join(f"`{n}`" for n in empty))
    if quality:
        lines.extend(quality)
    else:
        lines.append("- no missing values, no duplicate rows — clean dataset")
    lines.append("")

    if numeric:
        lines.append("## Numeric summary")
        lines.append("")
        lines.append("| column | min | median | mean | max | stdev | outliers |")
        lines.append("|---|---|---|---|---|---|---|")
        for name in numeric:
            d = columns[name]
            out = d.get("outliers") or {}
            lines.append(
                f"| `{name}` | {d.get('min')} | {d.get('median')} | {d.get('mean')} | {d.get('max')} "
                f"| {d.get('stdev')} | {out.get('count', 0)} |"
            )
        lines.append("")

    if cats:
        lines.append("## Categories")
        for name in cats[:8]:
            d = columns[name]
            top = d.get("top") or []
            preview = ", ".join(f"**{k}** ({n})" for k, n in top[:5])
            lines.append(f"- `{name}` ({d.get('unique')} unique): {preview}")
        lines.append("")

    if prof.get("correlations"):
        lines.append("## Correlations (Pearson)")
        lines.append("")
        lines.append("| a | b | r |")
        lines.append("|---|---|---|")
        for item in prof["correlations"][:10]:
            lines.append(f"| `{item['a']}` | `{item['b']}` | {item['r']} |")
        lines.append("")

    if chart_paths:
        lines.append("## Charts")
        for chart in chart_paths:
            lines.append(f"- `{chart}`")
        lines.append("")

    lines.append("## Suggested next steps")
    suggestions = []
    if dates and numeric:
        suggestions.append("trend analysis: strongest mover over time is worth a Report Studio line chart")
    if cats and numeric:
        suggestions.append("group comparison: aggregate a numeric by the top categorical for a stacked bar")
    top_corr = (prof.get("correlations") or [None])[0]
    if top_corr:
        suggestions.append(
            f"driver analysis: `{top_corr['b']}` tracks `{top_corr['a']}` (r={top_corr['r']}) — verify causation before claiming it"
        )
    if quality:
        suggestions.append("clean first: resolve the data-quality items above before quoting totals")
    for i, suggestion in enumerate(suggestions, 1):
        lines.append(f"{i}. {suggestion.capitalize()}")
    lines.append("")

    text = "\n".join(lines)
    path.write_text(text, encoding="utf-8")
    return str(path)
