import { NextRequest, NextResponse } from "next/server";
import { testProviderKey } from "@/lib/llm-router";
import { isProviderId, isValidProviderCredential } from "@/lib/providers";
import { endpointAllowsLocal } from "@/lib/provider-endpoints";
import { recordRuntimeHealthCheck } from "@/lib/runtime-config";
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
  const model = typeof body?.model === "string" ? body.model.trim() : undefined;
  const started = Date.now();
  const result = await testProviderKey({
    provider,
    apiKey: apiKey || undefined,
    endpoint: endpoint || undefined,
    model: model || undefined,
    allowLocal: endpointAllowsLocal(),
  });
  await recordRuntimeHealthCheck(user.id, {
    provider,
    model: model || result.models?.[0]?.id || "",
    endpoint,
    ok: result.ok,
    latencyMs: Date.now() - started,
    error: result.ok ? null : result.message,
  }).catch(() => null);
  return NextResponse.json(
    { ...result, latencyMs: Date.now() - started },
    { status: result.ok ? 200 : 400 },
  );
}
