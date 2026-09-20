// Pure-JS, zero-dependency builders for ZIP / DOCX / PDF files plus base64 helpers.
// Runs in any browser or the Electron renderer, so GodEye can mint real files
// (downloadable in the browser, auto-written to disk on the desktop app).

export const MIME_DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

// ---------- base64 ----------

export function bufToBase64(buf: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    bin += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + chunk)));
  }
  return btoa(bin);
}

export function base64ToBuf(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64.replace(/\s+/g, ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ---------- ZIP (store method — no compression, fully portable) ----------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(d = new Date()): { time: number; date: number } {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

function u16(v: number): Uint8Array {
  const b = new Uint8Array(2);
  new DataView(b.buffer).setUint16(0, v, true);
  return b;
}
function u32(v: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, v >>> 0, true);
  return b;
}

export interface ZipEntry {
  path: string;
  data: Uint8Array;
  isDir?: boolean;
}

export function makeZip(entries: ZipEntry[]): Uint8Array {
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  const now = dosDateTime();
  for (const e of entries) {
    const isDir = e.isDir || e.path.endsWith("/");
    const name = encoder.encode(isDir ? e.path.replace(/([^/])$/g, "$1/") : e.path);
    const data = isDir ? new Uint8Array(0) : e.data;
    const crc = crc32(data);
    // local file header
    const lhLen = 30;
    const local = new Uint8Array(lhLen + name.length + data.length);
    local.set(u32(0x04034b50), 0); // signature "PK\x03\x04"
    local.set(u16(20), 4); // version needed
    local.set(u16(0x0800), 6); // general purpose flag: UTF-8 names
    local.set(u16(0), 8); // method = store
    local.set(u16(now.time), 10);
    local.set(u16(now.date), 12);
    local.set(u32(crc), 14);
    local.set(u32(data.length), 18); // compressed size
    local.set(u32(data.length), 22); // uncompressed size
    local.set(u16(name.length), 26);
    local.set(u16(0), 28); // extra length
    local.set(name, 30);
    local.set(data, 30 + name.length);
    locals.push(local);
    // central directory header
    const chLen = 46;
    const ch = new Uint8Array(chLen + name.length);
    ch.set(u32(0x02014b50), 0); // signature "PK\x01\x02"
    ch.set(u16(20), 4); // version made by
    ch.set(u16(20), 6); // version needed
    ch.set(u16(0x0800), 8); // UTF-8 flag
    ch.set(u16(0), 10); // method = store
    ch.set(u16(now.time), 12);
    ch.set(u16(now.date), 14);
    ch.set(u32(crc), 16);
    ch.set(u32(data.length), 20);
    ch.set(u32(data.length), 24);
    ch.set(u16(name.length), 28);
    ch.set(u16(0), 30); // extra length
    ch.set(u16(0), 32); // comment length
    ch.set(u16(0), 34); // disk number
    ch.set(u16(0), 36); // internal attrs
    ch.set(u32(isDir ? 0x10 << 16 : 0), 38); // external attrs (dir bit)
    ch.set(u32(offset), 42); // local header offset
    ch.set(name, 46);
    centrals.push(ch);
    offset += local.length;
  }
  const centralSize = centrals.reduce((a, c) => a + c.length, 0);
  const eocd = new Uint8Array(22);
  eocd.set(u32(0x06054b50), 0); // signature "PK\x05\x06"
  eocd.set(u16(0), 4); // disk number
  eocd.set(u16(0), 6); // disk with central dir
  eocd.set(u16(entries.length), 8);
  eocd.set(u16(entries.length), 10);
  eocd.set(u32(centralSize), 12);
  eocd.set(u32(offset), 16);
  eocd.set(u16(0), 20); // comment length
  const chunks = [...locals, ...centrals, eocd];
  const total = chunks.reduce((a, c) => a + c.length, 0);
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of chunks) {
    out.set(c, p);
    p += c.length;
  }
  return out;
}

// ---------- DOCX (OOXML wordprocessing — a zip of XML) ----------

function escXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function docxRuns(text: string): { t: string; b?: boolean; i?: boolean; code?: boolean }[] {
  const out: { t: string; b?: boolean; i?: boolean; code?: boolean }[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ t: text.slice(last, m.index) });
    const tok = m[0];
    if (tok.startsWith("**")) out.push({ t: tok.slice(2, -2), b: true });
    else if (tok.startsWith("`")) out.push({ t: tok.slice(1, -1), code: true });
    else out.push({ t: tok.slice(1, -1), i: true });
    last = m.index + tok.length;
  }
  if (last < text.length) out.push({ t: text.slice(last) });
  return out.length ? out : [{ t: text }];
}

function docxParagraph(text: string, styleId?: string): string {
  const runs = docxRuns(text)
    .map((r) => {
      const pr = (r.b ? "<w:b/>" : "") + (r.i ? "<w:i/>" : "") + (r.code ? '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/>' : "");
      return `<w:r>${pr ? `<w:rPr>${pr}</w:rPr>` : ""}<w:t xml:space="preserve">${escXml(r.t)}</w:t></w:r>`;
    })
    .join("");
  const pPr = styleId ? `<w:pPr><w:pStyle w:val="${styleId}"/></w:pPr>` : "";
  return `<w:p>${pPr}${runs}</w:p>`;
}

const DOCX_CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

const DOCX_ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const DOCX_DOC_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

const DOCX_STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri"/><w:sz w:val="22"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr><w:rPr><w:b/><w:sz w:val="36"/><w:color w:val="2F5496"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="200" w:after="100"/></w:pPr><w:rPr><w:b/><w:sz w:val="30"/><w:color w:val="2F5496"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="160" w:after="80"/></w:pPr><w:rPr><w:b/><w:sz w:val="26"/><w:color w:val="2F5496"/></w:rPr></w:style>
</w:styles>`;

export function makeDocx(opts: { title?: string; content?: string }): Uint8Array {
  const title = (opts?.title || "").trim();
  const content = opts?.content || "";
  const body: string[] = [];
  if (title) body.push(docxParagraph(title, "Heading1"));
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) {
      body.push("<w:p/>");
      continue;
    }
    if (/^#{1,3}\s/.test(line)) {
      const m = /^(#{1,3})\s+(.*)$/.exec(line)!;
      body.push(docxParagraph(m[2], "Heading" + m[1].length));
    } else if (/^[-*]\s/.test(line)) {
      body.push(docxParagraph("•  " + line.replace(/^[-*]\s+/, "")));
    } else if (/^\d+[.)]\s/.test(line)) {
      body.push(docxParagraph(line.replace(/^(\d+[.)])\s+/, "$1  ")));
    } else {
      body.push(docxParagraph(line));
    }
  }
  body.push("<w:sectPr/>");
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body.join("")}</w:body></w:document>`;
  const encoder = new TextEncoder();
  return makeZip([
    { path: "[Content_Types].xml", data: encoder.encode(DOCX_CONTENT_TYPES) },
    { path: "_rels/.rels", data: encoder.encode(DOCX_ROOT_RELS) },
    { path: "word/document.xml", data: encoder.encode(documentXml) },
    { path: "word/styles.xml", data: encoder.encode(DOCX_STYLES) },
    { path: "word/_rels/document.xml.rels", data: encoder.encode(DOCX_DOC_RELS) },
  ]);
}

// ---------- PDF (minimal Type1/Helvetica text rendering) ----------

function pdfEscape(s: string): string {
  let out = "";
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    if (c === 40) out += "\\(";
    else if (c === 41) out += "\\)";
    else if (c === 92) out += "\\\\";
    else if (c >= 32 && c <= 126) out += ch;
    else out += "?";
  }
  return out;
}

export function makePdf(opts: { title?: string; content?: string }): Uint8Array {
  const title = (opts?.title || "").trim();
  const text = opts?.content || "";
  const wrap = (s: string, max: number): string[] => {
    const out: string[] = [];
    let cur = "";
    for (const word of s.split(" ")) {
      const next = (cur ? cur + " " : "") + word;
      if (next.length > max) {
        if (cur) out.push(cur);
        cur = word;
      } else {
        cur = next;
      }
    }
    if (cur) out.push(cur);
    return out;
  };
  const lines: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const strip = raw.replace(/^#{1,4}\s+/, "").trim();
    if (!strip) {
      lines.push("");
      continue;
    }
    for (const w of wrap(strip.replace(/[*`_]/g, ""), 92)) lines.push(w);
  }

  const pageW = 612;
  const pageH = 792;
  const margin = 56;
  const titleSize = 15;
  const bodySize = 10.5;
  const titleLH = 22;
  const bodyLH = 14.5;
  const areaH = pageH - margin * 2;
  const perPage = Math.max(1, Math.floor(areaH / bodyLH));
  const firstCap = title ? perPage - 1 : perPage;

  const pages: { title?: string; idxs: string[] }[] = [];
  let bodyIdx = 0;
  while (bodyIdx < lines.length) {
    const cap = pages.length === 0 ? firstCap : perPage;
    pages.push({ title: pages.length === 0 ? title : undefined, idxs: lines.slice(bodyIdx, bodyIdx + cap) });
    bodyIdx += cap;
  }
  if (pages.length === 0) pages.push({ title, idxs: [] });

  const contents: string[] = [];
  for (const pg of pages) {
    const ops: string[] = [];
    let y = pageH - margin - (pg.title ? titleSize : 0);
    if (pg.title) {
      ops.push(`BT /F2 ${titleSize} Tf ${margin} ${y} Td (${pdfEscape(pg.title)}) Tj ET`);
      y -= titleLH + 6;
    }
    if (pg.idxs.length) {
      ops.push(`BT /F1 ${bodySize} Tf ${margin} ${y} Td`);
      for (const ln of pg.idxs) ops.push(`(${pdfEscape(ln)}) Tj 0 -${bodyLH} Td`);
      ops.push("ET");
    }
    contents.push(ops.join("\n") + "\n");
  }

  const nPages = contents.length;
  const font1N = 3 + nPages;
  const font2N = font1N + 1;
  const contentStart = font2N + 1;
  const pageRefs = Array.from({ length: nPages }, (_, i) => `${3 + i} 0 R`).join(" ");
  const objBodies = new Map<number, string>();
  objBodies.set(1, "<< /Type /Catalog /Pages 2 0 R >>");
  objBodies.set(2, `<< /Type /Pages /Kids [${pageRefs}] /Count ${nPages} >>`);
  for (let i = 0; i < nPages; i++) {
    objBodies.set(3 + i, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /Font << /F1 ${font1N} 0 R /F2 ${font2N} 0 R >> >> /Contents ${contentStart + i} 0 R >>`);
  }
  objBodies.set(font1N, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  objBodies.set(font2N, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  for (let i = 0; i < nPages; i++) {
    objBodies.set(contentStart + i, `<< /Length ${new TextEncoder().encode(contents[i]).length} >>\nstream\n${contents[i]}endstream`);
  }

  const encoder = new TextEncoder();
  const head = encoder.encode("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  const chunks: Uint8Array[] = [head];
  let byteLen = head.length;
  const offsets: number[] = [];
  const maxObj = contentStart + nPages - 1;
  for (let n = 1; n <= maxObj; n++) {
    offsets.push(byteLen);
    const part = `${n} 0 obj\n${objBodies.get(n)}\nendobj\n`;
    chunks.push(encoder.encode(part));
    byteLen += encoder.encode(part).length;
  }
  const xrefOffset = byteLen;
  let xref = `xref\n0 ${maxObj + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) xref += `${String(off).padStart(10, "0")} 00000 n \n`;
  xref += `trailer\n<< /Size ${maxObj + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  chunks.push(encoder.encode(xref));

  const total = chunks.reduce((a, c) => a + c.length, 0);
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of chunks) {
    out.set(c, p);
    p += c.length;
  }
  return out;
}