import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { runAgentRuntime, listAgentMessages, listAgentTasks, listWorkspace } from "@/lib/agent-runtime";
import type { RuntimeRunInput } from "@/lib/agent-runtime";
import { getRun } from "@/lib/traces";

/** Inspect a recorded runtime run: task graph, messages, workspace and trace. */
export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const runId = req.nextUrl.searchParams.get("runId");
  if (!runId) return NextResponse.json({ error: "runId required" }, { status: 400 });
  const [tasks, messages, workspace, trace] = await Promise.all([
    listAgentTasks(user.id, runId),
    listAgentMessages(user.id, runId),
    listWorkspace(user.id, runId),
    getRun(user.id, runId),
  ]);
  return NextResponse.json({ tasks, messages, workspace, events: trace?.events || [], run: trace?.run || null });
}

/** Schedule and execute an agent run with the runtime kernel. */
export async function POST(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const body = await req.json().catch(() => null) as Partial<RuntimeRunInput> | null;
  if (!body || typeof body.prompt !== "string" || !body.prompt.trim() || !Array.isArray(body.agents) || !body.agents.length) {
    return NextResponse.json({ error: "prompt and agents are required" }, { status: 400 });
  }
  const result = await runAgentRuntime({ ...body, uid: user.id, prompt: body.prompt, agents: body.agents } as RuntimeRunInput);
  return NextResponse.json(result);
}
