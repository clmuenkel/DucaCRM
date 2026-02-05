import { createClient } from '@insforge/sdk';

let client: ReturnType<typeof createClient> | null = null;

export function createInsForgeClient() {
  if (client) return client;
  
  const baseUrl = process.env.NEXT_PUBLIC_INSFORGE_BASE_URL || 'https://ynq36v7w.eu-central.insforge.app';
  const anonKey = process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY;
  
  if (!anonKey) {
    throw new Error(
      "Missing InsForge environment variable. Please set NEXT_PUBLIC_INSFORGE_ANON_KEY"
    );
  }
  
  client = createClient({
    baseUrl,
    anonKey,
  });
  
  return client;
}

// Export singleton instance
export const insforge = createInsForgeClient();
