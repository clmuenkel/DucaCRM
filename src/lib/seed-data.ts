// Dummy data for testing the CRM
// This file can be imported and run to seed the database with test data

import { createClient } from "@/lib/supabase/client";
import { DEFAULT_USER_ID } from "@/lib/default-user";
import { getTimezoneFromLocation } from "@/lib/timezone";

// Dummy companies - Home Services
const DUMMY_COMPANIES = [
  {
    name: "Houston HVAC Pros",
    domain: "houstonhvacpros.com",
    industry: "hvac",
    employee_count: 25,
    employee_range: "1-50",
    city: "Houston",
    state: "TX",
    country: "US",
    website: "https://houstonhvacpros.com",
    annual_revenue: "$1M - $5M",
  },
  {
    name: "ABC Plumbing & Drain",
    domain: "abcplumbingdrain.com",
    industry: "plumbing",
    employee_count: 18,
    employee_range: "1-50",
    city: "Dallas",
    state: "TX",
    country: "US",
    website: "https://abcplumbingdrain.com",
    annual_revenue: "$500K - $1M",
  },
  {
    name: "Summit Roofing Solutions",
    domain: "summitroofing.com",
    industry: "roofing",
    employee_count: 35,
    employee_range: "1-50",
    city: "Denver",
    state: "CO",
    country: "US",
    website: "https://summitroofing.com",
    annual_revenue: "$2M - $5M",
  },
  {
    name: "Bright Spark Electric",
    domain: "brightsparkelectric.com",
    industry: "electrical",
    employee_count: 22,
    employee_range: "1-50",
    city: "Phoenix",
    state: "AZ",
    country: "US",
    website: "https://brightsparkelectric.com",
    annual_revenue: "$1M - $2M",
  },
  {
    name: "SunPower Solar Installers",
    domain: "sunpowersolaraz.com",
    industry: "solar",
    employee_count: 45,
    employee_range: "1-50",
    city: "Scottsdale",
    state: "AZ",
    country: "US",
    website: "https://sunpowersolaraz.com",
    annual_revenue: "$5M - $10M",
  },
  {
    name: "Premier Home Builders",
    domain: "premierhomebuilders.com",
    industry: "construction",
    employee_count: 40,
    employee_range: "1-50",
    city: "Austin",
    state: "TX",
    country: "US",
    website: "https://premierhomebuilders.com",
    annual_revenue: "$3M - $5M",
  },
];

// Dummy contacts for each company
const DUMMY_CONTACTS_BY_COMPANY: Record<string, Array<{
  first_name: string;
  last_name: string;
  title: string;
  email: string;
  phone: string;
  linkedin_url: string;
  seniority: string;
  department: string;
}>> = {
  "houstonhvacpros.com": [
    {
      first_name: "Mike",
      last_name: "Johnson",
      title: "Owner",
      email: "mike@houstonhvacpros.com",
      phone: "+1 (713) 555-0101",
      linkedin_url: "https://linkedin.com/in/mikejohnson-hvac",
      seniority: "owner",
      department: "executive",
    },
    {
      first_name: "Sarah",
      last_name: "Martinez",
      title: "Office Manager",
      email: "sarah@houstonhvacpros.com",
      phone: "+1 (713) 555-0102",
      linkedin_url: "https://linkedin.com/in/sarahmartinez",
      seniority: "manager",
      department: "operations",
    },
  ],
  "abcplumbingdrain.com": [
    {
      first_name: "Robert",
      last_name: "Williams",
      title: "President",
      email: "rob@abcplumbingdrain.com",
      phone: "+1 (214) 555-0201",
      linkedin_url: "https://linkedin.com/in/robwilliams-plumber",
      seniority: "owner",
      department: "executive",
    },
    {
      first_name: "Linda",
      last_name: "Chen",
      title: "Operations Manager",
      email: "linda@abcplumbingdrain.com",
      phone: "+1 (214) 555-0202",
      linkedin_url: "https://linkedin.com/in/lindachen",
      seniority: "manager",
      department: "operations",
    },
  ],
  "summitroofing.com": [
    {
      first_name: "David",
      last_name: "Thompson",
      title: "Founder & CEO",
      email: "david@summitroofing.com",
      phone: "+1 (303) 555-0301",
      linkedin_url: "https://linkedin.com/in/davidthompson-roofing",
      seniority: "owner",
      department: "executive",
    },
    {
      first_name: "Jennifer",
      last_name: "Lee",
      title: "Sales Manager",
      email: "jennifer@summitroofing.com",
      phone: "+1 (303) 555-0302",
      linkedin_url: "https://linkedin.com/in/jenniferlee",
      seniority: "manager",
      department: "sales",
    },
  ],
  "brightsparkelectric.com": [
    {
      first_name: "James",
      last_name: "Garcia",
      title: "Owner",
      email: "james@brightsparkelectric.com",
      phone: "+1 (602) 555-0401",
      linkedin_url: "https://linkedin.com/in/jamesgarcia-electric",
      seniority: "owner",
      department: "executive",
    },
  ],
  "sunpowersolaraz.com": [
    {
      first_name: "Michael",
      last_name: "Brown",
      title: "President",
      email: "michael@sunpowersolaraz.com",
      phone: "+1 (480) 555-0501",
      linkedin_url: "https://linkedin.com/in/michaelbrown-solar",
      seniority: "owner",
      department: "executive",
    },
    {
      first_name: "Emily",
      last_name: "Davis",
      title: "VP of Sales",
      email: "emily@sunpowersolaraz.com",
      phone: "+1 (480) 555-0502",
      linkedin_url: "https://linkedin.com/in/emilydavis",
      seniority: "vp",
      department: "sales",
    },
  ],
  "premierhomebuilders.com": [
    {
      first_name: "Chris",
      last_name: "Anderson",
      title: "Owner & General Contractor",
      email: "chris@premierhomebuilders.com",
      phone: "+1 (512) 555-0601",
      linkedin_url: "https://linkedin.com/in/chrisanderson-builder",
      seniority: "owner",
      department: "executive",
    },
    {
      first_name: "Amanda",
      last_name: "Wilson",
      title: "Project Manager",
      email: "amanda@premierhomebuilders.com",
      phone: "+1 (512) 555-0602",
      linkedin_url: "https://linkedin.com/in/amandawilson",
      seniority: "manager",
      department: "operations",
    },
  ],
};

export async function seedDummyData() {
  const supabase = await createClient();
  const userId = DEFAULT_USER_ID;
  
  const results = {
    companies: 0,
    contacts: 0,
    calls: 0,
    tasks: 0,
    errors: [] as string[],
  };

  try {
    // 1. Create companies
    for (const companyData of DUMMY_COMPANIES) {
      const timezone = getTimezoneFromLocation(
        companyData.city,
        companyData.state,
        companyData.country
      );

      const { data: company, error: companyError } = await supabase
        .from("companies")
        .insert({
          user_id: userId,
          ...companyData,
          timezone,
        })
        .select()
        .single();

      if (companyError) {
        results.errors.push(`Company ${companyData.name}: ${companyError.message}`);
        continue;
      }

      results.companies++;

      // 2. Create contacts for this company
      const contactsData = DUMMY_CONTACTS_BY_COMPANY[companyData.domain] || [];
      
      for (const contactData of contactsData) {
        const { data: contact, error: contactError } = await supabase
          .from("contacts")
          .insert({
            user_id: userId,
            company_id: company.id,
            ...contactData,
            company_name: companyData.name,
            company_domain: companyData.domain,
            industry: companyData.industry,
            employee_count: companyData.employee_count,
            employee_range: companyData.employee_range,
            city: companyData.city,
            state: companyData.state,
            country: companyData.country,
            source: "seed_data",
            stage: "fresh",
            status: "active",
          })
          .select()
          .single();

        if (contactError) {
          results.errors.push(`Contact ${contactData.first_name}: ${contactError.message}`);
          continue;
        }

        results.contacts++;

        // 3. Add a call for some contacts (randomly)
        if (Math.random() > 0.5) {
          const outcomes = ["connected", "voicemail", "no_answer"];
          const outcome = outcomes[Math.floor(Math.random() * outcomes.length)];
          
          const startedAt = new Date();
          startedAt.setDate(startedAt.getDate() - Math.floor(Math.random() * 14)); // Random day in last 2 weeks
          
          const durationSeconds = outcome === "connected" 
            ? Math.floor(Math.random() * 300) + 60 // 1-6 minutes if connected
            : Math.floor(Math.random() * 30); // 0-30 seconds otherwise

          const endedAt = new Date(startedAt.getTime() + durationSeconds * 1000);

          const { error: callError } = await supabase
            .from("calls")
            .insert({
              user_id: userId,
              contact_id: contact.id,
              started_at: startedAt.toISOString(),
              ended_at: endedAt.toISOString(),
              duration_seconds: durationSeconds,
              outcome,
              notes: outcome === "connected" 
                ? "Had a good conversation about their service needs." 
                : outcome === "voicemail" 
                  ? "Left voicemail with brief intro." 
                  : null,
              timestamped_notes: outcome === "connected" ? [
                { time: "00:15", note: "Intro - asked about current setup" },
                { time: "01:30", note: "Discussed pain points" },
                { time: "03:00", note: "Interested in learning more" },
              ] : [],
            });

          if (!callError) {
            results.calls++;
            
            // Update contact's last_contacted_at
            await supabase
              .from("contacts")
              .update({ 
                last_contacted_at: startedAt.toISOString(),
                stage: outcome === "connected" ? "contacted" : "fresh",
              })
              .eq("id", contact.id);
          }
        }

        // 4. Add tasks for some contacts
        if (Math.random() > 0.6) {
          const taskTypes = ["call", "email", "follow_up"];
          const dueDate = new Date();
          dueDate.setDate(dueDate.getDate() + Math.floor(Math.random() * 7) + 1);

          const { error: taskError } = await supabase
            .from("tasks")
            .insert({
              user_id: userId,
              contact_id: contact.id,
              title: `Follow up with ${contactData.first_name}`,
              type: taskTypes[Math.floor(Math.random() * taskTypes.length)],
              priority: "medium",
              status: "pending",
              due_date: dueDate.toISOString().split("T")[0],
            });

          if (!taskError) {
            results.tasks++;
          }
        }
      }
    }

    // 5. Create persona sets for home services
    const personaSets = [
      {
        user_id: userId,
        name: "Home Services Owners",
        titles: ["Owner", "President", "Founder", "CEO"],
        industries: ["hvac", "plumbing", "roofing", "electrical"],
        employee_ranges: ["1-50", "51-200"],
        include_intent_data: false,
        is_default: true,
      },
      {
        user_id: userId,
        name: "Solar & Construction Leaders",
        titles: ["Owner", "President", "General Manager"],
        industries: ["solar", "construction"],
        employee_ranges: ["1-50", "51-200"],
        include_intent_data: false,
        is_default: false,
      },
    ];

    for (const personaSet of personaSets) {
      await supabase.from("persona_sets").insert(personaSet);
    }

    return results;
  } catch (error: any) {
    results.errors.push(`Unexpected error: ${error.message}`);
    return results;
  }
}

export async function clearDummyData() {
  const supabase = await createClient();
  const userId = DEFAULT_USER_ID;

  // Delete in order to avoid FK constraints
  await supabase.from("tasks").delete().eq("user_id", userId);
  await supabase.from("calls").delete().eq("user_id", userId);
  await supabase.from("notes").delete().eq("user_id", userId);
  await supabase.from("contacts").delete().eq("user_id", userId);
  await supabase.from("companies").delete().eq("user_id", userId);
  await supabase.from("persona_sets").delete().eq("user_id", userId);

  return { success: true };
}
