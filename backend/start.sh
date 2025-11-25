#!/bin/bash
# Start ChainViz backend with logs (restarts if already running)

cd "$(dirname "$0")"

# Check if backend is already running
if pgrep -f "uvicorn.*app.main:app" > /dev/null; then
    echo "🔄 Backend is already running. Restarting..."
    pkill -f "uvicorn.*app.main:app"
    sleep 2
    echo "✅ Stopped existing backend process"
fi

# Check if port 8000 is in use (fallback check)
if lsof -ti:8000 > /dev/null 2>&1; then
    echo "⚠️  Port 8000 is in use. Attempting to free it..."
    lsof -ti:8000 | xargs kill -9 2>/dev/null || true
    sleep 1
fi

source venv/bin/activate

echo "🚀 Starting ChainViz backend with logs..."
echo "📝 Logs will be displayed below"
echo ""

uvicorn app.main:app \
  --host 0.0.0.0 \
  --port 8000 \
  --log-level info \
  --access-log \
  --reload

