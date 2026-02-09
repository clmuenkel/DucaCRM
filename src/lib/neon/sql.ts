import { neon } from "@neondatabase/serverless";

const connectionString =
  process.env.DATABASE_URL ||
  "postgresql://neondb_owner:npg_zf1eWn4bqVMc@ep-weathered-frost-ai6jcha1.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require";

const sql = neon(connectionString);

/**
 * Execute a raw SQL query with parameterized values.
 * Uses sql.query() for conventional (text, params) calls.
 * Uses HTTP under the hood — no TCP sockets, no hanging builds.
 */
export async function query(text: string, params: any[] = []): Promise<any[]> {
  const rows = await sql.query(text, params);
  return rows as any[];
}
