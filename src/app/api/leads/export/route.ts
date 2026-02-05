import { NextRequest, NextResponse } from "next/server";
import { insforge } from "@/lib/insforge/server";
import { DEFAULT_USER_ID } from "@/lib/default-user";

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const industry = searchParams.get("industry");
    const state = searchParams.get("state");
    const minConfidence = parseInt(searchParams.get("minConfidence") || "0");
    const format = searchParams.get("format") || "csv";
    const onlyDM = searchParams.get("onlyDM") === "true";

        const userId = DEFAULT_USER_ID;

    // Get companies with their contacts and fallback data
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
          confidence_score,
          is_primary_contact,
          is_decision_maker
        )
      `)
      .eq("user_id", userId)
      .in("enrichment_status", ["enriched", "no_match"]) // Include no_match for fallbacks
      .order("created_at", { ascending: false });

    if (industry) {
      query = query.eq("industry_tag", industry);
    }
    if (state) {
      query = query.eq("state", state);
    }
    if (onlyDM) {
      query = query.eq("contact_type", "dm");
    }

    const { data: companies, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!companies || companies.length === 0) {
      return NextResponse.json(
        { error: "No companies found to export" },
        { status: 404 }
      );
    }

    // Process data - get best contact for each company (DM or fallback)
    const exportData: any[] = [];
    
    for (const company of companies) {
      const c = company as any;
      const people = (c.lead_people as any[]) || [];
      
      // Find best contact (primary or highest confidence)
      let bestContact = people.find((p: any) => p.is_primary_contact);
      if (!bestContact && people.length > 0) {
        bestContact = people.reduce((best: any, current: any) => 
          (current.confidence_score || 0) > (best?.confidence_score || 0) ? current : best
        , people[0]);
      }

      // Determine final contact info (DM or fallback)
      const hasDM = bestContact?.email && bestContact.confidence_score >= 50;
      const contactType = hasDM ? "DM" : "Fallback";
      
      const finalEmail = bestContact?.email || c.fallback_email || (c.domain ? `info@${c.domain}` : "");
      const finalPhone = bestContact?.phone || c.fallback_phone || c.phone || "";
      const finalName = bestContact?.full_name || "Owner";
      const finalFirstName = bestContact?.first_name || "Owner";
      const finalLastName = bestContact?.last_name || "";
      const finalTitle = bestContact?.title || "Owner";
      const finalConfidence = bestContact?.confidence_score || (c.fallback_email ? 20 : 10);

      // Filter by confidence if specified
      if (minConfidence > 0 && finalConfidence < minConfidence) {
        continue;
      }

      // Skip if no email at all
      if (!finalEmail) {
        continue;
      }

      exportData.push({
        company_name: c.name,
        company_website: c.website || "",
        company_phone: c.phone || "",
        company_address: c.address || "",
        company_city: c.city || "",
        company_state: c.state || "",
        industry: c.industry_tag || "",
        contact_name: finalName,
        contact_first_name: finalFirstName,
        contact_last_name: finalLastName,
        contact_title: finalTitle,
        contact_email: finalEmail,
        email_status: bestContact?.email_status || (finalEmail.startsWith("info@") ? "guessed" : "fallback"),
        contact_phone: finalPhone,
        phone_type: bestContact?.phone_type || "office",
        confidence_score: finalConfidence,
        contact_type: contactType,
      });
    }

    if (exportData.length === 0) {
      return NextResponse.json(
        { error: "No leads with contact info found" },
        { status: 404 }
      );
    }

    if (format === "json") {
      return NextResponse.json({ 
        leads: exportData, 
        total: exportData.length,
        dmCount: exportData.filter(e => e.contact_type === "DM").length,
        fallbackCount: exportData.filter(e => e.contact_type === "Fallback").length,
      });
    }

    // Generate CSV
    const headers = [
      "Company Name",
      "Website",
      "Company Phone",
      "Address",
      "City",
      "State",
      "Industry",
      "Contact Name",
      "First Name",
      "Last Name",
      "Title",
      "Email",
      "Email Status",
      "Direct Phone",
      "Phone Type",
      "Confidence",
      "Contact Type",
    ];

    const csvRows = [
      headers.join(","),
      ...exportData.map(row => [
        `"${(row.company_name || "").replace(/"/g, '""')}"`,
        `"${row.company_website}"`,
        `"${row.company_phone}"`,
        `"${(row.company_address || "").replace(/"/g, '""')}"`,
        `"${row.company_city}"`,
        `"${row.company_state}"`,
        `"${row.industry}"`,
        `"${(row.contact_name || "").replace(/"/g, '""')}"`,
        `"${row.contact_first_name}"`,
        `"${row.contact_last_name}"`,
        `"${(row.contact_title || "").replace(/"/g, '""')}"`,
        `"${row.contact_email}"`,
        `"${row.email_status}"`,
        `"${row.contact_phone}"`,
        `"${row.phone_type}"`,
        row.confidence_score,
        `"${row.contact_type}"`,
      ].join(","))
    ];

    const csv = csvRows.join("\n");
    
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="leads_export_${new Date().toISOString().split("T")[0]}.csv"`,
      },
    });
  } catch (error: any) {
    console.error("Export error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to export leads" },
      { status: 500 }
    );
  }
}
