#!/bin/bash
# Simple SSH deployment for ChainViz
# This script will prompt for SSH password if needed
# Usage: ./deployment/deploy-ssh.sh 192.168.2.118 [username]

SERVER_IP="${1:-192.168.2.118}"
SSH_USER="${2:-ubuntu}"
SSH_PORT="${3:-22}"
DEPLOY_DIR="/home/${SSH_USER}/ChainViz"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   ChainViz SSH Deployment             ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""
echo "Server: ${SERVER_IP}"
echo "User: ${SSH_USER}"
echo "Deploy path: ${DEPLOY_DIR}"
echo ""

# Test connectivity
echo -e "${YELLOW}Testing connection to ${SERVER_IP}...${NC}"
if ! ping -c 1 -W 2 "${SERVER_IP}" > /dev/null 2>&1; then
    echo -e "${RED}❌ Cannot reach server ${SERVER_IP}${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Server is reachable${NC}"
echo ""

# Create tarball of project
echo -e "${YELLOW}📦 Creating deployment package...${NC}"
TEMP_TAR="/tmp/chainviz-deploy-$(date +%s).tar.gz"
tar czf "${TEMP_TAR}" \
    --exclude='node_modules' \
    --exclude='venv' \
    --exclude='.git' \
    --exclude='__pycache__' \
    --exclude='*.log' \
    --exclude='backend/venv' \
    --exclude='frontend/node_modules' \
    -C "$(dirname "$(pwd)")" \
    "$(basename "$(pwd)")"

echo -e "${GREEN}✅ Package created: ${TEMP_TAR}${NC}"
echo ""

# Upload and extract
echo -e "${YELLOW}📤 Uploading to server (will prompt for password)...${NC}"
echo ""

scp -P "${SSH_PORT}" "${TEMP_TAR}" "${SSH_USER}@${SERVER_IP}:/tmp/chainviz.tar.gz"

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Failed to upload package${NC}"
    rm -f "${TEMP_TAR}"
    exit 1
fi

rm -f "${TEMP_TAR}"
echo -e "${GREEN}✅ Package uploaded${NC}"
echo ""

# Extract and setup on remote server
echo -e "${YELLOW}🔧 Setting up on remote server...${NC}"
echo ""

ssh -p "${SSH_PORT}" -t "${SSH_USER}@${SERVER_IP}" << 'ENDSSH'
set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}📂 Extracting package...${NC}"
cd /tmp
tar xzf chainviz.tar.gz
cd ChainViz

echo -e "${YELLOW}🏠 Moving to deployment directory...${NC}"
mkdir -p ~/ChainViz
rsync -a --delete \
    --exclude='*.log' \
    --exclude='.env' \
    ./ ~/ChainViz/

cd ~/ChainViz
rm -f /tmp/chainviz.tar.gz

echo -e "${YELLOW}📦 Checking dependencies...${NC}"

# Check Docker
if ! command -v docker &> /dev/null; then
    echo -e "${YELLOW}🐳 Installing Docker...${NC}"
    curl -fsSL https://get.docker.com | sudo sh
    sudo usermod -aG docker $USER
    echo -e "${GREEN}✅ Docker installed${NC}"
else
    echo -e "${GREEN}✅ Docker is installed${NC}"
fi

# Check Docker Compose
if ! command -v docker-compose &> /dev/null; then
    echo -e "${YELLOW}📦 Installing Docker Compose...${NC}"
    sudo apt update -qq
    sudo apt install -y docker-compose
    echo -e "${GREEN}✅ Docker Compose installed${NC}"
else
    echo -e "${GREEN}✅ Docker Compose is installed${NC}"
fi

# Create backend .env
if [ ! -f backend/.env ]; then
    echo -e "${YELLOW}⚙️  Creating backend configuration...${NC}"
    cat > backend/.env << 'EOF'
ELECTRUM_HOST=fulcrum.sethforprivacy.com
ELECTRUM_PORT=50002
ELECTRUM_USE_SSL=true
REDIS_HOST=redis
REDIS_PORT=6379
EOF
    echo -e "${GREEN}✅ Configuration created${NC}"
fi

# Stop existing containers
echo -e "${YELLOW}🛑 Stopping existing containers...${NC}"
sudo docker-compose down 2>/dev/null || true

# Build and start
echo -e "${YELLOW}🏗️  Building and starting services (this takes 5-10 minutes)...${NC}"
sudo docker-compose up -d --build

echo -e "${YELLOW}⏳ Waiting for services to start...${NC}"
sleep 15

echo ""
echo -e "${GREEN}📊 Service Status:${NC}"
sudo docker-compose ps

echo ""
echo -e "${GREEN}✅ Deployment complete!${NC}"
ENDSSH

echo ""
echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║     Deployment Successful! 🎉         ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}🌐 Access your application:${NC}"
echo "   Frontend:    http://${SERVER_IP}"
echo "   Backend API: http://${SERVER_IP}:8000"
echo "   API Docs:    http://${SERVER_IP}:8000/docs"
echo ""
echo -e "${BLUE}📝 View logs:${NC}"
echo "   ssh ${SSH_USER}@${SERVER_IP}"
echo "   cd ~/ChainViz"
echo "   sudo docker-compose logs -f"
echo ""



