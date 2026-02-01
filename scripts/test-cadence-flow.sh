#!/bin/bash

# Test Cadence Flow Script
# Tests the full cadence workflow: create contact, start cadence, verify

set -e

BASE_URL="${BASE_URL:-http://localhost:3000}"
API_BASE="${BASE_URL}/api"

echo "🧪 Testing Cadence Flow"
echo "========================"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Step 1: Create test contact
echo "1️⃣  Creating test contact..."
CREATE_RESPONSE=$(curl -s -X POST "${API_BASE}/contacts/create-test" \
  -H "Content-Type: application/json")

CONTACT_ID=$(echo $CREATE_RESPONSE | grep -o '"contactId":"[^"]*"' | cut -d'"' -f4)

if [ -z "$CONTACT_ID" ]; then
  echo -e "${RED}❌ Failed to create test contact${NC}"
  echo "Response: $CREATE_RESPONSE"
  exit 1
fi

echo -e "${GREEN}✅ Test contact created: $CONTACT_ID${NC}"
echo ""

# Step 2: Start cadence
echo "2️⃣  Starting cadence for test contact..."
START_RESPONSE=$(curl -s -X POST "${API_BASE}/contacts/start-cadence" \
  -H "Content-Type: application/json" \
  -d "{\"contactIds\":[\"$CONTACT_ID\"]}")

SUCCESS=$(echo $START_RESPONSE | grep -o '"success":[^,]*' | cut -d':' -f2)

if [ "$SUCCESS" != "true" ]; then
  echo -e "${RED}❌ Failed to start cadence${NC}"
  echo "Response: $START_RESPONSE"
  exit 1
fi

echo -e "${GREEN}✅ Cadence started successfully${NC}"
echo "Response: $START_RESPONSE"
echo ""

# Step 3: Verify contact appears in active cadence
echo "3️⃣  Verifying contact is in active cadence..."
# This would require querying the database or API endpoint
# For now, we'll just check the response

echo -e "${YELLOW}⚠️  Manual check required:${NC}"
echo "   - Go to Work Queue"
echo "   - Verify contact appears in 'Active Cadence' top table"
echo "   - Check Instantly dashboard for lead"
echo ""

# Step 4: Verify campaign
echo "4️⃣  Verifying Instantly campaign..."
CAMPAIGN_RESPONSE=$(curl -s -X GET "${API_BASE}/instantly/verify-campaign")

VALID=$(echo $CAMPAIGN_RESPONSE | grep -o '"valid":[^,]*' | cut -d':' -f2)

if [ "$VALID" = "true" ]; then
  echo -e "${GREEN}✅ Campaign verified${NC}"
else
  echo -e "${RED}❌ Campaign verification failed${NC}"
  echo "Response: $CAMPAIGN_RESPONSE"
fi
echo ""

echo -e "${GREEN}✅ Test flow completed!${NC}"
echo ""
echo "Next steps:"
echo "  - Check Work Queue UI for contact"
echo "  - Check Instantly dashboard for lead"
echo "  - Verify email was sent"
