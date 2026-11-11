"""HTML mirror of the deck for visual verification (same theme, same layout)."""
import base64
import html
import re
import struct
from pathlib import Path
from string import Template

# 1 slide inch = 96 px → 13.333 × 7.5 in = 1280 × 720 px
PX = 96

_CSS = Template("""
* { margin: 0; padding: 0; box-sizing: border-box; }
body { background: #1a1f2b; font-family: Calibri, "Segoe UI", Arial, sans-serif; }
.slide {
  position: relative; width: 1280px; height: 720px; overflow: hidden;
  background: $bg; color: $text; margin: 24px auto; box-shadow: 0 8px 30px rgba(0,0,0,.35);
}
.abs { position: absolute; }
.bar { background: $accent; border-radius: 6px; }
.rule { background: $rule; height: 2px; }
.kicker { font-size: 13px; font-weight: 700; color: $muted; letter-spacing: .12em; text-transform: uppercase; }
.kicker.accent { color: $accent; }
.cover-title { font-size: 58px; font-weight: 700; color: $primary; line-height: 1.08; }
.subtitle { font-size: 26px; color: $muted; }
.meta { font-size: 15px; color: $muted; }
.section-num { font-size: 94px; font-weight: 700; color: $accent; line-height: 1; }
.section-title { font-size: 44px; font-weight: 700; color: $text; line-height: 1.15; }
.section-rule { background: $accent; height: 4px; width: 250px; }
.heading { font-size: 35px; font-weight: 700; color: $text; line-height: 1.1; }
ul.bullets { list-style: none; }
ul.bullets li { font-size: 22px; color: $text; margin-bottom: 15px; padding-left: 30px; position: relative; line-height: 1.3; }
ul.bullets li::before { content: "•"; position: absolute; left: 4px; color: $text; }
.kpi-card { background: $panel; border-radius: 12px; }
.kpi-value { font-size: 49px; font-weight: 700; color: $primary; line-height: 1; }
.kpi-label { font-size: 18px; font-weight: 700; color: $text; }
.kpi-delta { font-size: 15px; font-weight: 700; color: $accent; }
figure.media { position: absolute; display: flex; align-items: center; justify-content: center; }
figure.media img { max-width: 100%; max-height: 100%; }
.footnote { font-size: 14px; color: $muted; font-style: italic; }
table.deck { width: 100%; border-collapse: collapse; font-size: 16px; }
table.deck th { background: $primary; color: #ffffff; font-weight: 700; text-align: left; padding: 10px 14px; }
table.deck td { padding: 10px 14px; color: $text; vertical-align: middle; }
table.deck tbody tr:nth-child(even) td { background: $panel; }
.slide-num { position: absolute; right: 57px; bottom: 22px; font-size: 13px; color: $muted; }
.end-message { font-size: 52px; font-weight: 700; color: $primary; text-align: center; }
.end-contact { font-size: 19px; color: $muted; text-align: center; }
code { font-family: Consolas, monospace; }
""")


def _esc(value):
    return html.escape(str(value if value is not None else ""))


def _inline(text):
    text = _esc(text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", text)
    text = re.sub(r"(?<!\*)\*([^*]+)\*(?!\*)", r"<em>\1</em>", text)
    text = re.sub(r"`([^`]+)`", r"<code>\1</code>", text)
    return text


def _px(inches):
    """Slide inches → pixels."""
    return round(float(inches) * PX, 1)


def _abs(x_in, y_in, w_in, h_in, css="", inner=""):
    style = f"left:{_px(x_in)}px;top:{_px(y_in)}px;width:{_px(w_in)}px;height:{_px(h_in)}px;"
    if css:
        style += css
    return f'<div class="abs" style="{style}">{inner}</div>'


def _abs_px(x_px, y_px, w_px, h_px, css="", inner=""):
    style = f"left:{round(x_px, 1)}px;top:{round(y_px, 1)}px;width:{round(w_px, 1)}px;height:{round(h_px, 1)}px;"
    if css:
        style += css
    return f'<div class="abs" style="{style}">{inner}</div>'


def _data_url(path):
    data = Path(path).read_bytes()
    return "data:image/png;base64," + base64.b64encode(data).decode("ascii")


def _png_dims(path):
    with open(str(path), "rb") as fh:
        head = fh.read(33)
    return struct.unpack(">II", head[16:24])


def _fit_box(path, box_x_in, box_y_in, box_w_in, box_h_in):
    """Return (x, y, w, h) in px for an image centered inside a box given in inches."""
    img_w, img_h = _png_dims(path)
    box_w, box_h = _px(box_w_in), _px(box_h_in)
    scale = min(box_w / img_w, box_h / img_h)
    w, h = img_w * scale, img_h * scale
    x = _px(box_x_in) + (box_w - w) / 2
    y = _px(box_y_in) + (box_h - h) / 2
    return x, y, w, h


def _heading_html(slide, theme):
    y = 0.52
    out = ""
    if slide.get("kicker"):
        out += _abs(0.6, y, 12.133, 0.3, "kicker accent", _inline(str(slide["kicker"]).upper()))
        y += 0.34
    out += _abs(0.6, y, 12.133, 0.75, "heading", _inline(slide.get("heading") or ""))
    out += _abs(0.6, 1.42, 12.133, 0.02, "rule")
    return out


def _cover_html(slide, spec, theme):
    out = _abs(0.6, 1.55, 0.75, 0.11, "bar")
    out += _abs(0.6, 1.85, 9.5, 0.4, "kicker", _esc(str(spec.get("client") or "").upper()))
    out += _abs(0.6, 2.35, 11.0, 1.9, "cover-title", _inline(spec.get("title") or "Deck"))
    if spec.get("subtitle"):
        out += _abs(0.6, 4.15, 10.0, 0.6, "subtitle", _inline(spec["subtitle"]))
    meta = "   ·   ".join(_esc(x) for x in (spec.get("author"), spec.get("date")) if x)
    if meta:
        out += _abs(0.6, 6.55, 8.0, 0.4, "meta", meta)
    return out


def _section_html(slide, spec, theme):
    out = ""
    y = 3.3
    if slide.get("number"):
        out += _abs(0.6, 1.9, 3.0, 1.4, "section-num", _esc(slide["number"]))
    else:
        y = 2.6
    out += _abs(0.6, y, 2.6, 0.05, "section-rule")
    out += _abs(0.6, y + 0.25, 11.0, 1.2, "section-title", _inline(slide.get("title") or ""))
    if slide.get("kicker"):
        out += _abs(0.6, y + 1.05, 10.0, 0.5, "subtitle", _inline(slide["kicker"]))
    return out


def _bullets_html(slide, spec, theme):
    out = _heading_html(slide, theme)
    items = "".join(f"<li>{_inline(b)}</li>" for b in (slide.get("bullets") or []) if str(b).strip())
    out += _abs(0.6, 1.68, 12.133, 5.3, "", f'<ul class="bullets">{items}</ul>')
    return out


def _kpi_html(slide, spec, theme):
    out = _heading_html(slide, theme)
    items = [i for i in (slide.get("items") or []) if isinstance(i, dict)][:4]
    if not items:
        return out
    count = len(items)
    gap = 0.3
    card_w = (12.133 - gap * (count - 1)) / count
    top = 1.68 + 0.35
    for index, item in enumerate(items):
        x = 0.6 + index * (card_w + gap)
        out += f'<div class="kpi-card abs" style="left:{_px(x)}px;top:{_px(top)}px;width:{_px(card_w)}px;height:{_px(3.1)}px;"></div>'
        inner = (
            f'<div class="kpi-value">{_inline(item.get("value") or "")}</div>'
            f'<div class="kpi-label" style="margin-top:10px;">{_inline(item.get("label") or "")}</div>'
            + (f'<div class="kpi-delta" style="margin-top:5px;">{_inline(item["delta"])}</div>' if item.get("delta") else "")
        )
        out += _abs(x + 0.32, top + 0.4, card_w - 0.64, 2.2, "", inner)
    return out


def _chart_html(slide, spec, theme):
    out = _heading_html(slide, theme)
    bottom = 6.95 - (0.35 if slide.get("footnote") else 0)
    box_h = bottom - 1.73
    if slide.get("_chart"):
        x, y, w, h = _fit_box(slide["_chart"], 0.6, 1.73, 12.133, box_h)
        out += _abs_px(x, y, w, h, "", f'<img src="{_data_url(slide["_chart"])}" alt="" style="width:100%;height:100%;object-fit:contain;">')
    if slide.get("footnote"):
        out += _abs(0.6, bottom, 12.133, 0.3, "footnote", _inline(slide["footnote"]))
    return out


def _table_html(slide, spec, theme):
    out = _heading_html(slide, theme)
    data = slide.get("_table") or {}
    columns = list(data.get("columns") or [])
    rows = list(data.get("rows") or [])
    if not columns and rows:
        columns = [f"Column {i + 1}" for i in range(len(rows[0]))]
    if not columns:
        return out
    align = list(data.get("align") or [])

    def style_for(i):
        if i < len(align) and align[i] in ("left", "right", "center"):
            return f' style="text-align:{align[i]}"'
        return ""

    head = "".join(f"<th{style_for(i)}>{_esc(c)}</th>" for i, c in enumerate(columns))
    body = []
    for row in rows:
        cells = "".join(f"<td{style_for(i)}>{_inline(row[i] if i < len(row) else '')}</td>" for i in range(len(columns)))
        body.append(f"<tr>{cells}</tr>")
    out += _abs(0.6, 1.68, 12.133, 5.0, "", f'<table class="deck"><thead><tr>{head}</tr></thead><tbody>{"".join(body)}</tbody></table>')
    if slide.get("footnote"):
        out += _abs(0.6, 6.6, 12.133, 0.3, "footnote", _inline(slide["footnote"]))
    return out


def _image_html(slide, spec, theme):
    out = _heading_html(slide, theme)
    caption = slide.get("_image_caption") or ""
    bottom = 6.95 - (0.35 if caption else 0)
    if slide.get("_image"):
        x, y, w, h = _fit_box(slide["_image"], 0.6, 1.73, 12.133, bottom - 1.73)
        out += _abs_px(x, y, w, h, "", f'<img src="{_data_url(slide["_image"])}" alt="" style="width:100%;height:100%;object-fit:contain;">')
    if caption:
        out += _abs(0.6, bottom, 12.133, 0.3, "footnote", _inline(caption))
    return out


def _end_html(slide, spec, theme):
    out = _abs(0.6, 2.9, 12.133, 1.6, "end-message", _inline(slide.get("message") or "Thank you"))
    if slide.get("contact"):
        out += _abs(0.6, 4.6, 12.133, 0.5, "end-contact", _inline(slide["contact"]))
    return out


_RENDERERS = {
    "cover": _cover_html,
    "section": _section_html,
    "bullets": _bullets_html,
    "kpi": _kpi_html,
    "chart": _chart_html,
    "table": _table_html,
    "image": _image_html,
    "end": _end_html,
}


def build_html(spec, slides, theme, out_path):
    """Write the HTML mirror of the deck and return its path."""
    body = []
    total = len(slides)
    for index, slide in enumerate(slides):
        kind = str(slide.get("kind") or "bullets")
        inner = _RENDERERS.get(kind, _bullets_html)(slide, spec, theme)
        number = ""
        if kind not in ("cover", "end") and spec.get("page_numbers", True):
            number = f'<div class="slide-num">{index + 1} / {total}</div>'
        body.append(f'<section class="slide" data-kind="{_esc(kind)}">{inner}{number}</section>')

    document = (
        "<!doctype html><html><head><meta charset='utf-8'>"
        f"<title>{_esc(spec.get('title') or 'Deck')}</title>"
        f"<style>{_CSS.substitute(**theme)}</style></head><body>"
        + "".join(body)
        + "</body></html>"
    )
    Path(out_path).write_text(document, encoding="utf-8")
    return str(out_path)


def render_previews(html_path, out_dir):
    """Screenshot the cover and the first content slide."""
    from playwright.sync_api import sync_playwright

    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    cover_path = out_dir / "preview-cover.png"
    slide_path = out_dir / "preview-slide.png"

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page(viewport={"width": 1400, "height": 1000}, device_scale_factor=1)
        page.goto(Path(html_path).resolve().as_uri())
        page.wait_for_load_state("networkidle")
        page.locator("section.slide").first.screenshot(path=str(cover_path))
        content = page.locator(
            'section.slide[data-kind="chart"], section.slide[data-kind="kpi"], '
            'section.slide[data-kind="table"], section.slide[data-kind="bullets"]'
        ).first
        content.screenshot(path=str(slide_path))
        browser.close()

    return [str(cover_path), str(slide_path)]
