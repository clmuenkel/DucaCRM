# Cleanup Unused Files Plan

## Files to Remove

### 1. Supabase Files (No Longer Used After InsForge Migration)
- `src/lib/supabase/client.ts` - Old Supabase client
- `src/lib/supabase/server.ts` - Old Supabase server client
- `test_db.mjs` - Supabase test file
- `supabase/` directory - All migration files (already applied to InsForge)

### 2. Temporary Migration Scripts
- `scripts/bulk-migrate-insforge.mjs` - One-time migration script
- `scripts/fix-all-supabase-final.sh` - One-time fix script
- `scripts/fix-all-supabase.mjs` - One-time fix script
- `scripts/migrate-to-insforge.mjs` - One-time migration script

### 3. Temporary Documentation
- `BUILD_FIXES.md` - Temporary fix notes
- `FIXES_APPLIED.md` - Temporary fix notes
- `MIGRATION_COMPLETE.md` - Migration is complete, no longer needed

### 4. Files to Keep
- `DEPLOYMENT.md` - Useful deployment instructions
- `VERCEL_SETUP.md` - Useful Vercel setup guide
- `RESEND_SETUP.md` - Useful Resend setup guide
- `TESTING.md` - Useful testing documentation
- `README.md` - Main project readme
- `scripts/deploy-vercel.sh` - Active deployment script
- `scripts/setup-test-data.mjs` - Useful for testing
- `scripts/test-cadence-flow.sh` - Useful for testing
- `scripts/test-new-cadence-flow.sh` - Useful for testing
- `scripts/clear-email-queue-and-reset-cadences.mjs` - Utility script

## Implementation

1. Delete Supabase client files
2. Delete Supabase directory
3. Delete temporary migration scripts
4. Delete temporary documentation files
5. Verify no imports reference deleted files
6. Commit cleanup
