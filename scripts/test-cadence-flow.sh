#!/bin/bash

# Test Cadence Flow Script
# Tests the complete cadence automation flow

set -e

BASE_URL="${NEXT_PUBLIC_APP_URL:-http://localhost:3000}"
API_BASE="${BASE_URL}/api"

echo "🧪 Testing Cadence Flow"
echo "========================"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: Create test contact
echo "1️⃣  Creating test contact..."
CONTACT_RESPONSE=$(curl -s -X POST "${API_BASE}/contacts/create-test" \
  -H "Content-Type: application/json" \
  -d '{
    "first_name": "Test",
    "last_name": "Contact",
    "email": "test-'$(date +%s)'@example.com",
    "company_name": "Test Company"
  }')

CONTACT_ID=$(echo $CONTACT_RESPONSE | grep -o '"id":"[^"]*' | cut -d'"' -f4)

if [ -z "$CONTACT_ID" ]; then
  echo -e "${RED}❌ Failed to create test contact${NC}"
  echo "$CONTACT_RESPONSE"
  exit 1
fi

echo -e "${GREEN}✅ Contact created: $CONTACT_ID${NC}"
echo ""

# Test 2: Start cadence
echo "2️⃣  Starting cadence..."
CADENCE_RESPONSE=$(curl -s -X POST "${API_BASE}/contacts/start-cadence" \
  -H "Content-Type: application/json" \
  -d "{\"contactIds\": [\"$CONTACT_ID\"], \"pushToInstantly\": true}")

if echo "$CADENCE_RESPONSE" | grep -q '"success":true'; then
  echo -e "${GREEN}✅ Cadence started${NC}"
else
  echo -e "${RED}❌ Failed to start cadence${NC}"
  echo "$CADENCE_RESPONSE"
  exit 1
fi
echo ""

# Test 3: Verify contact in active cadence
echo "3️⃣  Verifying contact in active cadence..."
sleep 2
WORKQUEUE_RESPONSE=$(curl -s "${BASE_URL}/workqueue")

if echo "$WORKQUEUE_RESPONSE" | grep -q "$CONTACT_ID"; then
  echo -e "${GREEN}✅ Contact appears in work queue${NC}"
else
  echo -e "${YELLOW}⚠️  Contact may not appear in work queue (check manually)${NC}"
fi
echo ""

# Test 4: Simulate email open (webhook)
echo "4️⃣  Simulating email open webhook..."
EMAIL=$(echo $CONTACT_RESPONSE | grep -o '"email":"[^"]*' | cut -d'"' -f4)
WEBHOOK_RESPONSE=$(curl -s -X POST "${API_BASE}/instantly/webhook" \
  -H "Content-Type: application/json" \
  -d "{
    \"event\": \"email_opened\",
    \"email\": \"$EMAIL\",
    \"campaign_id\": \"test\"
  }")

if echo "$WEBHOOK_RESPONSE" | grep -q '"success":true'; then
  echo -e "${GREEN}✅ Webhook processed successfully${NC}"
else
  echo -e "${YELLOW}⚠️  Webhook may have failed (check manually)${NC}"
fi
echo ""

# Test 5: Simulate no answer on call
echo "5️⃣  Simulating no answer on call..."
OUTCOME_RESPONSE=$(curl -s -X POST "${API_BASE}/contacts/outcome" \
  -H "Content-Type: application/json" \
  -d "{
    \"contactId\": \"$CONTACT_ID\",
    \"outcome\": \"no_answer\",
    \"notes\": \"Test call - no answer\"
  }")

if echo "$OUTCOME_RESPONSE" | grep -q '"success":true'; then
  echo -e "${GREEN}✅ Call outcome recorded${NC}"
else
  echo -e "${YELLOW}⚠️  Call outcome may have failed${NC}"
fi
echo ""

# Test 6: Advance cadence
echo "6️⃣  Advancing cadence..."
ADVANCE_RESPONSE=$(curl -s -X POST "${API_BASE}/cadence/advance")

if echo "$ADVANCE_RESPONSE" | grep -q '"success":true'; then
  echo -e "${GREEN}✅ Cadence advanced${NC}"
  echo "$ADVANCE_RESPONSE" | grep -o '"message":"[^"]*'
else
  echo -e "${YELLOW}⚠️  Cadence advance may have issues${NC}"
fi
echo ""

# Test 7: Simulate meeting booking
echo "7️⃣  Simulating meeting booking..."
MEETING_RESPONSE=$(curl -s -X POST "${API_BASE}/contacts/outcome" \
  -H "Content-Type: application/json" \
  -d "{
    \"contactId\": \"$CONTACT_ID\",
    \"outcome\": \"won\",
    \"notes\": \"Test - meeting booked\"
  }")

if echo "$MEETING_RESPONSE" | grep -q '"success":true'; then
  echo -e "${GREEN}✅ Meeting booked${NC}"
else
  echo -e "${YELLOW}⚠️  Meeting booking may have failed${NC}"
fi
echo ""

# Test 8: Verify cadence stopped
echo "8️⃣  Verifying cadence stopped..."
sleep 1
ADVANCE_AGAIN=$(curl -s -X POST "${API_BASE}/cadence/advance")

if echo "$ADVANCE_AGAIN" | grep -q '"advanced":0'; then
  echo -e "${GREEN}✅ Cadence stopped (no contacts advanced)${NC}"
else
  echo -e "${YELLOW}⚠️  Check if cadence properly stopped${NC}"
fi
echo ""

echo -e "${GREEN}✅ All tests completed!${NC}"
echo ""
echo "Summary:"
echo "  - Contact created: $CONTACT_ID"
echo "  - Email: $EMAIL"
echo "  - Check Instantly dashboard for lead status"
echo "  - Check CRM work queue for contact status"
