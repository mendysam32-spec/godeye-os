"""HTML + Playwright PDF renderer for Report Studio."""
import base64
import html
import re
from pathlib import Path
from string import Template

_CSS = Template("""
:root {
  --primary: $primary;
  --accent: $accent;
  --text: $text;
  --muted: $muted;
  --rule: $rule;
  --surface: $surface;
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  color: var(--text);
  font-size: 10.5pt;
  line-height: 1.55;
  background: #ffffff;
}
.cover { height: 247mm; display: flex; flex-direction: column; justify-content: center; padding: 0 4mm; break-after: page; }
.cover .bar { width: 64px; height: 6px; background: var(--accent); margin-bottom: 28px; border-radius: 3px; }
.cover .kicker { font-size: 10pt; letter-spacing: .14em; text-transform: uppercase; color: var(--muted); margin-bottom: 14px; }
.cover h1 { font-size: 34pt; line-height: 1.1; margin: 0 0 12px; color: var(--primary); letter-spacing: -0.01em; }
.cover .subtitle { font-size: 14pt; color: var(--muted); margin: 0 0 40px; max-width: 85%; }
.cover .meta { font-size: 10.5pt; color: var(--muted); }
.cover .meta span { display: block; margin-top: 4px; }
.toc { padding-top: 2mm; }
.toc h2 { font-size: 18pt; color: var(--primary); margin: 0 0 16px; }
.toc ol { margin: 0; padding-left: 20px; }
.toc li { margin: 7px 0; font-size: 11pt; color: var(--text); }
.report-section { margin: 0; }
.report-section.level-1 { break-before: page; }
.report-section h2 { font-size: 18pt; color: var(--primary); margin: 0 0 12px; padding-bottom: 8px; border-bottom: 2px solid var(--rule); }
.report-section h3 { font-size: 13pt; color: var(--primary); margin: 18px 0 8px; }
.report-section h4 { font-size: 11.5pt; color: var(--text); margin: 14px 0 6px; }
p { margin: 0 0 9px; }
ul, ol { margin: 0 0 10px; padding-left: 20px; }
li { margin: 3px 0; }
strong { color: var(--text); }
code { font-family: "Consolas", "SF Mono", monospace; font-size: 9pt; background: #f1f5f9; padding: 1px 4px; border-radius: 3px; }
figure { margin: 14px 0 16px; break-inside: avoid; }
figure img { width: 100%; height: auto; display: block; border: 1px solid var(--rule); border-radius: 4px; }
figcaption { font-size: 8.5pt; color: var(--muted); font-style: italic; margin-top: 6px; }
table { width: 100%; border-collapse: collapse; font-size: 9pt; margin-top: 4px; }
th { background: var(--primary); color: #ffffff; text-align: left; padding: 7px 8px; font-weight: 600; }
td { border-bottom: 1px solid var(--rule); padding: 6px 8px; vertical-align: top; }
tbody tr:nth-child(even) td { background: #f7f9fb; }
""")


def _esc(value):
    return html.escape(str(value if value is not None else ""))


def _inline_md(text):
    text = _esc(text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", text)
    text = re.sub(r"(?<!\*)\*([^*]+)\*(?!\*)", r"<em>\1</em>", text)
    text = re.sub(r"`([^`]+)`", r"<code>\1</code>", text)
    return text


def _blocks_md(text):
    text = str(text or "").strip()
    if not text:
        return ""
    parts = []
    for block in re.split(r"\n\s*\n", text):
        lines = [line.rstrip() for line in block.split("\n") if line.strip()]
        if not lines:
            continue
        if all(re.match(r"^[-*]\s+", line) for line in lines):
            items = []
            for line in lines:
                cleaned = re.sub(r"^[-*]\s+", "", line)
                items.append(f"<li>{_inline_md(cleaned)}</li>")
            parts.append("<ul>" + "".join(items) + "</ul>")
        elif all(re.match(r"^\d+[.)]\s+", line) for line in lines):
            items = []
            for line in lines:
                cleaned = re.sub(r"^\d+[.)]\s+", "", line)
                items.append(f"<li>{_inline_md(cleaned)}</li>")
            parts.append("<ol>" + "".join(items) + "</ol>")
        else:
            parts.append(f"<p>{_inline_md(' '.join(lines))}</p>")
    return "".join(parts)


def _data_url(path):
    data = Path(path).read_bytes()
    return "data:image/png;base64," + base64.b64encode(data).decode("ascii")


def _css(theme):
    return _CSS.substitute(
        primary=theme["primary"],
        accent=theme["accent"],
        text=theme["text"],
        muted=theme["muted"],
        rule=theme["rule"],
        surface=theme["surface"],
    )


def _cover_html(spec):
    kicker = _esc(spec.get("client") or "")
    subtitle = f"<p class='subtitle'>{_esc(spec['subtitle'])}</p>" if spec.get("subtitle") else ""
    meta = "".join(
        f"<span>{_esc(item)}</span>"
        for item in (spec.get("author"), spec.get("date"))
        if item
    )
    return (
        "<section class='cover'>"
        "<div class='bar'></div>"
        f"<div class='kicker'>{kicker}</div>"
        f"<h1>{_esc(spec.get('title') or 'Report')}</h1>"
        f"{subtitle}"
        f"<div class='meta'>{meta}</div>"
        "</section>"
    )


def _toc_html(sections):
    items = []
    for section in sections:
        if int(section.get("level") or 1) != 1:
            continue
        items.append(f"<li>{_esc(section.get('heading') or '')}</li>")
    return "<section class='toc'><h2>Contents</h2><ol>" + "".join(items) + "</ol></section>"


def _table_html(data, number):
    columns = list(data.get("columns") or [])
    rows = list(data.get("rows") or [])
    align = list(data.get("align") or [])
    if not columns and rows:
        columns = [f"Column {i + 1}" for i in range(len(rows[0]))]
    if not columns:
        return ""

    def style_for(index):
        if index < len(align) and align[index] in ("left", "right", "center"):
            return f" style='text-align:{align[index]}'"
        return ""

    head = "".join(f"<th{style_for(i)}>{_esc(column)}</th>" for i, column in enumerate(columns))
    body = []
    for row in rows:
        cells = "".join(
            f"<td{style_for(i)}>{_esc(row[i] if i < len(row) else '')}</td>"
            for i in range(len(columns))
        )
        body.append(f"<tr>{cells}</tr>")

    caption = f"<figcaption>Table {number}: {_esc(data.get('title') or '')}</figcaption>" if data.get("title") else ""
    return (
        f"<figure>{caption}<table><thead><tr>{head}</tr></thead>"
        f"<tbody>{''.join(body)}</tbody></table></figure>"
    )


def _section_html(section):
    level = int(section.get("level") or 1)
    tag = "h2" if level == 1 else ("h3" if level == 2 else "h4")
    parts = [f"<section class='report-section level-{level}'>", f"<{tag}>{_esc(section.get('heading') or '')}</{tag}>"]

    body = _blocks_md(section.get("body"))
    if body:
        parts.append(body)

    if section.get("_chart"):
        title = (section.get("chart") or {}).get("title") or ""
        parts.append(
            f"<figure><img src='{_data_url(section['_chart'])}' alt='{_esc(title)}'>"
            f"<figcaption>Figure {section.get('_figure_no')}: {_esc(title)}</figcaption></figure>"
        )

    if section.get("_table"):
        parts.append(_table_html(section["_table"], section.get("_table_no")))

    if section.get("_image"):
        caption = section.get("_image_caption") or ""
        figcaption = f"<figcaption>{_esc(caption)}</figcaption>" if caption else ""
        parts.append(f"<figure><img src='{_data_url(section['_image'])}' alt=''>{figcaption}</figure>")

    parts.append("</section>")
    return "".join(parts)


def build_html(spec, sections, theme, out_path):
    """Write a standalone HTML report and return its path."""
    document = [
        "<!doctype html><html><head><meta charset='utf-8'>",
        f"<title>{_esc(spec.get('title') or 'Report')}</title>",
        f"<style>{_css(theme)}</style></head><body>",
        _cover_html(spec),
        _toc_html(sections),
    ]
    for section in sections:
        document.append(_section_html(section))
    document.append("</body></html>")
    Path(out_path).write_text("\n".join(document), encoding="utf-8")
    return str(out_path)


def _header_template(spec, theme):
    client = _esc(spec.get("client") or "")
    return (
        f"<div style='width:100%;font-size:8px;color:{theme['muted']};padding:0 18mm;"
        f"text-align:right;font-family:Arial,sans-serif;'>{client}</div>"
    )


def _footer_template(spec, theme):
    title = _esc(spec.get("title") or "")
    return (
        f"<div style='width:100%;font-size:8px;color:{theme['muted']};padding:0 18mm;"
        "display:flex;justify-content:space-between;font-family:Arial,sans-serif;'>"
        f"<span>{title}</span>"
        "<span><span class='pageNumber'></span> / <span class='totalPages'></span></span>"
        "</div>"
    )


def render_pdf(html_path, out_pdf, spec, theme):
    """Render the HTML to a PDF with Playwright/Chromium."""
    from playwright.sync_api import sync_playwright

    show_footer = bool(spec.get("page_numbers", True))
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page()
        page.goto(Path(html_path).resolve().as_uri())
        page.wait_for_load_state("networkidle")
        page.pdf(
            path=str(out_pdf),
            format=str(spec.get("page_size") or "A4"),
            print_background=True,
            display_header_footer=show_footer,
            header_template=_header_template(spec, theme),
            footer_template=_footer_template(spec, theme),
            margin={"top": "18mm", "bottom": "20mm", "left": "18mm", "right": "18mm"},
        )
        browser.close()
    return str(out_pdf)


def render_preview(html_path, out_dir, spec):
    """Screenshot the cover and the first content section for a quick visual check."""
    from playwright.sync_api import sync_playwright

    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    cover_path = out_dir / "preview-cover.png"
    content_path = out_dir / "preview-content.png"

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page(viewport={"width": 900, "height": 1200}, device_scale_factor=1)
        page.goto(Path(html_path).resolve().as_uri())
        page.wait_for_load_state("networkidle")
        page.screenshot(path=str(cover_path))
        page.evaluate("document.querySelector('.report-section')?.scrollIntoView({block:'start'})")
        page.wait_for_timeout(250)
        page.screenshot(path=str(content_path))
        browser.close()

    return [str(cover_path), str(content_path)]
