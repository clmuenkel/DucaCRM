#!/usr/bin/env node

/**
 * Migration script to replace Supabase imports with InsForge
 * Run: node scripts/migrate-to-insforge.mjs
 */

import { readFileSync, writeFileSync } from 'fs';
import { glob } from 'glob';
import { join } from 'path';

const patterns = [
  {
    // Replace client imports
    from: /import\s+{\s*createClient\s*}\s+from\s+["']@\/lib\/supabase\/client["'];?/g,
    to: 'import { insforge } from "@/lib/insforge/client";',
  },
  {
    // Replace server imports
    from: /import\s+{\s*createClient\s*}\s+from\s+["']@\/lib\/supabase\/server["'];?/g,
    to: 'import { insforge } from "@/lib/insforge/server";',
  },
  {
    // Replace await createClient() calls
    from: /const\s+supabase\s*=\s*await\s+createClient\(\);/g,
    to: '// Using insforge (already imported)',
  },
  {
    // Replace const supabase = createClient() (client-side)
    from: /const\s+supabase\s*=\s*createClient\(\);/g,
    to: '// Using insforge (already imported)',
  },
  {
    // Replace supabase.from() with insforge.database.from()
    from: /supabase\.from\(/g,
    to: 'insforge.database.from(',
  },
  {
    // Fix insert() calls - InsForge requires array format
    from: /\.insert\((\w+)\)(?!\s*\[)/g,
    to: (match, p1) => {
      // Check if it's already an array
      if (p1.startsWith('[')) return match;
      return `.insert([${p1}])`;
    },
  },
];

const filesToMigrate = [
  'src/app/api/**/*.ts',
  'src/hooks/**/*.ts',
  'src/components/**/*.tsx',
  'src/app/**/*.tsx',
];

async function migrateFile(filePath) {
  let content = readFileSync(filePath, 'utf-8');
  let modified = false;

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

  if (modified) {
    writeFileSync(filePath, content, 'utf-8');
    console.log(`✓ Migrated: ${filePath}`);
    return true;
  }
  return false;
}

async function main() {
  console.log('Starting InsForge migration...\n');

  let migrated = 0;
  let skipped = 0;

  for (const pattern of filesToMigrate) {
    const files = glob.sync(pattern, { ignore: ['**/node_modules/**', '**/.next/**'] });
    
    for (const file of files) {
      try {
        const wasMigrated = await migrateFile(file);
        if (wasMigrated) {
          migrated++;
        } else {
          skipped++;
        }
      } catch (error) {
        console.error(`✗ Error migrating ${file}:`, error.message);
      }
    }
  }

  console.log(`\nMigration complete!`);
  console.log(`  Migrated: ${migrated} files`);
  console.log(`  Skipped: ${skipped} files`);
  console.log(`\nNote: Please review the changes and test thoroughly.`);
}

main().catch(console.error);
