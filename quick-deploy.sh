#!/bin/bash
# Quick deploy script for AWS EC2

set -e

echo "🚀 Deploying ChainViz to AWS..."

cd /home/ubuntu/ChainViz

# Pull latest code
echo "📥 Pulling latest code..."
git fetch origin
git reset --hard origin/main

# Build frontend
echo "📦 Building frontend..."
cd frontend
npm install
npm run build
cd ..

# Rebuild and start services
echo "🏗️  Rebuilding and starting services..."
docker-compose down
docker-compose up -d --build

# Wait for services
echo "⏳ Waiting for services to start..."
sleep 20

# Check status
echo "✅ Deployment complete!"
docker-compose ps
