import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_USER_ID } from "@/lib/default-user";
import { syncEmailActivityForContacts } from "@/lib/instantly/client";

/**
 * POST /api/instantly/sync
 * Sync email activity (opens, replies) from Instantly to contacts
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    const userId = DEFAULT_USER_ID;

    // Get cadence settings
    const { data: settings } = await (supabase as any)
      .from("cadence_settings")
      .select("*")
      .eq("user_id", userId)
      .single();

    const apiKey = settings?.instantly_api_key || process.env.INSTANTLY_API_KEY;
    const campaignId = settings?.instantly_campaign_id;

    if (!apiKey) {
      return NextResponse.json(
        { error: "Instantly API key not configured" },
        { status: 400 }
      );
    }

    if (!campaignId) {
      return NextResponse.json(
        { error: "No Instantly campaign selected" },
        { status: 400 }
      );
    }

    // Get all contacts with active cadence that have emails
    const { data: contacts, error: fetchError } = await supabase
      .from("contacts")
      .select("id, email")
      .eq("user_id", userId)
      .eq("cadence_status", "active")
      .not("email", "is", null);

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!contacts || contacts.length === 0) {
      return NextResponse.json({
        message: "No active contacts to sync",
        synced: 0,
      });
    }

    // Get emails to sync
    const emails = contacts.map((c: any) => c.email).filter(Boolean);

    // Sync from Instantly
    const { synced, activities } = await syncEmailActivityForContacts(
      apiKey,
      campaignId,
      emails
    );

    // Update contacts with activity data
    let updated = 0;
    let hotLeads = 0;
    let replied = 0;

    for (const activity of activities) {
      const contact = contacts.find((c: any) => c.email === activity.email);
      if (!contact) continue;

      const { error: updateError } = await supabase
        .from("contacts")
        .update({
          email_opened: activity.opened,
          email_open_count: activity.open_count,
          email_replied: activity.replied,
          last_email_opened_at: activity.last_opened_at || null,
        })
        .eq("id", contact.id);

      if (!updateError) {
        updated++;
        if (activity.opened && !activity.replied) hotLeads++;
        if (activity.replied) replied++;
      }
    }

    return NextResponse.json({
      success: true,
      message: `Synced ${updated} contacts from Instantly`,
      stats: {
        total: contacts.length,
        synced: updated,
        hotLeads, // Opened but not replied - prioritize calling
        replied,
      },
    });
  } catch (error: any) {
    console.error("Instantly sync error:", error);
    return NextResponse.json(
      { error: error.message || "Sync failed" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/instantly/sync
 * Get sync status and last activity summary
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createClient();
    const userId = DEFAULT_USER_ID;

    // Get counts of email activity
    const { data: stats } = await supabase
      .from("contacts")
      .select("email_opened, email_replied")
      .eq("user_id", userId)
      .eq("cadence_status", "active");

    const counts = {
      total: stats?.length || 0,
      opened: stats?.filter((c: any) => c.email_opened).length || 0,
      replied: stats?.filter((c: any) => c.email_replied).length || 0,
      hotLeads: stats?.filter((c: any) => c.email_opened && !c.email_replied).length || 0,
    };

    return NextResponse.json({
      stats: counts,
      openRate: counts.total > 0 ? Math.round((counts.opened / counts.total) * 100) : 0,
      replyRate: counts.total > 0 ? Math.round((counts.replied / counts.total) * 100) : 0,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
