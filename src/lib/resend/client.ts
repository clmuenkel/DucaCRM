/**
 * Resend API Client
 * https://resend.com/docs/api-reference
 */

import { Resend } from 'resend';

export interface SendEmailParams {
  apiKey: string;
  from: string; // e.g., "sales@yourdomain.com" or "Name <sales@yourdomain.com>"
  to: string;
  subject: string;
  html: string;
  text?: string; // Plain text version for better deliverability
  scheduledAt?: Date;
  tags?: Array<{ name: string; value: string }>;
  replyTo?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer;
    cid?: string;
    contentType?: string;
  }>;
}

export interface SendEmailResult {
  success: boolean;
  emailId?: string;
  error?: string;
}

/**
 * Initialize Resend client
 */
export function getResendClient(apiKey: string) {
  return new Resend(apiKey);
}

/**
 * Send email via Resend
 */
export async function sendEmailViaResend(
  params: SendEmailParams
): Promise<SendEmailResult> {
  try {
    const resend = getResendClient(params.apiKey);
    
    const emailData: any = {
      from: params.from,
      to: params.to,
      subject: params.subject,
      html: params.html,
      // No extra headers — keep it clean like a personal email
      // Marketing headers (List-Unsubscribe, Precedence, X-Priority) cause Gmail
      // to route to Promotions/Updates instead of Primary inbox
    };

    // Add plain text version if provided (better deliverability)
    if (params.text) {
      emailData.text = params.text;
    }

    // Add reply-to if provided
    if (params.replyTo) {
      emailData.reply_to = params.replyTo;
    }

    // Add scheduling if provided
    if (params.scheduledAt) {
      emailData.scheduled_at = params.scheduledAt.toISOString();
    }

    // Add tags for tracking
    if (params.tags && params.tags.length > 0) {
      emailData.tags = params.tags;
    }

    // Add attachments (for CID images)
    if (params.attachments && params.attachments.length > 0) {
      emailData.attachments = params.attachments.map(att => {
        const attachment: any = {
          filename: att.filename,
          content: att.content.toString('base64'),
        };
        // Add CID for inline images
        if (att.cid) {
          attachment.cid = att.cid;
        }
        // Add content type if provided
        if (att.contentType) {
          attachment.content_type = att.contentType;
        }
        return attachment;
      });
    }

    const { data, error } = await resend.emails.send(emailData);

    if (error) {
      console.error('Resend API error:', error);
      return {
        success: false,
        error: error.message || 'Failed to send email',
      };
    }

    return {
      success: true,
      emailId: data?.id,
    };
  } catch (error: any) {
    console.error('Resend send error:', error);
    return {
      success: false,
      error: error.message || 'Failed to send email',
    };
  }
}
