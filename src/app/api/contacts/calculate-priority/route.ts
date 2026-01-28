import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_USER_ID } from "@/lib/default-user";
import type { Contact } from "@/types/database";

export const dynamic = 'force-dynamic';

/**
 * Calculate priority score for a contact
 * - Verified DM (Apollo found): +40 points
 * - Email verified (not generic): +30 points
 * - Has direct phone: +20 points
 * - Industry match: +10 points
 */
function calculatePriorityScore(contact: {
  source: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  industry: string | null;
}): number {
  let score = 0;

  // Verified DM (Apollo found): +40 points
  if (contact.source && (
    contact.source.toLowerCase().includes("apollo") ||
    contact.source.toLowerCase().includes("lead gen") ||
    contact.source.toLowerCase().includes("bulk_")
  )) {
    score += 40;
  }

  // Email verified (not generic): +30 points
  if (contact.email && 
    !contact.email.toLowerCase().includes("info@") &&
    !contact.email.toLowerCase().includes("contact@") &&
    !contact.email.toLowerCase().includes("sales@") &&
    !contact.email.toLowerCase().includes("hello@") &&
    !contact.email.toLowerCase().includes("admin@")
  ) {
    score += 30;
  }

  // Has direct phone: +20 points
  if (contact.phone || contact.mobile) {
    score += 20;
  }

  // Industry match: +10 points
  const targetIndustries = ["hvac", "plumbing", "roofing", "electrical", "solar", "construction"];
  if (contact.industry && targetIndustries.includes(contact.industry.toLowerCase())) {
    score += 10;
  }

  return score;
}

/**
 * POST /api/contacts/calculate-priority
 * Recalculate priority scores for all contacts
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    const userId = DEFAULT_USER_ID;

    // Get all contacts that need priority calculation
    const { data: contacts, error: fetchError } = await supabase
      .from("contacts")
      .select("id, source, email, phone, mobile, industry, priority_score")
      .eq("user_id", userId)
      .eq("status", "active");

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!contacts || contacts.length === 0) {
      return NextResponse.json({
        message: "No contacts to update",
        updated: 0,
      });
    }

    const typedContacts = (contacts || []) as Contact[];
    let updated = 0;
    let errors = 0;

    // Update each contact's priority score
    for (const contact of typedContacts) {
      const newScore = calculatePriorityScore(contact);
      
      // Only update if score changed
      if (newScore !== (contact.priority_score ?? 0)) {
        const { error: updateError } = await (supabase as any)
          .from("contacts")
          .update({ priority_score: newScore })
          .eq("id", contact.id);

        if (updateError) {
          console.error(`Failed to update contact ${contact.id}:`, updateError);
          errors++;
        } else {
          updated++;
        }
      }
    }

    return NextResponse.json({
      message: `Updated priority scores for ${updated} contacts`,
      total: typedContacts.length,
      updated,
      errors,
    });
  } catch (error: any) {
    console.error("Calculate priority error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to calculate priorities" },
      { status: 500 }
    );
  }
}
