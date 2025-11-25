#!/bin/bash
# Stop ChainViz development servers

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🛑 Stopping ChainViz Development Servers...${NC}\n"

# Stop backend
if [ -f /tmp/chainviz-backend.pid ]; then
    BACKEND_PID=$(cat /tmp/chainviz-backend.pid)
    if ps -p $BACKEND_PID > /dev/null 2>&1; then
        kill $BACKEND_PID 2>/dev/null || kill -9 $BACKEND_PID 2>/dev/null
        echo -e "${GREEN}✓ Backend stopped (PID: $BACKEND_PID)${NC}"
    fi
    rm -f /tmp/chainviz-backend.pid
fi

# Also kill any uvicorn processes on port 8000
if lsof -i :8000 >/dev/null 2>&1; then
    lsof -ti :8000 | xargs kill 2>/dev/null || true
    echo -e "${GREEN}✓ Stopped process on port 8000${NC}"
fi

# Stop frontend
if [ -f /tmp/chainviz-frontend.pid ]; then
    FRONTEND_PID=$(cat /tmp/chainviz-frontend.pid)
    if ps -p $FRONTEND_PID > /dev/null 2>&1; then
        kill $FRONTEND_PID 2>/dev/null || kill -9 $FRONTEND_PID 2>/dev/null
        echo -e "${GREEN}✓ Frontend stopped (PID: $FRONTEND_PID)${NC}"
    fi
    rm -f /tmp/chainviz-frontend.pid
fi

# Also kill any node/vite processes on port 5173
if lsof -i :5173 >/dev/null 2>&1; then
    lsof -ti :5173 | xargs kill 2>/dev/null || true
    echo -e "${GREEN}✓ Stopped process on port 5173${NC}"
fi

echo ""
echo -e "${GREEN}✅ All services stopped${NC}"


