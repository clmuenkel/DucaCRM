import { NextRequest, NextResponse } from "next/server";
import { insforge } from "@/lib/insforge/server";
import { DEFAULT_USER_ID } from "@/lib/default-user";
import type { Contact } from "@/types/database";

export const dynamic = 'force-dynamic';

interface CreateReferralRequest {
  sourceContactId: string;
  firstName: string;
  lastName?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  title?: string;
  notes?: string;
}

/**
 * POST /api/contacts/create-referral
 * Create a new contact from a referral (same company as source)
 */
export async function POST(request: NextRequest) {
  try {
    const body: CreateReferralRequest = await request.json();
    const {
      sourceContactId,
      firstName,
      lastName,
      email,
      phone,
      mobile,
      title,
      notes,
    } = body;

    if (!sourceContactId || !firstName) {
      return NextResponse.json(
        { error: "sourceContactId and firstName are required" },
        { status: 400 }
      );
    }

        const userId = DEFAULT_USER_ID;

    // Get source contact to copy company data
    const { data: sourceContact, error: fetchError } = await insforge.database
      .from("contacts")
      .select("*")
      .eq("id", sourceContactId)
      .eq("user_id", userId)
      .single();

    if (fetchError || !sourceContact) {
      return NextResponse.json(
        { error: "Source contact not found" },
        { status: 404 }
      );
    }

    const typedSource = sourceContact as Contact;

    // Create new contact with same company data
    const { data: newContact, error: insertError } = await insforge.database
      .from("contacts")
      .insert([{
        user_id: userId,
        company_id: typedSource.company_id,
        first_name: firstName,
        last_name: lastName || null,
        email: email || null,
        phone: phone || null,
        mobile: mobile || null,
        title: title || null,
        company_name: typedSource.company_name,
        company_domain: typedSource.company_domain,
        industry: typedSource.industry,
        employee_count: typedSource.employee_count,
        employee_range: typedSource.employee_range,
        city: typedSource.city,
        state: typedSource.state,
        country: typedSource.country,
        source: "referral",
        direct_referral_contact_id: sourceContactId,
        direct_referral_note: notes || null,
        stage: "fresh",
        status: "active",
        priority_score: typedSource.priority_score || 0,
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json(
        { error: insertError.message },
        { status: 500 }
      );
    }

    // Log activity for both contacts
    await insforge.database
      .from("activity_log")
      .insert([
        {
          user_id: userId,
          contact_id: sourceContactId,
          activity_type: "referral_given",
          summary: `Referred ${firstName} ${lastName || ""}`,
          metadata: {
            referred_contact_id: newContact.id,
          },
        },
        {
          user_id: userId,
          contact_id: newContact.id,
          activity_type: "referral_received",
          summary: `Referred by ${typedSource.first_name} ${typedSource.last_name || ""}`,
          metadata: {
            source_contact_id: sourceContactId,
          },
        },
      ]);

    return NextResponse.json({
      success: true,
      message: "Referral contact created successfully",
      contactId: newContact.id,
    });
  } catch (error: any) {
    console.error("Create referral error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create referral" },
      { status: 500 }
    );
  }
}
