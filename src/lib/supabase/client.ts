import { createClient as createSupabaseClient, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

let client: SupabaseClient<Database> | null = null;

export function createClient(): SupabaseClient<Database> {
  if (client) return client;
  
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  // During build time, env vars might not be available - return a dummy client that will fail gracefully
  if (typeof window === 'undefined' && (!supabaseUrl || !supabaseAnonKey)) {
    // Server-side build: create a dummy client that will throw on actual use
    // This prevents build errors while still catching runtime errors
    return createSupabaseClient<Database>(
      supabaseUrl || 'https://placeholder.supabase.co',
      supabaseAnonKey || 'placeholder-key'
    );
  }
  
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing Supabase environment variables. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY"
    );
  }
  
  client = createSupabaseClient<Database>(supabaseUrl, supabaseAnonKey);
  
  return client;
}
