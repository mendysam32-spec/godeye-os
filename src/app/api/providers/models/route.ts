import { NextRequest, NextResponse } from "next/server";
import { listProviderModels } from "@/lib/llm-router";
import { isProviderId, isValidProviderCredential } from "@/lib/providers";
import { endpointAllowsLocal } from "@/lib/provider-endpoints";
import { requireUser } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const provider = body?.provider;
  if (!isProviderId(provider)) {
    return NextResponse.json({ ok: false, error: "Unknown provider" }, { status: 400 });
  }
  const apiKey = typeof body?.apiKey === "string" ? body.apiKey.trim() : "";
  if (!isValidProviderCredential(provider, apiKey)) {
    return NextResponse.json(
      { ok: false, error: "Invalid API key — no spaces, line breaks or non-ASCII characters." },
      { status: 400 },
    );
  }
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint.trim() : undefined;
  const result = await listProviderModels(provider, apiKey || undefined, endpoint || undefined, {
    allowLocal: endpointAllowsLocal(),
  });
  return NextResponse.json(
    { ok: result.ok, models: result.models, ...(result.error ? { error: result.error } : {}) },
    { status: result.ok ? 200 : 400 },
  );
}
