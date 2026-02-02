import { readFileSync, writeFileSync } from 'fs';
import { glob } from 'glob';

const routeFiles = glob.sync('src/app/api/**/route.ts');

let updated = 0;
let skipped = 0;

for (const file of routeFiles) {
  const content = readFileSync(file, 'utf-8');
  
  // Skip if already has runtime export
  if (content.includes("export const runtime = 'edge'")) {
    skipped++;
    continue;
  }
  
  // Check if it has dynamic export
  const hasDynamic = content.includes("export const dynamic");
  
  let newContent;
  if (hasDynamic) {
    // Add runtime after dynamic export
    newContent = content.replace(
      /(export const dynamic = ['"]force-dynamic['"];)/,
      "$1\nexport const runtime = 'edge';"
    );
  } else {
    // Add runtime after imports, before first export
    const importEnd = content.indexOf('\nexport');
    if (importEnd === -1) {
      // No export found, add at end of imports
      const lastImport = content.lastIndexOf('import');
      const nextLine = content.indexOf('\n', lastImport);
      newContent = content.slice(0, nextLine + 1) + "\nexport const runtime = 'edge';\n" + content.slice(nextLine + 1);
    } else {
      // Add before first export
      newContent = content.slice(0, importEnd) + "\nexport const runtime = 'edge';\n" + content.slice(importEnd);
    }
  }
  
  if (newContent !== content) {
    writeFileSync(file, newContent, 'utf-8');
    updated++;
    console.log(`Updated: ${file}`);
  } else {
    skipped++;
    console.log(`Skipped (no change): ${file}`);
  }
}

console.log(`\nDone! Updated: ${updated}, Skipped: ${skipped}`);
