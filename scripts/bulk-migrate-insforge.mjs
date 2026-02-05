#!/usr/bin/env node

/**
 * Bulk migration script to replace Supabase with InsForge
 * This script performs find-and-replace operations across all TypeScript files
 */

import { readFileSync, writeFileSync } from 'fs';
import { glob } from 'glob';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// Files to skip (already migrated or special cases)
const skipFiles = [
  'src/lib/supabase',
  'src/lib/insforge',
  'node_modules',
  '.next',
];

// Migration patterns
const migrations = [
  {
    name: 'Replace client import',
    from: /import\s+{\s*createClient\s*}\s+from\s+["']@\/lib\/supabase\/client["'];?/g,
    to: 'import { insforge } from "@/lib/insforge/client";',
  },
  {
    name: 'Replace server import',
    from: /import\s+{\s*createClient\s*}\s+from\s+["']@\/lib\/supabase\/server["'];?/g,
    to: 'import { insforge } from "@/lib/insforge/server";',
  },
  {
    name: 'Remove const supabase = createClient()',
    from: /const\s+supabase\s*=\s*createClient\(\);\s*\n/g,
    to: '',
  },
  {
    name: 'Remove await createClient()',
    from: /const\s+supabase\s*=\s*await\s+createClient\(\);\s*\n/g,
    to: '',
  },
  {
    name: 'Replace supabase.from with insforge.database.from',
    from: /supabase\.from\(/g,
    to: 'insforge.database.from(',
  },
  {
    name: 'Fix insert() to use array format',
    from: /\.insert\(([^[\]\s]+)\)(?!\s*\[)/g,
    to: (match, p1) => {
      // Skip if already array or if it's a variable that might be an array
      if (p1.includes('[') || p1.includes('contacts') || p1.includes('companies')) {
        return match;
      }
      return `.insert([${p1}])`;
    },
  },
  {
    name: 'Fix upsert() to use array format',
    from: /\.upsert\((\{[^}]+\})\)(?!\s*\[)/g,
    to: (match, p1) => {
      return `.upsert([${p1}])`;
    },
  },
];

function shouldSkipFile(filePath) {
  return skipFiles.some(skip => filePath.includes(skip));
}

function migrateFile(filePath) {
  if (shouldSkipFile(filePath)) {
    return { migrated: false, reason: 'skipped' };
  }

  try {
    let content = readFileSync(filePath, 'utf-8');
    let modified = false;
    let changes = [];

    for (const migration of migrations) {
      const before = content;
      
      if (typeof migration.to === 'function') {
        content = content.replace(migration.from, migration.to);
      } else {
        content = content.replace(migration.from, migration.to);
      }

      if (content !== before) {
        modified = true;
        changes.push(migration.name);
      }
    }

    if (modified) {
      writeFileSync(filePath, content, 'utf-8');
      return { migrated: true, changes };
    }

    return { migrated: false, reason: 'no changes' };
  } catch (error) {
    return { migrated: false, reason: `error: ${error.message}` };
  }
}

async function main() {
  console.log('🚀 Starting bulk InsForge migration...\n');

  const patterns = [
    'src/**/*.ts',
    'src/**/*.tsx',
  ];

  let totalFiles = 0;
  let migratedFiles = 0;
  let skippedFiles = 0;
  let errorFiles = 0;

  for (const pattern of patterns) {
    const files = glob.sync(pattern, {
      cwd: projectRoot,
      ignore: ['**/node_modules/**', '**/.next/**', '**/dist/**'],
    });

    for (const file of files) {
      const filePath = join(projectRoot, file);
      totalFiles++;

      const result = migrateFile(filePath);
      
      if (result.migrated) {
        migratedFiles++;
        console.log(`✓ ${file} (${result.changes.join(', ')})`);
      } else if (result.reason === 'skipped') {
        skippedFiles++;
      } else if (result.reason?.startsWith('error')) {
        errorFiles++;
        console.error(`✗ ${file}: ${result.reason}`);
      }
    }
  }

  console.log(`\n📊 Migration Summary:`);
  console.log(`   Total files: ${totalFiles}`);
  console.log(`   Migrated: ${migratedFiles}`);
  console.log(`   Skipped: ${skippedFiles}`);
  console.log(`   Errors: ${errorFiles}`);
  console.log(`\n⚠️  Please review changes and test thoroughly!`);
}

main().catch(console.error);
