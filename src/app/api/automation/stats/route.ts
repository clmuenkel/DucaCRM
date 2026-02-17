/**
 * GET /api/automation/stats
 * Returns automation KPIs for the tracking dashboard.
 */

import { NextRequest, NextResponse } from "next/server";
import { insforge } from "@/lib/neon/server";
import { DEFAULT_USER_ID } from "@/lib/default-user";
import { todayCST } from "@/lib/automation/scheduler";
import { TemplateKey } from "@/lib/automation/config";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function checkAuth(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true;
  return request.headers.get("authorization") === `Bearer ${cronSecret}`;
}

interface TemplateSummary {
  attempts: number;
  sent: number;
  opens: number;
  replies: number;
  bounces: number;
  failures: number;
}

function createTemplateSummary(): TemplateSummary {
  return { attempts: 0, sent: 0, opens: 0, replies: 0, bounces: 0, failures: 0 };
}

export async function GET(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const daysParam = parseInt(url.searchParams.get("days") || "14", 10);
  const days = Number.isNaN(daysParam) ? 14 : Math.min(Math.max(daysParam, 7), 60);

  const now = new Date();
  const startDate = new Date(now.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  const startDateStr = startDate.toISOString().slice(0, 10);
  const sentAfterIso = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

  const userId = DEFAULT_USER_ID;

  const [campaignsRes, sendsRes, queueRes, logsRes] = await Promise.all([
    insforge.database
      .from("email_campaigns")
      .select("campaign_date, template_key, status, total_sent, total_failed, total_opened, total_replied, sender_stats, completed_at")
      .eq("user_id", userId)
      .gte("campaign_date", startDateStr)
      .order("campaign_date", { ascending: false })
      .limit(days + 7),
    insforge.database
      .from("email_sends")
      .select("template_key, status, sent_at, opened_at, replied_at, bounced_at")
      .eq("user_id", userId)
      .gte("sent_at", sentAfterIso)
      .limit(5000),
    insforge.database
      .from("cold_calling_queue")
      .select("status, priority, collected_date")
      .eq("user_id", userId),
    insforge.database
      .from("automation_logs")
      .select("action, level, details, created_at")
      .order("created_at", { ascending: false })
      .limit(40),
  ]);

  const campaigns = (campaignsRes.data as any[]) || [];
  const sends = (sendsRes.data as any[]) || [];
  const queue = (queueRes.data as any[]) || [];
  const logs = (logsRes.data as any[]) || [];

  const templateSummary: Record<string, TemplateSummary> = {
    original: createTemplateSummary(),
    short: createTemplateSummary(),
  };

  for (const send of sends) {
    const key: string = (send.template_key as TemplateKey) || "unknown";
    if (!templateSummary[key]) {
      templateSummary[key] = createTemplateSummary();
    }
    const summary = templateSummary[key];
    summary.attempts++;
    if (send.status === "sent") summary.sent++;
    if (send.opened_at) summary.opens++;
    if (send.replied_at) summary.replies++;
    if (send.bounced_at || send.status === "failed") summary.bounces++;
    if (send.status === "failed") summary.failures++;
  }

  const deliverabilityTotals = Object.values(templateSummary).reduce(
    (acc, stats) => {
      acc.attempts += stats.attempts;
      acc.sent += stats.sent;
      acc.opens += stats.opens;
      acc.replies += stats.replies;
      acc.bounces += stats.bounces;
      return acc;
    },
    { attempts: 0, sent: 0, opens: 0, replies: 0, bounces: 0 }
  );

  const abTesting = Object.entries(templateSummary).map(([template, stats]) => ({
    template,
    attempted: stats.attempts,
    sent: stats.sent,
    openRate: stats.sent ? stats.opens / stats.sent : 0,
    replyRate: stats.sent ? stats.replies / stats.sent : 0,
    bounceRate: stats.attempts ? stats.bounces / stats.attempts : 0,
  }));

  const campaignPerformance = campaigns.map((campaign) => {
    let senderStats: any = null;
    if (campaign.sender_stats) {
      if (typeof campaign.sender_stats === "string") {
        try {
          senderStats = JSON.parse(campaign.sender_stats);
        } catch {
          senderStats = campaign.sender_stats;
        }
      } else {
        senderStats = campaign.sender_stats;
      }
    }

    return {
      date: campaign.campaign_date,
      templateKey: campaign.template_key,
      status: campaign.status,
      totalSent: campaign.total_sent || 0,
      totalFailed: campaign.total_failed || 0,
      totalOpened: campaign.total_opened || 0,
      totalReplied: campaign.total_replied || 0,
      senderStats,
      completedAt: campaign.completed_at,
    };
  });

  const today = todayCST();
  const queueStats = queue.reduce(
    (acc, row) => {
      acc.total++;
      if (row.status === "pending") acc.pending++;
      if (row.status === "completed") acc.completed++;
      if (row.status === "callback") acc.callbacks++;
      if (row.collected_date === today) acc.addedToday++;
      if (typeof row.priority === "number") acc.prioritySum += row.priority;
      return acc;
    },
    { total: 0, pending: 0, completed: 0, callbacks: 0, addedToday: 0, prioritySum: 0 }
  );
  const averagePriority = queueStats.total ? queueStats.prioritySum / queueStats.total : 0;

  const deliverability = {
    totalAttempts: deliverabilityTotals.attempts,
    totalSent: deliverabilityTotals.sent,
    totalOpens: deliverabilityTotals.opens,
    totalReplies: deliverabilityTotals.replies,
    totalBounces: deliverabilityTotals.bounces,
    openRate: deliverabilityTotals.sent ? deliverabilityTotals.opens / deliverabilityTotals.sent : 0,
    replyRate: deliverabilityTotals.sent ? deliverabilityTotals.replies / deliverabilityTotals.sent : 0,
    bounceRate: deliverabilityTotals.attempts ? deliverabilityTotals.bounces / deliverabilityTotals.attempts : 0,
  };

  const logEntries = logs.map((log) => {
    let details: any = log.details;
    if (typeof details === "string") {
      try {
        details = JSON.parse(details);
      } catch {
        // keep raw string
      }
    }
    return {
      action: log.action,
      level: log.level,
      details,
      createdAt: log.created_at,
    };
  });

  return NextResponse.json({
    success: true,
    period: {
      days,
      startDate: startDateStr,
      endDate: today,
    },
    campaignPerformance,
    abTesting,
    deliverability,
    queue: {
      total: queueStats.total,
      pending: queueStats.pending,
      completed: queueStats.completed,
      callbacks: queueStats.callbacks,
      addedToday: queueStats.addedToday,
      averagePriority,
    },
    logs: logEntries,
  });
}
