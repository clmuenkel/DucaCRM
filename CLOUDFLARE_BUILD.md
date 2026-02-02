# Cloudflare Pages Build Configuration

## Build Command
Set the build command in Cloudflare Pages to:
```
npm run pages:build
```

## Build Output Directory
The output directory is automatically set via `wrangler.toml`:
```
pages_build_output_dir = ".vercel/output/static"
```

## Environment Variables
Make sure all required environment variables are set in Cloudflare Pages:
- `NEXT_PUBLIC_SUPABASE_URL` (TEXT)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (TEXT)
- `RESEND_API_KEY` (SECRET)
- `RESEND_FROM_EMAIL` (TEXT)
- And all other required variables

## Notes
- The `pages:build` script runs `next build` first, then the Cloudflare adapter
- The adapter converts Next.js output to Cloudflare Pages format
- Output goes to `.vercel/output/static` as specified in `wrangler.toml`
