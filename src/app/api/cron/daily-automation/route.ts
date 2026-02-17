/**
 * GET/POST /api/cron/daily-automation
 * Master cron job that runs every weekday at 9 AM CST via Vercel scheduled task.
 * Steps: setup tables → Apollo harvest → email campaign → phone collection → stats snapshot.
 */

import { NextRequest, NextResponse } from "next/server";
import { logAutomation } from "@/lib/automation/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface CronStep {
  name: string;
  path: string;
  method?: "GET" | "POST";
  body?: Record<string, any>;
}

const STEPS: CronStep[] = [
  { name: "setupTables", path: "/api/automation/setup-tables", method: "POST" },
  { name: "apolloHarvest", path: "/api/automation/apollo-harvest", method: "POST" },
  { name: "emailCampaign", path: "/api/automation/email-campaign", method: "POST" },
  { name: "phoneCollection", path: "/api/automation/phone-collection", method: "POST" },
  { name: "statsSnapshot", path: "/api/automation/stats", method: "GET" },
];

function checkAuth(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true;
  return request.headers.get("authorization") === `Bearer ${cronSecret}`;
}

async function callInternal(
  request: NextRequest,
  step: CronStep
): Promise<{ ok: boolean; status: number; data: any }> {
  const baseUrl = request.nextUrl.origin;
  const cronSecret = process.env.CRON_SECRET;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (cronSecret) headers["Authorization"] = `Bearer ${cronSecret}`;

  const method = step.method || "POST";
  const init: RequestInit = { method, headers };
  if (method === "POST") {
    init.body = JSON.stringify(step.body ?? {});
  }

  try {
    const res = await fetch(`${baseUrl}${step.path}`, init);
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch (err: any) {
    return { ok: false, status: 500, data: { error: err.message } };
  }
}

async function runCron(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = new Date().toISOString();
  await logAutomation("cron_start", { startedAt });

  const startedMs = Date.now();
  const results: Record<string, { ok: boolean; status: number; data: any }> = {};
  let hasError = false;

  for (const step of STEPS) {
    const result = await callInternal(request, step);
    results[step.name] = result;
    if (!result.ok) {
      hasError = true;
      await logAutomation(
        "cron_error",
        { step: step.name, status: result.status, data: result.data },
        "error"
      );
    }
  }

  const durationMs = Date.now() - startedMs;

  if (hasError) {
    await logAutomation(
      "cron_error",
      { durationMs, results, startedAt },
      "error"
    );
  } else {
    await logAutomation("cron_complete", { durationMs, results, startedAt });
  }

  return NextResponse.json(
    {
      success: !hasError,
      durationMs,
      results,
    },
    { status: hasError ? 500 : 200 }
  );
}

export async function GET(request: NextRequest) {
  return runCron(request);
}

export async function POST(request: NextRequest) {
  return runCron(request);
}
