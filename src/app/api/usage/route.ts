import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { listUsageEvents, summarizeUsage } from "@/lib/usage";

export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const limit = Number(req.nextUrl.searchParams.get("limit") || 200);
  const events = await listUsageEvents(user.id, limit);
  return NextResponse.json({ events, summary: summarizeUsage(events) });
}
