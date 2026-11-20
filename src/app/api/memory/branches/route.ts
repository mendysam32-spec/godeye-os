import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import {
  addMemoryToBranch, createMemoryBranch, listBranchMemories, listMemoryBranches,
} from "@/lib/memory";

/** Named memory modules and their contents. `"main"` is the implicit root. */
export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const branchId = req.nextUrl.searchParams.get("branchId");
  const [branches, memories] = await Promise.all([
    listMemoryBranches(user.id),
    listBranchMemories(user.id, branchId || "main"),
  ]);
  return NextResponse.json({ branches, memories });
}

/** Fork a branch (or main) into a new module. */
export async function POST(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const name = typeof body.name === "string" ? body.name : "";
  if (!name.trim()) return NextResponse.json({ error: "A branch name is required" }, { status: 400 });
  const branch = await createMemoryBranch(
    user.id,
    name,
    typeof body.sourceId === "string" ? body.sourceId : null,
    typeof body.projectId === "string" ? body.projectId : null,
  );
  if (!branch) return NextResponse.json({ error: "Could not fork branch" }, { status: 400 });
  return NextResponse.json({ branch });
}

/** Add an existing memory to a branch by reference. */
export async function PUT(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const memoryId = typeof body.memoryId === "string" ? body.memoryId : "";
  const branchId = typeof body.branchId === "string" ? body.branchId : "";
  if (!memoryId || !branchId) {
    return NextResponse.json({ error: "memoryId and branchId are required" }, { status: 400 });
  }
  const ok = await addMemoryToBranch(user.id, memoryId, branchId);
  return NextResponse.json({ ok });
}
