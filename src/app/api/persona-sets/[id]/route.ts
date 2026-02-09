import { NextRequest, NextResponse } from "next/server";
import { insforge } from "@/lib/neon/server";

export const dynamic = 'force-dynamic';

// GET /api/persona-sets/[id] - Get a single persona set
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
        const { id } = await params;

    const { data, error } = await insforge.database
      .from("persona_sets")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json({ error: "Persona set not found" }, { status: 404 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Persona set GET error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch persona set" },
      { status: 500 }
    );
  }
}

// PATCH /api/persona-sets/[id] - Update a persona set
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
        const { id } = await params;
    const body = await request.json();

    // If setting as default, unset other defaults first
    if (body.is_default) {
      const { data: currentData } = await insforge.database
        .from("persona_sets")
        .select("user_id")
        .eq("id", id)
        .single();
      
      const current = currentData as any;

      if (current) {
        await insforge.database
          .from("persona_sets")
          .update({ is_default: false })
          .eq("user_id", current.user_id)
          .neq("id", id);
      }
    }

    const { data, error } = await insforge.database
      .from("persona_sets")
      .update(body)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json({ error: "Persona set not found" }, { status: 404 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Persona set PATCH error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update persona set" },
      { status: 500 }
    );
  }
}

// DELETE /api/persona-sets/[id] - Delete a persona set
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
        const { id } = await params;

    const { error } = await insforge.database
      .from("persona_sets")
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Persona set DELETE error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to delete persona set" },
      { status: 500 }
    );
  }
}
