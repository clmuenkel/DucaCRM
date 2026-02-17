/**
 * Email Templates for EviosHQ outreach campaigns.
 * Variables: {{first_name}}, {{company_name}}, {{industry}}, {{sender_name}}, {{calendar_link}}
 */

export interface OutreachTemplate {
  key: string;
  name: string;
  subject: string;
  body: string;
}

export const OUTREACH_TEMPLATES: Record<string, OutreachTemplate> = {
  original: {
    key: "original",
    name: "Original Outreach (Full)",
    subject: "Quick question for {{company_name}}",
    body: `Hi {{first_name}},

I came across {{company_name}} and wanted to reach out. I work with {{industry}} companies to help them save time and grow revenue using custom automation and AI — things like automated follow-ups, smart scheduling, and streamlined operations.

We build everything custom around how your business actually works. No cookie-cutter templates.

Here's how it works:
1. Free discovery call to understand your pain points
2. We build the solution at no upfront cost
3. You test it in your business before committing

If you're open to a quick 15-minute chat, here's my calendar: {{calendar_link}}

Either way, I appreciate your time.

Best,
{{sender_name}}
Evios HQ`,
  },

  short: {
    key: "short",
    name: "Short Outreach (Recommended)",
    subject: "{{first_name}} — quick idea for {{company_name}}",
    body: `Hi {{first_name}},

I help {{industry}} companies automate the busywork — follow-ups, scheduling, customer communication — so owners can focus on the actual business.

Everything is built custom around how you work. No upfront cost, you only pay if you love it.

Worth a 15-min call? {{calendar_link}}

{{sender_name}}
Evios HQ`,
  },
};

/**
 * Render a template with variables.
 */
export function renderOutreachTemplate(
  template: OutreachTemplate,
  variables: Record<string, string>
): { subject: string; body: string } {
  let subject = template.subject;
  let body = template.body;

  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, "g");
    subject = subject.replace(regex, value || "");
    body = body.replace(regex, value || "");
  }

  return { subject, body };
}
