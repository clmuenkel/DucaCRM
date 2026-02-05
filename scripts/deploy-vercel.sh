#!/bin/bash

# Vercel Deployment Script
# This script helps deploy to Vercel using npx (no global install needed)

echo "🚀 Deploying to Vercel..."
echo ""

# Check if .vercel folder exists (project already linked)
if [ ! -d ".vercel" ]; then
  echo "📦 First time deployment - linking project..."
  npx vercel link
fi

# Deploy to production
echo "🚀 Deploying to production..."
npx vercel --prod

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📝 Don't forget to add environment variables in Vercel dashboard:"
echo "   - NEXT_PUBLIC_INSFORGE_BASE_URL"
echo "   - NEXT_PUBLIC_INSFORGE_ANON_KEY"
echo "   - And any other required variables"
