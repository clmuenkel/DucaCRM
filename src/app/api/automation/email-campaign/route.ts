/**
 * POST /api/automation/email-campaign
 * Send daily email batch: 50 emails rotating across 3 sender addresses.
 *
 * Flow:
 *  1. Create email_campaigns row for today
 *  2. Select up to 50 contacts with email who haven't been emailed today
 *  3. Rotate across 3 senders (~17 each)
 *  4. Send via Resend, record in email_sends
 *  5. Update contact tracking fields
 */

import { NextRequest, NextResponse } from "next/server";
import { insforge } from "@/lib/neon/server";
import { DEFAULT_USER_ID } from "@/lib/default-user";
import { sendEmailViaResend } from "@/lib/resend/client";
import { renderHTMLTemplate, htmlToPlainText } from "@/lib/email-template-renderer";
import { getIndustryForTemplate } from "@/lib/utils";
import {
  SENDER_ADDRESSES,
  EMAILS_PER_SENDER,
  TOTAL_DAILY_EMAILS,
  EMAIL_SEND_DELAY_MS,
  TemplateKey,
} from "@/lib/automation/config";
import { OUTREACH_TEMPLATES, renderOutreachTemplate } from "@/lib/automation/templates";
import { isWithinSendWindow, todayCST } from "@/lib/automation/scheduler";
import { logAutomation } from "@/lib/automation/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min for Vercel

// ─── Auth guard ─────────────────────────────────────────────
function checkAuth(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true; // No secret = dev mode
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${cronSecret}`;
}

// ─── Helpers ────────────────────────────────────────────────
function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function POST(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    return NextResponse.json({ error: "RESEND_API_KEY not configured" }, { status: 500 });
  }

  // Parse optional body
  let forcedTemplate: TemplateKey | null = null;
  let dryRun = false;
  try {
    const body = await request.json().catch(() => ({}));
    if (body.template && OUTREACH_TEMPLATES[body.template]) {
      forcedTemplate = body.template as TemplateKey;
    }
    if (body.dryRun === true) dryRun = true;
  } catch {}

  const templateRotation: TemplateKey[] = ["original", "short"];
  const campaignTemplateLabel = forcedTemplate || "a_b";

  const today = todayCST();
  const userId = DEFAULT_USER_ID;
  const calendarLink = process.env.CALENDAR_LINK || "https://calendar.app.google/YourLink";

  // Check send window (skip on dry run)
  if (!dryRun && !isWithinSendWindow()) {
    return NextResponse.json({
      success: false,
      message: "Outside CST business hours (Mon-Fri 9 AM - 5 PM). No emails sent.",
    });
  }

  // Check if campaign already ran today
  const { data: existing } = await insforge.database
    .from("email_campaigns")
    .select("id, status, total_sent")
    .eq("user_id", userId)
    .eq("campaign_date", today)
    .maybeSingle();

  if (existing && (existing as any).status === "completed") {
    return NextResponse.json({
      success: true,
      message: `Campaign already completed today (${(existing as any).total_sent} sent).`,
      campaignId: (existing as any).id,
    });
  }

  await logAutomation("campaign_start", { today, template: campaignTemplateLabel, dryRun });

  // Create or reuse campaign row
  let campaignId: string;
  if (existing) {
    campaignId = (existing as any).id;
    await insforge.database
      .from("email_campaigns")
      .update({ status: "running", started_at: new Date().toISOString() })
      .eq("id", campaignId);
  } else {
    const { data: campaign, error } = await insforge.database
      .from("email_campaigns")
      .insert([
        {
          user_id: userId,
          campaign_date: today,
          template_key: campaignTemplateLabel,
          status: "running",
          started_at: new Date().toISOString(),
        },
      ])
      .select("id")
      .single();

    if (error || !campaign) {
      return NextResponse.json({ error: "Failed to create campaign" }, { status: 500 });
    }
    campaignId = (campaign as any).id;
  }

  // Select contacts who:
  // - Have an email
  // - Are active, not bounced/unsubscribed
  // - Haven't been emailed by automation today
  // - Preferably "fresh" stage
  const { data: contacts, error: contactErr } = await insforge.database
    .from("contacts")
    .select("id, first_name, last_name, email, company_name, industry, industries, stage, total_emails")
    .eq("user_id", userId)
    .eq("status", "active")
    .not("email", "is", null)
    .order("created_at", { ascending: true })
    .limit(TOTAL_DAILY_EMAILS * 2); // fetch extra to filter

  if (contactErr || !contacts) {
    await insforge.database
      .from("email_campaigns")
      .update({ status: "failed", error_message: contactErr?.message || "No contacts" })
      .eq("id", campaignId);
    return NextResponse.json({ error: "Failed to fetch contacts" }, { status: 500 });
  }

  // Filter out contacts already emailed today
  const contactIds = (contacts as any[]).map((c) => c.id);
  const { data: alreadySent } = await insforge.database
    .from("email_sends")
    .select("contact_id")
    .eq("user_id", userId)
    .in("contact_id", contactIds);

  const sentSet = new Set((alreadySent as any[] || []).map((s) => s.contact_id));
  // Also filter out contacts who have replied or been contacted recently
  const eligible = (contacts as any[]).filter(
    (c) => c.email && !sentSet.has(c.id)
  );

  const toSend = eligible.slice(0, TOTAL_DAILY_EMAILS);

  if (toSend.length === 0) {
    await insforge.database
      .from("email_campaigns")
      .update({ status: "completed", completed_at: new Date().toISOString(), total_sent: 0 })
      .eq("id", campaignId);
    return NextResponse.json({ success: true, message: "No eligible contacts to email.", sent: 0 });
  }

  // Send emails, rotating senders & templates
  const templateStats: Record<string, { sent: number; failed: number }> = {};
  let totalSent = 0;
  let totalFailed = 0;
  const senderCounts: Record<string, number> = {};

  for (let i = 0; i < toSend.length; i++) {
    const contact = toSend[i];
    const senderIdx = i % SENDER_ADDRESSES.length;
    const sender = SENDER_ADDRESSES[senderIdx];

    const templateKey: TemplateKey = forcedTemplate || templateRotation[i % templateRotation.length];
    const template = OUTREACH_TEMPLATES[templateKey];
    templateStats[templateKey] = templateStats[templateKey] || { sent: 0, failed: 0 };

    // Enforce per-sender limit
    senderCounts[sender.email] = (senderCounts[sender.email] || 0) + 1;
    if (senderCounts[sender.email] > EMAILS_PER_SENDER) continue;

    const industry = getIndustryForTemplate(contact);
    const variables: Record<string, string> = {
      first_name: contact.first_name || "there",
      company_name: contact.company_name || "your company",
      industry,
      sender_name: sender.name,
      calendar_link: calendarLink,
    };

    const { subject, body } = renderOutreachTemplate(template, variables);
    const htmlBody = renderHTMLTemplate(body, {});
    const textBody = htmlToPlainText(htmlBody);

    if (dryRun) {
      totalSent++;
      templateStats[templateKey].sent++;
      continue;
    }

    try {
      const result = await sendEmailViaResend({
        apiKey: resendApiKey,
        from: `${sender.name} <${sender.email}>`,
        to: contact.email,
        subject,
        html: htmlBody,
        text: textBody,
        tags: [
          { name: "campaign_id", value: campaignId },
          { name: "automation", value: "daily_outreach" },
        ],
      });

      if (result.success) {
        // Record send
        await insforge.database.from("email_sends").insert([
          {
            campaign_id: campaignId,
            user_id: userId,
            contact_id: contact.id,
            sender_email: sender.email,
            sender_name: sender.name,
            to_email: contact.email,
            subject,
            body_text: textBody,
            body_html: htmlBody,
            template_key: templateKey,
            resend_email_id: result.emailId || null,
            status: "sent",
            sent_at: new Date().toISOString(),
          },
        ]);

        // Update contact
        await insforge.database
          .from("contacts")
          .update({
            last_email_sent_at: new Date().toISOString(),
            last_contacted_at: new Date().toISOString(),
            total_emails: (contact.total_emails || 0) + 1,
            stage: contact.stage === "fresh" ? "contacted" : contact.stage,
            resend_email_id: result.emailId || null,
          })
          .eq("id", contact.id);

        totalSent++;
        templateStats[templateKey].sent++;
      } else {
        await insforge.database.from("email_sends").insert([
          {
            campaign_id: campaignId,
            user_id: userId,
            contact_id: contact.id,
            sender_email: sender.email,
            sender_name: sender.name,
            to_email: contact.email,
            subject,
            body_text: textBody,
            template_key: templateKey,
            status: "failed",
            error_message: result.error || "Unknown error",
          },
        ]);
        totalFailed++;
        templateStats[templateKey].failed++;
        await logAutomation("email_failed", { contactId: contact.id, error: result.error }, "error");
      }
    } catch (err: any) {
      totalFailed++;
      templateStats[templateKey].failed++;
      await logAutomation("email_failed", { contactId: contact.id, error: err.message }, "error");
    }

    // Rate limit between sends
    if (i < toSend.length - 1) {
      await delay(EMAIL_SEND_DELAY_MS);
    }
  }

  // Finalize campaign
  await insforge.database
    .from("email_campaigns")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      total_sent: totalSent,
      total_failed: totalFailed,
      sender_stats: JSON.stringify({ senders: senderCounts, templates: templateStats }),
    })
    .eq("id", campaignId);

  await logAutomation("campaign_complete", {
    campaignId,
    totalSent,
    totalFailed,
    senderCounts,
    templateStats,
    templateMode: campaignTemplateLabel,
    dryRun,
  });

  return NextResponse.json({
    success: true,
    campaignId,
    sent: totalSent,
    failed: totalFailed,
    senderCounts,
    templateStats,
    templateMode: campaignTemplateLabel,
    dryRun,
  });
}

// Vercel cron calls GET
export async function GET(request: NextRequest) {
  return POST(request);
}
