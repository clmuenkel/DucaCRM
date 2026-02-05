import { NextRequest, NextResponse } from "next/server";
import { insforge } from "@/lib/insforge/server";
import { DEFAULT_USER_ID } from "@/lib/default-user";
import { verifyEmail, verifyEmailsBatch, generateEmailPatterns, findValidEmail } from "@/lib/email-verifier";

export const dynamic = 'force-dynamic';

interface VerifyRequest {
  // Single email verification
  email?: string;
  // Batch verification of person IDs
  personIds?: string[];
  // Generate and verify patterns for a name
  name?: {
    first: string;
    last: string;
    domain: string;
  };
  // Options
  checkSmtp?: boolean;
  limit?: number;
}

/**
 * POST /api/leads/verify-email
 * Verify email addresses for lead people
 */
export async function POST(request: NextRequest) {
  try {
    const body: VerifyRequest = await request.json();
    const { email, personIds, name, checkSmtp = false, limit = 50 } = body;

    // Mode 1: Single email verification
    if (email) {
      const result = await verifyEmail(email, { checkSmtp });
      return NextResponse.json({
        success: true,
        result,
      });
    }

    // Mode 2: Find valid email from name patterns
    if (name) {
      const patterns = generateEmailPatterns(name.first, name.last, name.domain);
      const emails = patterns.map(p => p.email);
      
      const validEmail = await findValidEmail(emails, { checkSmtp });
      
      return NextResponse.json({
        success: true,
        patterns,
        validEmail,
      });
    }

    // Mode 3: Batch verify lead_people with guessed emails
        const userId = DEFAULT_USER_ID;

    let query = insforge.database
      .from("lead_people")
      .select("id, email, email_status, full_name, first_name, last_name, lead_company_id")
      .eq("user_id", userId)
      .eq("email_status", "guessed")
      .limit(limit);

    if (personIds && personIds.length > 0) {
      query = query.in("id", personIds);
    }

    const { data: people, error: fetchError } = await query;

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!people || people.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No guessed emails to verify",
        stats: { processed: 0, verified: 0, invalid: 0 },
        results: [],
      });
    }

    // Verify emails
    const emails = people.map((p: any) => p.email).filter(Boolean);
    const verificationResults = await verifyEmailsBatch(emails, { 
      checkSmtp, 
      delayMs: 300 // Rate limit 
    });

    // Update database with results
    let verified = 0;
    let invalid = 0;
    const results: any[] = [];

    for (let i = 0; i < people.length; i++) {
      const person = people[i] as any;
      const verification = verificationResults.find(r => r.email === person.email);

      if (verification) {
        const updateData: any = {
          email_verified: verification.is_valid,
          email_verified_at: new Date().toISOString(),
          email_verification_method: verification.verification_method,
        };

        // Update email_status based on verification
        if (verification.is_valid) {
          updateData.email_status = "verified";
          updateData.confidence_score = verification.confidence;
          verified++;
        } else {
          updateData.email_status = "bounced";
          updateData.needs_manual_review = true;
          invalid++;
        }

        await insforge.database
          .from("lead_people")
          .update(updateData)
          .eq("id", person.id);

        results.push({
          personId: person.id,
          ...verification,
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Verified ${people.length} emails`,
      stats: {
        processed: people.length,
        verified,
        invalid,
        rate: people.length > 0 ? Math.round((verified / people.length) * 100) : 0,
      },
      results,
    });
  } catch (error: any) {
    console.error("Email verification error:", error);
    return NextResponse.json(
      { error: error.message || "Verification failed" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/leads/verify-email
 * Quick check a single email
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get("email");

    if (!email) {
      return NextResponse.json(
        { error: "Email parameter required" },
        { status: 400 }
      );
    }

    const result = await verifyEmail(email, { checkSmtp: false });
    
    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error: any) {
    console.error("Email verification error:", error);
    return NextResponse.json(
      { error: error.message || "Verification failed" },
      { status: 500 }
    );
  }
}
