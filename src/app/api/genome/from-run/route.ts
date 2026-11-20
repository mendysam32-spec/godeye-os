import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { listAgentMessages, listAgentTasks } from "@/lib/agent-runtime";
import { proposeSkillFromRun } from "@/lib/skill-genome";
import { getRun } from "@/lib/traces";

/** Let a verified agent result author the next generation of its own toolkit. */
export async function POST(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const runId = typeof body?.runId === "string" ? body.runId.trim() : "";
  if (!runId) return NextResponse.json({ error: "runId is required" }, { status: 400 });

  const [trace, messages, tasks] = await Promise.all([
    getRun(user.id, runId),
    listAgentMessages(user.id, runId),
    listAgentTasks(user.id, runId),
  ]);
  if (!trace) return NextResponse.json({ error: "Run not found" }, { status: 404 });

  const agentId = typeof body?.agentId === "string" && body.agentId ? body.agentId : null;
  const candidates = messages
    .filter((m) => m.type === "task.result" && typeof m.payload.content === "string" && String(m.payload.content).trim().length >= 40)
    .filter((m) => !agentId || m.from === agentId)
    .sort((a, b) => Number(b.payload.score ?? 0) - Number(a.payload.score ?? 0));
  const source = candidates[0];
  if (!source) {
    return NextResponse.json({ error: "No usable task.result message in that run" }, { status: 404 });
  }
  const task = tasks.find((t) => t.agentId === source.from);
  const name = typeof body?.name === "string" && body.name.trim() ? body.name.trim() : `${task?.name || source.from} capability`;
  const description = typeof body?.description === "string" && body.description.trim()
    ? body.description.trim()
    : `Reusable capability distilled from ${task?.name || source.from} in run ${runId.slice(0, 12)}.`;

  try {
    const skill = await proposeSkillFromRun({
      uid: user.id,
      runId,
      content: String(source.payload.content),
      agentId: source.from,
      agentName: task?.name || source.from,
      name,
      description,
      trustScore: Number(source.payload.score ?? 0.6),
    });
    return NextResponse.json({ skill });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not evolve skill" }, { status: 400 });
  }
}
