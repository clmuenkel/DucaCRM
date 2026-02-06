/**
 * GET /api/images/logo
 * Proxy logo image from Vercel Blob Storage through app domain
 * This avoids "suspicious content" warnings in emails
 */

import { NextRequest, NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

// Vercel Blob Storage URL for the logo
// Update this if you change the logo URL
const LOGO_BLOB_URL = process.env.LOGO_BLOB_URL || "https://mb3ecoencnraxhpp.public.blob.vercel-storage.com/EVIOS_Logo_4.png";

export async function GET(request: NextRequest) {
  try {
    // Fetch the image from Vercel Blob Storage
    const response = await fetch(LOGO_BLOB_URL, {
      headers: {
        'Accept': 'image/*',
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: "Failed to fetch logo" },
        { status: 500 }
      );
    }

    // Get the image data
    const imageBuffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'image/png';

    // Return the image with proper headers
    return new NextResponse(imageBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error: any) {
    console.error("Error proxying logo:", error);
    return NextResponse.json(
      { error: "Failed to load logo" },
      { status: 500 }
    );
  }
}
