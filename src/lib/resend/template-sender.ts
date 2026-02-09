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
    
    // Derive sending domain for image URLs
    const fromAddr = fromEmail.includes('<')
      ? fromEmail.match(/<(.+)>/)?.[1] || fromEmail
      : fromEmail;
    const imgDomain = fromAddr.split('@')[1] || 'duca-crm.vercel.app';
    
    const contactVariables: Record<string, string> = {
      first_name: contact.first_name || "",
      last_name: contact.last_name || "",
      full_name: `${contact.first_name} ${contact.last_name || ""}`.trim(),
      company: contact.company_name || "",
      title: contact.title || "",
      email: contact.email || "",
      phone: contact.phone || contact.mobile || "",
      industry: industry,
      // Static logo on sending domain — use {{logo_url}} in templates
      logo_url: `https://${imgDomain}/logo.png`,
      // Merge with custom variables (overrides contact data)
      ...variables,
    };

    // Render template with variables
    const renderedSubject = renderTemplate(template.subject_template, contactVariables);
    
    // Render HTML version with proper formatting
    let renderedHTML = renderHTMLTemplate(template.body_template, contactVariables);
    
    // meeting_link variable is already replaced by renderTemplate above
    // Keep it as a plain link — styled buttons trigger Gmail's Promotions filter
    
    // Image URLs already point to the sending domain via logo_url variable
    // No rewriting needed since we use static files on the same domain
    
    // Generate plain text version for better deliverability
    const renderedText = htmlToPlainText(renderedHTML);

    // Format "From" with name for better inbox placement
    // If fromEmail doesn't already have a name, add sender name
    let formattedFrom = fromEmail;
    // contactVariables already includes merged variables, so check there
    const senderName = contactVariables.sender_name;
    // Ensure we never use "CRM User" as sender name
    if (!fromEmail.includes('<') && senderName && 
        senderName !== "Your Name" && 
        senderName !== "[Your Name]" && 
        senderName !== "CRM User") {
      formattedFrom = `${senderName} <${fromEmail}>`;
    }

    const finalReplyTo = replyTo || undefined;

    // Send via Resend with CID attachments
    const result = await sendEmailViaResend({
      apiKey,
      from: formattedFrom,
      to: contact.email!,
      subject: renderedSubject,
      html: renderedHTML,
      text: renderedText, // Plain text version for better deliverability
      scheduledAt,
      replyTo: finalReplyTo,
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
