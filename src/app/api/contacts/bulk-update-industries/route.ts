import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_USER_ID } from "@/lib/default-user";

export const dynamic = 'force-dynamic';

interface BulkUpdateIndustriesRequest {
  contactIds: string[];
  industries: string[];
  action: "set" | "add" | "remove";
}

/**
 * POST /api/contacts/bulk-update-industries
 * Bulk update industries for multiple contacts
 */
export async function POST(request: NextRequest) {
  try {
    const body: BulkUpdateIndustriesRequest = await request.json();
    const { contactIds, industries, action } = body;

    if (!contactIds || contactIds.length === 0) {
      return NextResponse.json(
        { error: "contactIds is required" },
        { status: 400 }
      );
    }

    if (!industries || industries.length === 0) {
      return NextResponse.json(
        { error: "industries is required" },
        { status: 400 }
      );
    }

    if (!["set", "add", "remove"].includes(action)) {
      return NextResponse.json(
        { error: "action must be 'set', 'add', or 'remove'" },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const userId = DEFAULT_USER_ID;

    // Get current industries for all contacts
    const { data: contacts, error: fetchError } = await supabase
      .from("contacts")
      .select("id, industries")
      .eq("user_id", userId)
      .in("id", contactIds);

    if (fetchError) {
      return NextResponse.json(
        { error: fetchError.message },
        { status: 500 }
      );
    }

    let updated = 0;
    let errors = 0;

    // Update each contact
    for (const contact of contacts || []) {
      try {
        const typedContact = contact as { id: string; industries: string[] | null };
        let newIndustries: string[] = [];

        switch (action) {
          case "set":
            newIndustries = industries;
            break;
          case "add":
            const current = (typedContact.industries || []) as string[];
            newIndustries = [...new Set([...current, ...industries])];
            break;
          case "remove":
            const currentRemove = (typedContact.industries || []) as string[];
            newIndustries = currentRemove.filter((ind) => !industries.includes(ind));
            break;
        }

        const { error: updateError } = await (supabase as any)
          .from("contacts")
          .update({ industries: newIndustries })
          .eq("id", typedContact.id)
          .eq("user_id", userId);

        if (updateError) {
          errors++;
        } else {
          updated++;
        }
      } catch (error) {
        errors++;
      }
    }

    return NextResponse.json({
      success: true,
      message: `Updated ${updated} contacts, ${errors} errors`,
      stats: {
        updated,
        errors,
        total: contactIds.length,
      },
    });
  } catch (error: any) {
    console.error("Bulk update industries error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update industries" },
      { status: 500 }
    );
  }
}
