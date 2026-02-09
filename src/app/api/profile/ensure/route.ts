/**
 * POST /api/profile/ensure
 * Ensures the user profile exists with default values
 * Called automatically when needed
 */

import { NextRequest, NextResponse } from "next/server";
import { insforge } from "@/lib/neon/server";
import { DEFAULT_USER_ID, USER_INFO } from "@/lib/default-user";

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const userId = DEFAULT_USER_ID;

    // Check if profile exists
    const { data: existingProfile } = await insforge.database
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .maybeSingle();

    if (existingProfile) {
      return NextResponse.json({
        success: true,
        message: "Profile already exists",
        profile: existingProfile,
      });
    }

    // Create profile with default values
    const { data: newProfile, error: createError } = await insforge.database
      .from("profiles")
      .insert([{
        id: userId,
        full_name: USER_INFO.full_name,
        email: USER_INFO.email,
        daily_call_goal: 50,
        daily_email_goal: 20,
      }])
      .select()
      .single();

    if (createError) {
      console.error("Error creating profile:", createError);
      return NextResponse.json(
        { 
          success: false,
          error: createError.message || "Failed to create profile" 
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Profile created successfully",
      profile: newProfile,
    });
  } catch (error: any) {
    console.error("Ensure profile error:", error);
    return NextResponse.json(
      { 
        success: false,
        error: error.message || "Failed to ensure profile" 
      },
      { status: 500 }
    );
  }
}
