"use client";
import { useState } from "react";
import { Check, Copy } from "lucide-react";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inline(md: string): string {
  // escape first, then restore markdown formatting as html
  let s = escapeHtml(md);
  // inline code `x`
  s = s.replace(/`([^`\n]+)`/g, "<code class=\"md-code\">$1</code>");
  // images ![alt](url)
  s = s.replace(/!\[([^\]]*)\]\((https?:[^)\s]+)\)/g, "<a class=\"md-link\" href=\"$2\" target=\"_blank\" rel=\"noreferrer\">$1 (image)</a>");
  // links [t](url)
  s = s.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, "<a class=\"md-link\" href=\"$2\" target=\"_blank\" rel=\"noreferrer\">$1</a>");
  // bare urls
  s = s.replace(/(^|\s)(https?:\/\/[^\s<]+)/g, "$1<a class=\"md-link\" href=\"$2\" target=\"_blank\" rel=\"noreferrer\">$2</a>");
  // bold + italic + strike
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*\w])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  s = s.replace(/(^|[^_\w])_([^_\n]+)_/g, "$1<em>$2</em>");
  s = s.replace(/~~([^~]+)~~/g, "<del>$1</del>");
  return s;
}

interface Block {
  type: "code" | "html";
  lang?: string;
  code?: string;
  html?: string;
}

function toBlocks(content: string): Block[] {
  const blocks: Block[] = [];
  const fence = /```(\w*)[^\n]*\n([\s\S]*?)(?:```|$)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = fence.exec(content)) !== null) {
    if (m.index > last) blocks.push(...mdBlocks(content.slice(last, m.index)));
    blocks.push({ type: "code", lang: m[1] || "code", code: m[2].replace(/\n$/, "") });
    last = m.index + m[0].length;
  }
  if (last < content.length) blocks.push(...mdBlocks(content.slice(last)));
  return blocks;
}

function mdBlocks(src: string): Block[] {
  const out: Block[] = [];
  const lines = src.split("\n");
  let i = 0;
  let para: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushPara = () => {
    if (para.length) {
      const text = para.join("\n").trim();
      if (text) out.push({ type: "html", html: renderPara(text) });
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      const tag = list.ordered ? "ol" : "ul";
      const items = list.items.map((it) => `<li>${inline(it)}</li>`).join("");
      out.push({ type: "html", html: `<${tag} class="md-list">${items}</${tag}>` });
      list = null;
    }
  };

  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();
    if (!t) {
      flushPara();
      flushList();
      i++;
      continue;
    }
    // hr
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) {
      flushPara();
      flushList();
      out.push({ type: "html", html: "<hr class=\"md-hr\"/>" });
      i++;
      continue;
    }
    // heading
    const h = /^(#{1,4})\s+(.*)$/.exec(t);
    if (h) {
      flushPara();
      flushList();
      const lvl = h[1].length;
      out.push({ type: "html", html: `<div class="md-h${lvl}">${inline(h[2])}</div>` });
      i++;
      continue;
    }
    // blockquote
    if (/^&gt;/.test(escapeHtml(t)) || /^>/.test(t)) {
      flushPara();
      flushList();
      const quotes: string[] = [];
      while (i < lines.length && /^\s*&gt;|^\s*>/.test(lines[i])) {
        quotes.push(lines[i].replace(/^\s*&gt;|^\s*>/, "").trim());
        i++;
      }
      out.push({ type: "html", html: `<blockquote class="md-quote">${inline(quotes.join("<br/>"))}</blockquote>` });
      continue;
    }
    // table row (| a | b |) — render consecutive pipe rows as a table
    if (/^\|.+\|$/.test(t) && t.includes("|")) {
      flushPara();
      flushList();
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|.+\|\s*$/.test(lines[i])) {
        const cells = lines[i].trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
        // skip separator row |---|---|
        if (cells.every((c) => /^:?-{1,}:?$/.test(c))) {
          i++;
          continue;
        }
        rows.push(cells);
        i++;
      }
      if (rows.length) {
        const [head, ...body] = rows;
        const thead = `<thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead>`;
        const tbody = body.length ? `<tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody>` : "";
        out.push({ type: "html", html: `<div class="md-tablewrap"><table class="md-table">${thead}${tbody}</table></div>` });
      }
      continue;
    }
    // ordered list
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (ol) {
      flushPara();
      if (!list || !list.ordered) {
        flushList();
        list = { ordered: true, items: [] };
      }
      list.items.push(ol[1]);
      i++;
      continue;
    }
    // unordered list / task list
    const ul = /^\s*[-*+]\s+(.*)$/.exec(line);
    if (ul) {
      flushPara();
      if (!list || list.ordered) {
        flushList();
        list = { ordered: false, items: [] };
      }
      const task = /^\[([ xX])\]\s+(.*)$/.exec(ul[1]);
      list.items.push(task ? `${task[1].toLowerCase() === "x" ? "☑" : "☐"} ${task[2]}` : ul[1]);
      i++;
      continue;
    }
    para.push(line);
    i++;
  }
  flushPara();
  flushList();
  return out;
}

function renderPara(text: string): string {
  const parts = text.split("\n");
  // single short line stays as-is; multi-line joins with <br/>
  return `<p class="md-p">${parts.map((p) => inline(p)).join("<br/>")}</p>`;
}

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="md-codeblock">
      <div className="md-codehead">
        <span>{lang}</span>
        <button
          onClick={() => {
            navigator.clipboard.writeText(code).catch(() => {});
            setCopied(true);
            setTimeout(() => setCopied(false), 1400);
          }}
          className="md-copy"
          title="Copy code"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? "copied" : "copy"}
        </button>
      </div>
      <pre>
        <code>{code}</code>
      </pre>
      <style jsx>{`
        .md-codeblock { margin: 8px 0; border-radius: 12px; overflow: hidden; border: 1px solid var(--border); background: #0d1117; }
        .md-codehead { display: flex; align-items: center; justify-content: space-between; padding: 6px 10px; font-size: 11px; color: #9aa4b2; background: rgba(255,255,255,0.04); border-bottom: 1px solid rgba(255,255,255,0.08); }
        .md-copy { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.15); }
        .md-copy:hover { background: rgba(255,255,255,0.1); color: #fff; }
        pre { margin: 0; padding: 10px 12px; overflow-x: auto; font-size: 12px; line-height: 1.55; color: #e6edf3; font-family: var(--font-geist-mono), ui-monospace, monospace; white-space: pre; }
      `}</style>
    </div>
  );
}

export function Markdown({ content }: { content: string }) {
  if (!content) return null;
  const blocks = toBlocks(content);
  return (
    <div className="md-root">
      {blocks.map((b, i) =>
        b.type === "code" ? (
          <CodeBlock key={i} lang={b.lang || "code"} code={b.code || ""} />
        ) : (
          <div key={i} dangerouslySetInnerHTML={{ __html: b.html || "" }} />
        )
      )}
      <style jsx>{`
        .md-root { overflow-wrap: anywhere; }
        .md-root :global(.md-p) { margin: 6px 0; line-height: 1.6; white-space: normal; }
        .md-root :global(.md-h1) { font-size: 1.15rem; font-weight: 700; margin: 10px 0 4px; }
        .md-root :global(.md-h2) { font-size: 1.05rem; font-weight: 700; margin: 10px 0 4px; }
        .md-root :global(.md-h3) { font-size: 0.95rem; font-weight: 600; margin: 8px 0 4px; }
        .md-root :global(.md-h4) { font-size: 0.85rem; font-weight: 600; margin: 8px 0 2px; }
        .md-root :global(.md-list) { margin: 6px 0 6px 18px; line-height: 1.6; }
        .md-root :global(ul.md-list) { list-style: disc; }
        .md-root :global(ol.md-list) { list-style: decimal; }
        .md-root :global(.md-list li) { margin: 2px 0; }
        .md-root :global(.md-code) { font-family: var(--font-geist-mono), ui-monospace, monospace; font-size: 0.82em; background: var(--muted); border: 1px solid var(--border); border-radius: 6px; padding: 1px 5px; }
        .md-root :global(.md-link) { text-decoration: underline; text-underline-offset: 2px; }
        .md-root :global(.md-quote) { border-left: 3px solid var(--border); padding: 4px 10px; margin: 8px 0; opacity: 0.9; }
        .md-root :global(.md-hr) { margin: 10px 0; opacity: 0.5; }
        .md-root :global(.md-tablewrap) { overflow-x: auto; margin: 8px 0; border: 1px solid var(--border); border-radius: 10px; }
        .md-root :global(.md-table) { width: 100%; font-size: 12px; border-collapse: collapse; }
        .md-root :global(.md-table th), .md-root :global(.md-table td) { padding: 6px 10px; border-bottom: 1px solid var(--border); text-align: left; }
        .md-root :global(.md-table th) { background: var(--muted); font-weight: 600; }
      `}</style>
    </div>
  );
}
