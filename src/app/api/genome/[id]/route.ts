import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getSkillGenome, listSkillOutcomes } from "@/lib/skill-genome";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const { id } = await params;
  const [skill, outcomes] = await Promise.all([
    getSkillGenome(user.id, id),
    listSkillOutcomes(user.id, id),
  ]);
  if (!skill) return NextResponse.json({ error: "Skill not found" }, { status: 404 });
  return NextResponse.json({ skill, outcomes });
}
