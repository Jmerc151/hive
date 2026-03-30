#!/bin/bash
set -e
echo "Building frontend..."
npm run build
echo "Running syntax check..."
node --check server/index.js
echo "Build complete. Ready to deploy."
echo ""
echo "Deploy options:"
echo "  Railway: railway up"
echo "  Render:  git push (auto-deploys from GitHub)"
echo "  Docker:  docker build -t agentforge . && docker run -p 3002:3002 --env-file .env agentforge"
