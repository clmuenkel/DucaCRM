import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_USER_ID } from "@/lib/default-user";

export const dynamic = 'force-dynamic';

interface ImportRequest {
  companyIds?: string[]; // Specific companies to import
  personIds?: string[]; // Specific people to import
  importAll?: boolean; // Import all enriched leads
  onlyDM?: boolean; // Only import companies with decision maker info
}

interface ImportResult {
  companyId: string;
  companyName: string;
  contactName: string;
  status: "created" | "updated" | "skipped" | "failed";
  crmContactId?: string;
  crmCompanyId?: string;
  error?: string;
}

/**
 * POST /api/leads/import-to-crm
 * Import lead_companies and lead_people into the main CRM tables (contacts, companies)
 */
export async function POST(request: NextRequest) {
  try {
    const body: ImportRequest = await request.json();
    const { companyIds, personIds, importAll = false, onlyDM = false } = body;

    const supabase = createClient();
    const userId = DEFAULT_USER_ID;

    // Build query for lead companies to import
    let query = (supabase as any)
      .from("lead_companies")
      .select(`
        id,
        name,
        domain,
        website,
        phone,
        address,
        city,
        state,
        zip,
        country,
        industry_tag,
        contact_type,
        fallback_email,
        fallback_phone,
        lead_people (
          id,
          full_name,
          first_name,
          last_name,
          title,
          email,
          email_status,
          phone,
          phone_type,
          linkedin_url,
          confidence_score,
          is_primary_contact,
          is_decision_maker
        )
      `)
      .eq("user_id", userId)
      .in("enrichment_status", ["enriched", "no_match"]); // Only import processed companies

    if (companyIds && companyIds.length > 0) {
      query = query.in("id", companyIds);
    } else if (!importAll) {
      return NextResponse.json(
        { error: "Provide companyIds or set importAll=true" },
        { status: 400 }
      );
    }

    if (onlyDM) {
      query = query.eq("contact_type", "dm");
    }

    const { data: leadCompanies, error: fetchError } = await query;

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!leadCompanies || leadCompanies.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No companies to import",
        stats: { imported: 0, skipped: 0, failed: 0 },
        results: [],
      });
    }

    const results: ImportResult[] = [];
    let imported = 0;
    let updated = 0;
    let skipped = 0;
    let failed = 0;

    for (const leadCompany of leadCompanies) {
      const lc = leadCompany as any;
      const people = (lc.lead_people as any[]) || [];
      
      try {
        // Find the best contact for this company
        let bestPerson = people.find((p: any) => p.is_primary_contact);
        if (!bestPerson && people.length > 0) {
          bestPerson = people.reduce((best: any, current: any) => 
            (current.confidence_score || 0) > (best?.confidence_score || 0) ? current : best
          , people[0]);
        }

        // Determine final contact info (DM or fallback)
        const contactEmail = bestPerson?.email || lc.fallback_email;
        const contactPhone = bestPerson?.phone || lc.fallback_phone || lc.phone;
        const contactName = bestPerson?.full_name || "Owner";
        const contactFirstName = bestPerson?.first_name || "Owner";
        const contactLastName = bestPerson?.last_name || "";
        const contactTitle = bestPerson?.title || "Owner";

        if (!contactEmail && !contactPhone) {
          // Skip if no contact info at all
          results.push({
            companyId: lc.id,
            companyName: lc.name,
            contactName: "N/A",
            status: "skipped",
            error: "No contact info available",
          });
          skipped++;
          continue;
        }

        // Step 1: Create or update company in main CRM
        const companyData = {
          user_id: userId,
          name: lc.name,
          domain: lc.domain,
          industry: lc.industry_tag,
          city: lc.city,
          state: lc.state,
          country: lc.country || "US",
          website: lc.website,
        };

        // Check if company already exists by domain
        let crmCompanyId: string | null = null;
        
        if (lc.domain) {
          const { data: existingCompany } = await (supabase as any)
            .from("companies")
            .select("id")
            .eq("user_id", userId)
            .eq("domain", lc.domain)
            .single();
          
          crmCompanyId = (existingCompany as any)?.id || null;
        }

        if (crmCompanyId) {
          // Update existing company
          await (supabase as any)
            .from("companies")
            .update(companyData)
            .eq("id", crmCompanyId);
        } else {
          // Create new company
          const { data: newCompany, error: companyError } = await (supabase as any)
            .from("companies")
            .insert(companyData)
            .select("id")
            .single();
          
          if (companyError) {
            console.error(`Company insert error for ${lc.name}:`, companyError);
          }
          crmCompanyId = (newCompany as any)?.id || null;
        }

        // Step 2: Create or update contact in main CRM
        const contactData = {
          user_id: userId,
          company_id: crmCompanyId,
          first_name: contactFirstName,
          last_name: contactLastName,
          email: contactEmail,
          phone: contactPhone,
          mobile: bestPerson?.phone_type === "mobile" ? bestPerson.phone : null,
          title: contactTitle,
          linkedin_url: bestPerson?.linkedin_url,
          company_name: lc.name,
          company_domain: lc.domain,
          industry: lc.industry_tag,
          city: lc.city,
          state: lc.state,
          country: lc.country || "US",
          stage: "fresh",
          status: "active",
          source: "Lead Gen Pipeline",
          source_list: `${lc.industry_tag} - ${lc.city}, ${lc.state}`,
          lead_score: bestPerson?.confidence_score || 20,
        };

        // Check if contact already exists by email
        let crmContactId: string | null = null;
        let isUpdate = false;
        
        if (contactEmail) {
          const { data: existingContact } = await (supabase as any)
            .from("contacts")
            .select("id")
            .eq("user_id", userId)
            .eq("email", contactEmail)
            .single();
          
          crmContactId = (existingContact as any)?.id || null;
          isUpdate = !!crmContactId;
        }

        if (crmContactId) {
          // Update existing contact
          await (supabase as any)
            .from("contacts")
            .update(contactData)
            .eq("id", crmContactId);
          updated++;
        } else {
          // Create new contact
          const { data: newContact, error: contactError } = await (supabase as any)
            .from("contacts")
            .insert(contactData)
            .select("id")
            .single();
          
          if (contactError) {
            throw new Error(`Contact insert failed: ${contactError.message}`);
          }
          crmContactId = (newContact as any)?.id || null;
          imported++;
        }

        // Step 3: Log activity
        if (crmContactId) {
          await (supabase as any)
            .from("activity_log")
            .insert({
              user_id: userId,
              contact_id: crmContactId,
              activity_type: isUpdate ? "contact_updated" : "contact_created",
              summary: `Imported from Lead Gen: ${lc.name} (${lc.contact_type === "dm" ? "Decision Maker" : "Fallback Contact"})`,
              metadata: {
                source: "lead_pipeline",
                lead_company_id: lc.id,
                contact_type: lc.contact_type,
                confidence_score: bestPerson?.confidence_score || 20,
              },
            });
        }

        results.push({
          companyId: lc.id,
          companyName: lc.name,
          contactName,
          status: isUpdate ? "updated" : "created",
          crmContactId: crmContactId || undefined,
          crmCompanyId: crmCompanyId || undefined,
        });

      } catch (error: any) {
        console.error(`Import error for ${lc.name}:`, error);
        failed++;
        results.push({
          companyId: lc.id,
          companyName: lc.name,
          contactName: "N/A",
          status: "failed",
          error: error.message,
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Imported ${imported} new contacts, updated ${updated}, skipped ${skipped}, failed ${failed}`,
      stats: {
        imported,
        updated,
        skipped,
        failed,
        total: leadCompanies.length,
      },
      results,
    });

  } catch (error: any) {
    console.error("Import to CRM error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to import leads" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/leads/import-to-crm
 * Get import preview - how many leads are ready to import
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createClient();
    const userId = DEFAULT_USER_ID;

    // Count enriched companies by contact type
    const { data: companies } = await (supabase as any)
      .from("lead_companies")
      .select("id, contact_type")
      .eq("user_id", userId)
      .in("enrichment_status", ["enriched", "no_match"]);

    const counts = {
      total: 0,
      withDM: 0,
      withFallback: 0,
    };

    for (const company of companies || []) {
      const c = company as any;
      counts.total++;
      if (c.contact_type === "dm") counts.withDM++;
      else if (c.contact_type === "fallback") counts.withFallback++;
    }

    // Check how many are already in CRM (by domain)
    const { data: existingCompanies } = await (supabase as any)
      .from("lead_companies")
      .select("domain")
      .eq("user_id", userId)
      .not("domain", "is", null);

    const domains = (existingCompanies || []).map((c: any) => c.domain).filter(Boolean);
    
    let alreadyInCRM = 0;
    if (domains.length > 0) {
      const { count } = await (supabase as any)
        .from("companies")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .in("domain", domains);
      alreadyInCRM = count || 0;
    }

    return NextResponse.json({
      readyToImport: counts.total,
      withDecisionMaker: counts.withDM,
      withFallbackContact: counts.withFallback,
      alreadyInCRM,
      newToImport: counts.total - alreadyInCRM,
    });

  } catch (error: any) {
    console.error("Import preview error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to get preview" },
      { status: 500 }
    );
  }
}
