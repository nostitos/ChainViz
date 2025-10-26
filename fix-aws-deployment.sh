#!/bin/bash
# Quick fix for AWS deployment issues

set -e

echo "🔧 Fixing AWS deployment..."

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if we're on AWS (look for AWS metadata)
if curl -s --max-time 2 http://169.254.169.254/latest/meta-data/instance-id > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Running on AWS EC2${NC}"
else
    echo -e "${YELLOW}⚠️  Not running on AWS, but continuing anyway...${NC}"
fi

# Stop any running containers
echo -e "${YELLOW}🛑 Stopping existing containers...${NC}"
docker-compose down 2>/dev/null || true

# Pull latest code
echo -e "${YELLOW}📥 Pulling latest code...${NC}"
git pull origin main

# Build and start services (frontend build happens in Docker)
echo -e "${YELLOW}🏗️  Building and starting services...${NC}"
docker-compose up -d --build

# Wait for services to start
echo -e "${YELLOW}⏳ Waiting for services to start...${NC}"
sleep 20

# Check service status
echo -e "${YELLOW}🔍 Checking service status...${NC}"
docker-compose ps

# Test API
echo -e "${YELLOW}🧪 Testing API...${NC}"
if curl -s http://localhost/api/config > /dev/null; then
    echo -e "${GREEN}✅ API is working${NC}"
else
    echo -e "${RED}❌ API not working, showing logs:${NC}"
    docker-compose logs backend | tail -20
fi

# Test frontend
echo -e "${YELLOW}🧪 Testing frontend...${NC}"
if curl -s http://localhost/ > /dev/null; then
    echo -e "${GREEN}✅ Frontend is working${NC}"
else
    echo -e "${RED}❌ Frontend not working, showing logs:${NC}"
    docker-compose logs frontend | tail -20
fi

echo ""
echo -e "${GREEN}🎉 Fix complete!${NC}"
echo ""
echo "🌐 Your app should now be available at:"
echo "   http://utxo.link"
echo ""
echo "📊 Current status:"
docker-compose ps
