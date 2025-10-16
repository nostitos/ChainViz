#!/bin/bash
set -e

echo "🚀 Auto-deployment started at $(date)"
echo "================================================"

# Navigate to project directory
cd /home/ubuntu/ChainViz

# Pull latest changes
echo "📥 Pulling latest changes from GitHub..."
git fetch origin
git reset --hard origin/main

# Check what changed
CHANGED_FILES=$(git diff HEAD@{1} --name-only || echo "Initial deployment")
echo "Changed files:"
echo "$CHANGED_FILES"

# Determine what needs to be rebuilt
REBUILD_FRONTEND=false
REBUILD_BACKEND=false

if echo "$CHANGED_FILES" | grep -q "frontend/"; then
    REBUILD_FRONTEND=true
fi

if echo "$CHANGED_FILES" | grep -q "backend/"; then
    REBUILD_BACKEND=true
fi

if echo "$CHANGED_FILES" | grep -q "docker-compose.yml"; then
    REBUILD_FRONTEND=true
    REBUILD_BACKEND=true
fi

# Rebuild only what's needed
if [ "$REBUILD_FRONTEND" = true ] || [ "$REBUILD_BACKEND" = true ]; then
    echo ""
    echo "📦 Rebuilding containers..."
    
    if [ "$REBUILD_FRONTEND" = true ] && [ "$REBUILD_BACKEND" = true ]; then
        echo "  - Rebuilding both frontend and backend"
        sudo docker-compose build --no-cache
    elif [ "$REBUILD_FRONTEND" = true ]; then
        echo "  - Rebuilding frontend only"
        sudo docker-compose build --no-cache frontend
    elif [ "$REBUILD_BACKEND" = true ]; then
        echo "  - Rebuilding backend only"
        sudo docker-compose build --no-cache backend
    fi
    
    echo ""
    echo "🔄 Restarting containers..."
    sudo docker-compose up -d
    
    echo ""
    echo "⏳ Waiting for containers to be healthy..."
    sleep 20
else
    echo ""
    echo "ℹ️  No container changes detected, restarting services..."
    sudo docker-compose restart
    sleep 10
fi

# Show status
echo ""
echo "📊 Container Status:"
sudo docker-compose ps

# Test endpoints
echo ""
echo "🧪 Testing endpoints..."
if curl -f -s http://localhost/health > /dev/null; then
    echo "  ✅ Frontend health check passed"
else
    echo "  ❌ Frontend health check failed"
fi

if curl -f -s http://localhost:8000/docs > /dev/null; then
    echo "  ✅ Backend API is responding"
else
    echo "  ❌ Backend API check failed"
fi

echo ""
echo "✅ Deployment complete at $(date)"
echo "================================================"


