import { NextRequest, NextResponse } from "next/server";
import { submitVideo, type VaultPayload } from "@/lib/generation-router";
import type { ProviderId } from "@/lib/providers";
import { requireUser } from "@/lib/auth";

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
    return NextResponse.json({ ok: true, job, provider, model });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Video job submit failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}