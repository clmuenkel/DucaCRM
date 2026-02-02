import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_USER_ID } from "@/lib/default-user";
import type { Contact } from "@/types/database";

export const dynamic = 'force-dynamic';
export const runtime = 'edge';

interface MarkWrongNumberRequest {
  contactId: string;
  phoneType: "mobile" | "office";
}

/**
 * POST /api/contacts/mark-wrong-number
 * Mark a phone number as wrong and delete it
 */
export async function POST(request: NextRequest) {
  try {
    const body: MarkWrongNumberRequest = await request.json();
    const { contactId, phoneType } = body;

    if (!contactId || !phoneType) {
      return NextResponse.json(
        { error: "contactId and phoneType are required" },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const userId = DEFAULT_USER_ID;

    // Get contact
    const { data: contact, error: fetchError } = await supabase
      .from("contacts")
      .select("*")
      .eq("id", contactId)
      .eq("user_id", userId)
      .single();

    if (fetchError || !contact) {
      return NextResponse.json(
        { error: "Contact not found" },
        { status: 404 }
      );
    }

    const typedContact = contact as Contact;
    const today = new Date().toISOString().split("T")[0];

    // Get the wrong number before deleting
    const wrongNumber = phoneType === "mobile" ? typedContact.mobile : typedContact.phone;

    // Update contact: delete the phone number and set flags
    const updateData: any = {
      wrong_number_flag: true,
      wrong_number_phone: wrongNumber,
      last_call_attempt_date: today,
      call_attempts: (typedContact.call_attempts || 0) + 1,
    };

    if (phoneType === "mobile") {
      updateData.mobile = null;
    } else {
      updateData.phone = null;
    }

    const { error: updateError } = await (supabase as any)
      .from("contacts")
      .update(updateData)
      .eq("id", contactId);

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      );
    }

    // Log activity
    await (supabase as any)
      .from("activity_log")
      .insert({
        user_id: userId,
        contact_id: contactId,
        activity_type: "wrong_number_marked",
        summary: `Wrong ${phoneType} number marked and removed: ${wrongNumber}`,
        metadata: {
          phone_type: phoneType,
          wrong_number: wrongNumber,
        },
      });

    return NextResponse.json({
      success: true,
      message: "Wrong number marked and removed",
      wrongNumber,
    });
  } catch (error: any) {
    console.error("Mark wrong number error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to mark wrong number" },
      { status: 500 }
    );
  }
}
