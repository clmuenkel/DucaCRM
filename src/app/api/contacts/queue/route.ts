import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_USER_ID } from "@/lib/default-user";

export const dynamic = 'force-dynamic';

/**
 * GET /api/contacts/queue
 * Get contacts sorted by priority score for Work Queue
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createClient();
    const userId = DEFAULT_USER_ID;
    const { searchParams } = new URL(request.url);

    const industry = searchParams.get("industry");
    const cadenceStatus = searchParams.get("cadence_status");
    const search = searchParams.get("search");
    const orderBy = searchParams.get("order_by") || "priority_score";
    const limit = parseInt(searchParams.get("limit") || "200");

    let query = supabase
      .from("contacts")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "active");

    // Apply filters
    if (industry && industry !== "all") {
      query = query.eq("industry", industry);
    }

    if (cadenceStatus && cadenceStatus !== "all") {
      query = query.eq("cadence_status", cadenceStatus);
    }

    if (search) {
      query = query.or(
        `first_name.ilike.%${search}%,last_name.ilike.%${search}%,company_name.ilike.%${search}%,email.ilike.%${search}%`
      );
    }

    // Apply ordering
    if (orderBy === "priority_score") {
      query = query.order("priority_score", { ascending: false, nullsFirst: false });
    } else if (orderBy === "created_at") {
      query = query.order("created_at", { ascending: false });
    } else if (orderBy === "last_contacted_at") {
      query = query.order("last_contacted_at", { ascending: false, nullsFirst: false });
    }

    // Apply limit
    query = query.limit(limit);

    const { data: contacts, error } = await query;

    if (error) {
      console.error("Error fetching contacts for queue:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { count: totalLeads } = await supabase
      .from("contacts")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "active");

    const { count: toBework } = await supabase
      .from("contacts")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "active")
      .or("cadence_status.is.null,cadence_status.eq.none");

    return NextResponse.json({
      contacts: contacts || [],
      count: contacts?.length || 0,
      counts: {
        totalLeads: totalLeads || 0,
        toBework: toBework || 0,
      },
    });
  } catch (error: any) {
    console.error("Queue API error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch contacts" },
      { status: 500 }
    );
  }
}
