/**
 * GET/POST /api/automation/cron
 * Legacy path — redirects to /api/cron/daily-automation.
 */

import { NextRequest, NextResponse } from "next/server";
import { logAutomation } from "@/lib/automation/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function checkAuth(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true;
  return request.headers.get("authorization") === `Bearer ${cronSecret}`;
}

async function callMasterCron(request: NextRequest): Promise<NextResponse> {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const baseUrl = request.nextUrl.origin;
  const cronSecret = process.env.CRON_SECRET;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (cronSecret) headers["Authorization"] = `Bearer ${cronSecret}`;

  try {
    const res = await fetch(`${baseUrl}/api/cron/daily-automation`, {
      method: "POST",
      headers,
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    await logAutomation("cron_error", { error: err.message, source: "legacy_proxy" }, "error");
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return callMasterCron(request);
}

export async function POST(request: NextRequest) {
  return callMasterCron(request);
}
