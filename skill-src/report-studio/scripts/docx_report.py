"""Word (.docx) renderer for Report Studio."""
import re

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Mm, Pt, RGBColor

INLINE_RE = re.compile(r"(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)")


def _rgb(hex_color):
    return RGBColor.from_string(str(hex_color).lstrip("#").upper())


def _bottom_border(paragraph, color, size=12):
    p_pr = paragraph._p.get_or_add_pPr()
    borders = OxmlElement("w:pBdr")
    bottom = OxmlElement("w:bottom")
    bottom.set(qn("w:val"), "single")
    bottom.set(qn("w:sz"), str(size))
    bottom.set(qn("w:space"), "1")
    bottom.set(qn("w:color"), str(color).lstrip("#"))
    borders.append(bottom)
    p_pr.append(borders)


def _shade(cell, color):
    tc_pr = cell._tc.get_or_add_tcPr()
    shading = OxmlElement("w:shd")
    shading.set(qn("w:val"), "clear")
    shading.set(qn("w:color"), "auto")
    shading.set(qn("w:fill"), str(color).lstrip("#"))
    tc_pr.append(shading)


def _add_field(paragraph, field, theme):
    run = paragraph.add_run()
    run.font.size = Pt(8)
    run.font.color.rgb = _rgb(theme["muted"])
    begin = OxmlElement("w:fldChar")
    begin.set(qn("w:fldCharType"), "begin")
    instr = OxmlElement("w:instrText")
    instr.set(qn("xml:space"), "preserve")
    instr.text = f" {field} "
    end = OxmlElement("w:fldChar")
    end.set(qn("w:fldCharType"), "end")
    run._r.append(begin)
    run._r.append(instr)
    run._r.append(end)


def _inline(paragraph, text):
    text = str(text or "")
    position = 0
    for match in INLINE_RE.finditer(text):
        if match.start() > position:
            paragraph.add_run(text[position:match.start()])
        token = match.group(0)
        if token.startswith("**"):
            run = paragraph.add_run(token[2:-2])
            run.bold = True
        elif token.startswith("`"):
            run = paragraph.add_run(token[1:-1])
            run.font.name = "Consolas"
            run.font.size = Pt(9.5)
        else:
            run = paragraph.add_run(token[1:-1])
            run.italic = True
        position = match.end()
    if position < len(text):
        paragraph.add_run(text[position:])


def _caption(doc, text, theme):
    paragraph = doc.add_paragraph()
    paragraph.paragraph_format.space_before = Pt(4)
    paragraph.paragraph_format.space_after = Pt(10)
    run = paragraph.add_run(str(text))
    run.italic = True
    run.font.size = Pt(8.5)
    run.font.color.rgb = _rgb(theme["muted"])


def _add_image(doc, path, width_in=6.2):
    try:
        doc.add_picture(str(path), width=Inches(width_in))
        doc.paragraphs[-1].alignment = WD_ALIGN_PARAGRAPH.CENTER
        return True
    except Exception:
        return False


def _setup_page(doc, spec):
    section = doc.sections[0]
    if str(spec.get("page_size") or "A4").upper() == "LETTER":
        section.page_width = Inches(8.5)
        section.page_height = Inches(11)
    else:
        section.page_width = Mm(210)
        section.page_height = Mm(297)
    section.left_margin = section.right_margin = Mm(20)
    section.top_margin = Mm(20)
    section.bottom_margin = Mm(22)


def _setup_styles(doc, theme):
    normal = doc.styles["Normal"]
    normal.font.name = "Calibri"
    normal.font.size = Pt(10.5)
    normal.font.color.rgb = _rgb(theme["text"])
    normal.paragraph_format.space_after = Pt(6)
    normal.paragraph_format.line_spacing = 1.15

    for name, size in (("Heading 1", 18), ("Heading 2", 13), ("Heading 3", 11.5)):
        style = doc.styles[name]
        style.font.name = "Calibri"
        style.font.size = Pt(size)
        style.font.bold = True
        style.font.color.rgb = _rgb(theme["primary"])
        style.paragraph_format.space_before = Pt(14 if name == "Heading 1" else 10)
        style.paragraph_format.space_after = Pt(6)


def _add_header_footer(doc, spec, theme):
    section = doc.sections[0]

    header = section.header.paragraphs[0]
    header.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    run = header.add_run(str(spec.get("client") or spec.get("title") or ""))
    run.font.size = Pt(8)
    run.font.color.rgb = _rgb(theme["muted"])

    footer = section.footer.paragraphs[0]
    footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = footer.add_run(f"{spec.get('title') or ''}   ")
    run.font.size = Pt(8)
    run.font.color.rgb = _rgb(theme["muted"])
    _add_field(footer, "PAGE", theme)
    sep = footer.add_run(" / ")
    sep.font.size = Pt(8)
    sep.font.color.rgb = _rgb(theme["muted"])
    _add_field(footer, "NUMPAGES", theme)


def _add_cover(doc, spec, theme):
    for _ in range(4):
        doc.add_paragraph()
    rule = doc.add_paragraph()
    _bottom_border(rule, theme["accent"], 24)

    title = doc.add_paragraph()
    title.paragraph_format.space_before = Pt(18)
    run = title.add_run(str(spec.get("title") or "Report"))
    run.bold = True
    run.font.size = Pt(32)
    run.font.color.rgb = _rgb(theme["primary"])

    if spec.get("subtitle"):
        subtitle = doc.add_paragraph()
        subtitle.paragraph_format.space_before = Pt(6)
        run = subtitle.add_run(str(spec["subtitle"]))
        run.font.size = Pt(15)
        run.font.color.rgb = _rgb(theme["muted"])

    for _ in range(6):
        doc.add_paragraph()

    for line in (spec.get("client"), spec.get("author"), spec.get("date")):
        if not line:
            continue
        paragraph = doc.add_paragraph()
        run = paragraph.add_run(str(line))
        run.font.size = Pt(10.5)
        run.font.color.rgb = _rgb(theme["muted"])

    doc.add_page_break()


def _add_toc(doc, sections, theme):
    doc.add_heading("Contents", level=1)
    number = 0
    for section in sections:
        if int(section.get("level") or 1) != 1:
            continue
        number += 1
        paragraph = doc.add_paragraph()
        paragraph.paragraph_format.space_after = Pt(3)
        run = paragraph.add_run(f"{number}.   {section.get('heading') or ''}")
        run.font.size = Pt(10.5)
        run.font.color.rgb = _rgb(theme["text"])
    doc.add_page_break()


def _add_body(doc, text):
    text = str(text or "").strip()
    if not text:
        return
    for block in re.split(r"\n\s*\n", text):
        lines = [line.rstrip() for line in block.split("\n") if line.strip()]
        if not lines:
            continue
        if all(re.match(r"^[-*]\s+", line) for line in lines):
            for line in lines:
                paragraph = doc.add_paragraph(style="List Bullet")
                _inline(paragraph, re.sub(r"^[-*]\s+", "", line))
        elif all(re.match(r"^\d+[.)]\s+", line) for line in lines):
            for line in lines:
                paragraph = doc.add_paragraph(style="List Number")
                _inline(paragraph, re.sub(r"^\d+[.)]\s+", "", line))
        else:
            paragraph = doc.add_paragraph()
            _inline(paragraph, " ".join(lines))


def _add_table(doc, data, theme):
    columns = list(data.get("columns") or [])
    rows = list(data.get("rows") or [])
    if not columns and rows:
        columns = [f"Column {i + 1}" for i in range(len(rows[0]))]
    if not columns:
        return

    table = doc.add_table(rows=1, cols=len(columns))
    table.style = "Table Grid"
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = True

    header_cells = table.rows[0].cells
    for index, column in enumerate(columns):
        cell = header_cells[index]
        cell.text = ""
        paragraph = cell.paragraphs[0]
        run = paragraph.add_run(str(column))
        run.bold = True
        run.font.size = Pt(9.5)
        run.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
        _shade(cell, theme["primary"])

    align = list(data.get("align") or [])
    for row_index, row in enumerate(rows):
        cells = table.add_row().cells
        for column_index in range(len(columns)):
            value = str(row[column_index]) if column_index < len(row) else ""
            paragraph = cells[column_index].paragraphs[0]
            run = paragraph.add_run(value)
            run.font.size = Pt(9.5)
            if row_index % 2 == 1:
                _shade(cells[column_index], "F5F7FA")
            if column_index < len(align):
                paragraph.alignment = {
                    "right": WD_ALIGN_PARAGRAPH.RIGHT,
                    "center": WD_ALIGN_PARAGRAPH.CENTER,
                }.get(align[column_index], WD_ALIGN_PARAGRAPH.LEFT)


def build_docx(spec, sections, theme, out_path):
    """Render the report to a .docx file and return its path."""
    doc = Document()
    _setup_page(doc, spec)
    _setup_styles(doc, theme)
    _add_header_footer(doc, spec, theme)
    _add_cover(doc, spec, theme)
    _add_toc(doc, sections, theme)

    first = True
    for section in sections:
        level = int(section.get("level") or 1)
        if level == 1 and not first:
            doc.add_page_break()
        first = False

        doc.add_heading(str(section.get("heading") or ""), level=min(max(level, 1), 3))
        _add_body(doc, section.get("body"))

        if section.get("_chart"):
            if _add_image(doc, section["_chart"]):
                title = (section.get("chart") or {}).get("title") or ""
                _caption(doc, f"Figure {section.get('_figure_no')}: {title}", theme)

        if section.get("_table"):
            data = section["_table"]
            if data.get("title"):
                _caption(doc, f"Table {section.get('_table_no')}: {data['title']}", theme)
            _add_table(doc, data, theme)
            doc.add_paragraph()

        if section.get("_image"):
            if _add_image(doc, section["_image"]):
                caption = section.get("_image_caption") or ""
                if caption:
                    _caption(doc, caption, theme)

    doc.save(str(out_path))
    return str(out_path)
