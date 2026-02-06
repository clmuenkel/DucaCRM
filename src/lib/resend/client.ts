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
    
    // Extract domain from fromEmail for unsubscribe link
    const fromEmailAddress = params.from.includes('<') 
      ? params.from.match(/<(.+)>/)?.[1] || params.from
      : params.from;
    const domain = fromEmailAddress.split('@')[1] || 'example.com';
    
    // Build unsubscribe URLs (user should replace with their actual domain)
    const unsubscribeEmail = `unsubscribe@${domain}`;
    const unsubscribeUrl = `https://${domain}/unsubscribe`;
    
    const emailData: any = {
      from: params.from,
      to: params.to,
      subject: params.subject,
      html: params.html,
      headers: {
        // CRITICAL: List-Unsubscribe headers for inbox placement (Gmail requirement)
        'List-Unsubscribe': `<mailto:${unsubscribeEmail}?subject=Unsubscribe>, <${unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        // Helps avoid Promotions tab
        'Precedence': 'bulk',
        // Signals personal email, not marketing
        'X-Priority': '1',
        'X-Mailer': 'Resend',
      },
    };

    // Add plain text version if provided (better deliverability)
    if (params.text) {
      emailData.text = params.text;
    }

    // Add reply-to (should match from domain for better deliverability)
    if (params.replyTo) {
      emailData.reply_to = params.replyTo;
    } else {
      // Default to from email if no reply-to specified (ensures same domain)
      emailData.reply_to = fromEmailAddress;
    }

    // Add scheduling if provided
    if (params.scheduledAt) {
      emailData.scheduled_at = params.scheduledAt.toISOString();
    }

    // Add tags for tracking
    if (params.tags && params.tags.length > 0) {
      emailData.tags = params.tags;
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
