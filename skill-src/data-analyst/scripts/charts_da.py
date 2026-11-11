"""Chart set for Data Analyst. Matplotlib only; writes PNGs into a charts dir."""
import os
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

TEXT, MUTED, RULE, PRIMARY, ACCENT = "#111827", "#6b7280", "#e5e7eb", "#0f766e", "#f59e0b"
SERIES = ["#0f766e", "#f59e0b", "#6366f1", "#ef4444", "#14b8a6", "#8b5cf6"]


def _style(ax, title, x_label="", y_label=""):
    ax.set_title(title, fontsize=13, fontweight="bold", color=TEXT, pad=12, loc="left")
    if x_label:
        ax.set_xlabel(x_label, fontsize=9, color=MUTED)
    if y_label:
        ax.set_ylabel(y_label, fontsize=9, color=MUTED)
    ax.tick_params(colors=MUTED, labelsize=8)
    for spine in ("top", "right"):
        ax.spines[spine].set_visible(False)
    for spine in ("left", "bottom"):
        ax.spines[spine].set_color(RULE)
    ax.grid(axis="y", color=RULE, linewidth=0.8, alpha=0.9)
    ax.set_axisbelow(True)
    fig = ax.figure
    fig.patch.set_facecolor("white")
    ax.set_facecolor("white")


def _save(fig, out_path):
    out_path = str(out_path)
    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
    fig.tight_layout()
    fig.savefig(out_path, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    return out_path


def histogram(values, column, out_path, bins=14):
    """Histogram of one numeric column with mean/median lines."""
    values = [v for v in values if v is not None]
    if len(values) < 4:
        return None
    import statistics

    fig, ax = plt.subplots(figsize=(7.2, 3.6), dpi=170)
    ax.hist(values, bins=min(bins, max(6, len(values) // 3)), color=PRIMARY, edgecolor="white", linewidth=0.6)
    mean, median = statistics.mean(values), statistics.median(values)
    ax.axvline(mean, color=ACCENT, linewidth=1.8, linestyle="--", label=f"mean {mean:.4g}")
    ax.axvline(median, color=MUTED, linewidth=1.4, linestyle=":", label=f"median {median:.4g}")
    ax.legend(frameon=False, fontsize=8)
    _style(ax, f"Distribution: {column}", x_label=column, y_label="count")
    return _save(fig, out_path)


def bar_top(counts, column, out_path, top=8):
    """Top categories as a horizontal bar chart. counts = [[label, n], ...]."""
    pairs = [(str(label), n) for label, n in (counts or []) if label is not None][:top]
    if not pairs:
        return None
    pairs.reverse()
    fig, ax = plt.subplots(figsize=(7.2, 0.55 * len(pairs) + 1.2), dpi=170)
    labels = [p[0] for p in pairs]
    values = [p[1] for p in pairs]
    colors = [PRIMARY if i < len(pairs) - 1 else ACCENT for i in range(len(pairs))]
    ax.barh(labels, values, color=colors, height=0.62, edgecolor="white")
    for i, value in enumerate(values):
        ax.text(value, i, f" {value}", va="center", fontsize=8, color=TEXT)
    _style(ax, f"Top {column}", x_label="count")
    ax.grid(axis="x", color=RULE, linewidth=0.8, alpha=0.9)
    ax.grid(axis="y", visible=False)
    return _save(fig, out_path)


def trend(dates, values, date_col, value_col, out_path):
    """Line chart over sorted dates."""
    pairs = [(d, v) for d, v in zip(dates, values) if d is not None and v is not None]
    if len(pairs) < 3:
        return None
    pairs.sort()
    xs = [p[0] for p in pairs]
    ys = [p[1] for p in pairs]
    fig, ax = plt.subplots(figsize=(7.2, 3.6), dpi=170)
    ax.plot(xs, ys, color=PRIMARY, linewidth=2.2, marker="o", markersize=4)
    ax.fill_between(xs, ys, color=PRIMARY, alpha=0.12)
    step = max(1, len(xs) // 10)
    ax.set_xticks(xs[::step])
    _style(ax, f"{value_col} over {date_col}", x_label=date_col, y_label=value_col)
    return _save(fig, out_path)


def scatter(xs, ys, x_col, y_col, r, out_path):
    """Scatter of a correlated numeric pair."""
    if len(xs) < 4:
        return None
    fig, ax = plt.subplots(figsize=(7.2, 3.9), dpi=170)
    ax.scatter(xs, ys, s=30, color=PRIMARY, alpha=0.75, edgecolors="white", linewidths=0.5)
    _style(ax, f"{y_col} vs {x_col}  (r = {r})", x_label=x_col, y_label=y_col)
    return _save(fig, out_path)


def boxplot(groups, labels, out_path, title):
    """Grouped boxplots, e.g. one numeric grouped by a categorical."""
    groups = [g for g in groups if g and len(g) >= 2]
    if len(groups) < 2:
        return None
    fig, ax = plt.subplots(figsize=(7.2, 3.6), dpi=170)
    bp = ax.boxplot(groups, tick_labels=labels[: len(groups)], patch_artist=True, widths=0.55)
    for patch in bp["boxes"]:
        patch.set_facecolor(PRIMARY)
        patch.set_alpha(0.75)
        patch.set_edgecolor("white")
    for median in bp["medians"]:
        median.set_color(ACCENT)
        median.set_linewidth(1.8)
    _style(ax, title, y_label="value")
    return _save(fig, out_path)
