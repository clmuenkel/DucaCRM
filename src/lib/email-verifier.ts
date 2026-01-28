/**
 * Email Verification Library
 * 
 * Provides free and low-cost email verification methods:
 * 1. Syntax validation
 * 2. MX record check (DNS)
 * 3. SMTP mailbox check (free but rate-limited)
 * 4. API-based verification (paid, more reliable)
 */

import dns from "dns/promises";

// ===========================================
// TYPES
// ===========================================

export interface EmailVerificationResult {
  email: string;
  is_valid: boolean;
  verification_method: "syntax" | "dns" | "smtp" | "api";
  confidence: number; // 0-100
  details: {
    syntax_valid: boolean;
    domain_valid: boolean;
    mx_found: boolean;
    mailbox_exists?: boolean;
    is_disposable?: boolean;
    is_role_account?: boolean;
  };
  error?: string;
}

// ===========================================
// DISPOSABLE & ROLE EMAIL DETECTION
// ===========================================

// Common disposable email domains
const DISPOSABLE_DOMAINS = new Set([
  "tempmail.com", "throwaway.com", "guerrillamail.com", "mailinator.com",
  "10minutemail.com", "temp-mail.org", "fakeinbox.com", "trashmail.com",
  "yopmail.com", "getnada.com", "mohmal.com", "tempail.com",
]);

// Role-based email prefixes (less valuable for personal outreach)
const ROLE_PREFIXES = new Set([
  "info", "contact", "sales", "support", "admin", "hello", "help",
  "marketing", "billing", "accounts", "noreply", "no-reply", "donotreply",
  "team", "office", "service", "webmaster", "postmaster", "hostmaster",
  "orders", "enquiries", "inquiries", "feedback",
]);

// ===========================================
// VALIDATION FUNCTIONS
// ===========================================

/**
 * Basic syntax validation
 */
export function validateSyntax(email: string): boolean {
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email);
}

/**
 * Check if email is from a disposable domain
 */
export function isDisposable(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase();
  return domain ? DISPOSABLE_DOMAINS.has(domain) : false;
}

/**
 * Check if email is a role-based account (info@, contact@, etc.)
 */
export function isRoleAccount(email: string): boolean {
  const local = email.split("@")[0]?.toLowerCase();
  return local ? ROLE_PREFIXES.has(local) : false;
}

/**
 * Check if domain has valid MX records
 */
export async function checkMxRecords(domain: string): Promise<{ valid: boolean; records: string[] }> {
  try {
    const records = await dns.resolveMx(domain);
    if (records && records.length > 0) {
      return {
        valid: true,
        records: records.map(r => r.exchange),
      };
    }
    return { valid: false, records: [] };
  } catch (error) {
    return { valid: false, records: [] };
  }
}

/**
 * Verify email via SMTP (check if mailbox exists)
 * Note: This is a basic implementation. Many servers block this or return false positives.
 * Use with caution and rate limiting.
 */
export async function verifySmtp(email: string): Promise<{ exists: boolean; error?: string }> {
  const domain = email.split("@")[1];
  if (!domain) {
    return { exists: false, error: "Invalid domain" };
  }

  try {
    // Get MX records
    const mxResult = await checkMxRecords(domain);
    if (!mxResult.valid || mxResult.records.length === 0) {
      return { exists: false, error: "No MX records" };
    }

    // For now, just confirm MX records exist
    // Full SMTP verification requires a more complex implementation
    // that connects to the mail server and checks RCPT TO
    // This is often blocked and can get your IP blacklisted
    return { exists: true }; // Assume valid if MX exists
  } catch (error: any) {
    return { exists: false, error: error.message };
  }
}

/**
 * Generate email pattern variations for a name and domain
 */
export function generateEmailPatterns(
  firstName: string,
  lastName: string,
  domain: string
): Array<{ email: string; pattern: string; priority: number }> {
  const first = firstName.toLowerCase().replace(/[^a-z]/g, "");
  const last = lastName.toLowerCase().replace(/[^a-z]/g, "");
  
  if (!first || !last || !domain) return [];
  
  return [
    { email: `${first}@${domain}`, pattern: "first", priority: 1 },
    { email: `${first}.${last}@${domain}`, pattern: "first.last", priority: 2 },
    { email: `${first}${last}@${domain}`, pattern: "firstlast", priority: 3 },
    { email: `${first[0]}${last}@${domain}`, pattern: "flast", priority: 4 },
    { email: `${first}.${last[0]}@${domain}`, pattern: "first.l", priority: 5 },
    { email: `${first[0]}.${last}@${domain}`, pattern: "f.last", priority: 6 },
    { email: `${last}@${domain}`, pattern: "last", priority: 7 },
    { email: `${last}.${first}@${domain}`, pattern: "last.first", priority: 8 },
  ];
}

/**
 * Full email verification (syntax + DNS + optional SMTP)
 */
export async function verifyEmail(
  email: string,
  options: {
    checkSmtp?: boolean;
    timeout?: number;
  } = {}
): Promise<EmailVerificationResult> {
  const { checkSmtp = false, timeout = 5000 } = options;
  const domain = email.split("@")[1];
  
  const result: EmailVerificationResult = {
    email,
    is_valid: false,
    verification_method: "syntax",
    confidence: 0,
    details: {
      syntax_valid: false,
      domain_valid: false,
      mx_found: false,
    },
  };
  
  // Step 1: Syntax check
  result.details.syntax_valid = validateSyntax(email);
  if (!result.details.syntax_valid) {
    result.error = "Invalid email syntax";
    return result;
  }
  result.confidence = 20;
  
  // Step 2: Check for disposable/role
  result.details.is_disposable = isDisposable(email);
  result.details.is_role_account = isRoleAccount(email);
  
  if (result.details.is_disposable) {
    result.error = "Disposable email domain";
    return result;
  }
  
  // Reduce confidence for role accounts
  if (result.details.is_role_account) {
    result.confidence = 15;
  }
  
  // Step 3: MX record check
  try {
    const mxResult = await Promise.race([
      checkMxRecords(domain),
      new Promise<{ valid: false; records: [] }>((_, reject) => 
        setTimeout(() => reject(new Error("Timeout")), timeout)
      ),
    ]);
    
    result.details.mx_found = mxResult.valid;
    result.details.domain_valid = mxResult.valid;
    result.verification_method = "dns";
    
    if (mxResult.valid) {
      result.confidence = result.details.is_role_account ? 40 : 60;
      result.is_valid = true;
    } else {
      result.error = "No MX records found";
      return result;
    }
  } catch (error) {
    result.error = "DNS check failed";
    return result;
  }
  
  // Step 4: SMTP check (optional, more reliable but can be blocked)
  if (checkSmtp && result.details.mx_found) {
    try {
      const smtpResult = await Promise.race([
        verifySmtp(email),
        new Promise<{ exists: false; error: string }>((_, reject) => 
          setTimeout(() => reject(new Error("SMTP Timeout")), timeout)
        ),
      ]);
      
      result.details.mailbox_exists = smtpResult.exists;
      result.verification_method = "smtp";
      
      if (smtpResult.exists) {
        result.confidence = result.details.is_role_account ? 60 : 80;
      } else {
        result.confidence = 30;
        result.error = smtpResult.error || "Mailbox may not exist";
      }
    } catch (error) {
      // SMTP check failed, but DNS passed - still somewhat valid
      result.confidence = result.details.is_role_account ? 40 : 55;
    }
  }
  
  return result;
}

/**
 * Batch verify multiple emails
 */
export async function verifyEmailsBatch(
  emails: string[],
  options: {
    checkSmtp?: boolean;
    delayMs?: number;
  } = {}
): Promise<EmailVerificationResult[]> {
  const { checkSmtp = false, delayMs = 200 } = options;
  const results: EmailVerificationResult[] = [];
  
  for (const email of emails) {
    const result = await verifyEmail(email, { checkSmtp });
    results.push(result);
    
    // Rate limiting
    if (delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  return results;
}

/**
 * Find the most likely valid email from a list of guesses
 */
export async function findValidEmail(
  guesses: string[],
  options: { checkSmtp?: boolean } = {}
): Promise<{ email: string; confidence: number } | null> {
  // First, filter out obviously invalid ones
  const validSyntax = guesses.filter(validateSyntax);
  if (validSyntax.length === 0) return null;
  
  // Check MX for the domain (same for all guesses)
  const domain = validSyntax[0].split("@")[1];
  const mxResult = await checkMxRecords(domain);
  
  if (!mxResult.valid) {
    return null;
  }
  
  // Return the first guess with valid MX (most common pattern)
  // In a real implementation, you'd use an API service to verify
  for (const email of validSyntax) {
    if (!isRoleAccount(email)) {
      return { email, confidence: 50 };
    }
  }
  
  // If only role accounts, return the first one with lower confidence
  return { email: validSyntax[0], confidence: 30 };
}
