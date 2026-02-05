#!/usr/bin/env node

/**
 * Script to fix all remaining supabase references
 */

import { readFileSync, writeFileSync } from 'fs';
import { glob } from 'glob';
import { join } from 'path';

const filesToFix = [
  'src/app/api/persona-sets/route.ts',
  'src/app/api/persona-sets/[id]/route.ts',
  'src/app/api/leads/pipeline/route.ts',
  'src/app/api/leads/test/route.ts',
  'src/app/api/leads/apollo/bulk/route.ts',
  'src/app/api/leads/apollo/enrich/route.ts',
  'src/app/api/contacts/re-enrich/route.ts',
  'src/app/api/contacts/create-meeting-with-calendar/route.ts',
  'src/app/api/contacts/outcome/route.ts',
  'src/app/api/contacts/bulk-update-industries/route.ts',
  'src/app/api/contacts/mark-wrong-number/route.ts',
  'src/app/api/contacts/schedule-meeting/route.ts',
  'src/app/api/contacts/update-call-attempt/route.ts',
  'src/app/api/contacts/queue/route.ts',
  'src/app/api/contacts/start-cadence/route.ts',
  'src/app/api/contacts/mark-not-interested/route.ts',
  'src/app/api/contacts/[id]/referral/route.ts',
  'src/app/api/contacts/create-referral/route.ts',
];

const projectRoot = process.cwd();

function fixFile(filePath) {
  const fullPath = join(projectRoot, filePath);
  try {
    let content = readFileSync(fullPath, 'utf-8');
    let modified = false;

    // Replace supabase references
    const patterns = [
      { from: /await supabase\./g, to: 'await insforge.database.' },
      { from: /await \(supabase as any\)\./g, to: 'await insforge.database.' },
      { from: /const supabase = createClient\(\);/g, to: '// Using insforge (already imported)' },
      { from: /const supabase = await createClient\(\);/g, to: '// Using insforge (already imported)' },
      { from: /let query = supabase\./g, to: 'let query = insforge.database.' },
      { from: /const \{ data: existing \} = await supabase\./g, to: 'const { data: existing } = await insforge.database.' },
      { from: /const \{ data, error \} = await supabase\./g, to: 'const { data, error } = await insforge.database.' },
      { from: /const \{ data: \w+, error: \w+ \} = await supabase\./g, to: (match) => match.replace('supabase', 'insforge.database') },
      { from: /\.insert\(\{/g, to: (match, offset, string) => {
        // Check if it's already an array
        const before = string.substring(Math.max(0, offset - 20), offset);
        if (before.includes('insert([')) return match;
        // Check if next 50 chars contain closing brace and not array
        const after = string.substring(offset, offset + 100);
        if (after.includes('}])')) return match;
        if (after.includes('})\n')) {
          // Single object insert, needs to be array
          return '.insert([{';
        }
        return match;
      }},
    ];

    for (const pattern of patterns) {
      if (typeof pattern.to === 'function') {
        const newContent = content.replace(pattern.from, pattern.to);
        if (newContent !== content) {
          content = newContent;
          modified = true;
        }
      } else {
        const newContent = content.replace(pattern.from, pattern.to);
        if (newContent !== content) {
          content = newContent;
          modified = true;
        }
      }
    }

    // Fix insert calls that need array format
    content = content.replace(/\.insert\(\{([^}]+)\}\)\.select\(\)/g, (match, p1) => {
      if (!match.includes('insert([')) {
        return `.insert([{${p1}}]).select()`;
      }
      return match;
    });

    if (modified) {
      writeFileSync(fullPath, content, 'utf-8');
      console.log(`✓ Fixed: ${filePath}`);
      return true;
    }
    return false;
  } catch (error) {
    console.error(`✗ Error fixing ${filePath}:`, error.message);
    return false;
  }
}

async function main() {
  console.log('Fixing remaining Supabase references...\n');
  
  let fixed = 0;
  for (const file of filesToFix) {
    if (fixFile(file)) {
      fixed++;
    }
  }

  console.log(`\nFixed ${fixed} files.`);
}

main().catch(console.error);
