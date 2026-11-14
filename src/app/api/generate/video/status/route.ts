import { NextRequest, NextResponse } from "next/server";
import { pollVideo, type VaultPayload, type VideoPollResult } from "@/lib/generation-router";
import type { ProviderId } from "@/lib/providers";
import { requireUser } from "@/lib/auth";
import { getChatDb, ensureGenerationSchema } from "@/lib/d1";

// One status poll is a single provider GET.
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const { provider, model, job, jobId, vault } = body as {
    provider: ProviderId;
    model: string;
    job?: string;
    /** Row id of the persisted job (preferred) — enables reattach after
     * tab closes, reloads or poll-budget timeouts. */
    jobId?: string;
    vault?: Record<ProviderId, VaultPayload | string>;
  };
  if (!provider || !model || (!job && !jobId)) {
    return NextResponse.json({ error: "provider, model and job/jobId required" }, { status: 400 });
  }

  const v = vault?.[provider];
  const apiKey = typeof v === "string" ? v : v?.key;
  if (!apiKey) {
    return NextResponse.json({ error: `No API key for ${provider}. Connect it in Providers Vault.` }, { status: 401 });
  }
  const endpoint = v && typeof v === "object" && v.endpoint?.trim() ? v.endpoint.trim() : undefined;

  // Resolve the provider job handle — from the persisted row when we have one.
  const db = await getChatDb();
  if (db) {
    try {
      await ensureGenerationSchema(db);
    } catch {
      /* schema bootstrapping is best-effort */
    }
  }
  let jobHandle = job ? String(job) : "";
  if (db && jobId) {
    try {
      const row = (await db
        .prepare("SELECT job, provider FROM generation_jobs WHERE id = ?1 AND uid = ?2")
        .bind(String(jobId).slice(0, 64), user.id)
        .first()) as { job?: string | null; provider?: string | null } | null;
      if (row) {
        if (row.provider && row.provider !== provider) {
          return NextResponse.json({ ok: false, status: "error", error: `This job was submitted via ${row.provider} — reconnect that connector to reattach it.` });
        }
        jobHandle = String(row.job || "");
      }
    } catch {
      /* fall back to the inline handle */
    }
  }
  if (!jobHandle) {
    return NextResponse.json({ ok: false, status: "error", error: "Unknown job — the handle could not be recovered. Submit the generation again." });
  }

  let result: VideoPollResult;
  try {
    result = await pollVideo(
      { provider, model, prompt: "", apiKey: String(apiKey).trim(), ...(endpoint ? { baseUrl: endpoint } : {}) },
      jobHandle,
    );
  } catch (e) {
    // Network/transport failure — not a provider verdict. The client retries.
    const msg = e instanceof Error ? e.message : "Status poll failed";
    return NextResponse.json({ ok: false, transient: true, error: msg });
  }

  // Write the status back so a later reattach (even after days) sees the truth.
  if (db && jobId) {
    try {
      const st = result.status === "done" ? "completed" : result.status === "error" ? "failed" : "pending";
      await db
        .prepare("UPDATE generation_jobs SET status = ?1, error = ?2, updated_at = ?3 WHERE id = ?4 AND uid = ?5")
        .bind(st, result.error ? String(result.error).slice(0, 500) : null, new Date().toISOString(), String(jobId).slice(0, 64), user.id)
        .run();
    } catch {
      /* status persistence is best-effort */
    }
  }

  if (result.status === "error") return NextResponse.json({ ok: false, status: "error", error: result.error });
  return NextResponse.json({ ok: true, ...result, provider, model });
}
