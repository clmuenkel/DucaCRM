import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

interface OwnerExtractionResult {
  success: boolean;
  ownerName: string | null;
  firstName: string | null;
  lastName: string | null;
  confidence: number;
  source: string;
  rawText?: string;
}

/**
 * Fetch Google Place reviews to find owner responses
 */
async function fetchPlaceReviews(placeId: string): Promise<string[]> {
  if (!GOOGLE_PLACES_API_KEY) {
    throw new Error("Google Places API key not configured");
  }

  // Use Places API v2 to get place details with reviews
  const response = await fetch(
    `https://places.googleapis.com/v1/places/${placeId}?fields=reviews`,
    {
      headers: {
        "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY,
        "X-Goog-FieldMask": "reviews",
      },
    }
  );

  if (!response.ok) {
    console.error("Google Places API error:", response.status);
    return [];
  }

  const data = await response.json();
  const reviews = data.reviews || [];

  // Extract owner responses from reviews
  const ownerResponses: string[] = [];
  for (const review of reviews) {
    // Google Places API returns owner replies in the review object
    if (review.authorAttribution?.displayName && review.text?.text) {
      // Some reviews have owner responses - check for patterns
      const text = review.text.text;
      
      // Look for common owner response patterns
      if (
        text.toLowerCase().includes("thank you") ||
        text.toLowerCase().includes("thanks for") ||
        text.toLowerCase().includes("we appreciate") ||
        text.toLowerCase().includes("our team")
      ) {
        ownerResponses.push(text);
      }
    }
  }

  return ownerResponses;
}

/**
 * Use GPT to extract owner name from review response text
 */
async function extractOwnerNameWithAI(text: string): Promise<{
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  confidence: number;
}> {
  if (!OPENAI_API_KEY) {
    return { name: null, firstName: null, lastName: null, confidence: 0 };
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: `You are an expert at extracting business owner names from text.
Your task is to find the name of the business owner or manager who wrote a response.
Look for:
- Signatures at the end like "- John Smith, Owner"
- Names mentioned with titles like "Mike, President" or "Owner Bob"
- First person references where they identify themselves

Respond with ONLY valid JSON in this format:
{
  "name": "Full Name" or null if not found,
  "firstName": "First" or null,
  "lastName": "Last" or null,
  "confidence": 0-100 (how confident you are this is the owner's name)
}`,
        },
        {
          role: "user",
          content: `Extract the owner's name from this business response:\n\n"${text}"`,
        },
      ],
      temperature: 0.1,
      max_tokens: 100,
    });

    const responseText = completion.choices[0]?.message?.content?.trim() || "";
    const jsonStr = responseText.replace(/```json\n?|\n?```/g, "").trim();
    const result = JSON.parse(jsonStr);
    
    return {
      name: result.name || null,
      firstName: result.firstName || null,
      lastName: result.lastName || null,
      confidence: result.confidence || 0,
    };
  } catch (error) {
    console.error("OpenAI extraction error:", error);
    return { name: null, firstName: null, lastName: null, confidence: 0 };
  }
}

/**
 * Extract owner name using regex patterns (fallback without AI)
 */
function extractOwnerNameWithRegex(text: string): {
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  confidence: number;
} {
  // Common patterns for owner signatures
  const patterns = [
    // "- John Smith, Owner"
    /[-–—]\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s*,?\s*(?:Owner|President|CEO|Founder|Principal|Manager)/gi,
    // "Owner John Smith"
    /(?:Owner|President|CEO|Founder|Principal|Manager)\s*[-–—:,]?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi,
    // "Thanks, John" at end of message
    /(?:thanks|thank you|sincerely|best|regards)\s*[,!]?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s*$/gi,
    // "- John" or "- John Smith" at end
    /[-–—]\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s*$/gi,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match && match[1]) {
      const fullName = match[1].trim();
      const parts = fullName.split(/\s+/);
      return {
        name: fullName,
        firstName: parts[0] || null,
        lastName: parts[1] || null,
        confidence: 60, // Regex matches are less confident
      };
    }
  }

  return { name: null, firstName: null, lastName: null, confidence: 0 };
}

/**
 * POST handler - Extract owner from place reviews or provided text
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { placeId, companyName, rawText } = body;

    // If raw text is provided, use that directly
    if (rawText) {
      // Try AI extraction first
      if (OPENAI_API_KEY) {
        const aiResult = await extractOwnerNameWithAI(rawText);
        if (aiResult.name && aiResult.confidence >= 50) {
          return NextResponse.json({
            success: true,
            ownerName: aiResult.name,
            firstName: aiResult.firstName,
            lastName: aiResult.lastName,
            confidence: aiResult.confidence,
            source: "ai_extraction",
            rawText,
          } as OwnerExtractionResult);
        }
      }

      // Fall back to regex
      const regexResult = extractOwnerNameWithRegex(rawText);
      if (regexResult.name) {
        return NextResponse.json({
          success: true,
          ownerName: regexResult.name,
          firstName: regexResult.firstName,
          lastName: regexResult.lastName,
          confidence: regexResult.confidence,
          source: "regex_extraction",
          rawText,
        } as OwnerExtractionResult);
      }

      return NextResponse.json({
        success: false,
        ownerName: null,
        firstName: null,
        lastName: null,
        confidence: 0,
        source: "none",
        rawText,
      } as OwnerExtractionResult);
    }

    // If placeId is provided, fetch reviews
    if (placeId) {
      const ownerResponses = await fetchPlaceReviews(placeId);
      
      for (const response of ownerResponses) {
        // Try AI extraction
        if (OPENAI_API_KEY) {
          const aiResult = await extractOwnerNameWithAI(response);
          if (aiResult.name && aiResult.confidence >= 50) {
            return NextResponse.json({
              success: true,
              ownerName: aiResult.name,
              firstName: aiResult.firstName,
              lastName: aiResult.lastName,
              confidence: aiResult.confidence,
              source: "google_reviews_ai",
              rawText: response,
            } as OwnerExtractionResult);
          }
        }

        // Try regex extraction
        const regexResult = extractOwnerNameWithRegex(response);
        if (regexResult.name) {
          return NextResponse.json({
            success: true,
            ownerName: regexResult.name,
            firstName: regexResult.firstName,
            lastName: regexResult.lastName,
            confidence: regexResult.confidence,
            source: "google_reviews_regex",
            rawText: response,
          } as OwnerExtractionResult);
        }
      }

      return NextResponse.json({
        success: false,
        ownerName: null,
        firstName: null,
        lastName: null,
        confidence: 0,
        source: "no_owner_in_reviews",
        message: `No owner name found in ${ownerResponses.length} review responses`,
      });
    }

    return NextResponse.json(
      { error: "Either placeId or rawText is required" },
      { status: 400 }
    );
  } catch (error: any) {
    console.error("Extract owner API error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
