#!/bin/bash
# Simple local auto-deploy script
# Polls git for changes and deploys when detected

SERVER="192.168.2.118"
USER="chainviz"
PASSWORD="chainviz"
PROJECT_DIR="/Users/t/Documents/vibbbing/ChainViz"
POLL_INTERVAL=30  # seconds

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  ChainViz Local Auto-Deploy           ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}Project: ${PROJECT_DIR}${NC}"
echo -e "${YELLOW}Server: ${USER}@${SERVER}${NC}"
echo -e "${YELLOW}Poll interval: ${POLL_INTERVAL} seconds${NC}"
echo ""
echo -e "${GREEN}Press Ctrl+C to stop${NC}"
echo ""

# Check dependencies
if ! command -v sshpass &> /dev/null; then
    echo -e "${RED}❌ sshpass not found${NC}"
    echo -e "${YELLOW}Install with: brew install hudochenkov/sshpass/sshpass${NC}"
    exit 1
fi

cd "$PROJECT_DIR"

# Get initial commit
LAST_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "none")
echo -e "${GREEN}Initial commit: ${LAST_COMMIT:0:7}${NC}\n"

# Deploy function
deploy() {
    echo -e "\n${BLUE}[$(date +'%H:%M:%S')]${NC} ${YELLOW}📦 New changes detected! Deploying...${NC}"
    
    # Show what changed
    if [ "$LAST_COMMIT" != "none" ]; then
        echo -e "${YELLOW}Changes:${NC}"
        git log --oneline ${LAST_COMMIT}..HEAD
        echo ""
    fi
    
    # Create deployment package
    echo -e "${YELLOW}Creating package...${NC}"
    tar czf /tmp/chainviz-deploy.tar.gz \
        --exclude='node_modules' \
        --exclude='venv' \
        --exclude='.git' \
        --exclude='__pycache__' \
        --exclude='*.log' \
        --exclude='backend/venv' \
        --exclude='frontend/node_modules' \
        . 2>/dev/null
    
    # Upload to server
    echo -e "${YELLOW}Uploading to server...${NC}"
    if sshpass -p "$PASSWORD" scp -o StrictHostKeyChecking=no \
        /tmp/chainviz-deploy.tar.gz \
        ${USER}@${SERVER}:/tmp/ 2>/dev/null; then
        echo -e "${GREEN}✓ Upload complete${NC}"
    else
        echo -e "${RED}✗ Upload failed${NC}"
        rm -f /tmp/chainviz-deploy.tar.gz
        return 1
    fi
    
    # Deploy on server
    echo -e "${YELLOW}Deploying on server...${NC}"
    sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no ${USER}@${SERVER} << 'ENDSSH'
    set -e
    cd /tmp
    rm -rf ChainViz-new
    mkdir -p ChainViz-new
    tar xzf chainviz-deploy.tar.gz -C ChainViz-new
    
    cd ChainViz-new
    mkdir -p ~/ChainViz
    rsync -a --delete \
        --exclude='*.log' \
        --exclude='.env' \
        --exclude='backend/.env' \
        ./ ~/ChainViz/
    
    cd ~/ChainViz
    rm -rf /tmp/ChainViz-new /tmp/chainviz-deploy.tar.gz
    
    if [ ! -f backend/.env ]; then
        cat > backend/.env << 'EOF'
ELECTRUM_HOST=fulcrum.sethforprivacy.com
ELECTRUM_PORT=50002
ELECTRUM_USE_SSL=true
REDIS_HOST=redis
REDIS_PORT=6379
EOF
    fi
    
    echo "Rebuilding containers..."
    sudo docker compose down 2>/dev/null || true
    sudo docker compose up -d --build
    
    echo "Waiting for services..."
    sleep 15
    
    echo "Health check:"
    curl -s http://localhost:8000/health || echo "Backend starting..."
    
    echo "Service status:"
    sudo docker compose ps
ENDSSH
    
    rm -f /tmp/chainviz-deploy.tar.gz
    
    echo -e "${GREEN}[$(date +'%H:%M:%S')] ✅ Deployment complete!${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
}

# Poll loop
while true; do
    # Fetch latest
    git fetch origin main 2>/dev/null || true
    
    # Check for new commits
    CURRENT_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "none")
    REMOTE_COMMIT=$(git rev-parse origin/main 2>/dev/null || echo "none")
    
    if [ "$CURRENT_COMMIT" != "$REMOTE_COMMIT" ] && [ "$REMOTE_COMMIT" != "none" ]; then
        # Pull changes
        git pull origin main
        
        # Deploy
        deploy
        
        # Update last commit
        LAST_COMMIT=$(git rev-parse HEAD)
    else
        echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} No changes (${CURRENT_COMMIT:0:7})"
    fi
    
    # Wait before next check
    sleep "$POLL_INTERVAL"
done

