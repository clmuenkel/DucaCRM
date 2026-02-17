import { NextResponse } from "next/server";
import { insforge } from "@/lib/neon/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const timestamp = new Date().toISOString();
    
    // Test database connection
    let dbStatus = "connected";
    try {
      await insforge.database.from("contacts").select("id").limit(1);
    } catch (dbError) {
      console.error("[Health Check] Database connection failed:", dbError);
      dbStatus = "error";
    }

    const response = {
      status: "ok",
      timestamp,
      db: dbStatus,
      version: process.env.npm_package_version || "unknown",
      environment: process.env.NODE_ENV || "unknown",
    };

    // If database is down, return 503
    if (dbStatus === "error") {
      return NextResponse.json(response, { status: 503 });
    }

    return NextResponse.json(response);
  } catch (error: any) {
    console.error("[Health Check] Failed:", error);
    return NextResponse.json(
      {
        status: "error",
        timestamp: new Date().toISOString(),
        error: error.message || "Health check failed",
        db: "error",
      },
      { status: 500 }
    );
  }
}