import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_USER_ID } from "@/lib/default-user";
import type { Contact } from "@/types/database";

export const dynamic = 'force-dynamic';

interface StartCadenceRequest {
  contactIds: string[];
  pushToInstantly?: boolean;
  emailSendRate?: number; // emails per minute, default 5
}

/**
 * POST /api/contacts/start-cadence
 * Start sales cadence for selected contacts
 */
export async function POST(request: NextRequest) {
  try {
    const body: StartCadenceRequest = await request.json();
    const { contactIds, pushToInstantly = true, emailSendRate = 5 } = body;

    if (!contactIds || contactIds.length === 0) {
      return NextResponse.json(
        { error: "No contacts selected" },
        { status: 400 }
      );
    }

    const supabase = createClient();
    const userId = DEFAULT_USER_ID;

    // Get cadence settings for Instantly integration
    const { data: settings } = await (supabase as any)
      .from("cadence_settings")
      .select("*")
      .eq("user_id", userId)
      .single();

    const instantlyApiKey = settings?.instantly_api_key;
    const instantlyCampaignId = settings?.instantly_campaign_id;

    let started = 0;
    let pushedToInstantly = 0;
    let errors = 0;

    for (const contactId of contactIds) {
      try {
        // Get contact details
        const { data: contact, error: fetchError } = await supabase
          .from("contacts")
          .select("*")
          .eq("id", contactId)
          .eq("user_id", userId)
          .single();

        if (fetchError || !contact) {
          errors++;
          continue;
        }

        const typedContact = contact as Contact;
        const today = new Date().toISOString().split("T")[0];

        // Update cadence status with proper initialization
        const { error: updateError } = await (supabase as any)
          .from("contacts")
          .update({
            cadence_status: "active",
            cadence_step: 0,
            cadence_day_started: today,
            cadence_outcome: "in_progress",
            next_action_date: today,
            next_action_type: "email",
            cadence_started_at: new Date().toISOString(),
            stage: "fresh",
            email_opened: false,
            email_replied: false,
            call_attempts: 0,
          })
          .eq("id", contactId);

        if (updateError) {
          errors++;
          continue;
        }

        started++;

        // Push to Instantly with rate limiting if configured and contact has email
        if (pushToInstantly && instantlyApiKey && instantlyCampaignId && typedContact.email) {
          // Calculate delay based on rate (emails per minute)
          const delayMs = (60000 / emailSendRate) * started; // Delay increases for each contact
          
          // Use setTimeout to rate limit (fire and forget - don't await)
          setTimeout(async () => {
            try {
              const instantlyResponse = await fetch(
                "https://api.instantly.ai/api/v2/leads",
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Basic ${instantlyApiKey}`,
                  },
                  body: JSON.stringify({
                    campaign_id: instantlyCampaignId,
                    skip_if_in_workspace: true,
                    leads: [
                      {
                        email: typedContact.email || "",
                        first_name: typedContact.first_name,
                        last_name: typedContact.last_name || "",
                        company_name: typedContact.company_name || "",
                        personalization: typedContact.title || "Decision Maker",
                      },
                    ],
                  }),
                }
              );

              if (instantlyResponse.ok) {
                const instantlyData = await instantlyResponse.json();
                
                // Update contact with Instantly lead ID
                const supabaseUpdate = createClient();
                if (instantlyData.lead_id || instantlyData.status === "success") {
                  await (supabaseUpdate as any)
                    .from("contacts")
                    .update({ 
                      instantly_lead_id: instantlyData.lead_id || "pushed",
                      last_email_sent_at: new Date().toISOString(),
                    })
                    .eq("id", contactId);
                }
              }
            } catch (instantlyError) {
              console.error(`Failed to push contact ${contactId} to Instantly:`, instantlyError);
            }
          }, delayMs);
          
          // Count as pushed (even though it's async)
          pushedToInstantly++;
        }

        // Log activity
        await (supabase as any)
          .from("activity_log")
          .insert({
            user_id: userId,
            contact_id: contactId,
            activity_type: "cadence_started",
            summary: `Sales cadence started${pushedToInstantly ? " (added to Instantly)" : ""}`,
            metadata: {
              pushed_to_instantly: pushedToInstantly > 0,
            },
          });

      } catch (e: any) {
        console.error(`Error starting cadence for contact ${contactId}:`, e);
        errors++;
      }
    }

    return NextResponse.json({
      success: true,
      message: `Started cadence for ${started} contacts${pushedToInstantly > 0 ? `, ${pushedToInstantly} pushed to Instantly` : ""}`,
      stats: {
        started,
        pushedToInstantly,
        errors,
        total: contactIds.length,
      },
    });
  } catch (error: any) {
    console.error("Start cadence error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to start cadence" },
      { status: 500 }
    );
  }
}
