/**
 * Server-side executors for the internet / API / database agent tools.
 *
 * These run on the Worker (or the Next server in `next dev`) rather than in the
 * browser for three reasons: the browser cannot read a cross-origin response,
 * the D1 binding only exists server-side, and provider API keys must never be
 * handed to the renderer.
 */

import { getDb } from "./d1";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const MAX_DOWNLOAD_BYTES = 4 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 20_000;

/* -------------------------------------------------------------------------- */
/* url safety                                                                  */
/* -------------------------------------------------------------------------- */

const PRIVATE_HOSTS = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata",
  "metadata.google.internal",
  "instance-data",
]);

const PRIVATE_V4 = [
  /^127\./,
  /^10\./,
  /^0\./,
  /^169\.254\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
];

function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (PRIVATE_HOSTS.has(h)) return true;
  if (h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".localdomain")) return true;
  if (PRIVATE_V4.some((re) => re.test(h))) return true;
  if (/^f[cd][0-9a-f]{2}:/i.test(h)) return true; // unique-local IPv6
  if (h === "::1" || h === "::") return true;
  return false;
}

/**
 * Normalise and authorise a user-supplied URL. Anything that is not plain
 * public http(s) is refused — the tool runs on a shared Worker with the
 * project's own network reach, so it must not become an SSRF pivot into
 * localhost, link-local metadata endpoints or non-web schemes.
 */
export function safeUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(String(input).trim());
  } catch {
    throw new Error(`Not a valid URL: ${String(input).slice(0, 120)}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Only http/https URLs are allowed (got ${url.protocol.replace(":", "")})`);
  }
  if (isPrivateHost(url.hostname)) {
    throw new Error(`Refusing to request a private or internal address (${url.hostname})`);
  }
  return url;
}

async function download(url: URL, init: RequestInit = {}, cap = MAX_DOWNLOAD_BYTES): Promise<{ body: string; contentType: string; truncated: boolean; bytes: number }> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), {
      ...init,
      redirect: "follow",
      signal: ctl.signal,
      headers: { "User-Agent": UA, Accept: "*/*", ...(init.headers as Record<string, string> | undefined) },
    } as RequestInit);
    const reader = res.body?.getReader();
    if (!reader) {
      const text = await res.text();
      return { body: text, contentType: res.headers.get("content-type") || "", truncated: false, bytes: text.length };
    }
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    let truncated = false;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      bytes += value.length;
      if (bytes > cap) {
        chunks.push(value.subarray(0, value.length - (bytes - cap)));
        truncated = true;
        break;
      }
      chunks.push(value);
    }
    const merged = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
    let off = 0;
    for (const c of chunks) {
      merged.set(c, off);
      off += c.length;
    }
    return {
      body: new TextDecoder("utf-8", { fatal: false }).decode(merged),
      contentType: res.headers.get("content-type") || "",
      truncated,
      bytes,
    };
  } finally {
    clearTimeout(timer);
  }
}

/* -------------------------------------------------------------------------- */
/* html -> text                                                                */
/* -------------------------------------------------------------------------- */

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'", "#x27": "'", "#x2F": "/", "#47": "/",
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, code: string) => {
    const key = code.toLowerCase();
    if (ENTITIES[key]) return ENTITIES[key];
    if (key.startsWith("#x")) {
      const n = parseInt(key.slice(2), 16);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    if (key.startsWith("#")) {
      const n = parseInt(key.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return m;
  });
}

function stripTags(html: string, tag: string, keep = " "): string {
  return html.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?</${tag}>`, "gi"), keep);
}

/**
 * Turn a page into something a model can actually read: no script/style/nav
 * chrome, block-level tags become line breaks, and inline tags become spaces.
 */
export function htmlToText(html: string): string {
  let s = html;
  s = stripTags(s, "script").replace(/<!--[\s\S]*?-->/g, " ");
  s = stripTags(s, "style");
  s = stripTags(s, "noscript");
  s = stripTags(s, "svg");
  s = stripTags(s, "head");
  // keep link targets as plain text so the model can cite them
  s = s.replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi, (_m, href: string) => ` [${href}] `);
  s = s.replace(/<\/?(p|div|section|article|header|footer|main|aside|nav|tr|li|ul|ol|table|thead|tbody|h[1-6]|pre|blockquote|figure|figcaption|form|br|hr)\b[^>]*>/gi, "\n");
  s = s.replace(/<[^>]+>/g, " ");
  s = decodeEntities(s);
  s = s.replace(/\r/g, "");
  s = s.replace(/[ \t\f\v ]+/g, " ");
  s = s.replace(/ *\n */g, "\n");
  s = s.replace(/\n{3,}/g, "\n\n");
  return s.trim();
}

export interface FetchedDoc {
  url: string;
  finalUrl: string;
  contentType: string;
  format: string;
  text: string;
  truncated: boolean;
}

/** `medusa_fetchUrl` — download a page and return readable text. */
export async function runFetchUrl(args: { url?: string; format?: string; maxChars?: number }): Promise<FetchedDoc> {
  const url = safeUrl(String(args.url ?? ""));
  const want = String(args.format ?? "text").toLowerCase();
  const maxChars = Math.min(Math.max(Number(args.maxChars) || 12000, 500), 60000);
  const { body, contentType } = await download(url);

  let format = want;
  let text: string;
  if (want === "html") {
    text = body;
  } else if (want === "json" || /(^|[/+])json\b/i.test(contentType)) {
    format = "json";
    try {
      text = JSON.stringify(JSON.parse(body), null, 2);
    } catch {
      text = body;
      format = "text";
    }
  } else {
    format = "text";
    text = /^\s*</.test(body) ? htmlToText(body) : body;
  }

  return {
    url: url.toString(),
    finalUrl: url.toString(),
    contentType,
    format,
    text: text.slice(0, maxChars),
    truncated: text.length > maxChars,
  };
}

/* -------------------------------------------------------------------------- */
/* duckduckgo search                                                           */
/* -------------------------------------------------------------------------- */

export interface SearchHit {
  title: string;
  url: string;
  snippet: string;
}

/** DuckDuckGo wraps results in a redirector; recover the real destination. */
function unwrapDuckUrl(raw: string): string {
  const v = raw.replace(/^\/+/, "");
  if (!v.startsWith("duckduckgo.com/l/")) return raw;
  const qs = v.slice(v.indexOf("?") + 1);
  const target = new URLSearchParams(qs).get("uddg");
  return target ? decodeURIComponent(target) : raw;
}

function cleanTitle(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function parseDuckResults(html: string, limit: number): SearchHit[] {
  const hits: SearchHit[] = [];
  const seen = new Set<string>();
  const anchor = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const snippetRe = /<(?:a|div)[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/(?:a|div)>/gi;
  const snippets: string[] = [];
  let sm: RegExpExecArray | null;
  while ((sm = snippetRe.exec(html)) !== null) snippets.push(cleanTitle(sm[1]));

  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = anchor.exec(html)) !== null && hits.length < limit) {
    const url = unwrapDuckUrl(decodeEntities(m[1]));
    if (!/^https?:\/\//i.test(url) || seen.has(url)) continue;
    seen.add(url);
    hits.push({ title: cleanTitle(m[2]) || url, url, snippet: snippets[i] || "" });
    i++;
  }
  return hits;
}

function parseLiteResults(html: string, limit: number): SearchHit[] {
  // lite.duckduckgo.com returns a plain table of links with the snippet in the
  // following <td class="result-snippet">.
  const hits: SearchHit[] = [];
  const seen = new Set<string>();
  const link = /<a[^>]*rel="nofollow"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = link.exec(html)) !== null && hits.length < limit) {
    const url = unwrapDuckUrl(decodeEntities(m[1]));
    if (!/^https?:\/\//i.test(url) || seen.has(url)) continue;
    seen.add(url);
    const rest = html.slice(m.index, m.index + 2500);
    const sn = /class="result-snippet"[^>]*>([\s\S]*?)<\/td>/i.exec(rest);
    hits.push({ title: cleanTitle(m[2]) || url, url, snippet: sn ? cleanTitle(sn[1]) : "" });
  }
  return hits;
}

/**
 * `medusa_webSearch` — keyless web search.
 *
 * DuckDuckGo's no-JS endpoints are used first and `lite` as the fallback; both
 * are scraped rather than proxied through an API that needs a paid key. Rate
 * limits and markup changes are therefore expected, so a miss returns an
 * actionable message instead of pretending there were no results.
 */
export async function runWebSearch(args: { query?: string; count?: number }): Promise<{ query: string; engine: string; results: SearchHit[] }> {
  const query = String(args.query ?? "").trim().slice(0, 400);
  if (!query) throw new Error("No query given");
  const limit = Math.min(Math.max(Number(args.count) || 6, 1), 10);
  const form = new URLSearchParams({ q: query, kl: "wt-wt" }).toString();

  const attempts: { name: string; url: URL; init: RequestInit }[] = [
    {
      name: "duckduckgo",
      url: safeUrl("https://html.duckduckgo.com/html/"),
      init: { method: "POST", body: form, headers: { "Content-Type": "application/x-www-form-urlencoded" } },
    },
    {
      name: "duckduckgo-lite",
      url: safeUrl(`https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`),
      init: { method: "GET" },
    },
  ];

  const errors: string[] = [];
  for (const a of attempts) {
    try {
      const { body } = await download(a.url, a.init);
      const results = a.name.endsWith("lite") ? parseLiteResults(body, limit) : parseDuckResults(body, limit);
      if (results.length) return { query, engine: a.name, results };
      errors.push(`${a.name}: page parsed but no result links found (markup may have changed)`);
    } catch (e) {
      errors.push(`${a.name}: ${(e as Error).message}`);
    }
  }

  throw new Error(`Web search failed — ${errors.join(" | ")}. Try medusa_fetchUrl with a direct URL instead.`);
}

/* -------------------------------------------------------------------------- */
/* generic api calls                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Replace `{{VAULT:providerId}}` in header values with the matching Providers
 * Vault key. The model can therefore call authenticated APIs without the key
 * ever reaching the renderer or the transcript.
 */
export type VaultLookup = (providerId: string) => string | null | undefined;

export async function runHttpRequest(
  args: { url?: string; method?: string; headers?: Record<string, string>; body?: string; contentType?: string },
  vaultKey?: VaultLookup
): Promise<{ status: number; statusText: string; contentType: string; body: string; truncated: boolean }> {
  const url = safeUrl(String(args.url ?? ""));
  const method = String(args.method ?? "GET").toUpperCase();
  if (!/^(GET|POST|PUT|PATCH|DELETE|HEAD)$/.test(method)) throw new Error(`Unsupported method: ${method}`);

  const headers: Record<string, string> = {};
  const injected: string[] = [];
  for (const [k, raw] of Object.entries(args.headers ?? {})) {
    const v = String(raw ?? "");
    const ph = /^\{\{VAULT:([a-z0-9_-]+)\}\}$/i.exec(v.trim());
    if (ph) {
      const key = vaultKey?.(ph[1]);
      if (!key) throw new Error(`No key in the Providers Vault for "${ph[1]}" — connect it first`);
      headers[k] = key;
      injected.push(k);
    } else {
      headers[k] = v;
    }
  }

  let body: string | undefined;
  if (args.body !== undefined && args.body !== null && method !== "GET" && method !== "HEAD") {
    body = String(args.body);
    if (!headers["Content-Type"] && !headers["content-type"]) {
      headers["Content-Type"] = String(args.contentType ?? "application/json");
    }
    if (!Object.keys(headers).some((h) => h.toLowerCase() === "accept")) headers.Accept = "application/json";
  }

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), { method, headers, body, redirect: "follow", signal: ctl.signal });
    const { body: text, contentType, truncated } = await download(
      new URL(res.url || url.toString()),
      { method, headers, body },
      512 * 1024
    );
    return {
      status: res.status,
      statusText: res.statusText,
      contentType: contentType || res.headers.get("content-type") || "",
      body: text.slice(0, 20000),
      truncated,
    };
  } finally {
    clearTimeout(timer);
  }
}

/* -------------------------------------------------------------------------- */
/* read-only database access                                                   */
/* -------------------------------------------------------------------------- */

// Only one statement, and it must start with a reader. Anything that could
// mutate, attach or exfiltrate (ATTACH, PRAGMA writes, multi-statement tricks)
// is rejected before it reaches the binding.
const READONLY_START = /^(select|with|explain|pragma\s+(table_info|table_list|index_list|index_info|database_list|foreign_key_list|table_xinfo)|values)\b/i;

const FORBIDDEN = /\b(insert|update|delete|drop|alter|create|replace|truncate|attach|detach|vacuum|reindex|begin|commit|rollback|savepoint|grant|revoke|analyze)\b/i;

export function assertReadOnlySql(sql: string): void {
  const trimmed = String(sql ?? "").trim().replace(/;+\s*$/, "");
  if (!trimmed) throw new Error("No SQL given");
  if (trimmed.includes(";")) throw new Error("Only a single statement is allowed");
  if (!READONLY_START.test(trimmed)) {
    throw new Error("Read-only queries only — the statement must start with SELECT or WITH");
  }
  // A `WITH x AS (INSERT ...)` is still a write, so check the body too.
  if (FORBIDDEN.test(trimmed)) {
    throw new Error("Read-only queries only — that statement contains a write keyword");
  }
  if (/;\s*\S/.test(trimmed)) throw new Error("Only a single statement is allowed");
}

export interface QueryResult {
  sql: string;
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  truncated: boolean;
  source: "d1" | "none";
}

const MAX_LIMIT = 200;

export async function runQuery(args: { sql?: string; params?: unknown[]; limit?: number }): Promise<QueryResult> {
  const sql = String(args.sql ?? "");
  assertReadOnlySql(sql);
  const db = await getDb();
  if (!db) {
    throw new Error("No database binding in this environment (D1 is only available on the deployed Worker)");
  }
  const limit = Math.min(Math.max(Number(args.limit) || 50, 1), MAX_LIMIT);
  const params = Array.isArray(args.params) ? args.params.slice(0, 50) : [];

  const wrapped = /^\s*limit\b/i.test(sql) ? sql : `${sql.replace(/;\s*$/, "")} LIMIT ${limit}`;
  const stmt = db.prepare(wrapped);
  const bound = params.length ? stmt.bind(...params) : stmt;

  const isSelect = /^\s*(select|with|values|explain)/i.test(wrapped);
  const out = isSelect ? await bound.all<Record<string, unknown>>() : { results: [] };
  const rows = (out.results ?? []) as Record<string, unknown>[];
  const columns = rows.length ? Object.keys(rows[0]) : [];

  return {
    sql: wrapped,
    columns,
    rows: rows.slice(0, limit),
    rowCount: rows.length,
    truncated: rows.length >= limit,
    source: "d1",
  };
}

export interface TableInfo {
  name: string;
  columns: { name: string; type: string; notnull: number; pk: number }[];
  rowCount: number | null;
}

export async function runListTables(): Promise<{ tables: TableInfo[]; source: "d1" | "none" }> {
  const db = await getDb();
  if (!db) {
    throw new Error("No database binding in this environment (D1 is only available on the deployed Worker)");
  }
  const names = await db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all<{ name: string }>();
  const tables: TableInfo[] = [];
  for (const { name } of names.results ?? []) {
    let columns: TableInfo["columns"] = [];
    let rowCount: number | null = null;
    try {
      const info = await db.prepare(`PRAGMA table_info(${JSON.stringify(name).replace(/"/g, '""')})`).all<Record<string, unknown>>();
      columns = (info.results ?? []).map((r) => ({
        name: String(r.name ?? ""),
        type: String(r.type ?? ""),
        notnull: Number(r.notnull ?? 0),
        pk: Number(r.pk ?? 0),
      }));
    } catch {
      /* a view has no pragma info — report it with no columns */
    }
    try {
      const c = await db.prepare(`SELECT COUNT(*) AS n FROM "${name.replace(/"/g, '""')}"`).first<{ n: number }>();
      rowCount = Number(c?.n ?? 0);
    } catch {
      rowCount = null;
    }
    tables.push({ name, columns, rowCount });
  }
  return { tables, source: "d1" };
}
