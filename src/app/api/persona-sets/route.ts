import { NextRequest, NextResponse } from "next/server";
import { insforge } from "@/lib/insforge/server";

export const dynamic = 'force-dynamic';

// GET /api/persona-sets - List all persona sets
export async function GET(request: NextRequest) {
  try {
        const { data, error } = await supabase
      .from("persona_sets")
      .select("*")
      .order("is_default", { ascending: false })
      .order("name", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (error: any) {
    console.error("Persona sets GET error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch persona sets" },
      { status: 500 }
    );
  }
}

// POST /api/persona-sets - Create a new persona set
export async function POST(request: NextRequest) {
  try {
        const body = await request.json();

    const {
      user_id,
      name,
      titles,
      industries,
      employee_ranges,
      include_intent_data,
      is_default,
    } = body;

    if (!user_id || !name) {
      return NextResponse.json(
        { error: "user_id and name are required" },
        { status: 400 }
      );
    }

    // If setting as default, unset other defaults first
    if (is_default) {
      await (supabase as any)
        .from("persona_sets")
        .update({ is_default: false })
        .eq("user_id", user_id);
    }

    const { data, error } = await (supabase as any)
      .from("persona_sets")
      .insert({
        user_id,
        name,
        titles: titles || [],
        industries: industries || [],
        employee_ranges: employee_ranges || [],
        include_intent_data: include_intent_data || false,
        is_default: is_default || false,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error: any) {
    console.error("Persona sets POST error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create persona set" },
      { status: 500 }
    );
  }
}
