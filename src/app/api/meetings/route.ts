import { insforge } from "@/lib/insforge/server";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
  
  const contactId = searchParams.get("contactId");
  const companyId = searchParams.get("companyId");
  const status = searchParams.get("status");
  const upcoming = searchParams.get("upcoming");
  const limit = searchParams.get("limit");

  let query = insforge.database
    .from("meetings")
    .select("*, contacts(id, first_name, last_name, company_name, title)")
    .order("scheduled_at", { ascending: true });

  if (contactId) {
    query = query.eq("contact_id", contactId);
  }

  if (companyId) {
    query = query.eq("company_id", companyId);
  }

  if (status) {
    query = query.eq("status", status);
  }

  if (upcoming === "true") {
    query = query
      .eq("status", "scheduled")
      .gte("scheduled_at", new Date().toISOString());
  }

  if (limit) {
    query = query.limit(parseInt(limit));
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
    const body = await request.json();

  const { data, error } = await insforge.database
    .from("meetings")
    .insert([body])
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
