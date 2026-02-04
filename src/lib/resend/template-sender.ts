/**
 * Template Sender - Send emails via Resend using CRM templates
 * Renders CRM templates and sends via Resend with custom content
 */

import { renderTemplate, renderHTMLTemplate, htmlToPlainText } from "@/lib/email-template-renderer";
import { sendEmailViaResend } from "./client";
import { getIndustryForTemplate } from "@/lib/utils";
import type { Contact, EmailTemplate } from "@/types/database";

/**
 * Convert external image URL to base64 data URI
 * Only converts images < 50KB for instant loading
 */
async function convertImageToBase64(imageUrl: string): Promise<string | null> {
  try {
    // Fetch image
    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; EmailBot/1.0)',
      },
    });
    
    if (!response.ok) {
      console.warn(`Failed to fetch image: ${imageUrl} - Status: ${response.status}`);
      return null;
    }
    
    const buffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'image/png';
    
    // Only use base64 for small images (< 50KB)
    if (buffer.byteLength > 50 * 1024) {
      console.warn(`Image too large for base64: ${imageUrl} (${buffer.byteLength} bytes)`);
      return null;
    }
    
    const base64 = Buffer.from(buffer).toString('base64');
    return `data:${contentType};base64,${base64}`;
  } catch (error) {
    console.warn(`Error converting image to base64: ${imageUrl}`, error);
    return null;
  }
}

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
    let renderedHTML = renderHTMLTemplate(template.body_template, contactVariables);
    
    // Convert external images to base64 for instant loading (small images only)
    // This regex finds all img src attributes with external URLs
    const imgSrcPattern = /<img([^>]*)\ssrc=["'](https?:\/\/[^"']+)["']([^>]*)>/gi;
    const imagePromises: Promise<void>[] = [];
    const imageReplacements = new Map<string, string>();
    
    renderedHTML = renderedHTML.replace(imgSrcPattern, (match, before, url, after) => {
      // Skip if already base64
      if (url.startsWith('data:')) return match;
      
      // Only process Imgur URLs or other external image URLs
      if (url.includes('i.imgur.com') || url.includes('imgur.com')) {
        // Convert to base64 (only for small images)
        const promise = convertImageToBase64(url).then(base64 => {
          if (base64) {
            imageReplacements.set(url, base64);
          }
        });
        imagePromises.push(promise);
      }
      
      return match;
    });
    
    // Wait for all image conversions (with timeout)
    await Promise.race([
      Promise.all(imagePromises),
      new Promise(resolve => setTimeout(resolve, 2000)) // 2 second timeout
    ]);
    
    // Replace URLs with base64 data URIs
    imageReplacements.forEach((base64, url) => {
      renderedHTML = renderedHTML.replace(new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), base64);
    });
    
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
