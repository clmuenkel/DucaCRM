/**
 * POST /api/cadence/send-follow-up
 * Cadence email automation is temporarily disabled.
 */

import { NextRequest, NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

interface SendFollowUpRequest {
  contactIds?: string[]; // Optional - if not provided, finds all due contacts
}

export async function POST(request: NextRequest) {
  try {
    // Check for Vercel cron authorization (if called by cron, no body will be sent)
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    
    // If CRON_SECRET is set and this is a cron call, verify authorization
    // Allow manual calls (with body) to bypass cron auth
    let body: SendFollowUpRequest = { contactIds: undefined };
    try {
      body = await request.json();
    } catch {
      // No body - this is a cron call, verify auth
      if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json(
          { error: "Unauthorized" },
          { status: 401 }
        );
      }
    }
    
    // If body was provided but no auth header, this is a manual call - allow it
    // If auth header is present, verify it matches cron secret
    if (body.contactIds && cronSecret && authHeader && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }
    
    return NextResponse.json({
      success: true,
      sent: 0,
      failed: 0,
      total: body.contactIds?.length || 0,
      disabled: true,
      message: "Cadence follow-up emails are temporarily disabled",
    });
  } catch (error: any) {
    console.error("Send follow-up error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to send follow-up emails" },
      { status: 500 }
    );
  }
}

// GET handler for Vercel cron jobs (cron calls GET by default)
export async function GET(request: NextRequest) {
  return POST(request);
}
