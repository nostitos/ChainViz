#!/bin/bash
# Deploy ChainViz to AWS with proper configuration

set -e

echo "🚀 Deploying ChainViz to AWS..."

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if we're in the right directory
if [ ! -f "docker-compose.yml" ]; then
    echo -e "${RED}❌ Please run this script from the ChainViz root directory${NC}"
    exit 1
fi

# Build production frontend
echo -e "${YELLOW}📦 Building production frontend...${NC}"
cd frontend
npm run build
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Frontend build failed!${NC}"
    exit 1
fi
cd ..

echo -e "${GREEN}✅ Frontend built successfully${NC}"

# Build and deploy with Docker Compose
echo -e "${YELLOW}🐳 Building and deploying with Docker Compose...${NC}"
docker-compose down
docker-compose up -d --build

# Wait for services to start
echo -e "${YELLOW}⏳ Waiting for services to start...${NC}"
sleep 15

# Check if services are running
echo -e "${YELLOW}🔍 Checking service status...${NC}"
docker-compose ps

# Test the API
echo -e "${YELLOW}🧪 Testing API...${NC}"
sleep 5
if curl -s http://localhost/api/config > /dev/null; then
    echo -e "${GREEN}✅ API is responding${NC}"
else
    echo -e "${RED}❌ API is not responding${NC}"
    echo -e "${YELLOW}📝 Backend logs:${NC}"
    docker-compose logs backend
fi

# Test the frontend
echo -e "${YELLOW}🧪 Testing frontend...${NC}"
if curl -s http://localhost/ > /dev/null; then
    echo -e "${GREEN}✅ Frontend is responding${NC}"
else
    echo -e "${RED}❌ Frontend is not responding${NC}"
    echo -e "${YELLOW}📝 Frontend logs:${NC}"
    docker-compose logs frontend
fi

echo ""
echo -e "${GREEN}🎉 Deployment complete!${NC}"
echo ""
echo "🌐 Your app should be available at:"
echo "   http://utxo.link"
echo "   https://utxo.link (after SSL setup)"
echo ""
echo "📊 Service Status:"
docker-compose ps
echo ""
echo "📝 To view logs:"
echo "   docker-compose logs -f"
echo "   docker-compose logs -f backend"
echo "   docker-compose logs -f frontend"
echo "   docker-compose logs -f nginx"
echo ""
echo "🔧 To restart services:"
echo "   docker-compose restart"
echo ""
echo "🛑 To stop services:"
echo "   docker-compose down"
