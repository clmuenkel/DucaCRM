import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_USER_ID } from "@/lib/default-user";
import { renderTemplate } from "@/lib/email-template-renderer";
import { getIndustryForTemplate } from "@/lib/utils";
import type { EmailTemplate, Contact } from "@/types/database";

export const dynamic = 'force-dynamic';
export const runtime = 'edge';

interface TestTemplateRequest {
  templateId: string;
  contactId?: string;
  customVariables?: Record<string, string>;
}

/**
 * POST /api/templates/test
 * Test template rendering with sample or real contact data
 */
export async function POST(request: NextRequest) {
  try {
    const body: TestTemplateRequest = await request.json();
    const { templateId, contactId, customVariables = {} } = body;

    if (!templateId) {
      return NextResponse.json(
        { error: "templateId is required" },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const userId = DEFAULT_USER_ID;

    // Get template
    const { data: template, error: templateError } = await supabase
      .from("email_templates")
      .select("*")
      .eq("id", templateId)
      .eq("user_id", userId)
      .single();

    if (templateError || !template) {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 }
      );
    }

    const typedTemplate = template as EmailTemplate;

    // Get contact data if provided, otherwise use sample data
    let variables: Record<string, string> = {
      first_name: "John",
      last_name: "Smith",
      full_name: "John Smith",
      company: "Acme Corporation",
      title: "VP of Operations",
      email: "john.smith@acme.com",
      phone: "(555) 123-4567",
      industry: "home services",
      sender_name: "Your Name",
      sender_calendar: "https://calendly.com/your-link",
      meeting_date: "Tuesday, January 20th",
      meeting_time: "2:00 PM EST",
    };

    if (contactId) {
      const { data: contact } = await supabase
        .from("contacts")
        .select("*")
        .eq("id", contactId)
        .eq("user_id", userId)
        .single();

      if (contact) {
        const typedContact = contact as Contact;
        variables = {
          first_name: typedContact.first_name || "",
          last_name: typedContact.last_name || "",
          full_name: `${typedContact.first_name} ${typedContact.last_name || ""}`.trim(),
          company: typedContact.company_name || "",
          title: typedContact.title || "",
          email: typedContact.email || "",
          phone: typedContact.phone || typedContact.mobile || "",
          industry: getIndustryForTemplate(typedContact),
          sender_name: "Your Name", // Would come from profile
          sender_calendar: "https://calendly.com/your-link", // Would come from profile
          meeting_date: "Tuesday, January 20th",
          meeting_time: "2:00 PM EST",
        };
      }
    }

    // Get user profile for sender info
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, calendar_link")
      .eq("id", userId)
      .single();

    const typedProfile = profile as { full_name: string | null; calendar_link: string | null } | null;

    if (typedProfile) {
      variables.sender_name = typedProfile.full_name || variables.sender_name;
      variables.sender_calendar = typedProfile.calendar_link || variables.sender_calendar;
    }

    // Override with custom variables
    Object.assign(variables, customVariables);

    // Render template
    const subject = renderTemplate(typedTemplate.subject_template, variables);
    const renderedBody = renderTemplate(typedTemplate.body_template, variables);

    return NextResponse.json({
      success: true,
      subject,
      body: renderedBody,
      variables,
      template: {
        id: typedTemplate.id,
        name: typedTemplate.name,
        category: typedTemplate.category,
      },
    });
  } catch (error: any) {
    console.error("Test template error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to test template" },
      { status: 500 }
    );
  }
}
