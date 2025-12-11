#!/bin/bash

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Automaker Development Startup Script ===${NC}\n"

# Check if helper is already running
echo -e "${YELLOW}Checking for existing helper process...${NC}"
HELPER_PID=$(pgrep -f "tsx watch src/index.ts" || pgrep -f "node dist/index.js")

if [ ! -z "$HELPER_PID" ]; then
    echo -e "${YELLOW}Found existing helper process (PID: $HELPER_PID). Stopping it...${NC}"
    kill $HELPER_PID 2>/dev/null
    sleep 2
fi

# Clean up old connection info
rm -f /tmp/automaker-helper.json 2>/dev/null

echo -e "${GREEN}Starting helper service...${NC}"
cd /home/zany/cody/automaker/helper

# Start helper in background
npm run dev > /tmp/automaker-helper.log 2>&1 &
HELPER_PID=$!

echo -e "${GREEN}Helper service started (PID: $HELPER_PID)${NC}"
echo -e "${YELLOW}Waiting for helper to initialize...${NC}"
sleep 3

# Check if helper is running
if ps -p $HELPER_PID > /dev/null; then
    echo -e "${GREEN}✓ Helper service is running${NC}"

    # Check if connection info file exists
    if [ -f /tmp/automaker-helper.json ]; then
        PORT=$(cat /tmp/automaker-helper.json | grep -o '"port":[0-9]*' | cut -d: -f2)
        echo -e "${GREEN}✓ Helper is listening on port $PORT${NC}"

        # Test health endpoint
        if curl -s "http://localhost:$PORT/health" > /dev/null 2>&1; then
            echo -e "${GREEN}✓ Helper health check passed${NC}"
        else
            echo -e "${RED}✗ Helper health check failed${NC}"
        fi
    else
        echo -e "${RED}✗ Connection info file not found${NC}"
    fi
else
    echo -e "${RED}✗ Helper service failed to start${NC}"
    echo -e "${YELLOW}Check logs at: /tmp/automaker-helper.log${NC}"
    exit 1
fi

echo -e "\n${GREEN}Starting Next.js web app...${NC}"
cd /home/zany/cody/automaker/app

# Start Next.js in foreground
npm run dev:web

# Cleanup on exit
trap "echo -e '\n${YELLOW}Shutting down...${NC}'; kill $HELPER_PID 2>/dev/null" EXIT
