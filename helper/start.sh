#!/bin/bash

echo "Starting Automaker Helper Service..."
echo "=================================="
echo ""

# Check if node is installed
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed. Please install Node.js first."
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "Error: npm is not installed. Please install npm first."
    exit 1
fi

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Start the helper service
echo "Starting helper service on port 13131..."
echo ""
echo "The helper service enables full filesystem and system access"
echo "for the Automaker web application."
echo ""
echo "Keep this terminal open while using Automaker in your browser."
echo ""

npm start