/**
 * Server-side template rendering utility
 * Replaces {{variable}} placeholders with actual values
 */

/**
 * Convert Imgur links to image tags
 * Handles both album links (imgur.com/a/ID) and direct links (imgur.com/ID)
 * For album links, tries multiple image format fallbacks
 */
function convertImgurLinksToImages(text: string): string {
  // Match Imgur album links: https://imgur.com/a/ID or imgur.com/a/ID
  const albumPattern = /(https?:\/\/)?(www\.)?imgur\.com\/a\/([a-zA-Z0-9]+)/g;
  text = text.replace(albumPattern, (match, protocol, www, id) => {
    const fullUrl = protocol ? match : `https://${match}`;
    // For album links, try jpg first (most common), then png as fallback
    // Note: Album IDs don't always map to image IDs, but we try common formats
    return `<div style="margin: 24px 0 0 0; text-align: center;">
      <img 
        src="https://i.imgur.com/${id}.jpg" 
        alt="Logo" 
        style="max-width: 200px; height: auto; display: inline-block; border: none;" 
        onerror="if(this.src.indexOf('.jpg')!==-1){this.src='https://i.imgur.com/${id}.png';this.onerror=null;}else{this.style.display='none';}"
      />
    </div>`;
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
    
    // For direct links without extension, try jpg first, then png as fallback
    return `<div style="margin: 24px 0 0 0; text-align: center;">
      <img 
        src="https://i.imgur.com/${id}.jpg" 
        alt="Logo" 
        style="max-width: 200px; height: auto; display: inline-block; border: none;" 
        onerror="if(this.src.indexOf('.jpg')!==-1){this.src='https://i.imgur.com/${id}.png';this.onerror=null;}else{this.style.display='none';}"
      />
    </div>`;
  });

  return text;
}

/**
 * Helper function to convert a line to a clickable link if it's a URL
 */
function convertLineToLink(line: string): string {
  const trimmed = line.trim();
  
  // Check if line is a website link
  if (/^(www\.|http)/i.test(trimmed)) {
    const url = trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
    return `<a href="${url}" style="color: #2563eb; text-decoration: none;">${trimmed}</a>`;
  }
  
  return trimmed;
}

/**
 * Helper function to detect if a line is part of a signature
 */
function isSignatureLine(line: string): boolean {
  const trimmed = line.trim();
  return /^(Founder|CEO|President|Director|Manager|VP|Vice President|Owner|www\.|http|https:\/\/imgur)/i.test(trimmed) ||
         /^\|/.test(trimmed) || // Lines starting with |
         /@/.test(trimmed) && /\.(com|net|org|io|co)/i.test(trimmed); // Email-like patterns
}

/**
 * Helper function to detect if a paragraph starts a signature
 */
function isSignatureStart(paragraph: string): boolean {
  const trimmed = paragraph.trim();
  return /^(Best regards|Regards|Sincerely|Thanks|Thank you|Best|Warm regards)/i.test(trimmed);
}

/**
 * Convert plain text to HTML with proper formatting
 * Handles both single and double line breaks
 */
function convertPlainTextToHTML(text: string): string {
  // If already HTML (contains HTML tags), return as-is
  if (/<[a-z][\s\S]*>/i.test(text)) {
    return text;
  }

  // Normalize line breaks and split into lines
  const lines = text.split(/\r?\n/).map(line => line.trim());
  
  const htmlParagraphs: string[] = [];
  let currentParagraph: string[] = [];
  let foundSignatureStart = false;
  let signatureLineCount = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isEmpty = !line;
    
    // Check if this line starts a signature
    const isSignatureStartLine = isSignatureStart(line);
    
    // If we hit signature start, process current paragraph first
    if (isSignatureStartLine && currentParagraph.length > 0) {
      // Process accumulated paragraph
      const paraText = currentParagraph.join(' ').trim();
      if (paraText) {
        htmlParagraphs.push(`<p style="margin: 0 0 16px 0; line-height: 1.6;">${paraText}</p>`);
      }
      currentParagraph = [];
      foundSignatureStart = true;
      signatureLineCount = 0;
    }
    
    // Handle signature lines
    if (foundSignatureStart) {
      if (isEmpty) {
        // Empty line in signature - if we have accumulated signature lines, continue
        // (don't reset, as signature might continue after empty line)
        continue;
      }
      
      // Check if this is still part of signature (name, title, website, or image link)
      const isSignatureComponent = isSignatureLine(line) || 
                                   /^(www\.|http|https:\/\/imgur)/i.test(line) ||
                                   signatureLineCount < 5; // Allow up to 5 lines after "Best regards"
      
      if (isSignatureComponent || isSignatureStartLine) {
        signatureLineCount++;
        const formattedLine = convertLineToLink(line);
        const marginTop = signatureLineCount === 1 ? '24px' : '0';
        htmlParagraphs.push(`<p style="margin: ${marginTop} 0 0 0; line-height: 1.6;">${formattedLine}</p>`);
        continue;
      } else {
        // No longer in signature, reset and treat as regular content
        foundSignatureStart = false;
        signatureLineCount = 0;
        // Fall through to regular content handling
      }
    }
    
    // Handle regular content
    if (!foundSignatureStart) {
      if (isEmpty) {
        // Empty line - if we have accumulated content, process it as a paragraph
        if (currentParagraph.length > 0) {
          const paraText = currentParagraph.join(' ').trim();
          if (paraText) {
            htmlParagraphs.push(`<p style="margin: 0 0 16px 0; line-height: 1.6;">${paraText}</p>`);
          }
          currentParagraph = [];
        }
      } else {
        // Add line to current paragraph
        currentParagraph.push(line);
      }
    }
  }
  
  // Process any remaining paragraph
  if (currentParagraph.length > 0) {
    const paraText = currentParagraph.join(' ').trim();
    if (paraText) {
      htmlParagraphs.push(`<p style="margin: 0 0 16px 0; line-height: 1.6;">${paraText}</p>`);
    }
  }
  
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
