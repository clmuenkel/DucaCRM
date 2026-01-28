import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function checkTable() {
  const { data, error } = await supabase.from('phone_reveal_requests').select('id').limit(1);
  if (error) {
    console.error('Table phone_reveal_requests might not exist:', error.message);
  } else {
    console.log('Table phone_reveal_requests exists and is accessible.');
  }
}

checkTable();
