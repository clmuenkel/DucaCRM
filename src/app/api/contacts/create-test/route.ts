import { NextRequest, NextResponse } from "next/server";
import { insforge } from "@/lib/insforge/server";
import { DEFAULT_USER_ID } from "@/lib/default-user";

export const dynamic = 'force-dynamic';

/**
 * POST /api/contacts/create-test
 * Create a test contact for email testing
 */
export async function POST(request: NextRequest) {
  try {
        const userId = DEFAULT_USER_ID;

    // Check if test contact already exists
    const { data: existing } = await insforge.database
      .from("contacts")
      .select("id")
      .eq("user_id", userId)
      .eq("email", "18cmuenkel@gmail.com")
      .maybeSingle();

    if (existing) {
      const typedExisting = existing as { id: string };
      // Update existing contact with phone number
      const { error: updateError } = await insforge.database
        .from("contacts")
        .update({
          phone: "+18322941575",
        })
        .eq("id", typedExisting.id);
      
      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }
      
      return NextResponse.json({
        success: true,
        message: "Test contact updated with phone number",
        contactId: typedExisting.id,
      });
    }

    // Create test contact
    const { data: contact, error } = await insforge.database
      .from("contacts")
      .insert([{
        user_id: userId,
        first_name: "Carl-Luca",
        last_name: "Muenkel",
        email: "18cmuenkel@gmail.com",
        phone: "+18322941575",
        company_name: "Test Company",
        industry: "swag",
        employee_count: 50,
        employee_range: "11-50",
        status: "active",
        stage: "fresh",
        cadence_status: "none",
        priority_score: 75,
      }])
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: "Test contact created",
      contactId: contact.id,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to create test contact" },
      { status: 500 }
    );
  }
}
