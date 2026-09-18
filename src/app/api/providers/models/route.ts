import { NextRequest, NextResponse } from "next/server";
import { fetchProviderModels } from "@/lib/llm-router";
import type { ProviderId } from "@/lib/providers";
import { requireUser } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });

  const { provider, apiKey, endpoint } = await req.json().catch(() => ({}));
  if (!provider || !apiKey) return NextResponse.json({ error: "provider and apiKey required" }, { status: 400 });

  try {
    const models = await fetchProviderModels(provider as ProviderId, String(apiKey).trim(), endpoint ? String(endpoint).trim() : undefined);
    return NextResponse.json({ ok: true, provider, models });
  } catch {
    return NextResponse.json({ ok: false, error: "Failed to list models" }, { status: 400 });
  }
}