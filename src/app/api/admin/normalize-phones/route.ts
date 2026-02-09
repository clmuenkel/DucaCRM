import { NextRequest, NextResponse } from "next/server";
import { insforge } from "@/lib/neon/server";
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
        // Always normalize, even if it looks like it might already be normalized
        const currentPhone = String(contact.phone).trim();
        const normalized = normalizeToE164(currentPhone);
        
        if (normalized) {
          const normalizedPhone = normalized.trim();
          
          // Always update if different (handles spaces, dashes, missing +, etc.)
          // Use strict comparison to catch any differences
          // Also check if current phone doesn't start with + (definitely needs update)
          const needsUpdatePhone = normalizedPhone !== currentPhone || !currentPhone.startsWith("+");
          
          if (needsUpdatePhone) {
            updates.phone = normalizedPhone;
            needsUpdate = true;
            console.log(`[Normalize] Contact ${contact.id}: phone "${currentPhone}" -> "${normalizedPhone}"`);
          }
        } else {
          // If normalization failed, log it
          console.warn(`[Normalize] Failed to normalize phone "${contact.phone}" for contact ${contact.id}`);
          errors.push(`Contact ${contact.id}: Could not normalize phone "${contact.phone}"`);
        }
      }

      if (contact.mobile) {
        const currentMobile = String(contact.mobile).trim();
        const normalized = normalizeToE164(currentMobile);
        
        if (normalized) {
          const normalizedMobile = normalized.trim();
          
          // Always update if different or doesn't start with +
          const needsUpdateMobile = normalizedMobile !== currentMobile || !currentMobile.startsWith("+");
          
          if (needsUpdateMobile) {
            updates.mobile = normalizedMobile;
            needsUpdate = true;
            console.log(`[Normalize] Contact ${contact.id}: mobile "${currentMobile}" -> "${normalizedMobile}"`);
          }
        } else {
          // If normalization failed, log it
          console.warn(`[Normalize] Failed to normalize mobile "${contact.mobile}" for contact ${contact.id}`);
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
          // Log successful update for debugging
          if (updates.phone) {
            console.log(`[Normalize] ✓ Updated contact ${contact.id} phone to "${updates.phone}"`);
          }
          if (updates.mobile) {
            console.log(`[Normalize] ✓ Updated contact ${contact.id} mobile to "${updates.mobile}"`);
          }
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
