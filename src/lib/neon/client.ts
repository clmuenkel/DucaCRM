/**
 * Client-side Neon database wrapper.
 * Routes queries through /api/db endpoint.
 * Drop-in replacement for InsForge client — same .from().select().eq() API.
 */

import { DatabaseClient } from "./query-builder";
import type { QueryDescriptor } from "./query-builder";

async function clientExecutor(
  desc: QueryDescriptor
): Promise<{ data: any; error: any; count?: number }> {
  try {
    const res = await fetch("/api/db", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(desc),
    });

    if (!res.ok) {
      const text = await res.text();
      return {
        data: null,
        error: { message: `HTTP ${res.status}: ${text}` },
      };
    }

    return await res.json();
  } catch (e: any) {
    return {
      data: null,
      error: { message: e.message || "Network error" },
    };
  }
}

const database = new DatabaseClient(clientExecutor);

// Export matching InsForge's interface: insforge.database.from(...)
export const insforge = { database };
export { database };
