#!/bin/bash
# Local watch-and-deploy script
# Watches for file changes and automatically deploys to server

SERVER="192.168.2.118"
USER="chainviz"
PASSWORD="chainviz"
PROJECT_DIR="/Users/t/Documents/vibbbing/ChainViz"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  ChainViz Auto-Deploy Watcher         ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}Watching for changes in: ${PROJECT_DIR}${NC}"
echo -e "${YELLOW}Deploying to: ${USER}@${SERVER}${NC}"
echo ""
echo -e "${GREEN}Press Ctrl+C to stop${NC}"
echo ""

# Function to deploy
deploy() {
    echo -e "\n${BLUE}[$(date +'%H:%M:%S')]${NC} ${YELLOW}📦 Changes detected! Deploying...${NC}"
    
    # Create deployment package
    echo -e "${YELLOW}Creating package...${NC}"
    cd "$PROJECT_DIR"
    tar czf /tmp/chainviz-deploy.tar.gz \
        --exclude='node_modules' \
        --exclude='venv' \
        --exclude='.git' \
        --exclude='__pycache__' \
        --exclude='*.log' \
        --exclude='backend/venv' \
        --exclude='frontend/node_modules' \
        .
    
    # Upload to server
    echo -e "${YELLOW}Uploading to server...${NC}"
    sshpass -p "$PASSWORD" scp -o StrictHostKeyChecking=no \
        /tmp/chainviz-deploy.tar.gz \
        ${USER}@${SERVER}:/tmp/
    
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
    sudo docker compose down
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

# Check if fswatch is installed
if ! command -v fswatch &> /dev/null; then
    echo -e "${YELLOW}Installing fswatch...${NC}"
    brew install fswatch
fi

# Check if sshpass is installed
if ! command -v sshpass &> /dev/null; then
    echo -e "${YELLOW}Installing sshpass...${NC}"
    brew install hudochenkov/sshpass/sshpass 2>/dev/null || {
        echo -e "${RED}Failed to install sshpass. Please install manually:${NC}"
        echo "brew install hudochenkov/sshpass/sshpass"
        exit 1
    }
fi

# Watch for changes and deploy
echo -e "${GREEN}👀 Watching for changes...${NC}\n"

fswatch -o \
    --exclude='node_modules' \
    --exclude='venv' \
    --exclude='.git' \
    --exclude='__pycache__' \
    --exclude='*.log' \
    --exclude='backend/venv' \
    --exclude='frontend/node_modules' \
    "$PROJECT_DIR" | while read f; do
    deploy
done

