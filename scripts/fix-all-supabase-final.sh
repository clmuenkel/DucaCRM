#!/bin/bash

# Comprehensive script to fix ALL remaining supabase references

cd /Users/Duca/Desktop/pezCRM/KoldKallKilla

# List of files to fix
files=(
  "src/app/api/contacts/create-meeting-with-calendar/route.ts"
  "src/app/api/contacts/create-referral/route.ts"
  "src/app/api/contacts/mark-not-interested/route.ts"
  "src/app/api/contacts/mark-wrong-number/route.ts"
  "src/app/api/contacts/outcome/route.ts"
  "src/app/api/contacts/pause-cadence/route.ts"
  "src/app/api/contacts/queue/route.ts"
  "src/app/api/contacts/schedule-meeting/route.ts"
  "src/app/api/contacts/start-cadence/route.ts"
  "src/app/api/contacts/update-call-attempt/route.ts"
  "src/app/api/debug/calendar-response/route.ts"
  "src/app/api/email-queue/process/route.ts"
  "src/app/api/leads/apollo/bulk/route.ts"
  "src/app/api/leads/apollo/enrich/route.ts"
  "src/app/api/leads/export/route.ts"
  "src/app/api/leads/import-to-crm/route.ts"
  "src/app/api/leads/manual-review/route.ts"
  "src/app/api/leads/pipeline/route.ts"
  "src/app/api/leads/places/search/route.ts"
  "src/app/api/leads/scrape/route.ts"
  "src/app/api/leads/test/route.ts"
  "src/app/api/leads/verify-email/route.ts"
  "src/app/api/meetings/[id]/route.ts"
  "src/app/api/meetings/route.ts"
  "src/app/api/persona-sets/[id]/route.ts"
  "src/app/api/persona-sets/route.ts"
  "src/app/api/resend/webhook/route.ts"
  "src/app/api/templates/preview/route.ts"
  "src/app/api/templates/test/route.ts"
  "src/app/api/twilio/call/initiate/route.ts"
  "src/app/api/twilio/webhook/route.ts"
)

for file in "${files[@]}"; do
  if [ -f "$file" ]; then
    # Replace all supabase patterns
    sed -i '' 's/await supabase$/await insforge.database/g' "$file"
    sed -i '' 's/await supabase\./await insforge.database./g' "$file"
    sed -i '' 's/await (supabase as any)\./await insforge.database./g' "$file"
    sed -i '' 's/const { data, error } = await supabase$/const { data, error } = await insforge.database/g' "$file"
    sed -i '' 's/const { data: \([^,]*\), error: \([^}]*\) } = await supabase$/const { data: \1, error: \2 } = await insforge.database/g' "$file"
    sed -i '' 's/const { data: \([^}]*\) } = await supabase$/const { data: \1 } = await insforge.database/g' "$file"
    sed -i '' 's/const { count: \([^}]*\) } = await supabase$/const { count: \1 } = await insforge.database/g' "$file"
    sed -i '' 's/let query = supabase$/let query = insforge.database/g' "$file"
    sed -i '' 's/async function getApolloApiKey(supabase: any)/async function getApolloApiKey()/g' "$file"
    sed -i '' 's/getApolloApiKey(supabase)/getApolloApiKey()/g' "$file"
    echo "Fixed: $file"
  fi
done

echo "All files fixed!"
