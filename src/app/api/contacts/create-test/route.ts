import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_USER_ID } from "@/lib/default-user";

export const dynamic = 'force-dynamic';
export const runtime = 'edge';

/**
 * POST /api/contacts/create-test
 * Create a test contact for email testing
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const userId = DEFAULT_USER_ID;

    // Check if test contact already exists
    const { data: existing } = await supabase
      .from("contacts")
      .select("id")
      .eq("user_id", userId)
      .eq("email", "18cmuenkel@gmail.com")
      .maybeSingle();

    if (existing) {
      const typedExisting = existing as { id: string };
      return NextResponse.json({
        success: true,
        message: "Test contact already exists",
        contactId: typedExisting.id,
      });
    }

    // Create test contact
    const { data: contact, error } = await (supabase as any)
      .from("contacts")
      .insert({
        user_id: userId,
        first_name: "Carl-Luca",
        last_name: "Muenkel",
        email: "18cmuenkel@gmail.com",
        company_name: "Test Company",
        industry: "hvac",
        employee_count: 50,
        employee_range: "11-50",
        status: "active",
        stage: "fresh",
        cadence_status: "none",
        priority_score: 75,
      })
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
