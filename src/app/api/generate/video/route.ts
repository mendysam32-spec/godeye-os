import { NextRequest, NextResponse } from "next/server";
import { submitVideo, canSubmitVideo, type VaultPayload } from "@/lib/generation-router";
import { checkBudget } from "@/lib/economy";
import { estimateGenerationCost } from "@/lib/pricing";
import type { ProviderId } from "@/lib/providers";
import { requireUser } from "@/lib/auth";
import { getChatDb, ensureGenerationSchema } from "@/lib/d1";
import { recordUsageEvent } from "@/lib/usage";

// Submitting a job is a single provider POST.
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const { provider, model, prompt, duration, resolution, vault } = body as {
    provider: ProviderId;
    model: string;
    prompt: string;
    duration?: string;
    resolution?: string;
    vault?: Record<ProviderId, VaultPayload | string>;
  };
  if (!provider || !model || !prompt?.trim()) {
    return NextResponse.json({ error: "provider, model, prompt required" }, { status: 400 });
  }

  const v = vault?.[provider];
  const apiKey = typeof v === "string" ? v : v?.key;
  if (!apiKey) {
    return NextResponse.json({ error: `No API key for ${provider}. Connect it in Providers Vault.` }, { status: 401 });
  }
  const endpoint = v && typeof v === "object" && v.endpoint?.trim() ? v.endpoint.trim() : undefined;

  // Don't blind-POST to a /videos endpoint the provider doesn't implement —
  // that surfaces a raw 404. Only known video APIs get through.
  if (!canSubmitVideo(provider, model)) {
    return NextResponse.json({
      error: `'${model}' on ${provider} is not a video-generation connector. Video jobs work with Google (Veo) and OpenAI-compatible Sora models — pick one of those, or switch to image mode.`,
    }, { status: 400 });
  }

  const durationSec = Math.max(1, Math.min(120, Math.floor(Number(String(duration ?? "5").replace(/[^0-9.]/g, "")) || 5)));
  const estimate = estimateGenerationCost({ kind: "video", provider, model, durationSec, resolution });
  const budget = await checkBudget(user.id, estimate.costUsd).catch(() => null);
  if (budget && !budget.allowed) {
    return NextResponse.json({ error: budget.reason }, { status: 402 });
  }

  const started = Date.now();
  try {
    const { job } = await submitVideo({
      provider,
      model,
      prompt: String(prompt).slice(0, 4000),
      apiKey: String(apiKey).trim(),
      ...(endpoint ? { baseUrl: endpoint } : {}),
      ...(duration ? { duration } : {}),
      ...(resolution ? { resolution } : {}),
    });

    // Persist the handle so the run survives tab closes, reloads and
    // poll-budget timeouts — the status route can reattach by row id.
    // Best-effort: if the DB is unavailable the client falls back to
    // in-session polling only.
    let jobId: string | undefined;
    try {
      const db = await getChatDb();
      if (db) {
        await ensureGenerationSchema(db);
        jobId = crypto.randomUUID();
        const now = new Date().toISOString();
        await db
          .prepare(
            `INSERT INTO generation_jobs (id, uid, provider, model, prompt, job, status, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)
             ON CONFLICT(id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at`,
          )
          .bind(jobId, user.id, String(provider).slice(0, 48), String(model).slice(0, 120), String(prompt).slice(0, 4000), String(job).slice(0, 512), "pending", now)
          .run();
      }
    } catch {
      jobId = undefined;
    }

    const price = estimateGenerationCost({
      kind: "video", provider, model, durationSec, resolution,
    });
    await recordUsageEvent({
      uid: user.id, runId: jobId ?? null, kind: "video", provider, model,
      costUsd: price.costUsd, pricingSource: price.source,
      latencyMs: Date.now() - started,
      metadata: { jobId: jobId ?? null, duration, resolution: resolution || "default" },
    }).catch(() => null);

    return NextResponse.json({ ok: true, job, ...(jobId ? { jobId } : {}), provider, model });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Video job submit failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
