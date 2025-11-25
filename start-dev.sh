#!/bin/bash
# Start ChainViz development servers with log monitoring

set -e

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

echo -e "${BLUE}🚀 Starting ChainViz Development Servers...${NC}\n"

# Check if backend is running on port 8000
if lsof -i :8000 >/dev/null 2>&1; then
    echo -e "${GREEN}✓ Backend is already running on port 8000${NC}"
else
    echo -e "${YELLOW}→ Starting backend...${NC}"
    cd "$BACKEND_DIR"
    if [ ! -d "venv" ]; then
        echo -e "${YELLOW}⚠ Virtual environment not found. Creating one...${NC}"
        python3 -m venv venv
    fi
    source venv/bin/activate
    nohup uvicorn app.main:app --host 0.0.0.0 --port 8000 > "$BACKEND_LOG" 2>&1 &
    BACKEND_PID=$!
    echo $BACKEND_PID > /tmp/chainviz-backend.pid
    sleep 2
    if ps -p $BACKEND_PID > /dev/null; then
        echo -e "${GREEN}✓ Backend started (PID: $BACKEND_PID)${NC}"
    else
        echo -e "${YELLOW}⚠ Backend may have failed to start. Check logs: tail -f $BACKEND_LOG${NC}"
    fi
fi

# Check if frontend is running on port 5173
if lsof -i :5173 >/dev/null 2>&1; then
    echo -e "${GREEN}✓ Frontend is already running on port 5173${NC}"
else
    echo -e "${YELLOW}→ Starting frontend...${NC}"
    cd "$FRONTEND_DIR"
    if [ ! -d "node_modules" ]; then
        echo -e "${YELLOW}⚠ node_modules not found. Installing dependencies...${NC}"
        npm install
    fi
    nohup npm run dev > "$FRONTEND_LOG" 2>&1 &
    FRONTEND_PID=$!
    echo $FRONTEND_PID > /tmp/chainviz-frontend.pid
    sleep 3
    if ps -p $FRONTEND_PID > /dev/null; then
        echo -e "${GREEN}✓ Frontend started (PID: $FRONTEND_PID)${NC}"
    else
        echo -e "${YELLOW}⚠ Frontend may have failed to start. Check logs: tail -f $FRONTEND_LOG${NC}"
    fi
fi

echo ""
echo -e "${GREEN}✅ ChainViz is running!${NC}"
echo ""
echo "📍 Services:"
echo "  🎨 Frontend: http://localhost:5173"
echo "  📡 Backend:  http://localhost:8000"
echo "  📚 API Docs: http://localhost:8000/docs"
echo ""
echo "📋 View logs:"
echo "  Backend:  tail -f $BACKEND_LOG"
echo "  Frontend: tail -f $FRONTEND_LOG"
echo "  Both:     tail -f $BACKEND_LOG $FRONTEND_LOG"
echo ""
echo "🛑 Stop services:"
echo "  ./stop-dev.sh"
echo ""

# Wait a moment for logs to start
sleep 2

# Show recent logs
echo -e "${BLUE}📊 Recent logs:${NC}\n"
echo -e "${YELLOW}--- Backend (last 3 lines) ---${NC}"
tail -n 3 "$BACKEND_LOG" 2>/dev/null || echo "No backend logs yet"
echo ""
echo -e "${YELLOW}--- Frontend (last 3 lines) ---${NC}"
tail -n 3 "$FRONTEND_LOG" 2>/dev/null || echo "No frontend logs yet"
echo ""
echo -e "${BLUE}📊 Following logs (Ctrl+C to exit, but services will keep running)...${NC}\n"

# Follow logs with labels using awk to interleave
tail -f "$BACKEND_LOG" 2>/dev/null | awk '{print "\033[0;34m[BACKEND]\033[0m", $0}' &
TAIL_BACKEND=$!
tail -f "$FRONTEND_LOG" 2>/dev/null | awk '{print "\033[0;33m[FRONTEND]\033[0m", $0}' &
TAIL_FRONTEND=$!

# Wait for Ctrl+C
trap "kill $TAIL_BACKEND $TAIL_FRONTEND 2>/dev/null; echo -e '\n${GREEN}Log view stopped. Services are still running.${NC}'; exit" INT TERM
wait

