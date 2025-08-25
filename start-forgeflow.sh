#!/bin/bash

echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║     ForgeFlow v2 - True Parallel AI Orchestration        ║"
echo "║     Repository: github.com/VeloF2025/ForgeFlow-v2-FF2    ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "ERROR: .env file not found!"
    echo "Please copy .env.example to .env and configure your GitHub token"
    echo ""
    echo "Creating .env from .env.example..."
    cp .env.example .env
    echo ""
    echo "Please edit .env and add your GITHUB_TOKEN"
    exit 1
fi

# Check if node_modules exists
if [ ! -d node_modules ]; then
    echo "Installing dependencies..."
    npm install
    if [ $? -ne 0 ]; then
        echo "ERROR: Failed to install dependencies"
        exit 1
    fi
fi

# Check if dist directory exists
if [ ! -d dist ]; then
    echo "Building project..."
    npm run build
    if [ $? -ne 0 ]; then
        echo "ERROR: Failed to build project"
        exit 1
    fi
fi

echo ""
echo "Starting ForgeFlow v2..."
echo ""
echo "Dashboard will be available at: http://localhost:3000"
echo "Metrics endpoint: http://localhost:3000/metrics"
echo "API endpoint: http://localhost:3000/api"
echo ""
echo "Press Ctrl+C to stop"
echo ""

# Start the application
node dist/index.js "$@"