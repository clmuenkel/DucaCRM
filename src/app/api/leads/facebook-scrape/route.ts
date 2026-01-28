import { NextRequest, NextResponse } from "next/server";

interface FacebookScrapeResult {
  success: boolean;
  facebookUrl: string | null;
  phone: string | null;
  ownerName: string | null;
  pageInfo: {
    name?: string;
    about?: string;
    category?: string;
    address?: string;
  } | null;
  source: string;
}

// Common Facebook URL patterns
const FACEBOOK_PATTERNS = [
  /https?:\/\/(www\.)?facebook\.com\/([a-zA-Z0-9.-]+)/gi,
  /https?:\/\/(m\.)?facebook\.com\/([a-zA-Z0-9.-]+)/gi,
  /facebook\.com\/([a-zA-Z0-9.-]+)/gi,
];

// Phone patterns (US)
const PHONE_PATTERNS = [
  /\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
  /\+1[-.\s]?\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/g,
  /1[-.\s]?\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/g,
];

/**
 * Extract Facebook URL from website HTML
 */
function extractFacebookUrl(html: string): string | null {
  for (const pattern of FACEBOOK_PATTERNS) {
    const matches = html.match(pattern);
    if (matches && matches.length > 0) {
      // Return the first valid Facebook URL
      const url = matches[0];
      // Clean up and normalize the URL
      if (!url.startsWith("http")) {
        return `https://${url}`;
      }
      return url;
    }
  }
  return null;
}

/**
 * Extract phone numbers from text
 */
function extractPhoneNumbers(text: string): string[] {
  const phones = new Set<string>();
  
  for (const pattern of PHONE_PATTERNS) {
    const matches = text.match(pattern);
    if (matches) {
      for (const match of matches) {
        // Normalize phone format
        const cleaned = match.replace(/\D/g, "");
        if (cleaned.length === 10) {
          phones.add(`(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`);
        } else if (cleaned.length === 11 && cleaned.startsWith("1")) {
          phones.add(`(${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`);
        }
      }
    }
  }
  
  return Array.from(phones);
}

/**
 * Extract owner/manager name patterns from text
 */
function extractOwnerName(text: string): string | null {
  const patterns = [
    // "Owner: John Smith" or "Owner - John Smith"
    /(?:owner|president|ceo|founder|manager|principal)[:\s-]+([A-Z][a-z]+\s+[A-Z][a-z]+)/gi,
    // "John Smith, Owner"
    /([A-Z][a-z]+\s+[A-Z][a-z]+)\s*,\s*(?:owner|president|ceo|founder|manager|principal)/gi,
    // "Page managed by John Smith"
    /page\s+(?:managed|owned)\s+by\s+([A-Z][a-z]+\s+[A-Z][a-z]+)/gi,
  ];

  for (const pattern of patterns) {
    pattern.lastIndex = 0; // Reset regex state
    const match = pattern.exec(text);
    if (match && match[1]) {
      const name = match[1].trim();
      // Validate: must be two words, both capitalized, no weird values
      if (/^[A-Z][a-z]+\s+[A-Z][a-z]+$/.test(name) && 
          !["True False", "False True"].includes(name) &&
          name.length >= 5 && name.length <= 40) {
        return name;
      }
    }
  }

  return null;
}

/**
 * Fetch and parse website to find Facebook link
 */
async function scrapeWebsiteForFacebook(websiteUrl: string): Promise<string | null> {
  try {
    const response = await fetch(websiteUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; LeadFlow/1.0)",
        "Accept": "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });

    if (!response.ok) {
      console.error(`Website fetch failed: ${response.status}`);
      return null;
    }

    const html = await response.text();
    return extractFacebookUrl(html);
  } catch (error: any) {
    console.error("Website scrape error:", error.message);
    return null;
  }
}

/**
 * Scrape Facebook page for contact info
 * Note: Facebook limits scraping, so we use a lightweight approach
 */
async function scrapeFacebookPage(facebookUrl: string): Promise<{
  phone: string | null;
  ownerName: string | null;
  pageInfo: any;
}> {
  try {
    // Try to fetch the mobile version which is lighter
    const mobileUrl = facebookUrl.replace("www.facebook.com", "m.facebook.com");
    
    const response = await fetch(mobileUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15",
        "Accept": "text/html",
      },
      redirect: "follow",
    });

    if (!response.ok) {
      console.error(`Facebook fetch failed: ${response.status}`);
      return { phone: null, ownerName: null, pageInfo: null };
    }

    const html = await response.text();
    
    // Extract phone numbers
    const phones = extractPhoneNumbers(html);
    
    // Extract owner name
    const ownerName = extractOwnerName(html);
    
    // Try to extract page info from JSON-LD or meta tags
    let pageInfo: any = {};
    
    // Extract title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) {
      pageInfo.name = titleMatch[1].replace(/ \| Facebook$/, "").trim();
    }
    
    // Extract description/about
    const descMatch = html.match(/<meta\s+(?:name|property)=["'](?:description|og:description)["']\s+content=["']([^"']+)["']/i);
    if (descMatch) {
      pageInfo.about = descMatch[1];
    }

    return {
      phone: phones[0] || null,
      ownerName,
      pageInfo: Object.keys(pageInfo).length > 0 ? pageInfo : null,
    };
  } catch (error: any) {
    console.error("Facebook scrape error:", error.message);
    return { phone: null, ownerName: null, pageInfo: null };
  }
}

/**
 * POST handler - Scrape website and/or Facebook page for contact info
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { websiteUrl, facebookUrl, companyName } = body;

    if (!websiteUrl && !facebookUrl) {
      return NextResponse.json(
        { error: "Either websiteUrl or facebookUrl is required" },
        { status: 400 }
      );
    }

    let finalFacebookUrl = facebookUrl;
    
    // If no Facebook URL provided, try to find it from the website
    if (!finalFacebookUrl && websiteUrl) {
      console.log(`[Facebook Scraper] Searching website for Facebook link: ${websiteUrl}`);
      finalFacebookUrl = await scrapeWebsiteForFacebook(websiteUrl);
    }

    // If we have a Facebook URL, scrape it
    if (finalFacebookUrl) {
      console.log(`[Facebook Scraper] Scraping Facebook page: ${finalFacebookUrl}`);
      const result = await scrapeFacebookPage(finalFacebookUrl);
      
      return NextResponse.json({
        success: true,
        facebookUrl: finalFacebookUrl,
        phone: result.phone,
        ownerName: result.ownerName,
        pageInfo: result.pageInfo,
        source: "facebook",
      } as FacebookScrapeResult);
    }

    // No Facebook URL found
    return NextResponse.json({
      success: false,
      facebookUrl: null,
      phone: null,
      ownerName: null,
      pageInfo: null,
      source: "none",
      message: "No Facebook page found",
    } as FacebookScrapeResult);
  } catch (error: any) {
    console.error("Facebook scrape API error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
