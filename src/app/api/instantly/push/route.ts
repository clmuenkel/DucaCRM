import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_USER_ID } from "@/lib/default-user";
import { addLeadForCadence, type CadenceLead } from "@/lib/instantly/client";

export const dynamic = 'force-dynamic';

interface ContactToPush {
  email: string;
  first_name?: string;
  last_name?: string;
  company_name?: string;
  title?: string;
  industry?: string;
  city?: string;
}

interface PushRequest {
  contacts: ContactToPush[];
}

/**
 * POST /api/instantly/push
 * Push contacts to Instantly campaign for email cadence
 */
export async function POST(request: NextRequest) {
  try {
    const body: PushRequest = await request.json();
    const { contacts } = body;

    if (!contacts || contacts.length === 0) {
      return NextResponse.json(
        { error: "No contacts to push" },
        { status: 400 }
      );
    }

    const supabase = createClient();
    const userId = DEFAULT_USER_ID;

    // Get Instantly config from environment
    const apiKey = process.env.INSTANTLY_API_KEY;
    const campaignId = process.env.INSTANTLY_CAMPAIGN_ID;

    if (!apiKey) {
      return NextResponse.json(
        { error: "Instantly API key not configured. Add it in Settings." },
        { status: 400 }
      );
    }

    if (!campaignId) {
      return NextResponse.json(
        { error: "No Instantly campaign selected. Configure in Settings." },
        { status: 400 }
      );
    }

    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    // Push each contact to Instantly
    for (const contact of contacts) {
      if (!contact.email) {
        failed++;
        continue;
      }

      const lead: CadenceLead = {
        email: contact.email,
        first_name: contact.first_name || "",
        last_name: contact.last_name || "",
        company_name: contact.company_name || "",
        title: contact.title || "Owner",
        industry: contact.industry || "home services",
        city: contact.city || "",
      };

      const result = await addLeadForCadence(apiKey, campaignId, lead);

      if (result.success) {
        success++;
      } else {
        failed++;
        if (result.error) {
          errors.push(`${contact.email}: ${result.error}`);
        }
      }

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return NextResponse.json({
      success: true,
      message: `Pushed ${success} contacts to Instantly (${failed} failed)`,
      stats: {
        total: contacts.length,
        success,
        failed,
      },
      errors: errors.slice(0, 10), // Only return first 10 errors
    });
  } catch (error: any) {
    console.error("Instantly push error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to push to Instantly" },
      { status: 500 }
    );
  }
}
