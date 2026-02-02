# Cloudflare Pages Build Configuration

## Build Command
Set the build command in Cloudflare Pages to:
```
npx @cloudflare/next-on-pages
```

The adapter will automatically:
1. Run `npm run vercel-build` (which runs `next build`)
2. Convert the output to Cloudflare Pages format
3. Output to `.vercel/output/static` as specified in `wrangler.toml`

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
- The adapter handles the build process automatically
- It calls `vercel-build` script which runs `next build`
- No recursion because `vercel-build` is separate from `build`
- Output goes to `.vercel/output/static` as specified in `wrangler.toml`
