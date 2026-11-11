"""Chart rendering for Deck Builder. Matplotlib only; writes PNGs sized for 16:9 slides."""
import csv
import os
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.ticker import MaxNLocator


def _to_float(value):
    if value is None:
        return None
    text = str(value).strip().replace(",", "").replace("$", "").replace("%", "")
    if text == "" or text.lower() in ("na", "n/a", "null", "none", "-"):
        return None
    try:
        return float(text)
    except ValueError:
        return None


def _read_csv(path):
    with open(path, "r", encoding="utf-8-sig", newline="") as fh:
        rows = [row for row in csv.reader(fh)]
    if not rows:
        return [], []
    return [str(c).strip() for c in rows[0]], [r for r in rows[1:] if any(str(c).strip() for c in r)]


def resolve_data(chart, base_dir):
    """Return (labels, series) where series is [{'name', 'values'}]."""
    if chart.get("csv"):
        header, body = _read_csv(Path(base_dir) / str(chart["csv"]))
        if not header:
            raise ValueError(f"chart CSV is empty: {chart['csv']}")
        x_col = chart.get("x") or header[0]
        xi = header.index(x_col) if x_col in header else 0
        y_cols = chart.get("y")
        if isinstance(y_cols, str):
            y_cols = [y_cols]
        if not y_cols:
            y_cols = [h for i, h in enumerate(header) if i != xi]
        labels = [str(row[xi]) if xi < len(row) else "" for row in body]
        series = []
        for name in y_cols:
            if name not in header:
                continue
            yi = header.index(name)
            values = [_to_float(row[yi]) if yi < len(row) else None for row in body]
            series.append({"name": str(name), "values": values})
        return labels, series

    labels = [str(x) for x in (chart.get("labels") or [])]
    series = []
    for item in chart.get("series") or []:
        if isinstance(item, dict):
            series.append({
                "name": str(item.get("name") or "Series"),
                "values": [_to_float(v) for v in (item.get("values") or [])],
            })
        elif isinstance(item, (list, tuple)):
            series.append({"name": "Series", "values": [_to_float(v) for v in item]})
    if not labels and series:
        labels = [str(i + 1) for i in range(len(series[0]["values"]))]
    return labels, series


def _style_axes(ax, theme, chart):
    text, muted, rule = theme["text"], theme["muted"], theme["rule"]
    if chart.get("title"):
        ax.set_title(str(chart["title"]), fontsize=18, fontweight="bold", color=text, pad=14, loc="left")
    if chart.get("x_label"):
        ax.set_xlabel(str(chart["x_label"]), fontsize=12, color=muted)
    if chart.get("y_label"):
        ax.set_ylabel(str(chart["y_label"]), fontsize=12, color=muted)
    ax.tick_params(colors=muted, labelsize=11)
    for spine in ("top", "right"):
        ax.spines[spine].set_visible(False)
    for spine in ("left", "bottom"):
        ax.spines[spine].set_color(rule)
    ax.grid(axis="y", color=rule, linewidth=0.8, alpha=0.55)
    ax.set_axisbelow(True)


def render_chart(chart, out_path, theme, base_dir="."):
    """Render one chart spec to a PNG sized for a slide content area."""
    from common import chart_palette

    chart = chart or {}
    ctype = str(chart.get("type") or "bar").lower()
    labels, series = resolve_data(chart, base_dir)
    colors = chart_palette(theme)
    text, muted = theme["text"], theme["muted"]

    fig, ax = plt.subplots(figsize=(10.4, 4.7), dpi=170)
    fig.patch.set_facecolor(theme["bg"])
    ax.set_facecolor(theme["bg"])

    if ctype in ("pie", "donut"):
        values = (series[0]["values"] if series else []) or []
        pairs = [(label, value) for label, value in zip(labels, values) if value is not None][:12]
        if not pairs:
            pairs = [("No data", 1)]
        wedge_colors = [colors[i % len(colors)] for i in range(len(pairs))]
        kwargs = dict(colors=wedge_colors, startangle=90, counterclock=False)
        if ctype == "donut":
            kwargs["wedgeprops"] = {"width": 0.42, "edgecolor": theme["bg"], "linewidth": 2}
        ax.pie(
            [value for _, value in pairs],
            labels=[label for label, _ in pairs],
            autopct="%1.0f%%",
            textprops={"fontsize": 11, "color": text},
            **kwargs,
        )
        if chart.get("title"):
            ax.set_title(str(chart["title"]), fontsize=18, fontweight="bold", color=text, loc="left", pad=14)
        ax.axis("equal")

    elif ctype in ("line", "area", "scatter"):
        xs = list(range(len(labels)))
        for index, item in enumerate(series):
            color = colors[index % len(colors)]
            values = item["values"]
            if ctype == "scatter":
                points = [(x, y) for x, y in zip(xs, values) if y is not None]
                ax.scatter([p[0] for p in points], [p[1] for p in points], s=42, color=color, label=item["name"])
            else:
                ax.plot(xs, values, color=color, linewidth=2.6, marker="o", markersize=5.5, label=item["name"])
                if ctype == "area":
                    filled = [value if value is not None else 0 for value in values]
                    ax.fill_between(xs, filled, color=color, alpha=0.16)
        ax.set_xticks(xs)
        ax.set_xticklabels(labels)
        _style_axes(ax, theme, chart)
        if len(series) > 1:
            ax.legend(frameon=False, fontsize=11, labelcolor=text, loc="best")

    else:
        xs = list(range(len(labels)))
        count = max(len(series), 1)
        width = 0.8 / count
        bottom = [0.0] * len(labels)
        for index, item in enumerate(series):
            color = colors[index % len(colors)]
            values = [value if value is not None else 0 for value in item["values"]]
            if ctype == "stacked_bar":
                ax.bar(xs, values, bottom=bottom, color=color, label=item["name"], width=0.6, edgecolor=theme["bg"], linewidth=0.8)
                bottom = [b + v for b, v in zip(bottom, values)]
            else:
                offset = (index - (count - 1) / 2) * width
                ax.bar([x + offset for x in xs], values, color=color, label=item["name"], width=width * 0.9, edgecolor=theme["bg"], linewidth=0.8)
        ax.set_xticks(xs)
        ax.set_xticklabels(labels)
        _style_axes(ax, theme, chart)
        if len(series) > 1:
            ax.legend(frameon=False, fontsize=11, labelcolor=text, loc="best")
        ax.yaxis.set_major_locator(MaxNLocator(nbins=6))

    fig.tight_layout()
    out_path = str(out_path)
    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
    fig.savefig(out_path, bbox_inches="tight", facecolor=theme["bg"])
    plt.close(fig)
    return out_path
