/**
 * Script to clear email_queue and reset all active cadences
 * Run with: node scripts/clear-email-queue-and-reset-cadences.mjs
 * 
 * Requires environment variables:
 * - NEXT_PUBLIC_SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read .env.local file
let envVars = {};
try {
  const envFile = readFileSync(join(__dirname, '..', '.env.local'), 'utf8');
  envFile.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim().replace(/^["']|["']$/g, '');
      envVars[key] = value;
    }
  });
} catch (error) {
  console.warn('Could not read .env.local, using process.env');
}

const supabaseUrl = envVars.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = envVars.SUPABASE_SERVICE_ROLE_KEY || envVars.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000000';

async function clearData() {
  try {
    console.log('Clearing email_queue...');
    
    // Clear email_queue
    const { error: queueError, count: queueCount } = await supabase
      .from('email_queue')
      .delete({ count: 'exact' })
      .eq('user_id', DEFAULT_USER_ID);

    if (queueError) {
      console.error('Error clearing email_queue:', queueError);
    } else {
      console.log(`✓ Cleared ${queueCount || 0} email_queue entries`);
    }

    console.log('Resetting active cadences...');
    
    // Reset all active cadences
    const { error: cadenceError, count: cadenceCount } = await supabase
      .from('contacts')
      .update({
        cadence_status: null,
        cadence_step: null,
        cadence_outcome: null,
        next_action_date: null,
        next_action_type: null,
        cadence_day_started: null,
        cadence_started_at: null,
      })
      .eq('user_id', DEFAULT_USER_ID)
      .eq('cadence_status', 'active')
      .select('id', { count: 'exact', head: false });

    if (cadenceError) {
      console.error('Error resetting cadences:', cadenceError);
    } else {
      console.log(`✓ Reset ${cadenceCount || 0} active cadences`);
    }

    console.log('\n✅ Data cleared successfully!');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

clearData();
