/**
 * Template Sender - Send emails via Resend using CRM templates
 * Renders CRM templates and sends via Resend with custom content
 */

import { renderTemplate, renderHTMLTemplate, htmlToPlainText } from "@/lib/email-template-renderer";
import { sendEmailViaResend } from "./client";
import { getIndustryForTemplate } from "@/lib/utils";
import type { Contact, EmailTemplate } from "@/types/database";

/**
 * Validate if a string is a properly formatted base64 data URI
 */
function isValidBase64Image(dataUri: string): boolean {
  // Check for proper data URI format: data:image/[type];base64,[data]
  const dataUriPattern = /^data:image\/(png|jpeg|jpg|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/;
  return dataUriPattern.test(dataUri);
}

/**
 * Convert external image URL to base64 data URI
 * Only converts images < 50KB for instant loading
 */
async function convertImageToBase64(imageUrl: string): Promise<string | null> {
  try {
    console.log(`[Image Conversion] Attempting to convert: ${imageUrl}`);
    
    // Fetch image with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
    
    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; EmailBot/1.0)',
      },
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      console.warn(`[Image Conversion] Failed to fetch image: ${imageUrl} - Status: ${response.status}`);
      return null;
    }
    
    const buffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'image/png';
    const sizeKB = (buffer.byteLength / 1024).toFixed(2);
    
    console.log(`[Image Conversion] Fetched image: ${imageUrl} - Size: ${sizeKB}KB, Type: ${contentType}`);
    
    // Only use base64 for small images (< 50KB)
    if (buffer.byteLength > 50 * 1024) {
      console.warn(`[Image Conversion] Image too large for base64: ${imageUrl} (${buffer.byteLength} bytes, ${sizeKB}KB)`);
      return null;
    }
    
    const base64 = Buffer.from(buffer).toString('base64');
    const dataUri = `data:${contentType};base64,${base64}`;
    
    console.log(`[Image Conversion] Successfully converted: ${imageUrl} -> base64 (${sizeKB}KB)`);
    return dataUri;
  } catch (error: any) {
    if (error.name === 'AbortError') {
      console.warn(`[Image Conversion] Timeout converting image: ${imageUrl} (exceeded 5s)`);
    } else {
      console.warn(`[Image Conversion] Error converting image to base64: ${imageUrl}`, error);
    }
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
    
    // Track image conversion statistics
    const conversionStats = {
      total: 0,
      alreadyBase64: 0,
      converted: 0,
      skipped: 0,
      failed: 0,
    };
    
    // Convert external images to base64 for instant loading (small images only)
    // This regex finds all img src attributes with both external URLs and data URIs
    const imgSrcPattern = /<img([^>]*)\ssrc=["']([^"']+)["']([^>]*)>/gi;
    const imagePromises: Promise<void>[] = [];
    const imageReplacements = new Map<string, string>();
    
    renderedHTML = renderedHTML.replace(imgSrcPattern, (match, before, url, after) => {
      conversionStats.total++;
      
      // Check if already base64 - validate format
      if (url.startsWith('data:')) {
        if (isValidBase64Image(url)) {
          conversionStats.alreadyBase64++;
          console.log(`[Image Conversion] Found valid base64 image (${conversionStats.alreadyBase64})`);
          return match; // Already valid base64, keep as-is
        } else {
          console.warn(`[Image Conversion] Found invalid base64 format, attempting to fix: ${url.substring(0, 50)}...`);
          // Invalid base64 format - will try to process as external URL if possible
        }
      }
      
      // Process external URLs (Imgur or other image hosts)
      if (url.startsWith('http://') || url.startsWith('https://')) {
        // Only process Imgur URLs or other external image URLs
        if (url.includes('i.imgur.com') || url.includes('imgur.com') || url.match(/\.(jpg|jpeg|png|gif|webp)(\?|$)/i)) {
          // Convert to base64 (only for small images)
          const promise = convertImageToBase64(url).then(base64 => {
            if (base64) {
              imageReplacements.set(url, base64);
              conversionStats.converted++;
              console.log(`[Image Conversion] Successfully converted: ${url.substring(0, 50)}...`);
            } else {
              conversionStats.failed++;
              console.warn(`[Image Conversion] Failed to convert: ${url.substring(0, 50)}...`);
            }
          }).catch(error => {
            conversionStats.failed++;
            console.error(`[Image Conversion] Error processing: ${url.substring(0, 50)}...`, error);
          });
          imagePromises.push(promise);
        } else {
          conversionStats.skipped++;
          console.log(`[Image Conversion] Skipped non-image URL: ${url.substring(0, 50)}...`);
        }
      } else {
        conversionStats.skipped++;
      }
      
      return match;
    });
    
    // Wait for all image conversions (with increased timeout)
    console.log(`[Image Conversion] Processing ${imagePromises.length} images...`);
    await Promise.race([
      Promise.all(imagePromises),
      new Promise(resolve => setTimeout(resolve, 5000)) // 5 second timeout
    ]);
    
    // Replace URLs with base64 data URIs
    imageReplacements.forEach((base64, url) => {
      const escapedUrl = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      renderedHTML = renderedHTML.replace(new RegExp(escapedUrl, 'g'), base64);
    });
    
    // Log conversion statistics
    console.log(`[Image Conversion] Summary: Total=${conversionStats.total}, AlreadyBase64=${conversionStats.alreadyBase64}, Converted=${conversionStats.converted}, Skipped=${conversionStats.skipped}, Failed=${conversionStats.failed}`);
    
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
