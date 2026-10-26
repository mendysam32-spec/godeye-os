import { NextRequest, NextResponse } from "next/server";
import { testProviderKey } from "@/lib/llm-router";
import { isValidApiKey, type ProviderId } from "@/lib/providers";
import { requireUser } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });

  const { provider, apiKey, endpoint } = await req.json().catch(() => ({}));
  if (!provider || !apiKey) return NextResponse.json({ error: "provider and apiKey required" }, { status: 400 });
  const key = String(apiKey).trim();
  if (!isValidApiKey(key)) {
    return NextResponse.json({ ok: false, error: "API key contains spaces, line breaks or non-ASCII characters — re-copy it and try again." }, { status: 400 });
  }
  const result = await testProviderKey(provider as ProviderId, key, endpoint ? String(endpoint).trim() : undefined);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
