import { NextRequest, NextResponse } from "next/server";

interface BBBLookupResult {
  success: boolean;
  bbbUrl: string | null;
  ownerName: string | null;
  businessName: string | null;
  phone: string | null;
  address: string | null;
  accredited: boolean;
  rating: string | null;
  source: string;
}

// BBB search URL patterns
const BBB_SEARCH_BASE = "https://www.bbb.org/search";

// Owner/Principal patterns in BBB pages - BBB HTML uses specific structures
const OWNER_PATTERNS = [
  // BBB typically shows: "Mr. John Smith, Owner" or similar in dt/dd pairs
  /(?:Principal|Owner|President|CEO|Manager)[,:\s]+(?:Mr\.?|Mrs\.?|Ms\.?)?\s*([A-Z][a-z]+(?:\s+[A-Z]\.?)?\s+[A-Z][a-z]+)/gi,
  // Pattern: "John Smith, Owner"
  /([A-Z][a-z]+(?:\s+[A-Z]\.?)?\s+[A-Z][a-z]+)\s*[,\-]\s*(?:Owner|President|Principal|CEO|Founder)/gi,
  // BBB "Business Management" section with name on next line
  /Business\s+Management[^<]*<[^>]*>([A-Z][a-z]+(?:\s+[A-Z]\.?)?\s+[A-Z][a-z]+)/gi,
  // Contact name pattern
  /Contact\s+Name[^<]*<[^>]*>([A-Z][a-z]+(?:\s+[A-Z]\.?)?\s+[A-Z][a-z]+)/gi,
  // "Name:" followed by capitalized name
  /(?:Name|Contact)[:\s]+([A-Z][a-z]+\s+[A-Z][a-z]+)(?:\s|<|,)/gi,
];

// Phone pattern
const PHONE_PATTERN = /\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;

/**
 * Search BBB for a business
 */
async function searchBBB(companyName: string, city: string, state: string): Promise<string | null> {
  try {
    // Construct search URL
    const searchQuery = encodeURIComponent(`${companyName} ${city} ${state}`);
    const searchUrl = `${BBB_SEARCH_BASE}?find_country=USA&find_loc=${encodeURIComponent(`${city}, ${state}`)}&find_text=${encodeURIComponent(companyName)}&find_type=Category`;
    
    console.log(`[BBB Lookup] Searching: ${searchUrl}`);
    
    const response = await fetch(searchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; LeadFlow/1.0)",
        "Accept": "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });

    if (!response.ok) {
      console.error(`BBB search failed: ${response.status}`);
      return null;
    }

    const html = await response.text();
    
    // Look for business profile links in search results
    // BBB profile URLs are like: /us/tx/houston/profile/plumbing-contractor/abc-plumbing-0123-456789
    const profileMatch = html.match(/href="(\/us\/[a-z]{2}\/[^"]+\/profile\/[^"]+)"/i);
    
    if (profileMatch) {
      return `https://www.bbb.org${profileMatch[1]}`;
    }

    return null;
  } catch (error: any) {
    console.error("BBB search error:", error.message);
    return null;
  }
}

/**
 * Scrape BBB profile page for owner info
 */
async function scrapeBBBProfile(profileUrl: string): Promise<{
  ownerName: string | null;
  businessName: string | null;
  phone: string | null;
  address: string | null;
  accredited: boolean;
  rating: string | null;
}> {
  try {
    const response = await fetch(profileUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; LeadFlow/1.0)",
        "Accept": "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });

    if (!response.ok) {
      console.error(`BBB profile fetch failed: ${response.status}`);
      return {
        ownerName: null,
        businessName: null,
        phone: null,
        address: null,
        accredited: false,
        rating: null,
      };
    }

    const html = await response.text();
    let ownerName: string | null = null;
    
    // Extract owner name - try multiple methods
    // Method 1: Look for JSON-LD structured data (most reliable)
    const jsonLdMatch = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi);
    if (jsonLdMatch) {
      for (const jsonBlock of jsonLdMatch) {
        try {
          const jsonContent = jsonBlock.replace(/<script[^>]*>|<\/script>/gi, "");
          const data = JSON.parse(jsonContent);
          if (data.founder?.name) {
            ownerName = data.founder.name;
            console.log(`[BBB] Found owner from JSON-LD: ${ownerName}`);
            break;
          }
          if (data.employee?.name) {
            ownerName = data.employee.name;
            console.log(`[BBB] Found owner from JSON-LD employee: ${ownerName}`);
            break;
          }
        } catch (e) {
          // JSON parse failed, continue
        }
      }
    }
    
    // Method 2: Look for "Principal" or "Owner" text patterns
    if (!ownerName) {
      for (const pattern of OWNER_PATTERNS) {
        pattern.lastIndex = 0; // Reset regex state
        const match = pattern.exec(html);
        if (match && match[1]) {
          const name = match[1].trim();
          // Validate it looks like a name (two words, both capitalized)
          // Validate name - must be two words, not common title patterns
        const invalidNames = ["Owner Manager", "Manager Owner", "Contact Name", "Business Owner", "Principal Owner"];
        if (/^[A-Z][a-z]+\s+[A-Z][a-z]+$/.test(name) && !invalidNames.includes(name)) {
            ownerName = name;
            console.log(`[BBB] Found owner from pattern: ${ownerName}`);
            break;
          }
        }
      }
    }
    
    // Method 3: Look for specific BBB HTML structure
    if (!ownerName) {
      // BBB often has: <dt>Principal</dt><dd>John Smith</dd>
      const dtDdMatch = html.match(/<dt[^>]*>(?:Principal|Owner|President)[^<]*<\/dt>\s*<dd[^>]*>([^<]+)<\/dd>/i);
      if (dtDdMatch && dtDdMatch[1]) {
        const name = dtDdMatch[1].trim();
        if (/^[A-Z][a-z]+\s+[A-Z][a-z]+$/.test(name)) {
          ownerName = name;
          console.log(`[BBB] Found owner from dt/dd: ${ownerName}`);
        }
      }
    }
    
    // Extract business name
    let businessName: string | null = null;
    const nameMatch = html.match(/<h1[^>]*class="[^"]*business-name[^"]*"[^>]*>([^<]+)<\/h1>/i);
    if (nameMatch) {
      businessName = nameMatch[1].trim();
    } else {
      // Try og:title
      const ogMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i);
      if (ogMatch) {
        businessName = ogMatch[1].replace(/\s*\|\s*BBB.*$/, "").trim();
      }
    }
    
    // Extract phone
    let phone: string | null = null;
    const phoneMatch = html.match(PHONE_PATTERN);
    if (phoneMatch && phoneMatch.length > 0) {
      phone = phoneMatch[0];
    }
    
    // Extract address
    let address: string | null = null;
    const addressMatch = html.match(/<address[^>]*>([^<]+(?:<br[^>]*>[^<]+)*)<\/address>/i);
    if (addressMatch) {
      address = addressMatch[1].replace(/<br\s*\/?>/gi, ", ").trim();
    }
    
    // Check if BBB accredited
    const accredited = html.toLowerCase().includes("bbb accredited") || 
                       html.toLowerCase().includes("accredited business");
    
    // Extract rating
    let rating: string | null = null;
    const ratingMatch = html.match(/rating[:\s]*([A-F][+-]?)/i);
    if (ratingMatch) {
      rating = ratingMatch[1];
    }

    return {
      ownerName,
      businessName,
      phone,
      address,
      accredited,
      rating,
    };
  } catch (error: any) {
    console.error("BBB profile scrape error:", error.message);
    return {
      ownerName: null,
      businessName: null,
      phone: null,
      address: null,
      accredited: false,
      rating: null,
    };
  }
}

/**
 * Search Secretary of State for LLC/business owner info
 * Note: This is a simplified version - real implementation would need
 * to handle state-specific SOS websites
 */
async function searchSecretaryOfState(companyName: string, state: string): Promise<{
  ownerName: string | null;
  registeredAgent: string | null;
}> {
  // This would require state-specific implementations
  // For now, return empty - the BBB lookup is more reliable
  console.log(`[SOS Lookup] Would search ${state} Secretary of State for "${companyName}"`);
  
  return {
    ownerName: null,
    registeredAgent: null,
  };
}

/**
 * POST handler - Look up business on BBB
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { companyName, city, state, bbbUrl } = body;

    if (!companyName || (!city && !state && !bbbUrl)) {
      return NextResponse.json(
        { error: "companyName and either city/state or bbbUrl is required" },
        { status: 400 }
      );
    }

    let profileUrl = bbbUrl;
    
    // If no BBB URL provided, search for the business
    if (!profileUrl && city && state) {
      console.log(`[BBB Lookup] Searching for "${companyName}" in ${city}, ${state}`);
      profileUrl = await searchBBB(companyName, city, state);
    }

    // If we found or have a BBB profile, scrape it
    if (profileUrl) {
      console.log(`[BBB Lookup] Scraping profile: ${profileUrl}`);
      const result = await scrapeBBBProfile(profileUrl);
      
      // If no owner found on BBB, try Secretary of State
      if (!result.ownerName && state) {
        const sosResult = await searchSecretaryOfState(companyName, state);
        if (sosResult.ownerName) {
          result.ownerName = sosResult.ownerName;
        }
      }
      
      return NextResponse.json({
        success: true,
        bbbUrl: profileUrl,
        ownerName: result.ownerName,
        businessName: result.businessName,
        phone: result.phone,
        address: result.address,
        accredited: result.accredited,
        rating: result.rating,
        source: "bbb",
      } as BBBLookupResult);
    }

    // No BBB profile found
    return NextResponse.json({
      success: false,
      bbbUrl: null,
      ownerName: null,
      businessName: null,
      phone: null,
      address: null,
      accredited: false,
      rating: null,
      source: "none",
      message: "No BBB listing found",
    } as BBBLookupResult);
  } catch (error: any) {
    console.error("BBB lookup API error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
