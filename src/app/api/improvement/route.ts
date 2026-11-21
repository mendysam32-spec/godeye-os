import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import {
  listImprovementState,
  mergeProposal,
  rejectProposal,
  runImprovementCycle,
  validateProposal,
} from "@/lib/improvement";

/** Read the self-improvement ledger: post-mortems, patterns, proposals and adopted config. */
export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const state = await listImprovementState(user.id);
  return NextResponse.json(state, { headers: { "Cache-Control": "no-store" } });
}

/** Run one loop pass or gate/merge an individual proposal. */
export async function POST(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.action !== "string") {
    return NextResponse.json({ error: "action is required" }, { status: 400 });
  }

  try {
    if (body.action === "cycle") {
      const minOccurrences = Number(body.minOccurrences);
      const result = await runImprovementCycle(user.id, {
        minOccurrences: Number.isFinite(minOccurrences) && minOccurrences > 0 ? minOccurrences : 2,
        autoMerge: body.autoMerge === true,
      });
      return NextResponse.json(result);
    }
    if (typeof body.id !== "string" || !body.id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }
    if (body.action === "validate") {
      const proposal = await validateProposal(user.id, body.id);
      if (!proposal) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
      return NextResponse.json({ proposal });
    }
    if (body.action === "merge") {
      const proposal = await mergeProposal(user.id, body.id);
      if (!proposal) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
      return NextResponse.json({ proposal });
    }
    if (body.action === "reject") {
      const proposal = await rejectProposal(user.id, body.id);
      if (!proposal) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
      return NextResponse.json({ proposal });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Improvement action failed",
    }, { status: 400 });
  }
}
