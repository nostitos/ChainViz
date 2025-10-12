#!/bin/bash
# Simple Docker run script (no docker-compose needed)

set -e

echo "🐳 Starting ChainViz with Docker..."
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Create network if it doesn't exist
docker network create chainviz 2>/dev/null || true

# Start Redis
echo -e "${BLUE}Starting Redis...${NC}"
docker run -d \
  --name chainviz-redis \
  --network chainviz \
  -p 6379:6379 \
  --restart unless-stopped \
  redis:7-alpine \
  redis-server --appendonly yes

# Start Backend
echo -e "${BLUE}Starting Backend...${NC}"
docker build -t chainviz-backend ./backend
docker run -d \
  --name chainviz-backend \
  --network chainviz \
  -p 8000:8000 \
  -e ELECTRUM_HOST=fulcrum.sethforprivacy.com \
  -e ELECTRUM_PORT=50002 \
  -e REDIS_HOST=chainviz-redis \
  -e REDIS_PORT=6379 \
  --restart unless-stopped \
  chainviz-backend

# Wait for backend to be ready
echo -e "${BLUE}Waiting for backend...${NC}"
sleep 5

# Start Frontend (Dev mode)
echo -e "${BLUE}Starting Frontend (Dev mode)...${NC}"
docker build -f ./frontend/Dockerfile.dev -t chainviz-frontend-dev ./frontend
docker run -d \
  --name chainviz-frontend-dev \
  --network chainviz \
  -p 5173:5173 \
  -v "$(pwd)/frontend:/app" \
  -v /app/node_modules \
  -e VITE_API_URL=http://localhost:8000 \
  --restart unless-stopped \
  chainviz-frontend-dev

echo ""
echo -e "${GREEN}✅ ChainViz is starting!${NC}"
echo ""
echo "Wait 30 seconds for services to initialize..."
echo ""
echo "Then access:"
echo "  🎨 Frontend: http://localhost:5173"
echo "  📡 Backend:  http://localhost:8000"
echo "  📚 API Docs: http://localhost:8000/docs"
echo ""
echo "To view logs:"
echo "  docker logs -f chainviz-frontend-dev"
echo "  docker logs -f chainviz-backend"
echo ""
echo "To stop:"
echo "  ./stop-docker.sh"
echo ""




