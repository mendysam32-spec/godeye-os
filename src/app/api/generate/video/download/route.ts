import { NextRequest, NextResponse } from "next/server";
import type { VaultPayload } from "@/lib/generation-router";
import type { ProviderId } from "@/lib/providers";
import { requireUser } from "@/lib/auth";

// Provider video URLs are expiring signed links (and often >18MB, too big to
// inline in chat history). This endpoint pulls the bytes through the server —
// with the right auth — so the client can turn them into a real file that
// saves to disk (desktop) or downloads (browser) before the link dies.
export const maxDuration = 120;

// Only provider-signed media hosts may be fetched — this endpoint must never
// become an open proxy for arbitrary URLs.
const ALLOWED_HOSTS = new Set([
  "generativelanguage.googleapis.com",
  "api.openai.com",
  "oaiusercontent.com",
]);
const ALLOWED_SUFFIXES = [".openai.com", ".oaiusercontent.com"];

export async function POST(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const { provider, url, filename, vault } = body as {
    provider: ProviderId;
    url: string;
    filename?: string;
    vault?: Record<ProviderId, VaultPayload | string>;
  };
  if (!provider || !url) return NextResponse.json({ error: "provider and url required" }, { status: 400 });

  const v = vault?.[provider];
  const apiKey = typeof v === "string" ? v : v?.key;
  if (!apiKey) {
    return NextResponse.json({ error: `No API key for ${provider}. Connect it in Providers Vault.` }, { status: 401 });
  }

  let u: URL;
  try {
    u = new URL(String(url));
  } catch {
    return NextResponse.json({ error: "Invalid media URL" }, { status: 400 });
  }
  if (u.protocol !== "https:") return NextResponse.json({ error: "Only https media URLs are fetched" }, { status: 400 });
  const host = u.hostname.toLowerCase();
  const allowed = ALLOWED_HOSTS.has(host) || ALLOWED_SUFFIXES.some((s) => host.endsWith(s));
  if (!allowed) {
    return NextResponse.json({ error: `Refusing to fetch media from ${host} — only provider-signed hosts are allowed.` }, { status: 400 });
  }

  // Google file URIs authenticate with the Google header (and often no key at
  // all, being pre-signed); OpenAI-compatible ones use Bearer.
  const headers: Record<string, string> = {};
  if (host.endsWith("googleapis.com")) {
    if (!u.searchParams.has("key")) headers["x-goog-api-key"] = String(apiKey).trim();
  } else {
    headers.Authorization = `Bearer ${String(apiKey).trim()}`;
  }

  try {
    const r = await fetch(u, { headers });
    if (!r.ok) {
      return NextResponse.json({ error: `Media fetch failed (${r.status}) — the signed URL may have expired.` }, { status: 502 });
    }
    const size = Number(r.headers.get("content-length") || 0);
    if (size > 100_000_000) {
      return NextResponse.json({ error: "Video too large to fetch (>100MB)." }, { status: 413 });
    }
    const safe = String(filename || "").replace(/[^\w.\- ]/g, "").trim().slice(0, 120);
    return new NextResponse(r.body, {
      headers: {
        "Content-Type": r.headers.get("content-type") || "video/mp4",
        ...(safe ? { "X-Medusa-Filename": safe } : {}),
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Media fetch failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
