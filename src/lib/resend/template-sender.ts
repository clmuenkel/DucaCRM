/**
 * Template Sender - Send emails via Resend using CRM templates
 * Renders CRM templates and sends via Resend with custom content
 */

import { renderTemplate, renderHTMLTemplate, htmlToPlainText } from "@/lib/email-template-renderer";
import { sendEmailViaResend } from "./client";
import { getIndustryForTemplate } from "@/lib/utils";
import type { Contact, EmailTemplate } from "@/types/database";

export interface SendEmailWithTemplateParams {
  apiKey: string;
  fromEmail: string; // e.g., "sales@yourdomain.com"
  contact: Contact;
  template: EmailTemplate;
  variables?: Record<string, string>;
  scheduledAt?: Date;
  replyTo?: string;
}

export interface SendEmailWithTemplateResult {
  success: boolean;
  emailId?: string;
  error?: string;
}

/**
 * Send email via Resend using CRM template
 * Renders template and sends via Resend with custom content
 */
export async function sendEmailWithTemplate(
  params: SendEmailWithTemplateParams
): Promise<SendEmailWithTemplateResult> {
  try {
    const { apiKey, fromEmail, contact, template, variables = {}, scheduledAt, replyTo } = params;

    // Build variables from contact
    const industry = getIndustryForTemplate(contact);
    const contactVariables: Record<string, string> = {
      first_name: contact.first_name || "",
      last_name: contact.last_name || "",
      full_name: `${contact.first_name} ${contact.last_name || ""}`.trim(),
      company: contact.company_name || "",
      title: contact.title || "",
      email: contact.email || "",
      phone: contact.phone || contact.mobile || "",
      industry: industry,
      // Merge with custom variables (overrides contact data)
      ...variables,
    };

    // Render template with variables
    const renderedSubject = renderTemplate(template.subject_template, contactVariables);
    
    // Render HTML version with proper formatting
    const renderedHTML = renderHTMLTemplate(template.body_template, contactVariables);
    
    // Generate plain text version for better deliverability
    const renderedText = htmlToPlainText(renderedHTML);

    // Format "From" with name for better inbox placement
    // If fromEmail doesn't already have a name, add sender name
    let formattedFrom = fromEmail;
    // contactVariables already includes merged variables, so check there
    const senderName = contactVariables.sender_name;
    if (!fromEmail.includes('<') && senderName && senderName !== "Your Name" && senderName !== "[Your Name]") {
      formattedFrom = `${senderName} <${fromEmail}>`;
    }

    // Send via Resend
    const result = await sendEmailViaResend({
      apiKey,
      from: formattedFrom,
      to: contact.email!,
      subject: renderedSubject,
      html: renderedHTML,
      text: renderedText, // Plain text version for better deliverability
      scheduledAt,
      replyTo,
      tags: [
        { name: "contact_id", value: contact.id },
        { name: "template_id", value: template.id },
        { name: "cadence", value: "active" },
      ],
    });

    return result;
  } catch (error: any) {
    console.error("Failed to send email with template:", error);
    return {
      success: false,
      error: error.message || "Failed to send email",
    };
  }
}
