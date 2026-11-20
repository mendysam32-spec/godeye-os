import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { appendAgentMessage, listAgentMessages } from "@/lib/agent-runtime";
import { AGENT_MESSAGE_TYPES, type AgentMessageType } from "@/lib/foundation";

function parseType(value: unknown): AgentMessageType | null {
  return typeof value === "string" && (AGENT_MESSAGE_TYPES as readonly string[]).includes(value)
    ? value as AgentMessageType
    : null;
}

export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const runId = req.nextUrl.searchParams.get("runId");
  if (!runId) return NextResponse.json({ error: "runId required" }, { status: 400 });
  return NextResponse.json({ messages: await listAgentMessages(user.id, runId) });
}

/** Emit a structured protocol message between agents, humans or observers. */
export async function POST(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const runId = typeof body.runId === "string" ? body.runId : "";
  const type = parseType(body.type);
  const from = typeof body.from === "string" ? body.from : "";
  const to = typeof body.to === "string" ? body.to : "";
  if (!runId || !type || !from || !to) {
    return NextResponse.json({ error: "runId, a valid type, from and to are required" }, { status: 400 });
  }
  const payload = body.payload && typeof body.payload === "object" && !Array.isArray(body.payload)
    ? body.payload as Record<string, unknown>
    : {};
  const message = await appendAgentMessage({ uid: user.id, runId, type, from, to, payload });
  if (!message) return NextResponse.json({ error: "Could not record message" }, { status: 400 });
  return NextResponse.json({ message });
}
