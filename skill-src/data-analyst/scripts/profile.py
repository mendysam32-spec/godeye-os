"""Column profiling for Data Analyst: types, stats, outliers, correlations."""
import csv
import json
import math
import re
import statistics
from pathlib import Path

NUM_STRIP_RE = re.compile(r"[$€£,%\s]")
ISO_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?$")
US_DATE_RE = re.compile(r"^\d{1,2}/\d{1,2}/\d{4}$")


def _parse_number(value):
    text = str(value).strip()
    if text == "" or text.lower() in ("na", "n/a", "null", "none", "-", "nan"):
        return None
    stripped = NUM_STRIP_RE.sub("", text)
    if stripped.count(".") == 0 and stripped.count(",") == 1 and len(stripped.split(",")[1]) in (1, 2):
        stripped = stripped.replace(",", ".")  # european decimal comma
    else:
        stripped = stripped.replace(",", "")
    try:
        return float(stripped)
    except ValueError:
        return None


def _parse_date(value):
    text = str(value).strip()
    if ISO_DATE_RE.match(text):
        return text[:10]
    if US_DATE_RE.match(text):
        month, day, year = (int(part) for part in text.split("/"))
        try:
            from datetime import date

            return date(year, month, day).isoformat()
        except ValueError:
            return None
    return None


def load_rows(path):
    """Return (header, rows) from CSV or JSON. All values are strings/None."""
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"data file not found: {path}")
    if path.suffix.lower() == ".json":
        return _load_json(path)
    return _load_csv(path)


def _pick_dialect(sample):
    """Sniff the dialect; on failure pick the candidate delimiter that splits
    the header line into the most fields (>1), else default comma."""
    sample = sample.replace("\r\n", "\n")
    try:
        return csv.Sniffer().sniff(sample, delimiters=",;\t|")
    except csv.Error:
        pass
    header_line = sample.split("\n", 1)[0]
    best, best_count = None, 1
    for delim in ",;\t|":
        count = header_line.count(delim)
        if count > best_count:
            best, best_count = delim, count
    if best is None:
        return csv.excel
    return type("SimpleDialect", (csv.excel,), {"delimiter": best})()


def _load_csv(path):
    last_error = None
    rows = None
    for encoding in ("utf-8-sig", "latin-1"):
        try:
            with open(path, "r", encoding=encoding, newline="") as fh:
                sample = fh.read(4096)
                fh.seek(0)
                reader = csv.reader(fh, _pick_dialect(sample))
                rows = [row for row in reader]
            break
        except (UnicodeDecodeError, csv.Error) as error:
            last_error = error
            rows = None
    if rows is None:
        raise ValueError(f"could not read {path} as csv ({last_error})")
    rows = [row for row in rows if any(str(cell).strip() for cell in row)]
    if not rows:
        return [], []
    header = [str(cell).strip() for cell in rows[0]]
    body = rows[1:]
    # Pad/truncate rows to header length
    return header, [(row + [""] * len(header))[: len(header)] for row in body]


def _load_json(path):
    data = json.loads(path.read_text(encoding="utf-8-sig"))
    records = []
    if isinstance(data, list):
        records = data
    elif isinstance(data, dict):
        values = list(data.values())
        if data and all(isinstance(v, list) for v in values):
            length = max(len(v) for v in values)
            records = [{k: (v[i] if i < len(v) else None) for k, v in data.items()} for i in range(length)]
        else:
            records = [data]
    if not records:
        return [], []
    keys = []
    for record in records:
        if not isinstance(record, dict):
            continue
        for key in record:
            if key not in keys:
                keys.append(key)
    header = keys
    body = [[_stringify(record.get(k)) for k in header] for record in records if isinstance(record, dict)]
    return header, body


def _stringify(value):
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    if isinstance(value, (dict, list)):
        return json.dumps(value)
    return str(value)


def _is_blank(value):
    return str(value).strip() == "" or str(value).strip().lower() in ("na", "n/a", "null", "none", "nan", "-")


def profile_column(name, values):
    """Profile one column (list of raw strings)."""
    total = len(values)
    present = [v for v in values if not _is_blank(v)]
    detail = {
        "type": "text",
        "non_empty": len(present),
        "missing": total - len(present),
        "missing_pct": round((total - len(present)) / total * 100, 1) if total else 0.0,
        "unique": len({str(v).strip() for v in present}),
    }
    if not present:
        detail["type"] = "empty"
        return detail

    numbers = [n for n in (_parse_number(v) for v in present) if n is not None]
    if len(numbers) / len(present) >= 0.9 and len(numbers) >= 2:
        detail["type"] = "numeric"
        detail.update(_numeric_stats(numbers))
        return detail

    dates = [d for d in (_parse_date(v) for v in present) if d is not None]
    if len(dates) / len(present) >= 0.8 and len(dates) >= 2:
        detail["type"] = "date"
        detail["min"] = min(dates)
        detail["max"] = max(dates)
        try:
            from datetime import date

            d0 = date.fromisoformat(detail["min"])
            d1 = date.fromisoformat(detail["max"])
            detail["span_days"] = (d1 - d0).days
        except ValueError:
            pass
        detail["unique"] = len(set(dates))
        return detail

    uniq = len({str(v).strip() for v in present})
    if uniq <= 25 and all(len(str(v).strip()) <= 40 for v in present):
        detail["type"] = "categorical"
        counts: dict = {}
        for v in present:
            key = str(v).strip()
            counts[key] = counts.get(key, 0) + 1
        detail["top"] = [[k, n] for k, n in sorted(counts.items(), key=lambda kv: -kv[1])[:10]]
        return detail

    detail["type"] = "text"
    lengths = [len(str(v).strip()) for v in present]
    detail["avg_len"] = round(statistics.mean(lengths), 1)
    return detail


def _numeric_stats(numbers):
    values = sorted(numbers)
    mean = statistics.mean(values)
    stats = {
        "min": round(values[0], 4),
        "max": round(values[-1], 4),
        "mean": round(mean, 4),
        "median": round(statistics.median(values), 4),
        "stdev": round(statistics.stdev(values), 4) if len(values) > 1 else 0.0,
        "sum": round(sum(values), 4),
    }
    if len(values) >= 4:
        try:
            q1, q2, q3 = statistics.quantiles(values, n=4)
        except statistics.StatisticsError:
            q1 = q3 = None
        if q1 is not None and q3 is not None:
            stats["q1"] = round(q1, 4)
            stats["q3"] = round(q3, 4)
            iqr = q3 - q1
            if iqr > 0:
                lo, hi = q1 - 1.5 * iqr, q3 + 1.5 * iqr
                outliers = [round(v, 4) for v in values if v < lo or v > hi]
                stats["outliers"] = {"count": len(outliers), "values": outliers[:10]}
    return stats


def pearson(xs, ys):
    if len(xs) != len(ys) or len(xs) < 3:
        return None
    if max(xs) == min(xs) or max(ys) == min(ys):
        return None
    try:
        return round(statistics.correlation(xs, ys), 4)
    except (statistics.StatisticsError, ValueError):
        mx, my = statistics.mean(xs), statistics.mean(ys)
        cov = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
        vx = math.sqrt(sum((x - mx) ** 2 for x in xs))
        vy = math.sqrt(sum((y - my) ** 2 for y in ys))
        if vx == 0 or vy == 0:
            return None
        return round(cov / (vx * vy), 4)


def profile(header, rows):
    """Full dataset profile: dataset-level facts plus per-column detail."""
    columns_detail = {}
    numeric_values = {}
    for index, name in enumerate(header):
        values = [row[index] if index < len(row) else "" for row in rows]
        detail = profile_column(name, values)
        columns_detail[name] = detail
        if detail["type"] == "numeric":
            numeric_values[name] = [n for n in (_parse_number(v) for v in values) if n is not None]

    seen = {}
    duplicates = 0
    for row in rows:
        key = tuple(str(cell).strip() for cell in row)
        seen[key] = seen.get(key, 0) + 1
    duplicates = sum(count - 1 for count in seen.values() if count > 1)

    correlations = []
    names = list(numeric_values)
    for i, a in enumerate(names):
        for b in names[i + 1 :]:
            va, vb = numeric_values[a], numeric_values[b]
            if len(va) != len(vb):
                continue
            r = pearson(va, vb)
            if r is not None and abs(r) >= 0.3:
                correlations.append({"a": a, "b": b, "r": r})
    correlations.sort(key=lambda item: -abs(item["r"]))
    correlations = correlations[:15]

    return {
        "source": None,
        "rows": len(rows),
        "columns": len(header),
        "duplicate_rows": duplicates,
        "columns_detail": columns_detail,
        "correlations": correlations,
    }
