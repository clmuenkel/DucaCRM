/**
 * Server-side Neon database wrapper.
 * Executes queries directly via postgres.js — no HTTP overhead.
 * Drop-in replacement for InsForge server — same .from().select().eq() API.
 */

import { DatabaseClient } from "./query-builder";
import { executeQuery } from "./executor";

const database = new DatabaseClient(executeQuery);

// Export matching InsForge's interface: insforge.database.from(...)
export const insforge = { database };
export { database };
