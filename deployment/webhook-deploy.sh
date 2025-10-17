#!/bin/bash
# Webhook deployment script
# This script should be placed on the server at ~/ChainViz/deployment/webhook-deploy.sh
# It gets triggered by GitHub webhook or cron job

set -e

DEPLOY_DIR="$HOME/ChainViz"
LOG_FILE="$DEPLOY_DIR/deployment.log"
REPO_URL="https://github.com/nostitos/ChainViz.git"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1" | tee -a "$LOG_FILE"
}

log "🚀 Starting deployment..."

# Check if git repo exists
if [ ! -d "$DEPLOY_DIR/.git" ]; then
    error "Not a git repository. Initializing..."
    cd "$(dirname "$DEPLOY_DIR")"
    git clone "$REPO_URL" ChainViz
    cd ChainViz
else
    cd "$DEPLOY_DIR"
fi

# Get current commit
CURRENT_COMMIT=$(git rev-parse HEAD)
log "Current commit: ${CURRENT_COMMIT:0:7}"

# Fetch latest changes
log "📥 Fetching latest changes..."
git fetch origin main

# Check if there are updates
LATEST_COMMIT=$(git rev-parse origin/main)

if [ "$CURRENT_COMMIT" = "$LATEST_COMMIT" ]; then
    log "✅ Already up to date. No deployment needed."
    exit 0
fi

log "📦 New commits available: ${LATEST_COMMIT:0:7}"
log "📝 Changes:"
git log --oneline "$CURRENT_COMMIT..$LATEST_COMMIT" | tee -a "$LOG_FILE"

# Pull latest changes
log "⬇️  Pulling latest code..."
git pull origin main

# Ensure backend .env exists
if [ ! -f backend/.env ]; then
    log "⚙️  Creating backend configuration..."
    cat > backend/.env << 'EOF'
ELECTRUM_HOST=fulcrum.sethforprivacy.com
ELECTRUM_PORT=50002
ELECTRUM_USE_SSL=true
REDIS_HOST=redis
REDIS_PORT=6379
EOF
fi

# Stop services
log "🛑 Stopping services..."
sudo docker compose down >> "$LOG_FILE" 2>&1

# Rebuild and start
log "🏗️  Rebuilding and starting services..."
sudo docker compose up -d --build >> "$LOG_FILE" 2>&1

# Wait for services
log "⏳ Waiting for services to start..."
sleep 20

# Health check
log "🏥 Checking health..."
HEALTH=$(curl -s http://localhost:8000/health || echo '{"status":"error"}')
if echo "$HEALTH" | grep -q "healthy"; then
    log "✅ Health check passed: $HEALTH"
else
    error "❌ Health check failed: $HEALTH"
    log "📋 Recent logs:"
    sudo docker compose logs --tail=20
    exit 1
fi

# Show status
log "📊 Service status:"
sudo docker compose ps | tee -a "$LOG_FILE"

# Show recent logs
log "📋 Recent backend logs:"
sudo docker compose logs --tail=10 backend | tee -a "$LOG_FILE"

log "✅ Deployment completed successfully!"
log "   Frontend: http://localhost"
log "   Backend:  http://localhost:8000"
log "   Commit:   ${LATEST_COMMIT:0:7}"

# Send notification (optional - uncomment if you have notification setup)
# curl -X POST "$SLACK_WEBHOOK_URL" -H 'Content-Type: application/json' \
#   -d "{\"text\":\"ChainViz deployed successfully! Commit: ${LATEST_COMMIT:0:7}\"}"




