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
    
    // Extract domain from fromEmail for unsubscribe link
    const fromEmailAddress = fromEmail.includes('<') 
      ? fromEmail.match(/<(.+)>/)?.[1] || fromEmail
      : fromEmail;
    const domain = fromEmailAddress.split('@')[1] || 'example.com';
    const unsubscribeUrl = `https://${domain}/unsubscribe?email=${encodeURIComponent(contact.email || '')}`;
    
    const contactVariables: Record<string, string> = {
      first_name: contact.first_name || "",
      last_name: contact.last_name || "",
      full_name: `${contact.first_name} ${contact.last_name || ""}`.trim(),
      company: contact.company_name || "",
      title: contact.title || "",
      email: contact.email || "",
      phone: contact.phone || contact.mobile || "",
      industry: industry,
      unsubscribe_url: unsubscribeUrl, // Add unsubscribe URL variable
      // Merge with custom variables (overrides contact data)
      ...variables,
    };

    // Render template with variables
    const renderedSubject = renderTemplate(template.subject_template, contactVariables);
    
    // Render HTML version with proper formatting
    let renderedHTML = renderHTMLTemplate(template.body_template, contactVariables);
    
    // Format meeting_link as button if present (after all variables are rendered)
    if (contactVariables.meeting_link && contactVariables.meeting_link.trim()) {
      const meetingLinkUrl = contactVariables.meeting_link.trim();
      const buttonHTML = `<div style="margin: 20px 0;"><a href="${meetingLinkUrl}" style="display: inline-block; padding: 12px 24px; background-color: #4285f4; color: white; text-decoration: none; border-radius: 4px; font-weight: 500;">View Calendar Event</a></div>`;
      
      // Replace {{meeting_link}} placeholder
      renderedHTML = renderedHTML.replace(/\{\{meeting_link\}\}/gi, buttonHTML);
    }
    
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

    // Ensure reply-to matches from domain (critical for deliverability)
    // If replyTo is provided but different domain, use fromEmail domain
    let finalReplyTo = replyTo;
    if (replyTo) {
      const replyToDomain = replyTo.includes('@') ? replyTo.split('@')[1] : null;
      const fromDomain = fromEmailAddress.split('@')[1];
      if (replyToDomain && replyToDomain !== fromDomain) {
        // Reply-to domain doesn't match from domain - use from email instead
        console.warn(`[Email] Reply-to domain (${replyToDomain}) doesn't match from domain (${fromDomain}). Using from email for reply-to.`);
        finalReplyTo = fromEmailAddress;
      }
    } else {
      // No reply-to specified - use from email (ensures same domain)
      finalReplyTo = fromEmailAddress;
    }

    // Send via Resend with CID attachments
    const result = await sendEmailViaResend({
      apiKey,
      from: formattedFrom,
      to: contact.email!,
      subject: renderedSubject,
      html: renderedHTML,
      text: renderedText, // Plain text version for better deliverability
      scheduledAt,
      replyTo: finalReplyTo, // Use domain-matched reply-to
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
