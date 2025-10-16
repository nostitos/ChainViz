#!/bin/bash
# Deploy ChainViz to local server via SSH
# Usage: ./deployment/deploy-local.sh [server-ip] [ssh-user]

set -e

# Configuration
SERVER_IP="${1:-192.168.2.118}"
SSH_USER="${2:-ubuntu}"
SSH_TARGET="${SSH_USER}@${SERVER_IP}"
DEPLOY_DIR="/home/${SSH_USER}/ChainViz"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Deploying ChainViz to ${SERVER_IP}...${NC}"

# Add SSH options to skip strict host checking for local network
SSH_OPTS="-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=5"

# Test SSH connection
echo -e "${YELLOW}🔐 Testing SSH connection...${NC}"
if ! ssh ${SSH_OPTS} "${SSH_TARGET}" "echo 'SSH connection successful'" 2>/dev/null; then
    echo -e "${RED}❌ Failed to connect to ${SSH_TARGET}${NC}"
    echo "Please ensure:"
    echo "1. Server is reachable: ping ${SERVER_IP}"
    echo "2. SSH is enabled on the server"
    echo "3. You have SSH access (password or key)"
    echo ""
    echo "Trying to connect manually for debugging:"
    ssh ${SSH_OPTS} "${SSH_TARGET}" "echo 'Connected'"
    exit 1
fi

# Check if directory exists
echo -e "${YELLOW}📁 Checking deployment directory...${NC}"
if ssh ${SSH_OPTS} "${SSH_TARGET}" "[ -d ${DEPLOY_DIR} ]"; then
    echo -e "${YELLOW}📂 Existing installation found. Updating...${NC}"
    ssh ${SSH_OPTS} "${SSH_TARGET}" "cd ${DEPLOY_DIR} && git pull origin main || true"
else
    echo -e "${YELLOW}📥 No existing installation. Will do fresh setup...${NC}"
fi

# Copy project files to server
echo -e "${YELLOW}📤 Copying project files...${NC}"
rsync -avz --delete \
    -e "ssh ${SSH_OPTS}" \
    --exclude 'node_modules' \
    --exclude 'venv' \
    --exclude '.git' \
    --exclude '__pycache__' \
    --exclude '*.log' \
    --exclude '.env' \
    --exclude 'backend/venv' \
    . "${SSH_TARGET}:${DEPLOY_DIR}/"

# Run setup on remote server
echo -e "${YELLOW}🔧 Running setup on remote server...${NC}"
ssh ${SSH_OPTS} "${SSH_TARGET}" "bash -s" << 'REMOTE_SCRIPT'
set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

cd ~/ChainViz

echo -e "${YELLOW}📦 Updating system packages...${NC}"
sudo apt update

# Install Docker if not present
if ! command -v docker &> /dev/null; then
    echo -e "${YELLOW}🐳 Installing Docker...${NC}"
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
    rm get-docker.sh
    echo -e "${GREEN}✅ Docker installed${NC}"
else
    echo -e "${GREEN}✅ Docker already installed${NC}"
fi

# Install Docker Compose if not present
if ! command -v docker-compose &> /dev/null; then
    echo -e "${YELLOW}📦 Installing Docker Compose...${NC}"
    sudo apt install docker-compose -y
    echo -e "${GREEN}✅ Docker Compose installed${NC}"
else
    echo -e "${GREEN}✅ Docker Compose already installed${NC}"
fi

# Create backend .env if not exists
if [ ! -f backend/.env ]; then
    echo -e "${YELLOW}⚙️  Creating backend/.env...${NC}"
    cat > backend/.env << 'EOF'
ELECTRUM_HOST=fulcrum.sethforprivacy.com
ELECTRUM_PORT=50002
ELECTRUM_USE_SSL=true
REDIS_HOST=redis
REDIS_PORT=6379
EOF
    echo -e "${GREEN}✅ Backend configuration created${NC}"
else
    echo -e "${GREEN}✅ Backend configuration exists${NC}"
fi

# Stop existing containers
echo -e "${YELLOW}🛑 Stopping existing containers...${NC}"
docker-compose down 2>/dev/null || true

# Build and start services
echo -e "${YELLOW}🏗️  Building and starting services...${NC}"
docker-compose up -d --build

# Wait for services to start
echo -e "${YELLOW}⏳ Waiting for services to start...${NC}"
sleep 10

# Check service status
echo -e "${GREEN}📊 Service Status:${NC}"
docker-compose ps

echo -e "${GREEN}✅ Deployment complete!${NC}"
REMOTE_SCRIPT

# Final status check
echo ""
echo -e "${GREEN}✅ ChainViz deployed successfully!${NC}"
echo ""
echo "🌐 Access your application:"
echo "   Frontend: http://${SERVER_IP}"
echo "   Backend API: http://${SERVER_IP}:8000"
echo "   API Docs: http://${SERVER_IP}:8000/docs"
echo ""
echo "📊 Management commands (run on server):"
echo "   ssh ${SSH_TARGET}"
echo "   cd ${DEPLOY_DIR}"
echo "   docker-compose ps          # Check status"
echo "   docker-compose logs -f     # View logs"
echo "   docker-compose restart     # Restart services"
echo "   docker-compose down        # Stop services"
echo ""
echo "🔄 To update the application:"
echo "   ./deployment/deploy-local.sh ${SERVER_IP} ${SSH_USER}"
echo ""

