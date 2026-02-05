import { NextRequest, NextResponse } from "next/server";
import { insforge } from "@/lib/insforge/server";
import { DEFAULT_USER_ID } from "@/lib/default-user";
import { enrichPersonById, extractPersonMobile } from "@/lib/apollo/client";
import type { Contact } from "@/types/database";

export const dynamic = 'force-dynamic';

const APOLLO_API_BASE = "https://api.apollo.io/v1";

interface ReEnrichRequest {
  limit?: number;
  dryRun?: boolean;
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

/**
 * Look up a person by email then enrich to reveal phones
 */
async function lookupByEmail(apiKey: string, email: string): Promise<any | null> {
  try {
    const response = await fetch(`${APOLLO_API_BASE}/people/match`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": apiKey,
      },
      body: JSON.stringify({ email }),
    });

    if (!response.ok) return null;
    const data = await response.json();
    const personId = data.person?.id;
    if (!personId) return null;

    return await enrichPersonById(apiKey, personId);
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: ReEnrichRequest = await request.json().catch(() => ({}));
    const { limit = 200, dryRun = false } = body;

        const userId = DEFAULT_USER_ID;
    const apiKey = await getApolloApiKey();

    if (!apiKey) {
      return NextResponse.json(
        { error: "Apollo API key not configured" },
        { status: 400 }
      );
    }

    // Get ALL contacts that need phone data (with or without apollo_id)
    // Prioritize those missing mobile numbers
    const { data: contacts, error } = await insforge.database
      .from("contacts")
      .select("id, apollo_id, email, first_name, last_name, company_name, phone, mobile")
      .eq("user_id", userId)
      .is("mobile", null) // Only contacts without mobile
      .not("email", "is", null) // Must have email to look up
      .limit(limit);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log(`[Re-enrich] Found ${contacts?.length || 0} contacts to process`);

    const stats = {
      processed: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      byApolloId: 0,
      byEmail: 0,
    };

    const updatesPreview: Array<{
      contactId: string;
      name: string;
      email: string;
      phone: string | null;
      mobile: string | null;
      method: string;
    }> = [];

    const typedContacts = (contacts || []) as Contact[];
    for (const contact of typedContacts) {
      stats.processed++;
      
      try {
        let person = null;
        let method = "none";

        // Method 1: Try by apollo_id if available
        if (contact.apollo_id) {
          person = await enrichPersonById(apiKey, contact.apollo_id);
          if (person) {
            method = "apollo_id";
            stats.byApolloId++;
          }
        }

        // Method 2: Try by email if apollo_id didn't work
        if (!person && contact.email) {
          console.log(`[Re-enrich] Looking up by email: ${contact.email}`);
          person = await lookupByEmail(apiKey, contact.email);
          if (person) {
            method = "email";
            stats.byEmail++;
          }
        }

        if (!person) {
          console.log(`[Re-enrich] No match for: ${contact.first_name} ${contact.last_name}`);
          stats.skipped++;
          continue;
        }

        const phones = extractPersonMobile(person.phone_numbers);
        const nextMobile = phones.mobile;
        const nextPhone = phones.direct || phones.any;

        console.log(`[Re-enrich] Found phones for ${contact.first_name}: mobile=${nextMobile}, direct=${nextPhone}`);

        if (!nextMobile && !nextPhone) {
          stats.skipped++;
          continue;
        }

        if (!dryRun) {
          const updateData: Record<string, any> = {
            enrichment_status: "enriched",
            enriched_at: new Date().toISOString(),
          };

          // Only update if we have new data
          if (nextMobile) updateData.mobile = nextMobile;
          if (nextPhone) updateData.phone = nextPhone;
          
          // Save apollo_id if we didn't have it before
          if (!contact.apollo_id && person.id) {
            updateData.apollo_id = person.id;
          }

          const { error: updateError } = await insforge.database
            .from("contacts")
            .update(updateData)
            .eq("id", contact.id)
            .eq("user_id", userId);

          if (updateError) {
            console.error(`[Re-enrich] Update failed: ${updateError.message}`);
            stats.failed++;
            continue;
          }
        }

        updatesPreview.push({
          contactId: contact.id,
          name: `${contact.first_name} ${contact.last_name}`,
          email: contact.email || "",
          phone: nextPhone || null,
          mobile: nextMobile || null,
          method,
        });

        stats.updated++;
        
        // Rate limiting for Apollo API
        await new Promise((resolve) => setTimeout(resolve, 400));
      } catch (e: any) {
        console.error(`[Re-enrich] Error for ${contact.email}:`, e.message);
        stats.failed++;
      }
    }

    console.log(`[Re-enrich] Complete: ${stats.updated} updated, ${stats.skipped} skipped, ${stats.failed} failed`);

    return NextResponse.json({
      success: true,
      dryRun,
      stats,
      preview: updatesPreview.slice(0, 50),
    });
  } catch (error: any) {
    console.error("Re-enrich error:", error);
    return NextResponse.json(
      { error: error.message || "Re-enrich failed" },
      { status: 500 }
    );
  }
}
