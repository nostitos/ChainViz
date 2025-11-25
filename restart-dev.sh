#!/bin/bash
# Restart ChainViz services and tail backend logs

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"
BACKEND_LOG="/tmp/chainviz-backend.log"
FRONTEND_LOG="/tmp/chainviz-frontend.log"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🔄 Restarting ChainViz...${NC}"

# 1. Stop existing services
if [ -f "$SCRIPT_DIR/stop-dev.sh" ]; then
    "$SCRIPT_DIR/stop-dev.sh"
else
    echo -e "${YELLOW}stop-dev.sh not found, attempting manual cleanup...${NC}"
    pkill -f "uvicorn app.main:app" || true
    pkill -f "vite" || true
fi

echo -e "${BLUE}🚀 Starting services...${NC}"

# 2. Start Backend
echo -e "${YELLOW}→ Starting backend...${NC}"
cd "$BACKEND_DIR"
if [ ! -d "venv" ]; then
    echo "Creating venv..."
    python3 -m venv venv
fi
source venv/bin/activate
# Use --reload for development
nohup uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload > "$BACKEND_LOG" 2>&1 &
BACKEND_PID=$!
echo $BACKEND_PID > /tmp/chainviz-backend.pid
echo -e "${GREEN}✓ Backend started (PID: $BACKEND_PID)${NC}"

# 3. Start Frontend
echo -e "${YELLOW}→ Starting frontend...${NC}"
cd "$FRONTEND_DIR"
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi
nohup npm run dev > "$FRONTEND_LOG" 2>&1 &
FRONTEND_PID=$!
echo $FRONTEND_PID > /tmp/chainviz-frontend.pid
echo -e "${GREEN}✓ Frontend started (PID: $FRONTEND_PID)${NC}"

# 4. Tail Backend Logs
echo ""
echo -e "${BLUE}📋 Tailing Backend Logs (Ctrl+C to exit logs, services stay running)${NC}"
echo -e "${BLUE}To stop services run: ./stop-dev.sh${NC}"
echo ""

tail -f "$BACKEND_LOG"
