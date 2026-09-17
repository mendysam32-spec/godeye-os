import { NextRequest, NextResponse } from "next/server";
import { testProviderKey } from "@/lib/llm-router";
import type { ProviderId } from "@/lib/providers";

export async function POST(req: NextRequest) {
  const { provider, apiKey } = await req.json().catch(() => ({}));
  if (!provider || !apiKey) return NextResponse.json({ error: "provider and apiKey required" }, { status: 400 });
  const result = await testProviderKey(provider as ProviderId, String(apiKey).trim());
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
