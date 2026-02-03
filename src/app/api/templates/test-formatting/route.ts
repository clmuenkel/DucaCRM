import { NextRequest, NextResponse } from "next/server";
import { renderTemplate, renderHTMLTemplate, htmlToPlainText } from "@/lib/email-template-renderer";

export const dynamic = 'force-dynamic';

interface TestFormattingRequest {
  templateText: string;
  variables?: Record<string, string>;
}

/**
 * POST /api/templates/test-formatting
 * Test email formatting with raw template text
 * Returns formatted HTML output for verification
 */
export async function POST(request: NextRequest) {
  try {
    const body: TestFormattingRequest = await request.json();
    const { templateText, variables = {} } = body;

    if (!templateText) {
      return NextResponse.json(
        { error: "templateText is required" },
        { status: 400 }
      );
    }

    // Default variables for testing
    const defaultVariables: Record<string, string> = {
      first_name: "Carl-Luca",
      last_name: "Muenkel",
      full_name: "Carl-Luca Muenkel",
      company: "Test Company",
      title: "Founder & CEO",
      email: "test@example.com",
      phone: "+18322941575",
      industry: "swag",
      sender_name: "Carl-Luca Muenkel",
      sender_calendar: "https://calendly.com/test",
      meeting_date: "Tuesday, January 20th",
      meeting_time: "2:00 PM EST",
    };

    const testVariables = { ...defaultVariables, ...variables };

    // Render template with variables
    const renderedWithVars = renderTemplate(templateText, testVariables);
    
    // Get formatted HTML
    const renderedHTML = renderHTMLTemplate(templateText, testVariables);
    
    // Get plain text version
    const renderedText = htmlToPlainText(renderedHTML);

    return NextResponse.json({
      success: true,
      input: {
        templateText,
        variables: testVariables,
      },
      afterVariableReplacement: renderedWithVars,
      output: {
        html: renderedHTML,
        text: renderedText,
      },
      // Extract just the body content (without wrapper) for easier inspection
      bodyContent: renderedHTML
        .replace(/<!DOCTYPE[^>]*>/i, '')
        .replace(/<html[^>]*>/i, '')
        .replace(/<\/html>/i, '')
        .replace(/<head>[\s\S]*?<\/head>/i, '')
        .replace(/<body[^>]*>/i, '')
        .replace(/<\/body>/i, '')
        .trim(),
    });
  } catch (error: any) {
    console.error("Test formatting error:", error);
    return NextResponse.json(
      { 
        error: error.message || "Failed to test formatting",
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}
