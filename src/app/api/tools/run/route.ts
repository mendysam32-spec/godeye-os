import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { generateImage, type VaultPayload } from "@/lib/generation-router";
import type { ProviderId } from "@/lib/providers";
import { runFetchUrl, runHttpRequest, runListTables, runQuery, runWebSearch } from "@/lib/web-tools";
import { isServerTool } from "@/lib/tools";

/**
 * Server-side half of the agent tool loop.
 *
 * The browser half (`runGodEyeTool` in src/lib/desktop.ts) owns anything that
 * touches the user's disk. This route owns everything that needs the network
 * without CORS, the D1 binding, or a provider key that must not be handed to
 * the renderer. It speaks the same `{ ok, summary, detail, files }` shape as
 * the client so the chat agent loop does not care which side ran a tool.
 */

export const maxDuration = 120;

interface ToolBody {
  name: string;
  args?: Record<string, unknown>;
  provider?: ProviderId;
  model?: string;
  vault?: Record<ProviderId, VaultPayload | string>;
}

function clip(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}\n… (${s.length - n} more chars truncated)` : s;
}

function vaultKeyFor(vault: ToolBody["vault"], id: string): string | null {
  const v = vault?.[id as ProviderId];
  if (typeof v === "string") return v || null;
  return v?.key ?? null;
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as ToolBody | null;
  if (!body?.name) return NextResponse.json({ error: "Tool name required" }, { status: 400 });
  if (!isServerTool(body.name)) {
    return NextResponse.json({ error: `${body.name} is not a server tool` }, { status: 400 });
  }

  const args = body.args ?? {};
  const { provider, model, vault } = body;

  try {
    switch (body.name) {
      case "godeye_webSearch": {
        const r = await runWebSearch(args as { query?: string; count?: number });
        const lines = r.results.map((h, i) => `${i + 1}. ${h.title}\n   ${h.url}${h.snippet ? `\n   ${h.snippet}` : ""}`);
        return NextResponse.json({
          ok: true,
          summary: `${r.results.length} result(s) for "${r.query}"`,
          detail: lines.join("\n"),
        });
      }

      case "godeye_fetchUrl": {
        const doc = await runFetchUrl(args as { url?: string; format?: string; maxChars?: number });
        return NextResponse.json({
          ok: true,
          summary: `Fetched ${doc.url} — ${doc.format}, ${doc.text.length} chars${doc.truncated ? " (truncated)" : ""}`,
          detail: doc.text,
          path: doc.finalUrl,
        });
      }

      case "godeye_httpRequest": {
        const r = await runHttpRequest(
          args as { url?: string; method?: string; headers?: Record<string, string>; body?: string; contentType?: string },
          (id) => vaultKeyFor(vault, id)
        );
        return NextResponse.json({
          // A 4xx/5xx is a real answer from the API, not a tool failure: the
          // model needs to see the body to diagnose the request.
          ok: true,
          summary: `${String(args.method ?? "GET").toUpperCase()} ${String(args.url ?? "")} → ${r.status} ${r.statusText}`,
          detail: r.body || "(empty response body)",
          path: `${r.status}`,
        });
      }

      case "godeye_queryDb": {
        const r = await runQuery(args as { sql?: string; params?: unknown[]; limit?: number });
        const rows = r.rows.map((row) => JSON.stringify(row)).join("\n");
        return NextResponse.json({
          ok: true,
          summary: `${r.rowCount} row(s)${r.columns.length ? ` [${r.columns.join(", ")}]` : ""}`,
          detail: rows || "(no rows)",
        });
      }

      case "godeye_listTables": {
        const r = await runListTables();
        if (!r.tables.length) {
          return NextResponse.json({ ok: true, summary: "Database has no tables yet", detail: "" });
        }
        const detail = r.tables
          .map((t) => `${t.name} (${t.rowCount ?? "?"} rows)\n  ${t.columns.map((c) => `${c.name}:${c.type}${c.pk ? " PRIMARY KEY" : ""}`).join(", ")}`)
          .join("\n");
        return NextResponse.json({ ok: true, summary: `${r.tables.length} table(s)`, detail });
      }

      case "godeye_generateImage": {
        const prompt = String(args.prompt ?? "").trim();
        if (!prompt) return NextResponse.json({ error: "prompt required" }, { status: 400 });
        if (!provider || !model) {
          return NextResponse.json({ error: "No image-capable provider/model in this chat — switch to one in the model menu" }, { status: 400 });
        }
        const apiKey = vaultKeyFor(vault, provider);
        if (!apiKey) {
          return NextResponse.json({ error: `No API key for ${provider}. Connect it in Providers Vault.` }, { status: 401 });
        }
        const entry = vault?.[provider];
        const endpoint = entry && typeof entry === "object" && entry.endpoint?.trim() ? entry.endpoint.trim() : undefined;
        const out = await generateImage({
          provider,
          model,
          prompt: prompt.slice(0, 4000),
          apiKey: String(apiKey).trim(),
          ...(endpoint ? { baseUrl: endpoint } : {}),
          ...(args.size ? { size: String(args.size) } : {}),
        });

        // Hand the bytes back as files so the desktop build writes them to disk
        // and the browser build offers a download, exactly like media in chat.
        const files = out.images.map((img, i) => {
          const name = String(args.name ?? `godeye-image-${i + 1}.png`).replace(/\.(png|jpe?g|webp|gif)$/i, "");
          const ext = /^data:image\/(\w+)/.exec(img.src)?.[1]?.replace("jpeg", "jpg") || "png";
          const fileName = out.images.length > 1 ? `${name}-${i + 1}.${ext}` : `${name}.${ext}`;
          if (img.src.startsWith("data:")) {
            const mime = /^data:([^;]+)/.exec(img.src)?.[1] || img.mime || `image/${ext}`;
            return { name: fileName, type: mime, base64: img.src.slice(img.src.indexOf(",") + 1) };
          }
          return { name: fileName, type: img.mime || `image/${ext}`, content: img.url || img.src };
        });
        return NextResponse.json({
          ok: true,
          summary: `Generated ${files.length} image(s) with ${provider}/${model}`,
          detail: out.images.map((img) => img.url ?? "(inline)").join("\n"),
          files,
        });
      }

      default:
        return NextResponse.json({ error: `Unhandled server tool: ${body.name}` }, { status: 400 });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Tool failed";
    // Tool errors are fed back to the model as tool results, not surfaced as
    // HTTP failures, so it can retry or tell the user what went wrong.
    return NextResponse.json({ ok: false, summary: clip(msg, 400), detail: clip(msg, 4000) }, { status: 200 });
  }
}
