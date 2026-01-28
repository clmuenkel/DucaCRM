import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_USER_ID } from "@/lib/default-user";

/**
 * POST /api/leads/manual-review
 * Manually update a lead's contact information after review
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { companyId, ownerName, email, phone } = body;

    if (!companyId) {
      return NextResponse.json(
        { error: "companyId is required" },
        { status: 400 }
      );
    }

    if (!ownerName && !email && !phone) {
      return NextResponse.json(
        { error: "At least one of ownerName, email, or phone is required" },
        { status: 400 }
      );
    }

    const supabase = createClient();
    const userId = DEFAULT_USER_ID;

    // Check if company exists
    const { data: company, error: companyError } = await (supabase as any)
      .from("lead_companies")
      .select("id, name, domain")
      .eq("id", companyId)
      .eq("user_id", userId)
      .single();

    if (companyError || !company) {
      return NextResponse.json(
        { error: "Company not found" },
        { status: 404 }
      );
    }

    // Parse name into first and last
    const nameParts = (ownerName || "").trim().split(/\s+/);
    const firstName = nameParts[0] || null;
    const lastName = nameParts.slice(1).join(" ") || null;

    // Check if there's an existing lead person for this company
    const { data: existingPerson } = await (supabase as any)
      .from("lead_people")
      .select("id")
      .eq("lead_company_id", companyId)
      .eq("is_primary_contact", true)
      .single();

    const personData = {
      user_id: userId,
      lead_company_id: companyId,
      full_name: ownerName || "Owner",
      first_name: firstName,
      last_name: lastName,
      title: "Owner",
      email: email || null,
      email_status: email ? "manual" : "unknown",
      email_verified: false, // Manual entries are not automatically verified
      phone: phone || null,
      source: "manual_review",
      confidence_score: 80, // Manual entries have good confidence
      is_decision_maker: true,
      is_primary_contact: true,
      needs_manual_review: false, // Mark as reviewed
    };

    if (existingPerson) {
      // Update existing person
      const { error: updateError } = await (supabase as any)
        .from("lead_people")
        .update(personData)
        .eq("id", existingPerson.id);

      if (updateError) {
        console.error("Error updating lead person:", updateError);
        return NextResponse.json(
          { error: updateError.message },
          { status: 500 }
        );
      }
    } else {
      // Insert new person
      const { error: insertError } = await (supabase as any)
        .from("lead_people")
        .insert(personData);

      if (insertError) {
        console.error("Error inserting lead person:", insertError);
        return NextResponse.json(
          { error: insertError.message },
          { status: 500 }
        );
      }
    }

    // Update company status
    await (supabase as any)
      .from("lead_companies")
      .update({
        enrichment_status: "manual",
        contact_type: email ? "dm_manual" : "pending",
      })
      .eq("id", companyId);

    return NextResponse.json({
      success: true,
      message: "Contact information updated successfully",
    });
  } catch (error: any) {
    console.error("Manual review API error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
