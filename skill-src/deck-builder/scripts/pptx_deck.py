"""PowerPoint (.pptx) renderer for Deck Builder."""
import re

from PIL import Image
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.oxml.ns import qn
from pptx.util import Emu, Inches, Pt

# 16:9 canvas
SLIDE_W = Inches(13.333)
SLIDE_H = Inches(7.5)
MARGIN = Inches(0.6)
CONTENT_W = SLIDE_W - MARGIN * 2

INLINE_RE = re.compile(r"(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)")


def _rgb(hex_color):
    return RGBColor.from_string(str(hex_color).lstrip("#").upper())


def _hex(color):
    return str(color).lstrip("#")


def _inline_runs(paragraph, text, size, color, bold=False, italic=False):
    """Add runs to a paragraph, honoring **bold**, *italic*, `code`."""
    text = str(text or "")
    position = 0
    for match in INLINE_RE.finditer(text):
        if match.start() > position:
            _append_run(paragraph, text[position:match.start()])
        token = match.group(0)
        if token.startswith("**"):
            run = _append_run(paragraph, token[2:-2])
            run.font.bold = True
        elif token.startswith("`"):
            run = _append_run(paragraph, token[1:-1])
            run.font.name = "Consolas"
        else:
            run = _append_run(paragraph, token[1:-1])
            run.font.italic = True
        position = match.end()
    if position < len(text):
        _append_run(paragraph, text[position:])
    for run in paragraph.runs:
        run.font.size = Pt(size)
        run.font.color.rgb = _rgb(color)
        if run.font.name != "Consolas":
            run.font.name = "Calibri"
        if bold:
            run.font.bold = True
        if italic:
            run.font.italic = True


def _append_run(paragraph, text):
    run = paragraph.add_run()
    run.text = str(text or "")
    return run


def _textbox(slide, x, y, w, h, wrap=True):
    box = slide.shapes.add_textbox(x, y, w, h)
    tf = box.text_frame
    tf.word_wrap = wrap
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    return box, tf


def _para(tf, first=False, align=None, space_after=6, space_before=0):
    paragraph = tf.paragraphs[0] if first else tf.add_paragraph()
    if align is not None:
        paragraph.alignment = align
    paragraph.space_after = Pt(space_after)
    paragraph.space_before = Pt(space_before)
    return paragraph


def _bullet_char(paragraph, char="•", indent_in=0.26):
    """Real bullet with hanging indent via XML."""
    p_pr = paragraph._p.get_or_add_pPr()
    emu = Emu(Inches(indent_in))
    p_pr.set("marL", str(emu))
    p_pr.set("indent", str(-emu))
    bu_font = p_pr.makeelement(qn("a:buFont"), {"typeface": "Arial", "pitchFamily": "34", "charset": "0"})
    bu_char = p_pr.makeelement(qn("a:buChar"), {"char": char})
    p_pr.append(bu_font)
    p_pr.append(bu_char)


def _solid_fill(shape, color):
    shape.fill.solid()
    shape.fill.fore_color.rgb = _rgb(color)
    shape.line.fill.background()
    shape.shadow.inherit = False


def _bg(slide, theme):
    slide.background.fill.solid()
    slide.background.fill.fore_color.rgb = _rgb(theme["bg"])


def _accent_bar(slide, theme, x, y, w=Inches(0.75), h=Inches(0.11)):
    shape = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, x, y, w, h)
    _solid_fill(shape, theme["accent"])
    return shape


def _heading(slide, theme, text, kicker=None):
    """Standard content-slide heading block. Returns content top (EMU)."""
    y = Inches(0.52)
    if kicker:
        _, tf = _textbox(slide, MARGIN, y, CONTENT_W, Inches(0.3))
        paragraph = _para(tf, first=True, align=PP_ALIGN.LEFT, space_after=0)
        _inline_runs(paragraph, str(kicker).upper(), 11, theme["accent"], bold=True)
        y = y + Inches(0.34)
    _, tf = _textbox(slide, MARGIN, y, CONTENT_W, Inches(0.75))
    paragraph = _para(tf, first=True, align=PP_ALIGN.LEFT, space_after=0)
    _inline_runs(paragraph, text, 27, theme["text"], bold=True)
    rule = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, MARGIN, Inches(1.42), CONTENT_W, Pt(1.4))
    _solid_fill(rule, theme["rule"])
    return Inches(1.68)


def _slide_number(slide, index, total, theme):
    _, tf = _textbox(slide, SLIDE_W - Inches(1.35), SLIDE_H - Inches(0.44), Inches(0.75), Inches(0.3))
    paragraph = _para(tf, first=True, align=PP_ALIGN.RIGHT, space_after=0)
    _inline_runs(paragraph, f"{index + 1} / {total}", 10, theme["muted"])


def _notes(slide, text):
    if not text:
        return
    frame = slide.notes_slide.notes_text_frame
    frame.text = ""
    parts = [part for part in re.split(r"\n\s*\n", str(text)) if part.strip()]
    for i, part in enumerate(parts):
        paragraph = frame.paragraphs[0] if i == 0 else frame.add_paragraph()
        paragraph.text = part.strip()


def _fit_picture(slide, path, box_x, box_y, box_w, box_h):
    """Insert a picture scaled to fit the box, centered; returns the shape."""
    with Image.open(str(path)) as im:
        img_w, img_h = im.size
    scale = min(box_w / img_w, box_h / img_h)
    w, h = int(img_w * scale), int(img_h * scale)
    x = box_x + (box_w - w) // 2
    y = box_y + (box_h - h) // 2
    return slide.shapes.add_picture(str(path), x, y, w, h)


def _add_cover(slide, spec, theme):
    _accent_bar(slide, theme, MARGIN, Inches(1.55))
    _, tf = _textbox(slide, MARGIN, Inches(1.85), Inches(9.5), Inches(0.4))
    paragraph = _para(tf, first=True, space_after=0)
    _inline_runs(paragraph, str(spec.get("client") or "").upper(), 13, theme["muted"], bold=True)

    _, tf = _textbox(slide, MARGIN, Inches(2.35), Inches(11.0), Inches(1.9))
    paragraph = _para(tf, first=True, space_after=0)
    _inline_runs(paragraph, spec.get("title") or "Deck", 44, theme["primary"], bold=True)

    if spec.get("subtitle"):
        _, tf = _textbox(slide, MARGIN, Inches(4.15), Inches(10.0), Inches(0.6))
        paragraph = _para(tf, first=True, space_after=0)
        _inline_runs(paragraph, spec["subtitle"], 20, theme["muted"])

    meta = "   ·   ".join(str(x) for x in (spec.get("author"), spec.get("date")) if x)
    if meta:
        _, tf = _textbox(slide, MARGIN, Inches(6.55), Inches(8.0), Inches(0.4))
        paragraph = _para(tf, first=True, space_after=0)
        _inline_runs(paragraph, meta, 12, theme["muted"])


def _add_section(slide, spec, theme):
    number = str(spec.get("number") or "")
    if number:
        _, tf = _textbox(slide, MARGIN, Inches(1.9), Inches(3.0), Inches(1.4))
        paragraph = _para(tf, first=True, space_after=0)
        _inline_runs(paragraph, number, 72, theme["accent"], bold=True)
    y = Inches(3.3) if number else Inches(2.6)
    rule = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, MARGIN, y, Inches(2.6), Pt(3))
    _solid_fill(rule, theme["accent"])
    _, tf = _textbox(slide, MARGIN, y + Inches(0.25), Inches(11.0), Inches(1.2))
    paragraph = _para(tf, first=True, space_after=0)
    _inline_runs(paragraph, spec.get("title") or "", 34, theme["text"], bold=True)
    if spec.get("kicker"):
        _, tf = _textbox(slide, MARGIN, y + Inches(1.05), Inches(10.0), Inches(0.5))
        paragraph = _para(tf, first=True, space_after=0)
        _inline_runs(paragraph, spec["kicker"], 14, theme["muted"])


def _add_bullets(slide, spec, theme):
    top = _heading(slide, theme, spec.get("heading") or "", spec.get("kicker"))
    bullets = [b for b in (spec.get("bullets") or []) if str(b).strip()]
    _, tf = _textbox(slide, MARGIN, top, CONTENT_W, SLIDE_H - top - Inches(0.6))
    for i, item in enumerate(bullets):
        paragraph = _para(tf, first=(i == 0), space_after=12)
        _bullet_char(paragraph)
        _inline_runs(paragraph, item, 17, theme["text"])


def _add_kpi(slide, spec, theme):
    top = _heading(slide, theme, spec.get("heading") or "", spec.get("kicker"))
    items = [i for i in (spec.get("items") or []) if isinstance(i, dict)][:4]
    if not items:
        return
    count = len(items)
    gap = Inches(0.3)
    card_w = int((CONTENT_W - gap * (count - 1)) / count)
    card_h = Inches(3.1)
    for index, item in enumerate(items):
        x = MARGIN + index * (card_w + gap)
        card = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, x, top + Inches(0.35), card_w, card_h)
        _solid_fill(card, theme["panel"])
        card.adjustments[0] = 0.06

        _, tf = _textbox(slide, x + Inches(0.32), top + Inches(0.75), card_w - Inches(0.64), card_h - Inches(0.9))
        paragraph = _para(tf, first=True, space_after=8)
        _inline_runs(paragraph, item.get("value") or "", 38, theme["primary"], bold=True)
        paragraph = _para(tf, space_after=4)
        _inline_runs(paragraph, item.get("label") or "", 14, theme["text"], bold=True)
        if item.get("delta"):
            paragraph = _para(tf, space_after=0)
            _inline_runs(paragraph, item["delta"], 12, theme["accent"], bold=True)


def _add_chart(slide, spec, theme):
    top = _heading(slide, theme, spec.get("heading") or "", spec.get("kicker"))
    bottom = SLIDE_H - Inches(0.55)
    if spec.get("footnote"):
        bottom = bottom - Inches(0.35)
    box_h = bottom - top - Inches(0.25)
    if spec.get("_chart"):
        _fit_picture(slide, spec["_chart"], MARGIN, top + Inches(0.05), CONTENT_W, box_h)
    if spec.get("footnote"):
        _, tf = _textbox(slide, MARGIN, bottom, CONTENT_W, Inches(0.3))
        paragraph = _para(tf, first=True, space_after=0)
        _inline_runs(paragraph, spec["footnote"], 11, theme["muted"], italic=True)


def _add_table(slide, spec, theme):
    top = _heading(slide, theme, spec.get("heading") or "", spec.get("kicker"))
    data = spec.get("_table") or {}
    columns = list(data.get("columns") or [])
    rows = list(data.get("rows") or [])
    if not columns and rows:
        columns = [f"Column {i + 1}" for i in range(len(rows[0]))]
    if not columns:
        return
    available = SLIDE_H - top - Inches(0.6) - (Inches(0.35) if spec.get("footnote") else 0)
    row_h = min(Inches(0.42), max(Inches(0.3), available / (len(rows) + 1)))

    table_shape = slide.shapes.add_table(len(rows) + 1, len(columns), MARGIN, top, CONTENT_W, row_h * (len(rows) + 1))
    table = table_shape.table
    table.first_row = True
    for i, column in enumerate(columns):
        table.columns[i].width = int(CONTENT_W / len(columns))

    align = list(data.get("align") or [])
    align_map = {"left": PP_ALIGN.LEFT, "right": PP_ALIGN.RIGHT, "center": PP_ALIGN.CENTER}

    def fill_cell(cell, text, *, header=False, zebra=False):
        cell.margin_left = cell.margin_right = Inches(0.12)
        cell.margin_top = cell.margin_bottom = Inches(0.05)
        cell.vertical_anchor = MSO_ANCHOR.MIDDLE
        if header:
            cell.fill.solid()
            cell.fill.fore_color.rgb = _rgb(theme["primary"])
        elif zebra:
            cell.fill.solid()
            cell.fill.fore_color.rgb = _rgb(theme["panel"])
        else:
            cell.fill.background()
        tf = cell.text_frame
        tf.word_wrap = True
        paragraph = _para(tf, first=True, space_after=0)
        size = 12 if header else 12
        _inline_runs(paragraph, text, size, "#FFFFFF" if header else theme["text"], bold=header)

    for i, column in enumerate(columns):
        fill_cell(table.cell(0, i), str(column), header=True)
    for r, row in enumerate(rows):
        for c in range(len(columns)):
            value = str(row[c]) if c < len(row) else ""
            fill_cell(table.cell(r + 1, c), value, zebra=(r % 2 == 1))
            if c < len(align) and align[c] in align_map:
                table.cell(r + 1, c).text_frame.paragraphs[0].alignment = align_map[align[c]]

    if spec.get("footnote"):
        _, tf = _textbox(slide, MARGIN, SLIDE_H - Inches(0.9), CONTENT_W, Inches(0.3))
        paragraph = _para(tf, first=True, space_after=0)
        _inline_runs(paragraph, spec["footnote"], 11, theme["muted"], italic=True)


def _add_image(slide, spec, theme):
    top = _heading(slide, theme, spec.get("heading") or "", spec.get("kicker"))
    caption = spec.get("_image_caption") or ""
    bottom = SLIDE_H - Inches(0.55) - (Inches(0.35) if caption else 0)
    if spec.get("_image"):
        _fit_picture(slide, spec["_image"], MARGIN, top + Inches(0.05), CONTENT_W, bottom - top - Inches(0.15))
    if caption:
        _, tf = _textbox(slide, MARGIN, bottom, CONTENT_W, Inches(0.3))
        paragraph = _para(tf, first=True, space_after=0)
        _inline_runs(paragraph, caption, 11, theme["muted"], italic=True)


def _add_end(slide, spec, theme):
    message = spec.get("message") or "Thank you"
    _, tf = _textbox(slide, MARGIN, Inches(2.9), CONTENT_W, Inches(1.6))
    paragraph = _para(tf, first=True, align=PP_ALIGN.CENTER, space_after=0)
    _inline_runs(paragraph, message, 40, theme["primary"], bold=True)
    if spec.get("contact"):
        _, tf = _textbox(slide, MARGIN, Inches(4.6), CONTENT_W, Inches(0.5))
        paragraph = _para(tf, first=True, align=PP_ALIGN.CENTER, space_after=0)
        _inline_runs(paragraph, spec["contact"], 15, theme["muted"])


_RENDERERS = {
    "cover": _add_cover,
    "section": _add_section,
    "bullets": _add_bullets,
    "kpi": _add_kpi,
    "chart": _add_chart,
    "table": _add_table,
    "image": _add_image,
    "end": _add_end,
}


def build_pptx(spec, slides, theme, out_path):
    """Render the deck to a .pptx file and return its path."""
    deck = Presentation()
    deck.slide_width = SLIDE_W
    deck.slide_height = SLIDE_H
    blank = deck.slide_layouts[6]

    total = len(slides)
    for index, slide_spec in enumerate(slides):
        kind = str(slide_spec.get("kind") or "bullets")
        slide = deck.slides.add_slide(blank)
        _bg(slide, theme)
        renderer = _RENDERERS.get(kind, _add_bullets)
        # cover reads top-level fields (title/subtitle/author/date)
        renderer(slide, spec if kind == "cover" else slide_spec, theme)
        if kind not in ("cover", "end") and spec.get("page_numbers", True):
            _slide_number(slide, index, total, theme)
        _notes(slide, slide_spec.get("notes"))

    deck.save(str(out_path))
    return str(out_path)
