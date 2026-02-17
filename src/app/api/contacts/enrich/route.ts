import { NextRequest, NextResponse } from "next/server";
import { insforge } from "@/lib/neon/server";
import { DEFAULT_USER_ID } from "@/lib/default-user";

export const dynamic = "force-dynamic";

const APOLLO_API_BASE = "https://api.apollo.io/v1";
const MATCH_ENDPOINT = `${APOLLO_API_BASE}/people/match`;
const NEEDS_ENRICHMENT_STATUSES = ["no_email", "pending"] as const;
const RATE_LIMIT_DELAY_MS = 220; // ~4.5 req/sec
const MAX_MATCH_ATTEMPTS = 3;
const RATE_LIMIT_BACKOFF_MS = 2000; // required 2s on 429

interface EnrichRequestBody {
  contact_ids?: string[];
  contactIds?: string[];
  batch?: boolean;
  limit?: number;
  dry_run?: boolean;
  dryRun?: boolean;
}

interface ContactRecord {
  id: string;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  enrichment_status: string | null;
}

interface EnrichmentStats {
  enriched: number;
  no_match: number;
  credits_used: number;
  errors: number;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getApolloApiKey(): Promise<string | null> {
  if (process.env.APOLLO_API_KEY) return process.env.APOLLO_API_KEY;

  const { data: settings } = await insforge.database
    .from("user_settings")
    .select("apollo_api_key")
    .eq("user_id", DEFAULT_USER_ID)
    .single();

  return settings?.apollo_api_key || null;
}

function buildMatchPayload(contact: ContactRecord) {
  const payload: Record<string, any> = {
    reveal_personal_emails: true,
  };

  if (contact.first_name) {
    payload.first_name = contact.first_name;
  }
  if (contact.last_name) {
    payload.last_name = contact.last_name;
  }
  if (contact.company_name) {
    payload.organization_name = contact.company_name;
  }

  return payload;
}

function sanitizePhone(entry: any): string | null {
  if (!entry) return null;
  return (
    entry.sanitized_number ||
    entry.number ||
    entry.national_number ||
    entry.raw_number ||
    null
  );
}

function pickPhone(numbers: any[] | undefined, type: string): string | null {
  if (!Array.isArray(numbers)) return null;
  const match = numbers.find((n) => n.type === type);
  return match ? sanitizePhone(match) : null;
}

async function matchContact(
  contact: ContactRecord,
  apiKey: string
): Promise<any | null> {
  const payload = buildMatchPayload(contact);

  if (!payload.first_name || !payload.organization_name) {
    throw new Error("Contact is missing first_name or organization_name");
  }

  for (let attempt = 0; attempt < MAX_MATCH_ATTEMPTS; attempt++) {
    const response = await fetch(MATCH_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        "X-Api-Key": apiKey,
      },
      body: JSON.stringify(payload),
    });

    if (response.status === 429) {
      if (attempt === MAX_MATCH_ATTEMPTS - 1) {
        throw new Error("Apollo rate limit reached (429)");
      }
      await delay(RATE_LIMIT_BACKOFF_MS);
      continue;
    }

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new Error(errorBody || `Apollo API error: ${response.status}`);
    }

    const data = await response.json();
    return data.person || null;
  }

  return null;
}

function normalizeLimit(value: unknown, fallback: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback;
  return Math.min(Math.max(Math.floor(value), 1), 500);
}

function formatName(contact: ContactRecord): string {
  const first = contact.first_name?.trim() || "";
  const last = contact.last_name?.trim() || "";
  return `${first} ${last}`.trim() || first || last || "Unknown";
}

export async function POST(request: NextRequest) {
  try {
    const body: EnrichRequestBody = await request.json().catch(() => ({}));
    const dryRun = Boolean(body.dry_run ?? body.dryRun ?? false);
    const batch = Boolean(body.batch);
    const limit = normalizeLimit(body.limit, 50);
    const contactIds = (body.contact_ids || body.contactIds || []) as string[];

    if (dryRun) {
      const { data, error } = await insforge.database
        .from("contacts")
        .select("id, first_name, last_name, company_name, enrichment_status")
        .eq("user_id", DEFAULT_USER_ID)
        .in("enrichment_status", NEEDS_ENRICHMENT_STATUSES)
        .order("updated_at", { ascending: true })
        .limit(limit);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      const preview = (data || []).map((contact) => ({
        id: contact.id,
        name: formatName(contact as ContactRecord),
        company: contact.company_name,
        status: contact.enrichment_status,
      }));

      return NextResponse.json({ dry_run: true, preview });
    }

    const apiKey = await getApolloApiKey();
    if (!apiKey) {
      return NextResponse.json(
        { error: "Apollo API key not configured" },
        { status: 400 }
      );
    }

    if (contactIds.length === 0 && !batch) {
      return NextResponse.json(
        { error: "Provide contact_ids or enable batch mode" },
        { status: 400 }
      );
    }

    let query = insforge.database
      .from("contacts")
      .select(
        "id, first_name, last_name, company_name, email, phone, mobile, enrichment_status"
      )
      .eq("user_id", DEFAULT_USER_ID);

    if (contactIds.length > 0) {
      query = query.in("id", contactIds);
    } else if (batch) {
      query = query
        .in("enrichment_status", NEEDS_ENRICHMENT_STATUSES)
        .order("updated_at", { ascending: true })
        .limit(limit);
    }

    const { data: contacts, error: contactsError } = await query;

    if (contactsError) {
      return NextResponse.json(
        { error: contactsError.message },
        { status: 500 }
      );
    }

    if (!contacts || contacts.length === 0) {
      return NextResponse.json({ enriched: 0, no_match: 0, credits_used: 0, errors: 0 });
    }

    const stats: EnrichmentStats = {
      enriched: 0,
      no_match: 0,
      credits_used: 0,
      errors: 0,
    };

    for (const contact of contacts as ContactRecord[]) {
      try {
        const canEnrich = Boolean(contact.first_name && contact.company_name);
        if (!canEnrich) {
          stats.errors += 1;
          continue;
        }

        const match = await matchContact(contact, apiKey);
        stats.credits_used += 1;

        const updateData: Record<string, any> = {};
        if (match) {
          const phoneNumbers = Array.isArray(match.phone_numbers) ? match.phone_numbers : [];
          const mobile = pickPhone(phoneNumbers, "mobile");
          const direct = pickPhone(phoneNumbers, "direct") || pickPhone(phoneNumbers, "direct_dial");
          const fallback = sanitizePhone(phoneNumbers[0]);
          const nextPhone = direct || fallback || null;

          if (match.email) {
            updateData.email = match.email;
          }
          if (nextPhone) {
            updateData.phone = nextPhone;
          }
          if (mobile) {
            updateData.mobile = mobile;
          }

          updateData.enrichment_status = "enriched";
          updateData.enriched_at = new Date().toISOString();
          stats.enriched += 1;
        } else {
          updateData.enrichment_status = "no_match";
          stats.no_match += 1;
        }

        const { error: updateError } = await insforge.database
          .from("contacts")
          .update(updateData)
          .eq("id", contact.id)
          .eq("user_id", DEFAULT_USER_ID);

        if (updateError) {
          stats.errors += 1;
        }
      } catch (error) {
        console.error("[contacts/enrich] contact failed", error);
        stats.errors += 1;
      }

      await delay(RATE_LIMIT_DELAY_MS);
    }

    return NextResponse.json(stats);
  } catch (error: any) {
    console.error("[contacts/enrich] request failed", error);
    return NextResponse.json(
      { error: error.message || "Enrichment failed" },
      { status: 500 }
    );
  }
}
