import { createClient } from '@insforge/sdk';

let serverClient: ReturnType<typeof createClient> | null = null;

export function createInsForgeServerClient() {
  if (serverClient) return serverClient;
  
  const baseUrl = process.env.INSFORGE_BASE_URL || process.env.NEXT_PUBLIC_INSFORGE_BASE_URL || 'https://ynq36v7w.eu-central.insforge.app';
  const anonKey = process.env.INSFORGE_ANON_KEY || process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY;
  
  if (!anonKey) {
    throw new Error(
      "Missing InsForge environment variable. Please set INFORGE_ANON_KEY or NEXT_PUBLIC_INSFORGE_ANON_KEY"
    );
  }
  
  serverClient = createClient({
    baseUrl,
    anonKey,
  });
  
  return serverClient;
}

// Export singleton instance for server-side use
export const insforge = createInsForgeServerClient();
