import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTimezoneFromLocation } from "@/lib/timezone";

export const dynamic = 'force-dynamic';
export const runtime = 'edge';

// GET /api/companies - List all companies with stats
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const searchParams = request.nextUrl.searchParams;
    
    const search = searchParams.get("search");
    const industry = searchParams.get("industry");
    const limit = searchParams.get("limit");

    // Build query
    let query = supabase
      .from("companies")
      .select("*")
      .order("name", { ascending: true });

    if (search) {
      query = query.or(`name.ilike.%${search}%,domain.ilike.%${search}%`);
    }

    if (industry) {
      query = query.eq("industry", industry);
    }

    if (limit) {
      query = query.limit(parseInt(limit, 10));
    }

    const { data: companiesData, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const companies = (companiesData ?? []) as any[];

    if (companies.length === 0) {
      return NextResponse.json([]);
    }

    // Get contact counts for each company
    const companyIds = companies.map((c) => c.id);
    
    const { data: contactStatsData } = await supabase
      .from("contacts")
      .select("company_id, last_contacted_at")
      .in("company_id", companyIds);
    
    const contactStats = (contactStatsData ?? []) as any[];

    // Aggregate stats
    const statsMap = new Map<string, { count: number; lastContacted: string | null }>();
    
    contactStats.forEach((contact) => {
      if (!contact.company_id) return;
      
      const current = statsMap.get(contact.company_id) || { count: 0, lastContacted: null };
      current.count++;
      
      if (contact.last_contacted_at) {
        if (!current.lastContacted || contact.last_contacted_at > current.lastContacted) {
          current.lastContacted = contact.last_contacted_at;
        }
      }
      
      statsMap.set(contact.company_id, current);
    });

    // Merge stats into companies
    const companiesWithStats = companies.map((company) => {
      const stats = statsMap.get(company.id) || { count: 0, lastContacted: null };
      return {
        ...company,
        contact_count: stats.count,
        last_contacted_at: stats.lastContacted,
      };
    });

    return NextResponse.json(companiesWithStats);
  } catch (error: any) {
    console.error("Companies GET error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch companies" },
      { status: 500 }
    );
  }
}

// POST /api/companies - Create a new company
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const body = await request.json();

    const {
      user_id,
      name,
      domain,
      industry,
      employee_count,
      employee_range,
      city,
      state,
      country,
      website,
      linkedin_url,
      annual_revenue,
      intent_score,
      intent_topics,
    } = body;

    if (!user_id || !name) {
      return NextResponse.json(
        { error: "user_id and name are required" },
        { status: 400 }
      );
    }

    // Check for existing company with same domain
    if (domain) {
      const { data: existingData } = await supabase
        .from("companies")
        .select("id")
        .eq("user_id", user_id)
        .eq("domain", domain)
        .single();
      
      const existing = existingData as any;

      if (existing) {
        return NextResponse.json(
          { error: "Company with this domain already exists", existing_id: existing.id },
          { status: 409 }
        );
      }
    }

    // Derive timezone from location
    const timezone = getTimezoneFromLocation(city, state, country);

    const { data, error } = await (supabase as any)
      .from("companies")
      .insert({
        user_id,
        name,
        domain,
        industry,
        employee_count,
        employee_range,
        city,
        state,
        country: country || "US",
        timezone,
        website,
        linkedin_url,
        annual_revenue,
        intent_score,
        intent_topics: intent_topics || [],
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error: any) {
    console.error("Companies POST error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create company" },
      { status: 500 }
    );
  }
}
