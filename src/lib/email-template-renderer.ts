/**
 * Server-side template rendering utility
 * Replaces {{variable}} placeholders with actual values
 */

/**
 * Convert Imgur links to actual image tags
 * Handles direct i.imgur.com URLs and regular imgur.com links
 */
function convertImgurLinksToImages(text: string): string {
  // First, handle direct i.imgur.com image URLs (these are guaranteed to be images)
  // Match: https://i.imgur.com/ID.png or i.imgur.com/ID.jpg, etc.
  // Only match if not already inside an img src attribute
  const directImagePattern = /(https?:\/\/)?i\.imgur\.com\/([a-zA-Z0-9]+)(\.[a-z]+)?/g;
  text = text.replace(directImagePattern, (match, protocol, id, ext, offset, fullString) => {
    // Check if this URL is already inside an img src attribute
    const beforeMatch = fullString.substring(Math.max(0, offset - 50), offset);
    if (beforeMatch.includes('src="') || beforeMatch.includes("src='")) {
      return match; // Already in an image tag, don't process
    }
    
    const fullUrl = protocol ? match : `https://${match}`;
    
    // Direct image URL - convert to clean, single-line image tag (left-aligned)
    // Remove the URL text and only show the image
    return `<div style="margin: 24px 0 0 0; text-align: left;"><img src="${fullUrl}" alt="Logo" style="max-width: 200px; height: auto; display: block; margin: 0; border: none;" /></div>`;
  });

  // Then handle regular imgur.com links (album/post links)
  const albumPattern = /(https?:\/\/)?(www\.)?imgur\.com\/(a\/)?([a-zA-Z0-9]+)/g;
  text = text.replace(albumPattern, (match, protocol, www, albumPrefix, id, offset, fullString) => {
    // Skip if already processed as direct image URL
    if (match.includes('i.imgur.com')) {
      return match;
    }
    
    // Check if this URL is already inside an img src attribute
    const beforeMatch = fullString.substring(Math.max(0, offset - 50), offset);
    if (beforeMatch.includes('src="') || beforeMatch.includes("src='")) {
      return match; // Already in an image tag, don't process
    }
    
    // For regular imgur.com links, try to display as image (left-aligned)
    // Remove the URL text and only show the image
    return `<div style="margin: 24px 0 0 0; text-align: left;"><img src="https://i.imgur.com/${id}.jpg" alt="Logo" style="max-width: 200px; height: auto; display: block; margin: 0; border: none;" onerror="this.onerror=null;this.src='https://i.imgur.com/${id}.png';" /></div>`;
  });

  // Remove any remaining plain text Imgur URLs that weren't converted
  // This handles cases where URLs appear on their own line
  const remainingImgurPattern = /(?:^|\s)(https?:\/\/)?(www\.)?imgur\.com\/[^\s<>"]+(?:\s|$)/gi;
  text = text.replace(remainingImgurPattern, '');

  return text;
}

/**
 * Helper function to convert a line to a clickable link if it's a URL
 * Excludes Imgur URLs to prevent showing link text for images
 */
function convertLineToLink(line: string): string {
  const trimmed = line.trim();
  
  // Skip Imgur URLs - these should be converted to images, not links
  if (/imgur\.com/i.test(trimmed)) {
    return ''; // Remove Imgur URLs from text
  }
  
  // Check if line is a website link
  if (/^(www\.|http)/i.test(trimmed)) {
    const url = trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
    return `<a href="${url}" style="color: #2563eb; text-decoration: none;">${trimmed}</a>`;
  }
  
  return trimmed;
}

/**
 * Helper function to detect if a line is part of a signature
 * Excludes Imgur URLs from being treated as signature links
 */
function isSignatureLine(line: string): boolean {
  const trimmed = line.trim();
  
  // Exclude Imgur URLs - these should be converted to images, not signature links
  if (/imgur\.com/i.test(trimmed)) {
    return false;
  }
  
  return /^(Founder|CEO|President|Director|Manager|VP|Vice President|Owner|www\.|http)/i.test(trimmed) ||
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
  // Check if text is already fully formatted HTML email
  // Only skip if it's a complete HTML document, not just partial HTML
  const isFullHTML = /^<!DOCTYPE|^<html/i.test(text.trim());
  if (isFullHTML) {
    return text; // Already fully formatted HTML email
  }
  
  // Process text even if it contains some HTML tags (e.g., from variable replacement)
  // This allows us to format plain text that might have some HTML mixed in

  // Split by line breaks - preserve structure
  const rawLines = text.split(/\r?\n/);
  
  const htmlParagraphs: string[] = [];
  let currentParagraph: string[] = [];
  let foundSignatureStart = false;
  let signatureLineCount = 0;
  
  for (let i = 0; i < rawLines.length; i++) {
    const rawLine = rawLines[i];
    const trimmedLine = rawLine.trim();
    const isEmpty = !trimmedLine;
    const prevLineWasEmpty = i > 0 && !rawLines[i - 1].trim();
    
    // Skip lines that already contain HTML image tags (from convertImgurLinksToImages)
    // These should be inserted as-is, not wrapped in paragraphs
    if (trimmedLine.includes('<div') && trimmedLine.includes('<img')) {
      htmlParagraphs.push(trimmedLine);
      continue;
    }
    
    // Check if this line starts a signature
    const isSignatureStartLine = isSignatureStart(trimmedLine);
    
    // If we hit signature start, finalize current paragraph first
    if (isSignatureStartLine) {
      // Finalize any accumulated paragraph
      if (currentParagraph.length > 0) {
        const paraText = currentParagraph.join(' ').trim();
        if (paraText) {
          htmlParagraphs.push(`<p style="margin: 0 0 16px 0; line-height: 1.6;">${paraText}</p>`);
        }
        currentParagraph = [];
      }
      foundSignatureStart = true;
      signatureLineCount = 0;
    }
    
    // Handle signature lines
    if (foundSignatureStart) {
      if (isEmpty) {
        // Empty line in signature - skip
        continue;
      }
      
      // Check if this is still part of signature
      // Skip if it's already image HTML
      const isImageHTML = trimmedLine.includes('<div') && trimmedLine.includes('<img');
      // Exclude Imgur URLs from signature detection
      const isImgurUrl = /imgur\.com/i.test(trimmedLine);
      const isSignatureComponent = !isImageHTML && !isImgurUrl && (
        isSignatureLine(trimmedLine) || 
        /^(www\.|http)/i.test(trimmedLine) ||
        (signatureLineCount > 0 && signatureLineCount < 5)
      );
      
      if (isSignatureComponent || isSignatureStartLine) {
        signatureLineCount++;
        const formattedLine = convertLineToLink(trimmedLine);
        const marginTop = signatureLineCount === 1 ? '24px' : '0';
        htmlParagraphs.push(`<p style="margin: ${marginTop} 0 0 0; line-height: 1.6;">${formattedLine}</p>`);
        continue;
      } else {
        // No longer in signature
        foundSignatureStart = false;
        signatureLineCount = 0;
        // Fall through to regular content
      }
    }
    
    // Handle regular content
    if (!foundSignatureStart) {
      if (isEmpty) {
        // Empty line = paragraph break
        // Finalize current paragraph if we have content
        if (currentParagraph.length > 0) {
          const paraText = currentParagraph.join(' ').trim();
          if (paraText) {
            htmlParagraphs.push(`<p style="margin: 0 0 16px 0; line-height: 1.6;">${paraText}</p>`);
          }
          currentParagraph = [];
        }
      } else {
        // Non-empty line
        // If previous line was empty, this starts a new paragraph
        // Otherwise, add to current paragraph
        if (prevLineWasEmpty && currentParagraph.length === 0) {
          // Starting new paragraph after empty line
          currentParagraph.push(trimmedLine);
        } else if (currentParagraph.length === 0) {
          // First line of paragraph (no previous empty line)
          currentParagraph.push(trimmedLine);
        } else {
          // Continuation of current paragraph - join with space
          currentParagraph.push(trimmedLine);
        }
      }
    }
  }
  
  // Finalize any remaining paragraph
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
  
  // Convert Imgur links to images FIRST (before paragraph formatting)
  // This prevents URLs from being wrapped in <p> tags
  rendered = convertImgurLinksToImages(rendered);
  
  // THEN convert plain text to HTML (this will leave image HTML as-is)
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
