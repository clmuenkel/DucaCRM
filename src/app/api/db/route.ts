/**
 * POST /api/db
 * Internal API route for client-side database queries.
 * Receives a QueryDescriptor, executes via postgres.js, returns { data, error }.
 */

import { NextRequest, NextResponse } from "next/server";
import { executeQuery } from "@/lib/neon/executor";
import type { QueryDescriptor } from "@/lib/neon/query-builder";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const desc: QueryDescriptor = await request.json();

    if (!desc.table || !desc.operation) {
      return NextResponse.json(
        { data: null, error: { message: "Invalid query descriptor" } },
        { status: 400 }
      );
    }

    const result = await executeQuery(desc);
    return NextResponse.json(result);
  } catch (e: any) {
    console.error("[/api/db] Error:", e);
    return NextResponse.json(
      { data: null, error: { message: e.message || "Internal server error" } },
      { status: 500 }
    );
  }
}
