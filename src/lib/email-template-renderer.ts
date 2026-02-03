/**
 * Server-side template rendering utility
 * Replaces {{variable}} placeholders with actual values
 */

/**
 * Convert Imgur links to image tags
 * Handles both album links (imgur.com/a/ID) and direct links (imgur.com/ID)
 */
function convertImgurLinksToImages(text: string): string {
  // Match Imgur album links: https://imgur.com/a/ID or imgur.com/a/ID
  // Note: For albums, we convert to a clickable image that links to the album
  const albumPattern = /(https?:\/\/)?(www\.)?imgur\.com\/a\/([a-zA-Z0-9]+)/g;
  text = text.replace(albumPattern, (match, protocol, www, id) => {
    const fullUrl = protocol ? match : `https://${match}`;
    // For album links, try to use the album ID as image ID (may not work, but better than nothing)
    // User should update template to use direct image URL for best results
    return `<div style="margin: 24px 0 0 0; text-align: center;"><img src="https://i.imgur.com/${id}.png" alt="Logo" style="max-width: 200px; height: auto; display: inline-block; border: none;" onerror="this.style.display='none';" /></div>`;
  });

  // Match direct Imgur links: https://imgur.com/ID or imgur.com/ID
  const directPattern = /(https?:\/\/)?(www\.)?imgur\.com\/([a-zA-Z0-9]+)(?:\.[a-z]+)?(?:\?.*)?$/g;
  text = text.replace(directPattern, (match, protocol, www, id, ext) => {
    // Skip if it's an album link (already handled above)
    if (match.includes('/a/')) {
      return match;
    }
    
    // If it's already a direct image link with extension, convert to image tag
    if (ext && ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext.toLowerCase())) {
      const fullUrl = protocol ? match : `https://${match}`;
      return `<div style="margin: 24px 0 0 0; text-align: center;"><img src="${fullUrl}" alt="Logo" style="max-width: 200px; height: auto; display: inline-block; border: none;" /></div>`;
    }
    
    // For direct links without extension, try common formats
    const fullUrl = protocol ? `https://${www || ''}imgur.com/${id}` : `https://imgur.com/${id}`;
    // Try .jpg first (most common), with fallback
    return `<div style="margin: 24px 0 0 0; text-align: center;"><img src="https://i.imgur.com/${id}.jpg" alt="Logo" style="max-width: 200px; height: auto; display: inline-block; border: none;" onerror="this.src='https://i.imgur.com/${id}.png'; this.onerror=null;" /></div>`;
  });

  return text;
}

/**
 * Convert plain text to HTML with proper formatting
 * Preserves line breaks and converts to paragraphs with professional spacing
 */
function convertPlainTextToHTML(text: string): string {
  // If already HTML (contains HTML tags), return as-is
  if (/<[a-z][\s\S]*>/i.test(text)) {
    return text;
  }

  // Split by double line breaks (paragraphs)
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());
  
  // Convert each paragraph with proper styling
  const htmlParagraphs = paragraphs.map((paragraph, index) => {
    const lines = paragraph.split('\n').filter(line => line.trim());
    const paragraphText = paragraph.trim();
    
    // Check if this looks like a greeting (starts with "Hi" or "Hello")
    const isGreeting = /^(Hi|Hello|Hey|Dear)/i.test(paragraphText);
    
    // Check if this looks like a signature block (contains "Best regards" or similar)
    const isSignature = /^(Best regards|Regards|Sincerely|Thanks|Thank you)/i.test(paragraphText);
    
    // Check if this looks like a signature line (name, title, website)
    const isSignatureLine = /^(Founder|CEO|President|Director|Manager|www\.|http)/i.test(paragraphText) || 
                           (index === paragraphs.length - 1 && lines.length <= 3);
    
    // Format greeting with proper spacing
    if (isGreeting) {
      return `<p style="margin: 0 0 16px 0; line-height: 1.6;">${paragraphText}</p>`;
    }
    
    // Format signature block
    if (isSignature || isSignatureLine) {
      const signatureLines = lines.map((line, lineIndex) => {
        const trimmedLine = line.trim();
        
        // Check if line is a website link
        if (/^(www\.|http)/i.test(trimmedLine)) {
          const url = trimmedLine.startsWith('http') ? trimmedLine : `https://${trimmedLine}`;
          return `<a href="${url}" style="color: #2563eb; text-decoration: none;">${trimmedLine}</a>`;
        }
        
        // First line of signature (usually "Best regards,")
        if (lineIndex === 0 && isSignature) {
          return trimmedLine;
        }
        
        return trimmedLine;
      });
      
      // Add extra spacing before signature
      const marginTop = index > 0 ? '24px' : '16px';
      return `<p style="margin: ${marginTop} 0 0 0; line-height: 1.6;">${signatureLines.join('<br>')}</p>`;
    }
    
    // Regular paragraph with proper spacing
    if (lines.length === 1) {
      return `<p style="margin: 0 0 16px 0; line-height: 1.6;">${lines[0].trim()}</p>`;
    }
    
    // Multiple lines - join with <br> and wrap in <p>
    return `<p style="margin: 0 0 16px 0; line-height: 1.6;">${lines.map(line => line.trim()).join('<br>')}</p>`;
  });

  return htmlParagraphs.join('');
}

/**
 * Generate plain text version from HTML
 */
export function htmlToPlainText(html: string): string {
  let text = html;
  
  // Convert links to plain text with URL
  text = text.replace(/<a[^>]*href=["']([^"']*)["'][^>]*>([^<]*)<\/a>/gi, (match, url, linkText) => {
    // If link text is same as URL, just show URL
    if (linkText.trim() === url || !linkText.trim()) {
      return url;
    }
    // Otherwise show both
    return `${linkText.trim()} (${url})`;
  });
  
  // Remove image tags (keep alt text if available, or show [Image])
  text = text.replace(/<img[^>]*alt=["']([^"']*)["'][^>]*>/gi, (match, alt) => {
    return alt ? `[Image: ${alt}]` : '[Image]';
  });
  text = text.replace(/<img[^>]*>/gi, '[Image]');
  
  // Convert <br> and <br/> to line breaks
  text = text.replace(/<br\s*\/?>/gi, '\n');
  
  // Convert paragraphs to double line breaks
  text = text.replace(/<\/p>/gi, '\n\n');
  text = text.replace(/<p[^>]*>/gi, '');
  
  // Convert divs to line breaks
  text = text.replace(/<\/div>/gi, '\n');
  text = text.replace(/<div[^>]*>/gi, '');
  
  // Remove other HTML tags
  text = text.replace(/<[^>]+>/g, '');
  
  // Decode HTML entities
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&apos;/g, "'");
  
  // Clean up multiple spaces and line breaks
  text = text.replace(/\n{3,}/g, '\n\n');
  text = text.replace(/[ \t]+/g, ' ');
  text = text.replace(/^\s+|\s+$/gm, ''); // Trim each line
  
  return text.trim();
}

/**
 * Render template with variable substitution
 */
export function renderTemplate(
  template: string,
  variables: Record<string, string>
): string {
  let rendered = template;
  
  // Replace {{key}} and {key} patterns
  Object.entries(variables).forEach(([key, value]) => {
    // Handle common variable name mistakes
    if (key === 'first_name') {
      // Support first.name -> first_name
      rendered = rendered.replace(new RegExp(`\\{\\{first\\.name\\}\\}`, "gi"), value || "");
      rendered = rendered.replace(new RegExp(`\\{first\\.name\\}`, "gi"), value || "");
      // Support firstName -> first_name
      rendered = rendered.replace(new RegExp(`\\{\\{firstName\\}\\}`, "gi"), value || "");
      rendered = rendered.replace(new RegExp(`\\{firstName\\}`, "gi"), value || "");
    }
    if (key === 'last_name') {
      // Support last.name -> last_name
      rendered = rendered.replace(new RegExp(`\\{\\{last\\.name\\}\\}`, "gi"), value || "");
      rendered = rendered.replace(new RegExp(`\\{last\\.name\\}`, "gi"), value || "");
      // Support lastName -> last_name
      rendered = rendered.replace(new RegExp(`\\{\\{lastName\\}\\}`, "gi"), value || "");
      rendered = rendered.replace(new RegExp(`\\{lastName\\}`, "gi"), value || "");
    }
    
    // Standard variable replacement
    rendered = rendered.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value || "");
    rendered = rendered.replace(new RegExp(`\\{${key}\\}`, "g"), value || "");
  });
  
  return rendered;
}

/**
 * Render HTML email template with proper formatting
 */
export function renderHTMLTemplate(
  template: string,
  variables: Record<string, string>
): string {
  // First render variables
  let rendered = renderTemplate(template, variables);
  
  // Convert Imgur links to images
  rendered = convertImgurLinksToImages(rendered);
  
  // Convert plain text to HTML if needed
  rendered = convertPlainTextToHTML(rendered);
  
  // Wrap in proper email HTML structure
  return wrapEmailHTML(rendered);
}

/**
 * Wrap content in proper email HTML structure
 * Professional email formatting to avoid Promotions tab
 */
function wrapEmailHTML(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Email</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 16px; line-height: 1.6; color: #1f2937; background-color: #ffffff;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #ffffff;">
    <tr>
      <td align="center" style="padding: 20px 0;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px; background-color: #ffffff;">
          <tr>
            <td style="padding: 20px 24px; font-size: 16px; line-height: 1.6; color: #1f2937;">
              ${content}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
