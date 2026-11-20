import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { addSkillTestCase } from "@/lib/skill-genome";

/** Add a bounded test case to a genome version (tests themselves are versioned). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.input !== "string" || !body.input.trim()) {
    return NextResponse.json({ error: "A test input is required" }, { status: 400 });
  }
  const skill = await addSkillTestCase(user.id, id, body);
  if (!skill) return NextResponse.json({ error: "Skill not found" }, { status: 404 });
  return NextResponse.json({ skill });
}
