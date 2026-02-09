import { NextRequest, NextResponse } from "next/server";
import { insforge } from "@/lib/neon/server";

export const dynamic = 'force-dynamic';

// POST /api/contacts/[id]/referral - Set a direct referral for a contact
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
        const { id } = await params;
    const body = await request.json();

    const { referrer_id, note } = body;

    if (!referrer_id) {
      return NextResponse.json(
        { error: "referrer_id is required" },
        { status: 400 }
      );
    }

    // Verify the referrer exists
    const { data: referrer, error: referrerError } = await insforge.database
      .from("contacts")
      .select("id, first_name, last_name, title")
      .eq("id", referrer_id)
      .single();

    if (referrerError || !referrer) {
      return NextResponse.json(
        { error: "Referrer contact not found" },
        { status: 404 }
      );
    }

    // Update the contact with the referral
    const { data, error } = await insforge.database
      .from("contacts")
      .update({
        direct_referral_contact_id: referrer_id,
        direct_referral_note: note || null,
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      if ((error as any).code === "PGRST116" || error.message?.includes("No rows")) {
        return NextResponse.json({ error: "Contact not found" }, { status: 404 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ...data,
      referrer,
    });
  } catch (error: any) {
    console.error("Set referral error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to set referral" },
      { status: 500 }
    );
  }
}

// DELETE /api/contacts/[id]/referral - Remove direct referral from a contact
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
        const { id } = await params;

    const { data, error } = await insforge.database
      .from("contacts")
      .update({
        direct_referral_contact_id: null,
        direct_referral_note: null,
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      if ((error as any).code === "PGRST116" || error.message?.includes("No rows")) {
        return NextResponse.json({ error: "Contact not found" }, { status: 404 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Remove referral error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to remove referral" },
      { status: 500 }
    );
  }
}

// GET /api/contacts/[id]/referral - Get the referral context for a contact
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
        const { id } = await params;

    // Get the contact with referral info
    const { data: contactData, error } = await insforge.database
      .from("contacts")
      .select(`
        id,
        company_id,
        direct_referral_contact_id,
        direct_referral_note
      `)
      .eq("id", id)
      .single();
    
    const contact = contactData as any;

    if (error) {
      if ((error as any).code === "PGRST116" || error.message?.includes("No rows")) {
        return NextResponse.json({ error: "Contact not found" }, { status: 404 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // If there's a direct referral, get the referrer details
    if (contact?.direct_referral_contact_id) {
      const { data: referrer } = await insforge.database
        .from("contacts")
        .select("id, first_name, last_name, title, last_contacted_at")
        .eq("id", contact.direct_referral_contact_id)
        .single();

      return NextResponse.json({
        type: "direct",
        referrer,
        note: contact.direct_referral_note,
      });
    }

    // Otherwise check for company-level "talked to"
    if (contact.company_id) {
      const { data: companyContact } = await insforge.database
        .from("contacts")
        .select("id, first_name, last_name, title, last_contacted_at")
        .eq("company_id", contact.company_id)
        .neq("id", id)
        .not("last_contacted_at", "is", null)
        .order("last_contacted_at", { ascending: false })
        .limit(1)
        .single();

      if (companyContact) {
        return NextResponse.json({
          type: "company",
          companyTalkedTo: companyContact,
        });
      }
    }

    return NextResponse.json({ type: "none" });
  } catch (error: any) {
    console.error("Get referral context error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to get referral context" },
      { status: 500 }
    );
  }
}
