import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { deleteMemory, listMemories, saveMemories, searchMemories, type SaveMemoryInput } from "@/lib/memory";
import { isMemoryKind } from "@/lib/foundation";

export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const params = req.nextUrl.searchParams;
  const q = params.get("q") || "";
  const projectId = params.get("projectId");
  const limit = Number(params.get("limit") || 100);
  const memories = q.trim()
    ? await searchMemories(user.id, q, { projectId, limit: Math.min(8, limit) })
    : await listMemories(user.id, limit);
  return NextResponse.json({ memories });
}

function parseInputs(value: unknown): SaveMemoryInput[] {
  const raw = Array.isArray(value) ? value : value ? [value] : [];
  return raw.flatMap((item): SaveMemoryInput[] => {
    if (!item || typeof item !== "object") return [];
    const o = item as Record<string, unknown>;
    if (typeof o.content !== "string" || !o.content.trim()) return [];
    return [{
      content: o.content,
      kind: isMemoryKind(o.kind) ? o.kind : "fact",
      projectId: typeof o.projectId === "string" ? o.projectId : null,
      sourceChatId: typeof o.sourceChatId === "string" ? o.sourceChatId : null,
      sourceMessageId: typeof o.sourceMessageId === "string" ? o.sourceMessageId : null,
      pinned: o.pinned === true,
    }];
  });
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const inputs = parseInputs(body?.memories ?? body);
  if (!inputs.length) return NextResponse.json({ error: "No valid memories supplied" }, { status: 400 });
  const memories = await saveMemories(user.id, inputs);
  return NextResponse.json({ memories, saved: memories.length });
}

export async function DELETE(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const id = typeof body.id === "string" ? body.id : req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const ok = await deleteMemory(user.id, id);
  return NextResponse.json({ ok });
}
