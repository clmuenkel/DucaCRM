#!/usr/bin/env node

const { execSync } = require('child_process');

// This script is for Cloudflare Pages
// The adapter will call "vercel-build" which runs "next build"
// So we don't need to build here - just run the adapter

console.log('Running Cloudflare Pages adapter...');
console.log('(The adapter will run "vercel-build" which runs "next build")');
try {
  execSync('npx @cloudflare/next-on-pages', { stdio: 'inherit' });
} catch (error) {
  console.error('Adapter failed');
  process.exit(1);
}
