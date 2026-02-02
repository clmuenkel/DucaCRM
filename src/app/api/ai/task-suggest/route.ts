import { NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface TaskSuggestRequest {
  text: string;
  contact?: {
    name?: string;
    title?: string;
    company?: string;
  };
  context?: string;
}

interface TaskSuggestResponse {
  title: string;
  type: "call" | "email" | "follow_up" | "meeting" | "other";
  importance: number;
}


export async function POST(request: Request) {
  try {
    const body: TaskSuggestRequest = await request.json();
    const { text, contact, context } = body;

    if (!text) {
      return NextResponse.json(
        { error: "Task text is required" },
        { status: 400 }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      // Fallback if no API key - return sensible defaults
      return NextResponse.json({
        title: text.substring(0, 60) + (text.length > 60 ? "..." : ""),
        type: "follow_up",
        importance: 5,
      });
    }

    const contactInfo = contact
      ? `Contact: ${contact.name || "Unknown"}${contact.title ? ` (${contact.title})` : ""}${contact.company ? ` at ${contact.company}` : ""}`
      : "";

    const prompt = `You are a sales CRM assistant. Based on the task note from a sales call, generate a concise task title, determine the task type, and rate its importance.

Task note: "${text}"
${contactInfo}
${context ? `Additional context: ${context}` : ""}

Respond in JSON format only:
{
  "title": "A clear, actionable task title (max 60 chars)",
  "type": "call" | "email" | "follow_up" | "meeting" | "other",
  "importance": 1-10 (1=low priority, 10=critical/urgent)
}

Guidelines:
- Title should be action-oriented (e.g., "Send pricing proposal to John", "Schedule demo call")
- Type "call" for phone follow-ups, "email" for email tasks, "meeting" for scheduling meetings, "follow_up" for general follow-ups
- Importance: 8-10 for urgent/time-sensitive, 5-7 for standard follow-ups, 1-4 for low priority/long-term`;

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "You are a helpful sales assistant. Always respond with valid JSON only, no markdown.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.3,
      max_tokens: 150,
    });

    const responseText = completion.choices[0]?.message?.content?.trim() || "";
    
    // Parse JSON response
    let result: TaskSuggestResponse;
    try {
      // Remove any markdown code blocks if present
      const jsonStr = responseText.replace(/```json\n?|\n?```/g, "").trim();
      result = JSON.parse(jsonStr);
    } catch {
      // Fallback if parsing fails
      result = {
        title: text.substring(0, 60) + (text.length > 60 ? "..." : ""),
        type: "follow_up",
        importance: 5,
      };
    }

    // Validate and sanitize response
    const validTypes = ["call", "email", "follow_up", "meeting", "other"];
    if (!validTypes.includes(result.type)) {
      result.type = "follow_up";
    }
    if (typeof result.importance !== "number" || result.importance < 1 || result.importance > 10) {
      result.importance = 5;
    }
    if (!result.title || typeof result.title !== "string") {
      result.title = text.substring(0, 60);
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Task suggest error:", error);
    
    // Return fallback on error
    return NextResponse.json({
      title: "Follow up",
      type: "follow_up",
      importance: 5,
    });
  }
}
