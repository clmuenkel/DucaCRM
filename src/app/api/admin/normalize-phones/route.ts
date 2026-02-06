import { NextRequest, NextResponse } from "next/server";
import { insforge } from "@/lib/insforge/server";
import { normalizeToE164 } from "@/lib/utils";
import { DEFAULT_USER_ID } from "@/lib/default-user";

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/normalize-phones
 * Normalize all phone numbers in the database to E.164 format
 */
export async function POST(request: NextRequest) {
  try {
    const userId = DEFAULT_USER_ID;
    
    // Get all contacts with phone numbers
    const { data: contacts, error } = await insforge.database
      .from("contacts")
      .select("id, phone, mobile")
      .eq("user_id", userId)
      .or("phone.not.is.null,mobile.not.is.null");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let updated = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const contact of contacts || []) {
      const updates: { phone?: string | null; mobile?: string | null } = {};
      let needsUpdate = false;

      if (contact.phone) {
        const normalized = normalizeToE164(contact.phone);
        if (normalized && normalized !== contact.phone) {
          updates.phone = normalized;
          needsUpdate = true;
        } else if (!normalized && contact.phone) {
          // If normalization failed, log it but don't update
          errors.push(`Contact ${contact.id}: Could not normalize phone "${contact.phone}"`);
        }
      }

      if (contact.mobile) {
        const normalized = normalizeToE164(contact.mobile);
        if (normalized && normalized !== contact.mobile) {
          updates.mobile = normalized;
          needsUpdate = true;
        } else if (!normalized && contact.mobile) {
          // If normalization failed, log it but don't update
          errors.push(`Contact ${contact.id}: Could not normalize mobile "${contact.mobile}"`);
        }
      }

      if (needsUpdate) {
        const { error: updateError } = await insforge.database
          .from("contacts")
          .update(updates)
          .eq("id", contact.id);

        if (updateError) {
          console.error(`Failed to update contact ${contact.id}:`, updateError);
          failed++;
          errors.push(`Contact ${contact.id}: ${updateError.message}`);
        } else {
          updated++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      updated,
      failed,
      total: contacts?.length || 0,
      errors: errors.slice(0, 50), // Limit errors returned
    });
  } catch (error: any) {
    console.error("[Normalize Phones] Error:", error);
    return NextResponse.json(
      { error: error.message || "Normalization failed" },
      { status: 500 }
    );
  }
}
