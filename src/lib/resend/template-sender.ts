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
    
    // Convert base64 images to CID attachments (email clients block inline base64)
    const base64Attachments: Array<{
      filename: string;
      content: Buffer;
      cid: string;
      contentType: string;
    }> = [];
    let cidCounter = 0;
    
    // Find all base64 images and convert to CID
    renderedHTML = renderedHTML.replace(/<img([^>]*)\ssrc=["'](data:image\/([^;]+);base64,([^"']+))["']([^>]*)>/gi, (match, before, dataUri, imageType, base64Data, after) => {
      try {
        const cid = `image_${cidCounter++}`;
        const contentType = imageType || 'png';
        const buffer = Buffer.from(base64Data, 'base64');
        
        base64Attachments.push({
          filename: `${cid}.${contentType}`,
          content: buffer,
          cid: cid,
          contentType: `image/${contentType}`,
        });
        
        console.log(`[Image CID] Converted base64 image to CID: ${cid} (${contentType}, ${buffer.length} bytes)`);
        
        // Replace with CID reference
        return `<img${before} src="cid:${cid}"${after}>`;
      } catch (error) {
        console.error(`[Image CID] Failed to convert base64 to CID:`, error);
        return match; // Keep original if conversion fails
      }
    });
    
    // Convert external images to base64 then CID (for small images only)
    const externalImageUrls = new Set<string>();
    const imgSrcPattern = /<img([^>]*)\ssrc=["']([^"']+)["']([^>]*)>/gi;
    let match;
    
    // First pass: collect external image URLs
    while ((match = imgSrcPattern.exec(renderedHTML)) !== null) {
      const url = match[2];
      // Skip if already processed (has cid: or data:)
      if (url.includes('cid:') || url.startsWith('data:')) {
        continue;
      }
      // Skip Vercel Blob URLs (different domain issue)
      if (url.includes('blob.vercel-storage.com')) {
        console.log(`[Image CID] Skipping Vercel Blob URL (domain mismatch): ${url.substring(0, 50)}...`);
        continue;
      }
      // Collect external image URLs
      if (url.startsWith('http://') || url.startsWith('https://')) {
        if (url.includes('i.imgur.com') || url.includes('imgur.com') || url.match(/\.(jpg|jpeg|png|gif|webp)(\?|$)/i)) {
          externalImageUrls.add(url);
        }
      }
    }
    
    // Convert external images to base64 then CID
    const imagePromises: Promise<void>[] = [];
    const urlToCid = new Map<string, string>();
    
    externalImageUrls.forEach(url => {
      const promise = convertImageToBase64(url).then(base64 => {
        if (base64) {
          // Extract base64 data from data URI
          const base64Match = base64.match(/data:image\/([^;]+);base64,(.+)/);
          if (base64Match) {
            const [, imageType, base64Data] = base64Match;
            const cid = `image_${cidCounter++}`;
            const buffer = Buffer.from(base64Data, 'base64');
            
            base64Attachments.push({
              filename: `${cid}.${imageType}`,
              content: buffer,
              cid: cid,
              contentType: `image/${imageType}`,
            });
            
            urlToCid.set(url, cid);
            console.log(`[Image CID] Converted external image to CID: ${cid} (${url.substring(0, 50)}...)`);
          }
        }
      }).catch(error => {
        console.error(`[Image CID] Error converting external image: ${url.substring(0, 50)}...`, error);
      });
      imagePromises.push(promise);
    });
    
    // Wait for external image conversions
    if (imagePromises.length > 0) {
      console.log(`[Image CID] Processing ${imagePromises.length} external images...`);
      await Promise.race([
        Promise.all(imagePromises),
        new Promise(resolve => setTimeout(resolve, 5000)) // 5 second timeout
      ]);
      
      // Replace external URLs with CID references
      urlToCid.forEach((cid, url) => {
        const escapedUrl = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        renderedHTML = renderedHTML.replace(new RegExp(`src=["']${escapedUrl}["']`, 'gi'), `src="cid:${cid}"`);
      });
    }
    
    console.log(`[Image CID] Total attachments: ${base64Attachments.length}`);
    
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
      attachments: base64Attachments.length > 0 ? base64Attachments : undefined,
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
