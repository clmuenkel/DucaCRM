import { NextRequest, NextResponse } from "next/server";
import { insforge } from "@/lib/insforge/server";
import { getTimezoneFromLocation } from "@/lib/timezone";

export const dynamic = 'force-dynamic';

// GET /api/companies/[id] - Get a single company with all contacts and call history
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Get company
    const { data: companyData, error } = await insforge.database
      .from("companies")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      if ((error as any).code === "PGRST116" || error.message?.includes("No rows")) {
        return NextResponse.json({ error: "Company not found" }, { status: 404 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    const company = companyData as any;

    // Get all contacts for this company
    const { data: contactsData } = await insforge.database
      .from("contacts")
      .select("*")
      .eq("company_id", id)
      .order("last_contacted_at", { ascending: false, nullsFirst: false });
    
    const contacts = (contactsData ?? []) as any[];

    // Get call history for all contacts
    const contactIds = contacts.map((c) => c.id);
    let calls: any[] = [];
    
    if (contactIds.length > 0) {
      const { data: callData } = await insforge.database
        .from("calls")
        .select("*, contacts(id, first_name, last_name, title)")
        .in("contact_id", contactIds)
        .order("started_at", { ascending: false })
        .limit(50);
      
      calls = callData || [];
    }

    // Calculate stats
    const contact_count = contacts.length;
    const last_contacted_at = contacts.reduce((latest: string | null, contact: any) => {
      if (!contact.last_contacted_at) return latest;
      if (!latest || contact.last_contacted_at > latest) {
        return contact.last_contacted_at;
      }
      return latest;
    }, null);

    // Get the "talked to" reference (most recently contacted person)
    const talked_to = contacts.find((c: any) => c.last_contacted_at === last_contacted_at) || null;

    return NextResponse.json({
      ...company,
      contacts: contacts || [],
      calls,
      contact_count,
      last_contacted_at,
      talked_to: talked_to ? {
        id: talked_to.id,
        first_name: talked_to.first_name,
        last_name: talked_to.last_name,
        title: talked_to.title,
        last_contacted_at: talked_to.last_contacted_at,
      } : null,
    });
  } catch (error: any) {
    console.error("Company GET error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch company" },
      { status: 500 }
    );
  }
}

// PATCH /api/companies/[id] - Update a company
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    // If location is being updated, recalculate timezone
    if (body.city || body.state || body.country) {
      const { data: currentCompanyData } = await insforge.database
        .from("companies")
        .select("city, state, country")
        .eq("id", id)
        .single();
      
      const currentCompany = currentCompanyData as any;

      const city = body.city ?? currentCompany?.city;
      const state = body.state ?? currentCompany?.state;
      const country = body.country ?? currentCompany?.country;

      body.timezone = getTimezoneFromLocation(city, state, country);
    }

    const { data, error } = await insforge.database
      .from("companies")
      .update(body)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      if ((error as any).code === "PGRST116" || error.message?.includes("No rows")) {
        return NextResponse.json({ error: "Company not found" }, { status: 404 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Company PATCH error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update company" },
      { status: 500 }
    );
  }
}

// DELETE /api/companies/[id] - Delete a company
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // First unlink all contacts from this company
    await insforge.database
      .from("contacts")
      .update({ company_id: null })
      .eq("company_id", id);

    // Then delete the company
    const { error } = await insforge.database
      .from("companies")
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Company DELETE error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to delete company" },
      { status: 500 }
    );
  }
}
