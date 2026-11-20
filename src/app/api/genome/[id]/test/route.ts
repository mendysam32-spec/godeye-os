import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { PROVIDERS, type ProviderId } from "@/lib/providers";
import { testSkillGenome, type GenomeVault } from "@/lib/skill-genome";

/** Execute a genome version's test cases and persist measured outcomes. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const provider = body?.provider as ProviderId;
  const model = typeof body?.model === "string" ? body.model.trim() : "";
  if (!body || !PROVIDERS.some((p) => p.id === provider) || !model) {
    return NextResponse.json({ error: "A valid provider and model are required" }, { status: 400 });
  }
  const effort = ["off", "low", "medium", "high", "extra-high"].includes(String(body.effort))
    ? body.effort as "off" | "low" | "medium" | "high" | "extra-high"
    : "off";
  const result = await testSkillGenome({
    uid: user.id,
    id,
    vault: (body.vault ?? {}) as GenomeVault,
    provider,
    model,
    effort,
  });
  return NextResponse.json(result, { status: result.skill ? 200 : 404 });
}
