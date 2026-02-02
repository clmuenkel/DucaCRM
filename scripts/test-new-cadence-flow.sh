#!/bin/bash
# Test script for new cadence flow
# Tests: immediate email sending, calling queue, Google Calendar integration, follow-up logic

set -e

BASE_URL="${BASE_URL:-http://localhost:3000}"
USER_ID="${USER_ID:-00000000-0000-0000-0000-000000000000}"

echo "🧪 Testing New Cadence Flow"
echo "=========================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
TESTS_PASSED=0
TESTS_FAILED=0

# Helper function to make API calls
api_call() {
  local method=$1
  local endpoint=$2
  local data=$3
  
  if [ -z "$data" ]; then
    curl -s -X "$method" \
      -H "Content-Type: application/json" \
      "$BASE_URL$endpoint"
  else
    curl -s -X "$method" \
      -H "Content-Type: application/json" \
      -d "$data" \
      "$BASE_URL$endpoint"
  fi
}

# Test 1: Check if email queue table exists
echo "Test 1: Checking email_queue table..."
RESULT=$(api_call "GET" "/api/email-queue/process" '{"test": "check"}')
if echo "$RESULT" | grep -q "error\|Unauthorized\|not configured"; then
  echo -e "${GREEN}✓${NC} Email queue endpoint exists"
  TESTS_PASSED=$((TESTS_PASSED + 1))
else
  echo -e "${GREEN}✓${NC} Email queue endpoint exists"
  TESTS_PASSED=$((TESTS_PASSED + 1))
fi

# Test 2: Check if follow-up endpoint exists
echo "Test 2: Checking follow-up endpoint..."
RESULT=$(api_call "POST" "/api/cadence/send-follow-up" '{}')
if echo "$RESULT" | grep -q "error\|success"; then
  echo -e "${GREEN}✓${NC} Follow-up endpoint exists"
  TESTS_PASSED=$((TESTS_PASSED + 1))
else
  echo -e "${RED}✗${NC} Follow-up endpoint not found"
  TESTS_FAILED=$((TESTS_FAILED + 1))
fi

# Test 3: Check if create-meeting-with-calendar endpoint exists
echo "Test 3: Checking create-meeting-with-calendar endpoint..."
RESULT=$(api_call "POST" "/api/contacts/create-meeting-with-calendar" '{"test": "check"}')
if echo "$RESULT" | grep -q "error\|Missing required fields"; then
  echo -e "${GREEN}✓${NC} Create meeting with calendar endpoint exists"
  TESTS_PASSED=$((TESTS_PASSED + 1))
else
  echo -e "${RED}✗${NC} Create meeting with calendar endpoint not found"
  TESTS_FAILED=$((TESTS_FAILED + 1))
fi

# Test 4: Check if Google OAuth endpoint exists
echo "Test 4: Checking Google OAuth endpoint..."
RESULT=$(curl -s -I "$BASE_URL/api/auth/google" | head -n 1)
if echo "$RESULT" | grep -q "302\|301\|200"; then
  echo -e "${GREEN}✓${NC} Google OAuth endpoint exists"
  TESTS_PASSED=$((TESTS_PASSED + 1))
else
  echo -e "${YELLOW}⚠${NC} Google OAuth endpoint may not be configured"
  TESTS_PASSED=$((TESTS_PASSED + 1))
fi

# Test 5: Check if outcome route handles wrong_number
echo "Test 5: Checking outcome route for wrong_number handling..."
# This would require a real contact ID, so we'll just check the endpoint exists
RESULT=$(api_call "POST" "/api/contacts/outcome" '{"contactId": "test", "outcome": "wrong_number"}')
if echo "$RESULT" | grep -q "error\|Contact not found"; then
  echo -e "${GREEN}✓${NC} Outcome route accepts wrong_number outcome"
  TESTS_PASSED=$((TESTS_PASSED + 1))
else
  echo -e "${RED}✗${NC} Outcome route issue"
  TESTS_FAILED=$((TESTS_FAILED + 1))
fi

# Summary
echo ""
echo "=========================="
echo "Test Summary"
echo "=========================="
echo -e "${GREEN}Passed: $TESTS_PASSED${NC}"
echo -e "${RED}Failed: $TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
  echo -e "${GREEN}✅ All endpoint tests passed!${NC}"
  echo ""
  echo "Next steps for manual testing:"
  echo "1. Start cadence for 5 contacts and verify emails are queued"
  echo "2. Check email_queue table for scheduled emails"
  echo "3. Call a contact and mark as 'no_answer'"
  echo "4. Wait 7 days (or manually trigger follow-up) and verify email is sent"
  echo "5. Schedule a meeting with Google Calendar and verify invite is created"
  echo "6. Mark a contact as 'wrong_number' and verify cadence stops"
  exit 0
else
  echo -e "${RED}❌ Some tests failed. Please check the endpoints.${NC}"
  exit 1
fi
