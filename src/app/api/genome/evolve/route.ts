import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { crossoverSkillGenome, mutateSkillGenome, selectSkillGenome } from "@/lib/skill-genome";

/** Genetic operators: all create or promote versions; none rewrite history. */
export async function POST(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.action !== "string") {
    return NextResponse.json({ error: "action is required" }, { status: 400 });
  }

  if (body.action === "mutate") {
    if (typeof body.parentId !== "string" || !body.parentId) {
      return NextResponse.json({ error: "parentId is required" }, { status: 400 });
    }
    const strategy = ["tighten", "example", "reorder"].includes(String(body.strategy))
      ? body.strategy as "tighten" | "example" | "reorder"
      : undefined;
    const skill = await mutateSkillGenome(user.id, body.parentId, {
      strategy,
      seed: typeof body.seed === "string" ? body.seed : undefined,
    });
    if (!skill) return NextResponse.json({ error: "Parent skill not found" }, { status: 404 });
    return NextResponse.json({ skill });
  }

  if (body.action === "crossover") {
    if (typeof body.aId !== "string" || typeof body.bId !== "string" || !body.aId || !body.bId) {
      return NextResponse.json({ error: "aId and bId are required" }, { status: 400 });
    }
    if (body.aId === body.bId) {
      return NextResponse.json({ error: "Choose two different parents" }, { status: 400 });
    }
    const skill = await crossoverSkillGenome(user.id, body.aId, body.bId, typeof body.seed === "string" ? body.seed : undefined);
    if (!skill) return NextResponse.json({ error: "Parent skill not found" }, { status: 404 });
    return NextResponse.json({ skill });
  }

  if (body.action === "select") {
    if (typeof body.familyId !== "string" || !body.familyId) {
      return NextResponse.json({ error: "familyId is required" }, { status: 400 });
    }
    return NextResponse.json(await selectSkillGenome(user.id, body.familyId));
  }

  return NextResponse.json({ error: "Unknown operator" }, { status: 400 });
}
