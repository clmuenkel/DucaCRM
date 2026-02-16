#!/usr/bin/env node

/**
 * Test Apollo API keyword-based search filters.
 *
 * Usage:
 *   node scripts/test-apollo-filters.mjs --industry plumbing --size "1,10" --limit 5
 *
 * Options:
 *   --industry  Industry key (plumbing, hvac, roofing, landscaping, pest_control)
 *   --size      Employee range bucket (default "1,10")
 *   --limit     Max results (default 5)
 */

import { readFileSync } from "fs";
import { resolve } from "path";

// ── Parse CLI args ──────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
}

const industry = getArg("industry") || "plumbing";
const size = getArg("size") || "1,10";
const limit = parseInt(getArg("limit") || "5", 10);

// ── Resolve API key ─────────────────────────────────────────
let apiKey = process.env.APOLLO_API_KEY;
if (!apiKey) {
  try {
    const envPath = resolve(process.cwd(), ".env");
    const envContent = readFileSync(envPath, "utf-8");
    const match = envContent.match(/^APOLLO_API_KEY=(.+)$/m);
    if (match) apiKey = match[1].trim().replace(/^["']|["']$/g, "");
  } catch {}
}
if (!apiKey) {
  console.error("❌ No APOLLO_API_KEY found in env or .env file");
  process.exit(1);
}

// ── Industry keywords ───────────────────────────────────────
const INDUSTRY_KEYWORDS = {
  plumbing: ["plumbing", "plumbing services"],
  hvac: ["hvac", "heating and cooling", "air conditioning"],
  roofing: ["roofing", "roof repair"],
  landscaping: ["landscaping", "lawn care", "landscape"],
  pest_control: ["pest control", "exterminator", "pest management"],
};

const keywords = INDUSTRY_KEYWORDS[industry];
if (!keywords) {
  console.error(`❌ Unknown industry "${industry}". Valid: ${Object.keys(INDUSTRY_KEYWORDS).join(", ")}`);
  process.exit(1);
}

// ── Title sets ──────────────────────────────────────────────
const OWNER_TITLES = ["Owner", "CEO", "President", "Founder"];
const EXPANDED_TITLES = [...OWNER_TITLES, "COO", "CFO", "Operations Manager", "Procurement"];

const maxEmployees = parseInt(size.split(",")[1] || "10", 10);
const titles = maxEmployees <= 20 ? OWNER_TITLES : EXPANDED_TITLES;

// ── Search ──────────────────────────────────────────────────
console.log(`\n🔍 Apollo keyword search`);
console.log(`   Industry:  ${industry} → keywords: ${JSON.stringify(keywords)}`);
console.log(`   Size:      ${size} employees`);
console.log(`   Titles:    ${titles.join(", ")}`);
console.log(`   Limit:     ${limit}\n`);

const payload = {
  q_organization_keyword_tags: keywords,
  organization_num_employees_ranges: [size],
  person_titles: titles,
  person_locations: ["United States"],
  per_page: limit,
};

async function search(body) {
  const res = await fetch("https://api.apollo.io/v1/mixed_people/api_search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`❌ Apollo API ${res.status}: ${text.substring(0, 300)}`);
    process.exit(1);
  }
  return res.json();
}

const data = await search(payload);
const people = data.people || [];

if (people.length === 0) {
  console.log("⚠️  Zero results with owner titles, broadening...\n");
  const broadPayload = { ...payload, person_titles: EXPANDED_TITLES };
  const broadData = await search(broadPayload);
  people.push(...(broadData.people || []));
}

console.log(`✅ Found ${people.length} results:\n`);
console.log("─".repeat(100));
console.log(
  "Name".padEnd(25) +
    "Title".padEnd(25) +
    "Organization".padEnd(25) +
    "Email".padEnd(12) +
    "Phone".padEnd(12)
);
console.log("─".repeat(100));

for (const p of people) {
  const name = `${p.first_name || ""} ${p.last_name || ""}`.trim().substring(0, 24);
  const title = (p.title || "—").substring(0, 24);
  const org = (p.organization?.name || "—").substring(0, 24);
  const email = p.email ? "✅ yes" : p.has_email ? "🔒 hidden" : "❌ no";
  const phone = p.has_direct_phone === true || p.has_direct_phone === "Yes" ? "✅ yes" : "❌ no";

  console.log(
    name.padEnd(25) +
      title.padEnd(25) +
      org.padEnd(25) +
      email.padEnd(12) +
      phone.padEnd(12)
  );
}

console.log("─".repeat(100));
console.log(`\nPagination: page ${data.pagination?.page || 1}, total: ${data.pagination?.total_entries || "?"}`);
