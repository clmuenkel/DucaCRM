/**
 * POST /api/automation/apollo-harvest
 * Harvest leads from Apollo search API (free tier — emails visible in search results).
 *
 * Strategy:
 *  - Use mixed_people/api_search with keyword tags per industry
 *  - Rotate through industries + employee ranges
 *  - Collect contacts with visible emails (no credit-consuming enrichment)
 *  - Upsert into contacts table for email campaigns
 */

import { NextRequest, NextResponse } from "next/server";
import { insforge } from "@/lib/neon/server";
import { DEFAULT_USER_ID } from "@/lib/default-user";
import {
  searchApolloContacts,
  INDUSTRY_KEYWORDS_MAP,
  getTitlesForSize,
  mapApolloToContact,
  mapApolloToCompany,
  type EnhancedSearchParams,
} from "@/lib/apollo/client";
import {
  HARVEST_INDUSTRIES,
  HARVEST_EMPLOYEE_RANGES,
  HARVEST_DAILY_TARGET,
  HARVEST_PER_PAGE,
  APOLLO_REQUEST_DELAY_MS,
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
    // Try user_settings
    const { data: settings } = await insforge.database
      .from("user_settings")
      .select("apollo_api_key")
      .eq("user_id", DEFAULT_USER_ID)
      .maybeSingle();
    if (!(settings as any)?.apollo_api_key) {
      return NextResponse.json({ error: "APOLLO_API_KEY not configured" }, { status: 500 });
    }
  }

  const effectiveKey = apolloApiKey || "";
  const today = todayCST();
  const userId = DEFAULT_USER_ID;

  await logAutomation("harvest_start", { today, target: HARVEST_DAILY_TARGET });

  let totalHarvested = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  const byIndustry: Record<string, number> = {};

  // Rotate through industries and employee ranges
  for (const industry of HARVEST_INDUSTRIES) {
    if (totalHarvested >= HARVEST_DAILY_TARGET) break;

    const keywords = INDUSTRY_KEYWORDS_MAP[industry];
    if (!keywords) continue;

    for (const empRange of HARVEST_EMPLOYEE_RANGES) {
      if (totalHarvested >= HARVEST_DAILY_TARGET) break;

      const titles = getTitlesForSize(empRange);
      const remaining = HARVEST_DAILY_TARGET - totalHarvested;
      const perPage = Math.min(HARVEST_PER_PAGE, remaining);

      try {
        const result = await searchApolloContacts(effectiveKey, {
          q_organization_keyword_tags: keywords,
          organization_num_employees_ranges: [empRange],
          person_titles: titles,
          person_locations: ["United States"],
          per_page: perPage,
        } as EnhancedSearchParams);

        const people = result.people || [];

        for (const person of people) {
          if (totalHarvested >= HARVEST_DAILY_TARGET) break;

          // Only harvest contacts with visible emails (no credit spend)
          const email = typeof person.email === "string" ? person.email.trim() : "";
          if (!email) {
            totalSkipped++;
            continue;
          }

          // Check if contact already exists
          const { data: existingContact } = await insforge.database
            .from("contacts")
            .select("id")
            .eq("user_id", userId)
            .eq("email", email)
            .maybeSingle();

          if (existingContact) {
            totalSkipped++;
            continue;
          }

          // Upsert company
          let companyId: string | null = null;
          const companyData = mapApolloToCompany(person, userId);
          if (companyData && companyData.name) {
            try {
              const { data: company } = await insforge.database
                .from("companies")
                .upsert([companyData], { onConflict: "user_id,domain" })
                .select("id")
                .single();
              if (company) companyId = (company as any).id;
            } catch {
              // Company upsert failed — continue without company_id
            }
          }

          // Insert contact
          const contactData = mapApolloToContact(person, userId, `harvest_${today}`, companyId || undefined);
          try {
            await insforge.database.from("contacts").insert([contactData]);
            totalHarvested++;
            byIndustry[industry] = (byIndustry[industry] || 0) + 1;
          } catch (e: any) {
            // Likely duplicate — skip
            if (e.message?.includes("duplicate") || e.detail?.includes("already exists")) {
              totalSkipped++;
            } else {
              totalErrors++;
              console.error(`[Harvest] Insert error for ${email}:`, e.message);
            }
          }
        }

        // Rate limit between API calls
        await delay(APOLLO_REQUEST_DELAY_MS);
      } catch (err: any) {
        totalErrors++;
        await logAutomation("harvest_error", {
          industry,
          empRange,
          error: err.message,
        }, "error");
        // Continue with next combo
      }
    }
  }

  await logAutomation("harvest_complete", {
    today,
    totalHarvested,
    totalSkipped,
    totalErrors,
    byIndustry,
  });

  return NextResponse.json({
    success: true,
    harvested: totalHarvested,
    skipped: totalSkipped,
    errors: totalErrors,
    byIndustry,
  });
}

export async function GET(request: NextRequest) {
  return POST(request);
}
