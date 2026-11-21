import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { PROVIDERS, isProviderId } from "@/lib/providers";
import { endpointAllowsLocal } from "@/lib/provider-endpoints";
import {
  RUNTIME_CAPABILITIES,
  deleteRuntimeModelPolicy,
  listRuntimeHealthChecks,
  listRuntimeModelPolicies,
  listRuntimeProviderConfigs,
  saveRuntimeModelPolicy,
  saveRuntimeProviderConfig,
} from "@/lib/runtime-config";

/** Declarative runtime policy. Never accepts endpoints, keys or executable code. */
export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const [providers, policies, health] = await Promise.all([
    listRuntimeProviderConfigs(user.id),
    listRuntimeModelPolicies(user.id),
    listRuntimeHealthChecks(user.id),
  ]);
  return NextResponse.json({
    ok: true,
    providers,
    policies,
    health,
    capabilities: RUNTIME_CAPABILITIES,
    localEndpointsAllowed: endpointAllowsLocal(),
    catalog: PROVIDERS.map((p) => ({
      id: p.id,
      name: p.name,
      kind: p.kind ?? "openai-compatible",
      auth: p.auth ?? "api-key",
      localOnly: p.localOnly === true,
      endpointRequired: p.endpointRequired === true,
    })),
  });
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  const input = body as Record<string, unknown>;
  try {
    if (input.kind === "provider") {
      if (!isProviderId(input.provider)) return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
      const saved = await saveRuntimeProviderConfig(user.id, {
        provider: input.provider,
        enabled: input.enabled !== false,
        priority: Number(input.priority),
        endpointPolicy: input.endpointPolicy === "custom" ? "custom" : "catalog",
        metadata: input.metadata as Record<string, unknown> | undefined,
      });
      return NextResponse.json({ ok: true, saved });
    }
    if (input.kind === "model") {
      if (!isProviderId(input.provider)) return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
      const saved = await saveRuntimeModelPolicy(user.id, {
        taskClass: String(input.taskClass ?? ""),
        provider: input.provider,
        model: String(input.model ?? ""),
        enabled: input.enabled !== false,
        priority: Number(input.priority),
        requiredCapabilities: input.requiredCapabilities,
        fallbacks: input.fallbacks,
        maxAttempts: Number(input.maxAttempts),
        localOnly: input.localOnly === true,
        metadata: input.metadata as Record<string, unknown> | undefined,
      });
      return NextResponse.json({ ok: true, saved });
    }
    return NextResponse.json({ error: "kind must be provider or model" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error)?.message || "Invalid policy" }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const id = body && typeof body === "object" && typeof (body as Record<string, unknown>).id === "string"
    ? (body as Record<string, unknown>).id as string
    : "";
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const removed = await deleteRuntimeModelPolicy(user.id, id);
  return NextResponse.json({ ok: removed });
}
