import { NextRequest, NextResponse } from "next/server";
import { insforge } from "@/lib/neon/server";
import { DEFAULT_USER_ID } from "@/lib/default-user";
import {
  OutreachState,
  shouldSendEmail,
  shouldCall,
  getNextAction,
} from "@/lib/outreach/state-machine";

export const dynamic = "force-dynamic";

const ACTIONABLE_STATES: OutreachState[] = [
  "fresh",
  "emailed",
  "email_follow_up",
  "called_no_answer",
  "call_back_scheduled",
];

const FOLLOW_UP_STATES: OutreachState[] = [
  "emailed",
  "email_follow_up",
  "called_no_answer",
  "call_back_scheduled",
];

const CONTACT_FIELDS = [
  "id",
  "first_name",
  "last_name",
  "company_name",
  "industry",
  "employee_count",
  "employee_range",
  "stage",
  "outreach_lock",
  "outreach_follow_up_date",
  "allow_email_override",
  "email",
  "phone",
  "mobile",
].join(", ");

function isDue(stateValue: string | null, followUpDate: string | null, now: Date): boolean {
  const state = (stateValue as OutreachState) ?? "fresh";
  if (state === "fresh") {
    return true;
  }
  if (!FOLLOW_UP_STATES.includes(state)) {
    return false;
  }
  if (!followUpDate) {
    return true;
  }
  const followUp = new Date(followUpDate);
  if (Number.isNaN(followUp.getTime())) {
    return true;
  }
  return followUp <= now;
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const industryFilter = url.searchParams.get("industry");
    const sizeFilter = url.searchParams.get("size");
    const limitParam = url.searchParams.get("limit");
    const limit = Math.min(Math.max(parseInt(limitParam ?? "20", 10) || 20, 1), 100);

    let query = insforge.database
      .from("contacts")
      .select(CONTACT_FIELDS)
      .eq("user_id", DEFAULT_USER_ID)
      .eq("status", "active")
      .order("employee_count", { ascending: true, nullsFirst: true })
      .order("company_name", { ascending: true });

    const orParts = ["outreach_lock.is.null", ...ACTIONABLE_STATES.map((state) => `outreach_lock.eq.${state}`)];
    query = query.or(orParts.join(","));

    if (industryFilter) {
      query = query.eq("industry", industryFilter);
    }

    if (sizeFilter) {
      query = query.eq("employee_range", sizeFilter);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[Outreach Queue]", error);
      return NextResponse.json({ error: "Failed to load contacts" }, { status: 500 });
    }

    const now = new Date();
    const filtered = (data || []).filter((contact: any) =>
      isDue(contact.outreach_lock ?? null, contact.outreach_follow_up_date, now)
    );

    const sorted = filtered
      .sort((a: any, b: any) => {
        const aCount = typeof a.employee_count === "number" ? a.employee_count : Number.MAX_SAFE_INTEGER;
        const bCount = typeof b.employee_count === "number" ? b.employee_count : Number.MAX_SAFE_INTEGER;
        if (aCount !== bCount) {
          return aCount - bCount;
        }
        return (a.company_name || "").localeCompare(b.company_name || "");
      })
      .slice(0, limit);

    const payload = sorted.map((contact: any) => {
      const outreachLock = contact.outreach_lock ?? "fresh";
      const stageForAction = contact.stage ?? outreachLock;
      return {
        id: contact.id,
        name: [contact.first_name, contact.last_name].filter(Boolean).join(" ").trim(),
        company_name: contact.company_name,
        industry: contact.industry,
        employee_count: contact.employee_count,
        employee_range: contact.employee_range,
        stage: contact.stage,
        outreach_lock: outreachLock,
        outreach_follow_up_date: contact.outreach_follow_up_date,
        can_send_email: shouldSendEmail(contact.outreach_lock ?? null, contact.allow_email_override ?? false),
        should_call: shouldCall(contact.outreach_lock ?? null),
        next_action: getNextAction(stageForAction, contact.outreach_follow_up_date),
      };
    });

    return NextResponse.json({
      filters: {
        industry: industryFilter,
        size: sizeFilter,
        limit,
      },
      count: payload.length,
      data: payload,
    });
  } catch (err: any) {
    console.error("[Outreach Queue]", err);
    return NextResponse.json({ error: err.message ?? "Unexpected error" }, { status: 500 });
  }
}
