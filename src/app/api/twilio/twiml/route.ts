import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/twilio/twiml
 * Returns TwiML instructions for outbound calls
 * This endpoint is called by Twilio when a call is initiated via Voice SDK
 */
// Note: Cannot use edge runtime - Twilio SDK uses Node.js-only modules

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const to = formData.get("To") as string;
    const from = formData.get("From") as string;

    if (!to) {
      return new NextResponse(
        `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Error: No destination number provided.</Say>
  <Hangup/>
</Response>`,
        {
          status: 200,
          headers: { "Content-Type": "text/xml" },
        }
      );
    }

    // Return TwiML to dial the number
    // The <Dial> verb connects the call to the destination
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="${from || ""}">
    <Number>${to}</Number>
  </Dial>
</Response>`;

    return new NextResponse(twiml, {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    });
  } catch (error: any) {
    console.error("Error generating TwiML:", error);
    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Error processing call request.</Say>
  <Hangup/>
</Response>`,
      {
        status: 200,
        headers: { "Content-Type": "text/xml" },
      }
    );
  }
}

/**
 * GET /api/twilio/twiml (for testing)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const to = searchParams.get("To");
  const from = searchParams.get("From");

  if (!to) {
    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Error: No destination number provided.</Say>
  <Hangup/>
</Response>`,
      {
        status: 200,
        headers: { "Content-Type": "text/xml" },
      }
    );
  }

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="${from || ""}">
    <Number>${to}</Number>
  </Dial>
</Response>`;

  return new NextResponse(twiml, {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}
