import { neon } from "@neondatabase/serverless";

const connectionString =
  process.env.DATABASE_URL ||
  "postgresql://neondb_owner:npg_zf1eWn4bqVMc@ep-weathered-frost-ai6jcha1.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require";

// neon() returns a tagged template function that also supports sql(string, params)
// The TypeScript types only expose the tagged template signature, so we cast.
const neonFn = neon(connectionString);

/**
 * Execute a raw SQL query with parameterized values.
 * Uses HTTP under the hood — no TCP sockets, no hanging builds.
 */
export async function query(text: string, params: any[] = []): Promise<any[]> {
  // neon() function supports (string, params[]) at runtime even though types say TemplateStringsArray
  const rows = await (neonFn as any)(text, params);
  return rows as any[];
}
