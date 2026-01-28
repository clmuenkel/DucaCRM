import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_USER_ID } from "@/lib/default-user";
import { addLeadsToCampaign, type InstantlyLead } from "@/lib/instantly/client";

interface PushLeadsRequest {
  contactIds: string[];
}

/**
 * POST /api/instantly/push-leads
 * Push contacts to Instantly campaign
 */
export async function POST(request: NextRequest) {
  try {
    const body: PushLeadsRequest = await request.json();
    const { contactIds } = body;

    if (!contactIds || contactIds.length === 0) {
      return NextResponse.json(
        { error: "No contacts provided" },
        { status: 400 }
      );
    }

    const supabase = createClient();
    const userId = DEFAULT_USER_ID;

    // Get Instantly settings
    const { data: settings } = await (supabase as any)
      .from("cadence_settings")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (!settings?.instantly_api_key) {
      return NextResponse.json(
        { error: "Instantly API key not configured. Go to Settings to add it." },
        { status: 400 }
      );
    }

    if (!settings?.instantly_campaign_id) {
      return NextResponse.json(
        { error: "No Instantly campaign selected. Go to Settings to select one." },
        { status: 400 }
      );
    }

    // Fetch contacts
    const { data: contacts, error: fetchError } = await supabase
      .from("contacts")
      .select("*")
      .eq("user_id", userId)
      .in("id", contactIds);

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!contacts || contacts.length === 0) {
      return NextResponse.json(
        { error: "No contacts found" },
        { status: 404 }
      );
    }

    // Filter contacts that have emails and haven't been pushed yet
    const eligibleContacts = contacts.filter(
      (c: any) => c.email && !c.instantly_lead_id
    );

    if (eligibleContacts.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No new contacts to push (all already in Instantly or missing email)",
        stats: { pushed: 0, skipped: contacts.length },
      });
    }

    // Prepare leads for Instantly
    const leads: InstantlyLead[] = eligibleContacts.map((c: any) => ({
      email: c.email,
      first_name: c.first_name || "",
      last_name: c.last_name || "",
      company_name: c.company_name || "",
      personalization: c.title || "Decision Maker",
      phone: c.phone || c.mobile || "",
    }));

    // Push to Instantly
    const result = await addLeadsToCampaign(
      settings.instantly_api_key,
      settings.instantly_campaign_id,
      leads
    );

    // Update contacts with Instantly status
    if (result.success > 0) {
      const pushedEmails = leads.slice(0, result.success).map(l => l.email);
      
      await supabase
        .from("contacts")
        .update({
          instantly_lead_id: "pushed",
          cadence_status: "active",
          cadence_started_at: new Date().toISOString(),
        })
        .eq("user_id", userId)
        .in("email", pushedEmails);
    }

    return NextResponse.json({
      success: true,
      message: `Pushed ${result.success} contacts to Instantly${result.failed > 0 ? `, ${result.failed} failed` : ""}`,
      stats: {
        pushed: result.success,
        failed: result.failed,
        skipped: contacts.length - eligibleContacts.length,
        errors: result.errors,
      },
    });
  } catch (error: any) {
    console.error("Push to Instantly error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to push leads" },
      { status: 500 }
    );
  }
}
