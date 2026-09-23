import { NextRequest, NextResponse } from "next/server";
import { pollVideo, type VaultPayload } from "@/lib/generation-router";
import type { ProviderId } from "@/lib/providers";
import { requireUser } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const { provider, model, job, vault } = body as {
    provider: ProviderId;
    model: string;
    job: string;
    vault?: Record<ProviderId, VaultPayload | string>;
  };
  if (!provider || !model || !job) {
    return NextResponse.json({ error: "provider, model, job required" }, { status: 400 });
  }

  const v = vault?.[provider];
  const apiKey = typeof v === "string" ? v : v?.key;
  if (!apiKey) {
    return NextResponse.json({ error: `No API key for ${provider}. Connect it in Providers Vault.` }, { status: 401 });
  }
  const endpoint = v && typeof v === "object" && v.endpoint?.trim() ? v.endpoint.trim() : undefined;

  const result = await pollVideo(
    { provider, model, prompt: "", apiKey: String(apiKey).trim(), ...(endpoint ? { baseUrl: endpoint } : {}) },
    String(job)
  );
  if (result.status === "error") return NextResponse.json({ ok: false, status: "error", error: result.error });
  return NextResponse.json({ ok: true, ...result, provider, model });
}