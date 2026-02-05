import { NextRequest, NextResponse } from "next/server";
import { insforge } from "@/lib/insforge/server";
import { DEFAULT_USER_ID } from "@/lib/default-user";
import { renderTemplate, renderHTMLTemplate } from "@/lib/email-template-renderer";
import { getIndustryForTemplate } from "@/lib/utils";
import type { EmailTemplate, Contact } from "@/types/database";

export const dynamic = 'force-dynamic';

/**
 * GET /api/templates/preview?templateId=XXX&contactId=YYY
 * Visual HTML preview of email template that can be opened in browser
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const templateId = searchParams.get("templateId");
    const contactId = searchParams.get("contactId");

    if (!templateId) {
      return new NextResponse(
        "<html><body><h1>Error</h1><p>templateId parameter is required</p></body></html>",
        {
          status: 400,
          headers: { "Content-Type": "text/html" },
        }
      );
    }

        const userId = DEFAULT_USER_ID;

    // Get template
    const { data: template, error: templateError } = await supabase
      .from("email_templates")
      .select("*")
      .eq("id", templateId)
      .eq("user_id", userId)
      .single();

    if (templateError || !template) {
      return new NextResponse(
        "<html><body><h1>Error</h1><p>Template not found</p></body></html>",
        {
          status: 404,
          headers: { "Content-Type": "text/html" },
        }
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
      meeting_link: "https://meet.google.com/xxx-xxxx-xxx",
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
          sender_name: "Your Name",
          sender_calendar: "https://calendly.com/your-link",
          meeting_date: "Tuesday, January 20th",
          meeting_time: "2:00 PM EST",
          meeting_link: "https://meet.google.com/xxx-xxxx-xxx",
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

    // Render template to get actual HTML output
    const subject = renderTemplate(typedTemplate.subject_template, variables);
    const renderedHTML = renderHTMLTemplate(typedTemplate.body_template, variables);

    // Return HTML that can be viewed in browser
    return new NextResponse(renderedHTML, {
      status: 200,
      headers: {
        "Content-Type": "text/html",
      },
    });
  } catch (error: any) {
    console.error("Preview template error:", error);
    return new NextResponse(
      `<html><body><h1>Error</h1><p>${error.message || "Failed to preview template"}</p></body></html>`,
      {
        status: 500,
        headers: { "Content-Type": "text/html" },
      }
    );
  }
}
