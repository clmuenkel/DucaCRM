/**
 * CSV Parser for importing contacts from spreadsheets
 * Handles multi-line quoted fields, row deduplication, and field mapping
 * Supports both legacy CSV format and Apollo export CSV format
 */

import type { InsertTables } from "@/types/database";
import { normalizeToE164 } from "@/lib/utils";

// ============================================================================
// SHARED TYPES
// ============================================================================

// Parsed row from legacy CSV (raw string values)
export interface ParsedCSVRow {
  lastName: string;
  firstName: string;
  company: string;
  linkedinUrl: string;
  type: string; // Industry
  companyInfo: string; // State
  companyHeadcount: string;
  timeZone: string;
  mobile: string;
  direct: string;
  email: string;
  position: string;
  personalConnector: string;
  answered: string;
  notes: string;
  // Original row index for debugging
  _rowIndex?: number;
}

// Apollo CSV parsed row
export interface ApolloCSVRow {
  firstName: string;
  lastName: string;
  title: string;
  companyName: string;
  email: string;
  emailVerificationSource: string;
  mobilePhone: string;
  otherPhone: string;
  employeeCount: number | null;
  industry: string; // CSV industry (ignored for tagging)
  city: string;
  state: string;
  // Derived fields
  inferredTags: string[];
  employeeRange: string | null;
  // For extra phones note (always null with 2-column format)
  extraPhonesNote: string | null;
  _rowIndex?: number;
}

// Company group for preview
export interface CompanyGroup {
  companyName: string;
  city: string;
  state: string;
  employeeCount: number | null;
  employeeRange: string | null;
  inferredTags: string[];
  contacts: ApolloCSVRow[];
}

// ============================================================================
// INDUSTRY TAG INFERENCE
// ============================================================================

const INDUSTRY_KEYWORDS: Record<string, string[]> = {
  hvac: [
    "hvac", "heating", "cooling", "air conditioning", "ac ", "a/c",
    "furnace", "ventilation", "climate", "heat pump", "ductless",
    "air tech", "air-tech", "comfort air", "thermosystem"
  ],
  plumbing: [
    "plumbing", "plumber", "plumb", "drain", "pipe", "sewer",
    "water heater", "rooter", "leak", "faucet"
  ],
  roofing: [
    "roofing", "roof", "roofer", "shingle", "gutter", "spouting"
  ],
  electrical: [
    "electrical", "electrician", "electric", "wiring", "generator"
  ],
  pest_control: [
    "pest", "exterminator", "termite", "bug", "rodent", "mosquito",
    "bed bug", "ant ", "cockroach", "wildlife"
  ],
  landscaping: [
    "landscape", "landscaping", "lawn", "garden", "irrigation",
    "tree service", "turf", "grass", "mowing", "outdoor"
  ],
  windows_doors: [
    "window", "door", "glass", "sash", "impact window", "pella"
  ],
  solar: [
    "solar", "photovoltaic", "pv system", "renewable energy"
  ],
  construction: [
    "construction", "contractor", "remodel", "renovation", "builder",
    "general contractor", "home improvement"
  ],
  mechanical: [
    "mechanical", "mech ", "industrial"
  ]
};

/**
 * Infer industry tags from company name
 * Returns array of matching tags (can be multiple)
 */
export function inferCompanyTags(companyName: string): string[] {
  if (!companyName) return [];
  
  const lowerName = companyName.toLowerCase();
  const matchedTags: string[] = [];
  
  for (const [tag, keywords] of Object.entries(INDUSTRY_KEYWORDS)) {
    for (const keyword of keywords) {
      if (lowerName.includes(keyword)) {
        matchedTags.push(tag);
        break; // Only add each tag once
      }
    }
  }
  
  return matchedTags;
}

// ============================================================================
// EMPLOYEE RANGE MAPPING
// ============================================================================

/**
 * Compute employee range string from employee count number
 */
export function computeEmployeeRange(count: number | null): string | null {
  if (count === null || count === undefined || isNaN(count)) return null;
  
  if (count <= 10) return "1-10";
  if (count <= 50) return "11-50";
  if (count <= 200) return "51-200";
  if (count <= 500) return "201-500";
  if (count <= 1000) return "501-1000";
  if (count <= 5000) return "1001-5000";
  if (count <= 10000) return "5001-10000";
  return "10001+";
}

/**
 * Normalize employee range to match CRM format (for legacy CSV)
 */
function normalizeEmployeeRange(headcount: string): string | null {
  if (!headcount) return null;
  
  // Common formats: "5K-10K employees", "1K-5K employees", "201-500 employees", "501-1K employees"
  const cleaned = headcount.toLowerCase().replace(/employees?/gi, "").trim();
  
  // Map to standardized ranges
  const rangeMap: Record<string, string> = {
    "1-10": "1-10",
    "11-50": "11-50",
    "51-200": "51-200",
    "201-500": "201-500",
    "501-1k": "501-1000",
    "501-1000": "501-1000",
    "1k-5k": "1001-5000",
    "1001-5000": "1001-5000",
    "5k-10k": "5001-10000",
    "5001-10000": "5001-10000",
    "10k+": "10001+",
    "10001+": "10001+",
  };
  
  return rangeMap[cleaned] || headcount;
}

// ============================================================================
// DECISION MAKER SCORING (for sorting contacts within a company)
// ============================================================================

/**
 * Score a job title for decision-maker priority
 * Higher score = more likely to be a decision maker
 */
export function scoreDecisionMakerTitle(title: string): number {
  if (!title) return 0;
  
  const lowerTitle = title.toLowerCase();
  
  // Exclude non-buying roles
  const excludePatterns = [
    /\bfinance\b/, /\baccountant\b/, /\bcfo\b/, /\bhr\b/, /\bhuman resource/,
    /\bmarketing\b/, /\blegal\b/, /\bcounsel\b/, /\bit\b/, /\btechnician\b/,
    /\bsupport\b/, /\bcustomer service\b/, /\bassistant\b/, /\bintern\b/,
    /\bapprentice\b/, /\badmin\b/, /\bsecretary\b/, /\breceptionist\b/
  ];
  
  for (const pattern of excludePatterns) {
    if (pattern.test(lowerTitle)) return -10;
  }
  
  // Score buying decision-makers
  if (/\bowner\b/.test(lowerTitle)) return 100;
  if (/\bfounder\b/.test(lowerTitle)) return 95;
  if (/\bceo\b|\bchief executive\b/.test(lowerTitle)) return 90;
  if (/\bpresident\b/.test(lowerTitle)) return 85;
  if (/\bcoo\b|\bchief operating\b/.test(lowerTitle)) return 80;
  if (/\bgeneral manager\b|\bgm\b/.test(lowerTitle)) return 75;
  if (/\boperations manager\b|\bvp.*operations\b|\bvice president.*operations\b/.test(lowerTitle)) return 70;
  if (/\bfacilities manager\b|\bfacilities director\b/.test(lowerTitle)) return 65;
  if (/\bdirector\b/.test(lowerTitle)) return 60;
  if (/\bvice president\b|\bvp\b/.test(lowerTitle)) return 55;
  if (/\bmanager\b/.test(lowerTitle)) return 40;
  if (/\bpurchasing\b|\bprocurement\b/.test(lowerTitle)) return 35;
  
  return 20; // Default score for unmatched titles
}

// ============================================================================
// CSV HEADER DETECTION
// ============================================================================

/**
 * Required headers for Apollo CSV detection (all must be present)
 */
const APOLLO_REQUIRED_HEADERS = [
  "first name",
  "last name", 
  "title",
  "company name",
  "email",
  "mobile phone",
  "# employees"
];

/**
 * Detect if the CSV is an Apollo export based on headers
 * Uses strict matching - ALL required columns must be present
 */
export function isApolloCSV(headerLine: string): boolean {
  // Remove BOM character if present and parse header
  const cleanedLine = headerLine.replace(/^\uFEFF/, "");
  const headers = parseCSVLine(cleanedLine)
    .map((h) => h.trim().toLowerCase());
  
  // Check that ALL required Apollo columns exist
  const hasAllRequired = APOLLO_REQUIRED_HEADERS.every((required) =>
    headers.includes(required)
  );
  
  if (hasAllRequired) {
    console.log("[CSV Parser] Detected Apollo CSV format (all required headers found)");
  }
  
  return hasAllRequired;
}

// ============================================================================
// TIMEZONE MAPPING (for legacy CSV)
// ============================================================================

const TIMEZONE_ABBR_MAP: Record<string, string> = {
  EST: "America/New_York",
  EDT: "America/New_York",
  CST: "America/Chicago",
  CDT: "America/Chicago",
  MST: "America/Denver",
  MDT: "America/Denver",
  PST: "America/Los_Angeles",
  PDT: "America/Los_Angeles",
  MT: "America/Denver",
  PT: "America/Los_Angeles",
  ET: "America/New_York",
  CT: "America/Chicago",
  AKST: "America/Anchorage",
  AKDT: "America/Anchorage",
  HST: "America/Honolulu",
};

/**
 * Map timezone abbreviation to IANA timezone
 */
export function mapTimezone(abbr: string): string {
  if (!abbr) return "America/New_York"; // Default to Eastern
  
  const normalized = abbr.toUpperCase().trim();
  return TIMEZONE_ABBR_MAP[normalized] || "America/New_York";
}

// ============================================================================
// CSV LINE PARSING
// ============================================================================

/**
 * Parse a single CSV line into fields
 * Handles quoted fields with commas and escaped quotes
 */
function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let currentField = "";
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote
        currentField += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      fields.push(currentField);
      currentField = "";
    } else {
      currentField += char;
    }
  }
  
  // Add the last field
  fields.push(currentField);
  
  return fields;
}

/**
 * Clean a field value - trim, remove leading/trailing newlines
 */
function cleanField(value: string | undefined): string {
  if (!value) return "";
  
  let cleaned = value
    .replace(/^[\s\n\r]+|[\s\n\r]+$/g, "") // Trim whitespace and newlines
    .replace(/\n/g, " ") // Replace internal newlines with spaces
    .replace(/^['"]+|['"]+$/g, "") // Remove leading/trailing single OR double quotes
    .trim();
  
  // Treat comma-only, comma-with-spaces, or punctuation-only as empty
  if (/^[,.\s\-_]+$/.test(cleaned) || cleaned.length === 0) {
    return "";
  }
  
  return cleaned;
}

/**
 * Parse CSV text into lines, handling quoted fields with newlines
 */
function parseCSVToLines(csvText: string): string[] {
  const lines: string[] = [];
  
  // Normalize line endings (handle \r\n, \r, \n)
  const normalizedText = csvText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  
  // Parse CSV properly handling quoted fields with newlines
  let currentLine = "";
  let inQuotes = false;
  
  for (let i = 0; i < normalizedText.length; i++) {
    const char = normalizedText[i];
    
    if (char === '"') {
      // Simply toggle quote state and preserve the character
      // parseCSVLine will handle escaped quotes during field parsing
      inQuotes = !inQuotes;
      currentLine += char;
    } else if (char === "\n" && !inQuotes) {
      if (currentLine.trim()) {
        lines.push(currentLine);
      }
      currentLine = "";
    } else {
      currentLine += char;
    }
  }
  
  // Don't forget the last line
  if (currentLine.trim()) {
    lines.push(currentLine);
  }
  
  return lines;
}

// ============================================================================
// APOLLO CSV PARSING
// ============================================================================

/**
 * Parse Apollo export CSV into ApolloCSVRow array
 */
export function parseApolloCSV(csvText: string): ApolloCSVRow[] {
  const rows: ApolloCSVRow[] = [];
  const lines = parseCSVToLines(csvText);
  
  console.log(`[Apollo CSV Parser] Parsed ${lines.length} lines from CSV`);
  
  if (lines.length === 0) {
    console.log("[Apollo CSV Parser] No lines found in CSV");
    return [];
  }
  
  // Parse header to get column indices
  const headerFields = parseCSVLine(lines[0]);
  const headerMap = new Map<string, number>();
  headerFields.forEach((field, index) => {
    headerMap.set(field.trim(), index);
  });
  
  console.log("[Apollo CSV Parser] Headers:", Array.from(headerMap.keys()));
  
  // Column indices
  const getField = (fields: string[], name: string): string => {
    const index = headerMap.get(name);
    return index !== undefined ? cleanField(fields[index]) : "";
  };
  
  // Parse each row
  for (let rowIndex = 1; rowIndex < lines.length; rowIndex++) {
    const fields = parseCSVLine(lines[rowIndex]);
    
    const firstName = getField(fields, "First Name");
    const lastName = getField(fields, "Last Name");
    
    // Skip rows without a name
    if (!firstName && !lastName) continue;
    
    const companyName = getField(fields, "Company Name");
    const mobilePhone = getField(fields, "Mobile Phone");
    const otherPhone = getField(fields, "Other Phone");
    
    // Parse employee count
    const employeeCountStr = getField(fields, "# Employees");
    const employeeCount = employeeCountStr ? parseInt(employeeCountStr, 10) : null;
    
    // Infer tags from company name
    const inferredTags = inferCompanyTags(companyName);
    
    // Compute employee range
    const employeeRange = computeEmployeeRange(employeeCount);
    
    // Extra phones note always null with 2-column format
    const extraPhonesNote = null;
    
    const row: ApolloCSVRow = {
      firstName,
      lastName,
      title: getField(fields, "Title"),
      companyName,
      email: getField(fields, "Email"),
      emailVerificationSource: getField(fields, "Primary Email Verification Source"),
      mobilePhone,
      otherPhone,
      employeeCount: isNaN(employeeCount as number) ? null : employeeCount,
      industry: getField(fields, "Industry"), // Keep for reference but don't use for tagging
      city: getField(fields, "City"),
      state: getField(fields, "State"),
      inferredTags,
      employeeRange,
      extraPhonesNote,
      _rowIndex: rowIndex,
    };
    
    rows.push(row);
  }
  
  console.log(`[Apollo CSV Parser] Parsed ${rows.length} valid contacts`);
  if (rows.length > 0) {
    console.log("[Apollo CSV Parser] First contact:", rows[0]);
  }
  
  return rows;
}

/**
 * Group Apollo CSV rows by company
 * Sorts contacts within each group by decision-maker score
 */
export function groupByCompany(rows: ApolloCSVRow[]): CompanyGroup[] {
  const groupMap = new Map<string, CompanyGroup>();
  
  for (const row of rows) {
    // Create a key from company name + city + state
    const key = `${row.companyName.toLowerCase()}|${row.city.toLowerCase()}|${row.state.toLowerCase()}`;
    
    if (!groupMap.has(key)) {
      groupMap.set(key, {
        companyName: row.companyName,
        city: row.city,
        state: row.state,
        employeeCount: row.employeeCount,
        employeeRange: row.employeeRange,
        inferredTags: row.inferredTags,
        contacts: [],
      });
    }
    
    const group = groupMap.get(key)!;
    group.contacts.push(row);
    
    // Merge tags (union)
    for (const tag of row.inferredTags) {
      if (!group.inferredTags.includes(tag)) {
        group.inferredTags.push(tag);
      }
    }
    
    // Update employee count if this row has it and group doesn't
    if (row.employeeCount && !group.employeeCount) {
      group.employeeCount = row.employeeCount;
      group.employeeRange = row.employeeRange;
    }
  }
  
  // Sort contacts within each group by decision-maker score (descending)
  for (const group of groupMap.values()) {
    group.contacts.sort((a, b) => 
      scoreDecisionMakerTitle(b.title) - scoreDecisionMakerTitle(a.title)
    );
  }
  
  // Convert to array and sort by company name
  const groups = Array.from(groupMap.values());
  groups.sort((a, b) => a.companyName.localeCompare(b.companyName));
  
  return groups;
}

/**
 * Deduplicate Apollo rows by email
 */
export function dedupeApolloByEmail(rows: ApolloCSVRow[]): ApolloCSVRow[] {
  const emailMap = new Map<string, ApolloCSVRow>();
  const noEmailRows: ApolloCSVRow[] = [];
  
  for (const row of rows) {
    if (!row.email) {
      noEmailRows.push(row);
      continue;
    }
    
    const lowerEmail = row.email.toLowerCase();
    
    if (!emailMap.has(lowerEmail)) {
      emailMap.set(lowerEmail, row);
    } else {
      // Merge: prefer row with more data
      const existing = emailMap.get(lowerEmail)!;
      
      // Fill in missing fields from duplicate
      if (!existing.mobilePhone && row.mobilePhone) existing.mobilePhone = row.mobilePhone;
      if (!existing.otherPhone && row.otherPhone) existing.otherPhone = row.otherPhone;
      if (!existing.title && row.title) existing.title = row.title;
    }
  }
  
  return [...emailMap.values(), ...noEmailRows];
}

// ============================================================================
// LEGACY CSV PARSING (Original format)
// ============================================================================

/**
 * Parse legacy CSV text into array of rows
 * Handles quoted fields with embedded newlines and commas
 */
export function parseCSV(csvText: string): ParsedCSVRow[] {
  const rows: ParsedCSVRow[] = [];
  const lines = parseCSVToLines(csvText);
  
  console.log(`[CSV Parser] Parsed ${lines.length} lines from CSV`);
  
  if (lines.length === 0) {
    console.log("[CSV Parser] No lines found in CSV");
    return [];
  }
  
  // Log header for debugging
  console.log("[CSV Parser] Header:", lines[0].substring(0, 100) + "...");
  
  // Parse each line into fields
  for (let rowIndex = 1; rowIndex < lines.length; rowIndex++) {
    const line = lines[rowIndex];
    const fields = parseCSVLine(line);
    
    // Map fields to ParsedCSVRow
    // Column order: Last Name, First Name, Company, Link, Type, Company Info, 
    // Company Headcount, Time Zone, Mobile, Direct, Email, Position, 
    // Personal Connector + Bio, Answered, Last Email Sent Date, Email Notes,
    // Last Email Sent Date (dup), Notes, Start, Day X columns...
    
    const row: ParsedCSVRow = {
      lastName: cleanField(fields[0]),
      firstName: cleanField(fields[1]),
      company: cleanField(fields[2]),
      linkedinUrl: cleanField(fields[3]),
      type: cleanField(fields[4]),
      companyInfo: cleanField(fields[5]),
      companyHeadcount: cleanField(fields[6]),
      timeZone: cleanField(fields[7]),
      mobile: cleanField(fields[8]),
      direct: cleanField(fields[9]),
      email: cleanField(fields[10]),
      position: cleanField(fields[11]),
      personalConnector: cleanField(fields[12]),
      answered: cleanField(fields[13]),
      notes: cleanField(fields[17]), // Notes is at index 17
      _rowIndex: rowIndex,
    };
    
    // Only add rows that have at least a name
    if (row.firstName || row.lastName) {
      rows.push(row);
    }
  }
  
  console.log(`[CSV Parser] Parsed ${rows.length} valid contacts`);
  if (rows.length > 0) {
    console.log("[CSV Parser] First contact:", rows[0]);
  }
  
  return rows;
}

/**
 * Deduplicate rows - keep only rows with non-empty LinkedIn URL
 * When same person appears twice (one with Link, one without), keep the one with Link
 */
export function dedupeByLink(rows: ParsedCSVRow[]): ParsedCSVRow[] {
  // Group by (firstName + lastName + company) key
  const groups = new Map<string, ParsedCSVRow[]>();
  
  for (const row of rows) {
    const key = `${row.firstName.toLowerCase()}|${row.lastName.toLowerCase()}|${row.company.toLowerCase()}`;
    
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(row);
  }
  
  // For each group, prefer the row with a LinkedIn URL
  const dedupedRows: ParsedCSVRow[] = [];
  
  for (const groupRows of groups.values()) {
    if (groupRows.length === 1) {
      dedupedRows.push(groupRows[0]);
    } else {
      // Find row with LinkedIn URL
      const withLink = groupRows.find(r => r.linkedinUrl.length > 0);
      if (withLink) {
        // Merge any additional data from other rows
        const merged = mergeRows(withLink, groupRows.filter(r => r !== withLink));
        dedupedRows.push(merged);
      } else {
        // No LinkedIn URL in any row, keep first
        dedupedRows.push(groupRows[0]);
      }
    }
  }
  
  return dedupedRows;
}

/**
 * Merge data from additional rows into the primary row
 * Fills in blank fields from other rows
 */
function mergeRows(primary: ParsedCSVRow, others: ParsedCSVRow[]): ParsedCSVRow {
  const merged = { ...primary };
  
  for (const other of others) {
    // Fill in any blank fields from other rows
    if (!merged.mobile && other.mobile) merged.mobile = other.mobile;
    if (!merged.direct && other.direct) merged.direct = other.direct;
    if (!merged.email && other.email) merged.email = other.email;
    if (!merged.personalConnector && other.personalConnector) merged.personalConnector = other.personalConnector;
    if (!merged.notes && other.notes) merged.notes = other.notes;
  }
  
  return merged;
}

// ============================================================================
// DOMAIN EXTRACTION
// ============================================================================

/**
 * Extract domain from email address
 */
export function extractDomain(email: string): string | null {
  if (!email) return null;
  
  const cleaned = email.trim().toLowerCase();
  const atIndex = cleaned.lastIndexOf("@");
  
  if (atIndex === -1 || atIndex === cleaned.length - 1) return null;
  
  const domain = cleaned.substring(atIndex + 1);
  
  // Filter out common personal email domains
  const personalDomains = [
    "gmail.com", "yahoo.com", "hotmail.com", "outlook.com",
    "aol.com", "icloud.com", "mail.com", "protonmail.com",
    "live.com", "msn.com", "me.com"
  ];
  
  if (personalDomains.includes(domain)) {
    return null;
  }
  
  return domain;
}

// ============================================================================
// DATABASE MAPPING - LEGACY CSV
// ============================================================================

/**
 * Map parsed CSV row to contact insert data (legacy format)
 */
export function mapToContact(
  row: ParsedCSVRow,
  userId: string,
  companyId?: string
): InsertTables<"contacts"> {
  const domain = extractDomain(row.email);
  
  return {
    user_id: userId,
    company_id: companyId || null,
    first_name: row.firstName,
    last_name: row.lastName || null,
    email: row.email || null,
    phone: row.direct || null, // Direct → contacts.phone (primary dial number)
    mobile: row.mobile || null, // Mobile → contacts.mobile
    linkedin_url: row.linkedinUrl || null,
    title: row.position || null,
    company_name: row.company || null,
    company_domain: domain,
    industry: row.type || null,
    state: row.companyInfo || null, // Company Info contains state
    employee_range: normalizeEmployeeRange(row.companyHeadcount),
    source: "csv_import",
    source_list: "CX Call List",
    stage: "fresh",
    status: "active",
    direct_referral_note: row.personalConnector || null,
    tags: row.answered?.toLowerCase() === "yes" ? ["answered"] : [],
    lead_score: 0,
    total_calls: 0,
    total_emails: 0,
  };
}

/**
 * Map parsed CSV row to company insert data (legacy format)
 */
export function mapToCompany(
  row: ParsedCSVRow,
  userId: string,
  domain: string | null
): InsertTables<"companies"> | null {
  if (!row.company) return null;
  
  return {
    user_id: userId,
    name: row.company,
    domain: domain,
    industry: row.type || null,
    state: row.companyInfo || null,
    employee_range: normalizeEmployeeRange(row.companyHeadcount),
    timezone: mapTimezone(row.timeZone),
    country: "USA",
  };
}

// ============================================================================
// DATABASE MAPPING - APOLLO CSV
// ============================================================================

/**
 * Map Apollo CSV row to contact insert data
 */
/**
 * Clean phone number by removing quotes, plus signs, and extra whitespace
 */
function cleanPhoneNumber(phone: string | null | undefined): string | null {
  if (!phone) return null;
  
  // Remove quotes and clean whitespace
  let cleaned = phone
    .replace(/^['"]+|['"]+$/g, "") // Remove leading/trailing quotes
    .trim();
  
  // Return null if empty after cleaning
  if (cleaned.length === 0) return null;
  
  // Normalize to E.164 format for Twilio compatibility
  const normalized = normalizeToE164(cleaned);
  
  // Return normalized version, or cleaned version if normalization fails
  return normalized || cleaned;
}

export function mapApolloToContact(
  row: ApolloCSVRow,
  userId: string,
  companyId?: string
): InsertTables<"contacts"> {
  const domain = extractDomain(row.email);
  
  // Calculate priority score based on title
  const priorityScore = scoreDecisionMakerTitle(row.title);
  
  // Clean phone numbers
  const mobile = cleanPhoneNumber(row.mobilePhone);
  const phone = cleanPhoneNumber(row.otherPhone);
  
  // Ensure first_name is never empty (required field)
  // Fallback order: firstName -> lastName -> email prefix -> "Unknown"
  let firstName = row.firstName?.trim() || "";
  if (!firstName) {
    firstName = row.lastName?.trim() || 
                (row.email ? row.email.split("@")[0] : null) ||
                "Unknown";
  }
  
  return {
    user_id: userId,
    company_id: companyId || null,
    first_name: firstName,
    last_name: row.lastName || null,
    email: row.email || null,
    phone: phone, // Other Phone → contacts.phone
    mobile: mobile, // Mobile Phone → contacts.mobile
    linkedin_url: null,
    title: row.title || null,
    company_name: row.companyName || null,
    company_domain: domain,
    industry: row.inferredTags.join(", ") || null, // Use inferred tags
    city: row.city || null,
    state: row.state || null,
    employee_count: row.employeeCount,
    employee_range: row.employeeRange,
    source: "apollo_csv_import",
    source_list: "Apollo Export",
    stage: "fresh",
    status: "active",
    tags: row.inferredTags,
    lead_score: 0,
    priority_score: priorityScore, // Score based on title (Owner=100, CEO=90, etc.)
    total_calls: 0,
    total_emails: 0,
  };
}

/**
 * Map Apollo CSV row to company insert data
 */
export function mapApolloToCompany(
  row: ApolloCSVRow,
  userId: string,
  domain: string | null
): InsertTables<"companies"> | null {
  if (!row.companyName) return null;
  
  return {
    user_id: userId,
    name: row.companyName,
    domain: domain,
    industry: row.inferredTags.join(", ") || null,
    city: row.city || null,
    state: row.state || null,
    employee_count: row.employeeCount,
    employee_range: row.employeeRange,
    country: "USA",
  };
}

// ============================================================================
// IMPORT PREPARATION
// ============================================================================

/**
 * Parse and prepare legacy CSV data for import
 * Returns deduped, mapped rows ready for database insertion
 */
export function prepareImport(csvText: string): {
  rows: ParsedCSVRow[];
  stats: {
    totalRows: number;
    afterDedupe: number;
    duplicatesRemoved: number;
  };
} {
  const allRows = parseCSV(csvText);
  const dedupedRows = dedupeByLink(allRows);
  
  return {
    rows: dedupedRows,
    stats: {
      totalRows: allRows.length,
      afterDedupe: dedupedRows.length,
      duplicatesRemoved: allRows.length - dedupedRows.length,
    },
  };
}

/**
 * Parse and prepare Apollo CSV data for import
 * Returns grouped companies with contacts
 */
export function prepareApolloImport(csvText: string): {
  groups: CompanyGroup[];
  allRows: ApolloCSVRow[];
  stats: {
    totalRows: number;
    afterDedupe: number;
    duplicatesRemoved: number;
    totalCompanies: number;
    withMobile: number;
    withWorkPhone: number;
    missingBothPhones: number;
    topTags: { tag: string; count: number }[];
  };
} {
  const allRows = parseApolloCSV(csvText);
  const dedupedRows = dedupeApolloByEmail(allRows);
  const groups = groupByCompany(dedupedRows);
  
  // Updated stats - only check Mobile Phone and Other Phone
  const withMobile = dedupedRows.filter(r => r.mobilePhone).length;
  const withOtherPhone = dedupedRows.filter(r => r.otherPhone).length;
  const missingBothPhones = dedupedRows.filter(r => 
    !r.mobilePhone && !r.otherPhone
  ).length;
  
  // Count tags
  const tagCounts = new Map<string, number>();
  for (const row of dedupedRows) {
    for (const tag of row.inferredTags) {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    }
  }
  const topTags = Array.from(tagCounts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  
  return {
    groups,
    allRows: dedupedRows,
    stats: {
      totalRows: allRows.length,
      afterDedupe: dedupedRows.length,
      duplicatesRemoved: allRows.length - dedupedRows.length,
      totalCompanies: groups.length,
      withMobile,
      withWorkPhone: withOtherPhone, // Rename for UI compatibility
      missingBothPhones,
      topTags,
    },
  };
}
