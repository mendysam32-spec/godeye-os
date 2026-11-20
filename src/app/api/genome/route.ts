import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { isSkillGenomeKind, isSkillGenomeStatus, type SkillDna, type SkillOutcome } from "@/lib/foundation";
import { createSkillGenome, listSkillGenome, listSkillOutcomes } from "@/lib/skill-genome";

/** List genome versions (optionally one family/status) with recent outcomes. */
export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const familyId = req.nextUrl.searchParams.get("familyId") || null;
  const rawStatus = req.nextUrl.searchParams.get("status");
  const status = isSkillGenomeStatus(rawStatus) ? rawStatus : null;
  const [skills, rawOutcomes] = await Promise.all([
    listSkillGenome(user.id, { familyId, status }),
    listSkillOutcomes(user.id),
  ]);
  const skillIds = new Set(skills.map((s) => s.id));
  const outcomes = rawOutcomes.filter((o: SkillOutcome) => skillIds.has(o.skillId)).slice(0, 200);
  return NextResponse.json({ skills, outcomes });
}

/** Register a new skill/tool version. Agents do this through the genome API. */
export async function POST(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.name !== "string" || typeof body.body !== "string") {
    return NextResponse.json({ error: "name and body are required" }, { status: 400 });
  }
  if (body.kind != null && !isSkillGenomeKind(body.kind)) {
    return NextResponse.json({ error: "kind must be prompt or tool" }, { status: 400 });
  }
  try {
    const skill = await createSkillGenome({
      uid: user.id,
      name: body.name,
      slug: typeof body.slug === "string" ? body.slug : undefined,
      description: typeof body.description === "string" ? body.description : undefined,
      kind: body.kind as "prompt" | "tool" | undefined,
      body: body.body,
      dna: body.dna && typeof body.dna === "object" && !Array.isArray(body.dna)
        ? body.dna as Partial<SkillDna>
        : null,
      tests: Array.isArray(body.tests) ? body.tests : null,
      familyId: typeof body.familyId === "string" ? body.familyId : null,
      parentIds: Array.isArray(body.parentIds) ? body.parentIds.filter((id): id is string => typeof id === "string") : null,
    });
    return NextResponse.json({ skill });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not register skill" }, { status: 400 });
  }
}
