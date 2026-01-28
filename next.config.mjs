/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['@supabase/ssr', 'twilio'],
  },
};

export default nextConfig;
