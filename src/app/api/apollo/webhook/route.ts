import { NextRequest, NextResponse } from "next/server";
import { insforge } from "@/lib/insforge/server";

export const dynamic = 'force-dynamic';

/**
 * Apollo Webhook Endpoint
 * 
 * Receives phone numbers from Apollo after a reveal_phone_number request.
 * Apollo sends this webhook 2-5 minutes after the initial enrichment call.
 * 
 * Expected payload format:
 * {
 *   "status": "success",
 *   "total_requested_enrichments": 1,
 *   "unique_enriched_records": 1,
 *   "missing_records": 0,
 *   "credits_consumed": 1,
 *   "people": [
 *     {
 *       "id": "587cf802f65125cad923a266",
 *       "status": "success",
 *       "phone_numbers": [
 *         {
 *           "raw_number": "+1 555-123-4567",
 *           "sanitized_number": "+15551234567",
 *           "type_cd": "mobile",
 *           "confidence_cd": "high",
 *           ...
 *         }
 *       ]
 *     }
 *   ]
 * }
 */

interface ApolloPhoneNumber {
  raw_number?: string;
  sanitized_number?: string;
  type_cd?: string;
  confidence_cd?: string;
  status_cd?: string;
}

interface ApolloWebhookPerson {
  id: string;
  status: string;
  email?: string; // Apollo may include email in webhook
  first_name?: string;
  last_name?: string;
  phone_numbers?: ApolloPhoneNumber[];
}

interface ApolloWebhookPayload {
  status: string;
  total_requested_enrichments?: number;
  unique_enriched_records?: number;
  missing_records?: number;
  credits_consumed?: number;
  people?: ApolloWebhookPerson[];
}

/**
 * Extract the best mobile number from Apollo's phone_numbers array
 */
function extractBestMobile(phoneNumbers: ApolloPhoneNumber[]): string | null {
  if (!phoneNumbers || phoneNumbers.length === 0) return null;

  // Priority: mobile > other (non-HQ) > any
  const mobile = phoneNumbers.find(
    (p) => p.type_cd === "mobile" && p.sanitized_number
  );
  if (mobile?.sanitized_number) return mobile.sanitized_number;

  // Next: direct dial or other personal numbers
  const direct = phoneNumbers.find(
    (p) =>
      (p.type_cd === "direct_dial" || p.type_cd === "other") &&
      p.sanitized_number
  );
  if (direct?.sanitized_number) return direct.sanitized_number;

  // Fallback: any number that's not HQ
  const any = phoneNumbers.find(
    (p) =>
      p.type_cd !== "work_hq" &&
      p.type_cd !== "corporate_hq" &&
      p.sanitized_number
  );
  if (any?.sanitized_number) return any.sanitized_number;

  return null;
}

/**
 * POST /api/apollo/webhook
 * Receives phone reveal data from Apollo
 */
export async function POST(request: NextRequest) {
  try {
    const payload: ApolloWebhookPayload = await request.json();

    console.log("[Apollo Webhook] ========== WEBHOOK RECEIVED ==========");
    console.log("[Apollo Webhook] Payload:", JSON.stringify(payload, null, 2));

    if (payload.status !== "success") {
      console.error("[Apollo Webhook] Non-success status:", payload.status);
      return NextResponse.json({ received: true, status: "ignored" });
    }

    const people = payload.people || [];
    if (people.length === 0) {
      console.log("[Apollo Webhook] No people in payload");
      return NextResponse.json({ received: true, updated: 0 });
    }

        let updated = 0;
    let failed = 0;
    const results: Array<{ apolloId: string; mobile: string; method: string; success: boolean; error?: string }> = [];

    for (const person of people) {
      if (person.status !== "success") {
        console.log(`[Apollo Webhook] Skipping person ${person.id}: status=${person.status}`);
        continue;
      }

      const phoneNumbers = person.phone_numbers || [];
      if (phoneNumbers.length === 0) {
        console.log(`[Apollo Webhook] No phone numbers for person ${person.id}`);
        continue;
      }

      const mobile = extractBestMobile(phoneNumbers);
      if (!mobile) {
        console.log(`[Apollo Webhook] No usable mobile for person ${person.id}`);
        continue;
      }

      console.log(`[Apollo Webhook] Processing: apollo_id=${person.id}, mobile=${mobile}`);

      // ========== STEP 1: Verify contact exists by apollo_id ==========
      const { data: existingByApolloId, error: lookupError } = await insforge.database
        .from("contacts")
        .select("id, email, first_name, last_name, phone, mobile")
        .eq("apollo_id", person.id)
        .maybeSingle();

      if (lookupError) {
        console.error(`[Apollo Webhook] Lookup error for apollo_id ${person.id}:`, lookupError.message);
      }

      console.log(`[Apollo Webhook] Lookup by apollo_id: ${existingByApolloId ? `FOUND (id=${existingByApolloId.id}, email=${existingByApolloId.email})` : "NOT FOUND"}`);

      let updateMethod = "none";
      let updateSuccess = false;
      let updateError = "";

      // ========== STEP 2: Try update by apollo_id ==========
      if (existingByApolloId) {
        const { data: updateResult, error: updateErr } = await insforge.database
          .from("contacts")
          .update({
            mobile: mobile,
            phone: mobile, // Also set as primary phone
            updated_at: new Date().toISOString(),
          })
          .eq("apollo_id", person.id)
          .select("id, email, mobile");

        if (updateErr) {
          console.error(`[Apollo Webhook] Update by apollo_id FAILED:`, updateErr.message);
          updateError = updateErr.message;
        } else if (updateResult && updateResult.length > 0) {
          console.log(`[Apollo Webhook] ✓ Update by apollo_id SUCCESS: ${updateResult.length} row(s) updated`);
          updateMethod = "apollo_id";
          updateSuccess = true;
          updated++;
        } else {
          console.log(`[Apollo Webhook] Update by apollo_id returned 0 rows (unexpected)`);
          updateError = "0 rows updated despite contact existing";
        }
      }

      // ========== STEP 3: Fallback - try update by email from phone_reveal_requests ==========
      if (!updateSuccess) {
        console.log(`[Apollo Webhook] Trying fallback: lookup email from phone_reveal_requests...`);
        
        // Get the email from our tracking table
        const { data: trackingRecord } = await insforge.database
          .from("phone_reveal_requests")
          .select("contact_id")
          .eq("apollo_id", person.id)
          .eq("status", "pending")
          .maybeSingle();

        if (trackingRecord?.contact_id) {
          console.log(`[Apollo Webhook] Found tracking record, contact_id=${trackingRecord.contact_id}`);
          
          const { data: updateResult, error: updateErr } = await insforge.database
            .from("contacts")
            .update({
              mobile: mobile,
              phone: mobile,
              updated_at: new Date().toISOString(),
            })
            .eq("id", trackingRecord.contact_id)
            .select("id, email, mobile");

          if (updateErr) {
            console.error(`[Apollo Webhook] Update by contact_id FAILED:`, updateErr.message);
            updateError = updateErr.message;
          } else if (updateResult && updateResult.length > 0) {
            console.log(`[Apollo Webhook] ✓ Update by contact_id SUCCESS: ${updateResult[0].email} now has mobile=${mobile}`);
            updateMethod = "contact_id_fallback";
            updateSuccess = true;
            updated++;
          }
        } else {
          console.log(`[Apollo Webhook] No tracking record found for apollo_id ${person.id}`);
        }
      }

      // ========== STEP 4: Last resort - search contacts by email if Apollo included it ==========
      if (!updateSuccess && person.email) {
        console.log(`[Apollo Webhook] Trying last resort: update by email=${person.email}`);
        
        const { data: updateResult, error: updateErr } = await insforge.database
          .from("contacts")
          .update({
            mobile: mobile,
            phone: mobile,
            apollo_id: person.id, // Also save the apollo_id for future webhooks
            updated_at: new Date().toISOString(),
          })
          .eq("email", person.email)
          .select("id, email, mobile");

        if (updateErr) {
          console.error(`[Apollo Webhook] Update by email FAILED:`, updateErr.message);
          updateError = updateErr.message;
        } else if (updateResult && updateResult.length > 0) {
          console.log(`[Apollo Webhook] ✓ Update by email SUCCESS: ${updateResult.length} row(s) updated`);
          updateMethod = "email_fallback";
          updateSuccess = true;
          updated++;
        }
      }

      // Track result
      if (!updateSuccess) {
        failed++;
        console.error(`[Apollo Webhook] ✗ FAILED to update contact for apollo_id=${person.id}, mobile=${mobile}`);
      }

      results.push({
        apolloId: person.id,
        mobile,
        method: updateMethod,
        success: updateSuccess,
        error: updateError || undefined,
      });

      // Update tracking table
      try {
        await insforge.database
          .from("phone_reveal_requests")
          .update({
            status: updateSuccess ? "completed" : "failed",
            mobile_number: mobile,
            completed_at: new Date().toISOString(),
            error_message: updateError || null,
          })
          .eq("apollo_id", person.id)
          .eq("status", "pending");
      } catch {
        // Table may not exist yet, that's okay
      }
    }

    console.log("[Apollo Webhook] ========== WEBHOOK COMPLETE ==========");
    console.log(`[Apollo Webhook] Results: ${updated} updated, ${failed} failed, ${people.length} total`);
    console.log("[Apollo Webhook] Details:", JSON.stringify(results, null, 2));

    return NextResponse.json({
      received: true,
      updated,
      failed,
      total: people.length,
      results,
    });
  } catch (error: any) {
    console.error("[Apollo Webhook] Error processing webhook:", error);
    return NextResponse.json(
      { error: error.message || "Webhook processing failed" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/apollo/webhook
 * Health check endpoint (for testing)
 */
export async function GET() {
  return NextResponse.json({
    status: "ok",
    endpoint: "Apollo Phone Reveal Webhook",
    timestamp: new Date().toISOString(),
  });
}
