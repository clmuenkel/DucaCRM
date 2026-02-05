import { NextRequest, NextResponse } from "next/server";
import { insforge } from "@/lib/insforge/server";
import { DEFAULT_USER_ID } from "@/lib/default-user";
import { inferCompanyTags } from "@/lib/csv-parser";

export const dynamic = 'force-dynamic';

/**
 * POST /api/contacts/[id]/detect-industries
 * Auto-detect industries from company name
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: contactId } = await params;

    if (!contactId) {
      return NextResponse.json(
        { error: "Contact ID is required" },
        { status: 400 }
      );
    }

        const userId = DEFAULT_USER_ID;

    // Get contact
    const { data: contact, error: fetchError } = await supabase
      .from("contacts")
      .select("company_name, industries")
      .eq("id", contactId)
      .eq("user_id", userId)
      .single();

    if (fetchError || !contact) {
      return NextResponse.json(
        { error: "Contact not found" },
        { status: 404 }
      );
    }

    const typedContact = contact as { company_name: string | null; industries: string[] | null };
    const companyName = typedContact.company_name || "";
    
    if (!companyName) {
      return NextResponse.json(
        { error: "Contact has no company name" },
        { status: 400 }
      );
    }

    // Detect industries
    const detectedIndustries = inferCompanyTags(companyName);

    return NextResponse.json({
      success: true,
      companyName,
      detectedIndustries,
      currentIndustries: typedContact.industries || [],
    });
  } catch (error: any) {
    console.error("Detect industries error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to detect industries" },
      { status: 500 }
    );
  }
}
