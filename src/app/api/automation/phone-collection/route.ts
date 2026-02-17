/**
 * POST /api/automation/phone-collection
 * Collect phone numbers from Apollo and keep the cold calling queue healthy.
 */

import { NextRequest, NextResponse } from "next/server";
import { insforge } from "@/lib/neon/server";
import { DEFAULT_USER_ID } from "@/lib/default-user";
import {
  searchApolloContacts,
  INDUSTRY_KEYWORDS_MAP,
  getTitlesForSize,
  extractPersonMobile,
  type EnhancedSearchParams,
} from "@/lib/apollo/client";
import {
  HARVEST_INDUSTRIES,
  HARVEST_EMPLOYEE_RANGES,
  PHONE_DAILY_TARGET,
  HARVEST_PER_PAGE,
  APOLLO_REQUEST_DELAY_MS,
  PHONE_QUEUE_TARGET,
} from "@/lib/automation/config";
import { todayCST } from "@/lib/automation/scheduler";
import { logAutomation } from "@/lib/automation/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function checkAuth(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true;
  return request.headers.get("authorization") === `Bearer ${cronSecret}`;
}

export async function POST(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apolloApiKey = process.env.APOLLO_API_KEY;
  if (!apolloApiKey) {
    return NextResponse.json({ error: "APOLLO_API_KEY not configured" }, { status: 500 });
  }

  const today = todayCST();
  const userId = DEFAULT_USER_ID;

  await logAutomation("phone_collected", { phase: "start", today, target: PHONE_DAILY_TARGET });

  let collected = 0;
  let skipped = 0;
  let errors = 0;

  for (const industry of HARVEST_INDUSTRIES) {
    if (collected >= PHONE_DAILY_TARGET) break;

    const keywords = INDUSTRY_KEYWORDS_MAP[industry];
    if (!keywords) continue;

    for (const empRange of HARVEST_EMPLOYEE_RANGES) {
      if (collected >= PHONE_DAILY_TARGET) break;

      try {
        const result = await searchApolloContacts(apolloApiKey, {
          q_organization_keyword_tags: keywords,
          organization_num_employees_ranges: [empRange],
          person_titles: getTitlesForSize(empRange),
          person_locations: ["United States"],
          per_page: HARVEST_PER_PAGE,
        } as EnhancedSearchParams);

        for (const person of result.people || []) {
          if (collected >= PHONE_DAILY_TARGET) break;

          const phones = extractPersonMobile(person.phone_numbers);
          const bestPhone = phones.mobile || phones.direct || phones.any;
          if (!bestPhone) {
            skipped++;
            continue;
          }

          const email = typeof person.email === "string" ? person.email.trim() : "";

          const { data: existingQueue } = await insforge.database
            .from("cold_calling_queue")
            .select("id")
            .eq("phone", bestPhone)
            .eq("collected_date", today)
            .maybeSingle();

          if (existingQueue) {
            skipped++;
            continue;
          }

          let contactId: string | null = null;
          if (email) {
            const { data: existing } = await insforge.database
              .from("contacts")
              .select("id")
              .eq("user_id", userId)
              .eq("email", email)
              .maybeSingle();

            if (existing) {
              contactId = (existing as any).id;
              await insforge.database
                .from("contacts")
                .update({
                  phone: phones.direct || phones.mobile || bestPhone,
                  mobile: phones.mobile || null,
                })
                .eq("id", contactId)
                .eq("user_id", userId);
            }
          }

          if (!contactId) {
            const { data: newContact, error: insertErr } = await insforge.database
              .from("contacts")
              .insert([
                {
                  user_id: userId,
                  first_name: person.first_name || "Unknown",
                  last_name: person.last_name || null,
                  email: email || null,
                  phone: bestPhone,
                  mobile: phones.mobile || null,
                  company_name: person.organization?.name || null,
                  industry: person.organization?.industry || industry,
                  title: person.title || null,
                  source: "apollo_phone_harvest",
                  source_list: `phone_${today}`,
                  stage: "fresh",
                  status: "active",
                  apollo_id: person.id,
                  enrichment_status: email ? "enriched" : "no_email",
                },
              ])
              .select("id")
              .single();

            if (insertErr) {
              errors++;
              continue;
            }

            contactId = (newContact as any).id;
          }

          if (!contactId) {
            errors++;
            continue;
          }

          try {
            await insforge.database.from("cold_calling_queue").insert([
              {
                user_id: userId,
                contact_id: contactId,
                first_name: person.first_name || "Unknown",
                last_name: person.last_name || null,
                company_name: person.organization?.name || null,
                industry: person.organization?.industry || industry,
                phone: bestPhone,
                phone_type: phones.mobile ? "mobile" : phones.direct ? "direct" : "other",
                source: "apollo_search",
                status: "pending",
                priority: phones.mobile ? 10 : phones.direct ? 5 : 1,
                collected_date: today,
              },
            ]);
            collected++;
          } catch (e: any) {
            if (e.message?.includes("duplicate")) {
              skipped++;
            } else {
              errors++;
            }
          }
        }

        await delay(APOLLO_REQUEST_DELAY_MS);
      } catch (err: any) {
        errors++;
        await logAutomation("phone_error", { industry, error: err.message }, "error");
      }
    }
  }

  // Queue management: prune stale completed entries and backfill pending queue
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const { data: prunedRows } = await insforge.database
    .from("cold_calling_queue")
    .delete()
    .lt("created_at", fourteenDaysAgo)
    .neq("status", "pending")
    .select("id");
  const pruned = prunedRows?.length || 0;

  const { data: queueRows } = await insforge.database
    .from("cold_calling_queue")
    .select("contact_id,status")
    .eq("user_id", userId);

  const queueContacts = new Set<string>();
  let pendingCount = 0;
  for (const row of queueRows || []) {
    queueContacts.add(row.contact_id);
    if (row.status === "pending") pendingCount++;
  }

  let backfilled = 0;
  if (pendingCount < PHONE_QUEUE_TARGET) {
    const needed = PHONE_QUEUE_TARGET - pendingCount;
    const { data: backlogContacts } = await insforge.database
      .from("contacts")
      .select("id,first_name,last_name,company_name,industry,phone,mobile")
      .eq("user_id", userId)
      .eq("status", "active")
      .not("phone", "is", null)
      .order("last_contacted_at", { ascending: true })
      .limit(needed * 2);

    for (const contact of backlogContacts || []) {
      if (!contact.phone) continue;
      if (queueContacts.has(contact.id)) continue;

      try {
        await insforge.database.from("cold_calling_queue").insert([
          {
            user_id: userId,
            contact_id: contact.id,
            first_name: contact.first_name || "Unknown",
            last_name: contact.last_name || null,
            company_name: contact.company_name || null,
            industry: contact.industry || null,
            phone: contact.phone,
            phone_type: contact.mobile ? "mobile" : "direct",
            source: "contact_backfill",
            status: "pending",
            priority: contact.mobile ? 8 : 4,
            collected_date: today,
          },
        ]);
        queueContacts.add(contact.id);
        backfilled++;
        if (backfilled >= needed) break;
      } catch (err: any) {
        if (!err.message?.includes("duplicate")) {
          errors++;
        }
      }
    }
    pendingCount += backfilled;
  }

  await logAutomation("phone_collected", {
    phase: "complete",
    today,
    collected,
    skipped,
    errors,
    pruned,
    backfilled,
    pendingCount,
  });

  return NextResponse.json({
    success: true,
    collected,
    skipped,
    errors,
    pruned,
    backfilled,
    pending: pendingCount,
  });
}

export async function GET(request: NextRequest) {
  return POST(request);
}
