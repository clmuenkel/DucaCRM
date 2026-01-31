/**
 * Server-side template rendering utility
 * Replaces {{variable}} placeholders with actual values
 */
export function renderTemplate(
  template: string,
  variables: Record<string, string>
): string {
  let rendered = template;
  Object.entries(variables).forEach(([key, value]) => {
    // Replace {{key}} and {key} patterns
    rendered = rendered.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value || "");
    rendered = rendered.replace(new RegExp(`\\{${key}\\}`, "g"), value || "");
  });
  return rendered;
}
