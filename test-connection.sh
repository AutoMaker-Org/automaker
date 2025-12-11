#!/bin/bash

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}=== Testing Helper Service Connection ===${NC}\n"

# Check if connection info exists
if [ ! -f /tmp/automaker-helper.json ]; then
    echo -e "${RED}✗ Connection info file not found at /tmp/automaker-helper.json${NC}"
    echo -e "${YELLOW}  Is the helper service running?${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Connection info file found${NC}"

# Read connection info
PORT=$(cat /tmp/automaker-helper.json | grep -o '"port":[0-9]*' | cut -d: -f2)
TOKEN=$(cat /tmp/automaker-helper.json | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

echo -e "${GREEN}  Port: $PORT${NC}"
echo -e "${GREEN}  Token: ${TOKEN:0:20}...${NC}\n"

# Test health endpoint
echo -e "${YELLOW}Testing health endpoint...${NC}"
HEALTH=$(curl -s "http://localhost:$PORT/health")

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Health endpoint responded${NC}"
    echo -e "${GREEN}  Response: $HEALTH${NC}\n"
else
    echo -e "${RED}✗ Health endpoint failed${NC}"
    exit 1
fi

# Test CORS
echo -e "${YELLOW}Testing CORS from localhost:3007...${NC}"
CORS_TEST=$(curl -s -H "Origin: http://localhost:3007" -H "Access-Control-Request-Method: GET" -X OPTIONS "http://localhost:$PORT/health" -w "%{http_code}" -o /dev/null)

if [ "$CORS_TEST" = "204" ] || [ "$CORS_TEST" = "200" ]; then
    echo -e "${GREEN}✓ CORS preflight succeeded (HTTP $CORS_TEST)${NC}\n"
else
    echo -e "${RED}✗ CORS preflight failed (HTTP $CORS_TEST)${NC}\n"
fi

# Test authenticated endpoint
echo -e "${YELLOW}Testing authenticated endpoint...${NC}"
AUTH_TEST=$(curl -s -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"path":"/tmp"}' "http://localhost:$PORT/fs/exists" -w "\n%{http_code}" | tail -1)

if [ "$AUTH_TEST" = "200" ]; then
    echo -e "${GREEN}✓ Authenticated request succeeded${NC}\n"
else
    echo -e "${RED}✗ Authenticated request failed (HTTP $AUTH_TEST)${NC}\n"
fi

echo -e "${GREEN}=== Connection Test Complete ===${NC}"
