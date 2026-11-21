import { NextRequest, NextResponse } from "next/server";
import { generateImage, type VaultPayload } from "@/lib/generation-router";
import { checkBudget } from "@/lib/economy";
import { estimateGenerationCost } from "@/lib/pricing";
import type { ProviderId } from "@/lib/providers";
import { requireUser } from "@/lib/auth";
import { recordUsageEvent } from "@/lib/usage";

export async function POST(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const { provider, model, prompt, size, vault } = body as {
    provider: ProviderId;
    model: string;
    prompt: string;
    size?: string;
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

  const estimate = estimateGenerationCost({ kind: "image", provider, model, count: 1 });
  const budget = await checkBudget(user.id, estimate.costUsd).catch(() => null);
  if (budget && !budget.allowed) {
    return NextResponse.json({ error: budget.reason }, { status: 402 });
  }

  const started = Date.now();
  try {
    const out = await generateImage({
      provider,
      model,
      prompt: String(prompt).slice(0, 4000),
      apiKey: String(apiKey).trim(),
      ...(endpoint ? { baseUrl: endpoint } : {}),
      ...(size ? { size } : {}),
    });
    const price = estimateGenerationCost({
      kind: "image", provider, model, count: out.images?.length || 1,
    });
    await recordUsageEvent({
      uid: user.id, kind: "image", provider, model,
      costUsd: price.costUsd, pricingSource: price.source,
      latencyMs: Date.now() - started,
      metadata: { count: out.images?.length || 1, size: size || "default" },
    }).catch(() => null);
    return NextResponse.json({ ok: true, images: out.images, meta: out.meta, provider, model });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Image generation failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}