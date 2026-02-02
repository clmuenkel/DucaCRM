/**
 * Template Sender - Send emails via Instantly using CRM templates
 * Renders CRM templates and pushes to Instantly with custom content
 */

import { renderTemplate } from "@/lib/email-template-renderer";
import { addLeadToCampaign } from "./client";
import type { Contact, EmailTemplate } from "@/types/database";

export interface SendEmailWithTemplateParams {
  apiKey: string;
  campaignId: string;
  contact: Contact;
  template: EmailTemplate;
  variables?: Record<string, string>;
  scheduledAt?: Date; // Optional scheduled send time
}

export interface SendEmailWithTemplateResult {
  success: boolean;
  leadId?: string;
  error?: string;
}

/**
 * Send email via Instantly using CRM template
 * Renders template and pushes to Instantly with custom content
 */
export async function sendEmailWithTemplate(
  params: SendEmailWithTemplateParams
): Promise<SendEmailWithTemplateResult> {
  try {
    const { apiKey, campaignId, contact, template, variables = {}, scheduledAt } = params;

    // Build variables from contact
    const contactVariables: Record<string, string> = {
      first_name: contact.first_name || "",
      last_name: contact.last_name || "",
      full_name: `${contact.first_name} ${contact.last_name || ""}`.trim(),
      company: contact.company_name || "",
      title: contact.title || "",
      email: contact.email || "",
      phone: contact.phone || contact.mobile || "",
      // Merge with custom variables (overrides contact data)
      ...variables,
    };

    // Render template with variables
    const renderedSubject = renderTemplate(template.subject_template, contactVariables);
    const renderedBody = renderTemplate(template.body_template, contactVariables);

    // Prepare lead data for Instantly
    const leadData = {
      email: contact.email || "",
      first_name: contact.first_name || "",
      last_name: contact.last_name || "",
      company_name: contact.company_name || "",
      personalization: contact.title || "Decision Maker",
      phone: contact.phone || contact.mobile || "",
      website: contact.company_domain || "",
      custom_variables: {
        // Push rendered template content as custom variables
        // Instantly campaign should be configured to use these variables
        email_subject: renderedSubject,
        email_body: renderedBody,
        // Also include raw variables for Instantly's template system
        industry: contact.industries?.[0] || contact.industry || "home services",
        title: contact.title || "Owner",
        city: contact.city || "",
        ...variables,
        // If scheduledAt is provided, add it to custom variables
        ...(scheduledAt ? { scheduled_at: scheduledAt.toISOString() } : {}),
      },
    };

    // Push to Instantly
    const response = await addLeadToCampaign(apiKey, campaignId, leadData);

    return {
      success: true,
      leadId: response.lead_id || "pushed",
    };
  } catch (error: any) {
    console.error("Failed to send email with template:", error);
    return {
      success: false,
      error: error.message || "Failed to send email",
    };
  }
}
