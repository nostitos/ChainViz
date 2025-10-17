#!/bin/bash
# Interactive deployment script for ChainViz to local server
# Usage: ./deployment/deploy-local-interactive.sh

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   ChainViz Local Deployment Script    ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""

# Get server details
read -p "Server IP address [192.168.2.118]: " SERVER_IP
SERVER_IP="${SERVER_IP:-192.168.2.118}"

read -p "SSH username [ubuntu]: " SSH_USER
SSH_USER="${SSH_USER:-ubuntu}"

read -p "SSH port [22]: " SSH_PORT
SSH_PORT="${SSH_PORT:-22}"

SSH_TARGET="${SSH_USER}@${SERVER_IP}"
DEPLOY_DIR="/home/${SSH_USER}/ChainViz"

echo ""
echo -e "${YELLOW}Configuration:${NC}"
echo "  Server: ${SERVER_IP}"
echo "  User: ${SSH_USER}"
echo "  Port: ${SSH_PORT}"
echo "  Deploy directory: ${DEPLOY_DIR}"
echo ""

# Test connection
echo -e "${YELLOW}🔐 Testing SSH connection...${NC}"
if ! ssh -p "${SSH_PORT}" -o ConnectTimeout=5 "${SSH_TARGET}" "echo 'SSH connection successful'" 2>/dev/null; then
    echo -e "${RED}❌ Failed to connect to ${SSH_TARGET}${NC}"
    echo ""
    echo "Please verify:"
    echo "1. Server is reachable: ping ${SERVER_IP}"
    echo "2. SSH service is running on port ${SSH_PORT}"
    echo "3. Username '${SSH_USER}' exists and you have access"
    echo ""
    echo "Trying manual connection for debugging..."
    ssh -p "${SSH_PORT}" "${SSH_TARGET}"
    exit 1
fi

echo -e "${GREEN}✅ SSH connection successful!${NC}"
echo ""

# Confirm deployment
read -p "Continue with deployment? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Deployment cancelled."
    exit 0
fi

# Create remote directory if needed
echo -e "${YELLOW}📁 Creating deployment directory...${NC}"
ssh -p "${SSH_PORT}" "${SSH_TARGET}" "mkdir -p ${DEPLOY_DIR}"

# Copy project files
echo -e "${YELLOW}📤 Copying project files (this may take a moment)...${NC}"
rsync -avz --progress \
    -e "ssh -p ${SSH_PORT}" \
    --exclude 'node_modules' \
    --exclude 'venv' \
    --exclude '.git' \
    --exclude '__pycache__' \
    --exclude '*.log' \
    --exclude '.env' \
    --exclude 'backend/venv' \
    --exclude 'frontend/node_modules' \
    . "${SSH_TARGET}:${DEPLOY_DIR}/"

echo -e "${GREEN}✅ Files copied successfully!${NC}"
echo ""

# Run installation on remote server
echo -e "${YELLOW}🔧 Installing and configuring ChainViz on remote server...${NC}"
echo -e "${YELLOW}This will take several minutes...${NC}"
echo ""

ssh -p "${SSH_PORT}" -t "${SSH_TARGET}" "bash -s" << 'REMOTE_SCRIPT'
set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

cd ~/ChainViz

echo -e "${YELLOW}📦 Updating system packages...${NC}"
sudo apt update -qq

# Install Docker if not present
if ! command -v docker &> /dev/null; then
    echo -e "${YELLOW}🐳 Installing Docker...${NC}"
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
    rm get-docker.sh
    echo -e "${GREEN}✅ Docker installed${NC}"
    
    # Activate docker group without logout
    echo -e "${YELLOW}Activating Docker group...${NC}"
    newgrp docker << DOCKERSETUP
    docker --version
DOCKERSETUP
else
    echo -e "${GREEN}✅ Docker already installed ($(docker --version))${NC}"
fi

# Install Docker Compose if not present
if ! command -v docker-compose &> /dev/null; then
    echo -e "${YELLOW}📦 Installing Docker Compose...${NC}"
    sudo apt install docker-compose -y -qq
    echo -e "${GREEN}✅ Docker Compose installed${NC}"
else
    echo -e "${GREEN}✅ Docker Compose already installed ($(docker-compose --version))${NC}"
fi

# Create backend .env if not exists
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
else
    echo -e "${GREEN}✅ Configuration already exists${NC}"
fi

# Stop existing containers
echo -e "${YELLOW}🛑 Stopping existing containers...${NC}"
sudo docker-compose down 2>/dev/null || true

# Build and start services
echo -e "${YELLOW}🏗️  Building Docker images (this may take 5-10 minutes)...${NC}"
sudo docker-compose build --no-cache

echo -e "${YELLOW}🚀 Starting services...${NC}"
sudo docker-compose up -d

# Wait for services to start
echo -e "${YELLOW}⏳ Waiting for services to initialize...${NC}"
sleep 15

# Check service status
echo ""
echo -e "${GREEN}📊 Service Status:${NC}"
sudo docker-compose ps

echo ""
echo -e "${GREEN}✅ Deployment complete!${NC}"
REMOTE_SCRIPT

# Get server info
SERVER_INFO=$(ssh -p "${SSH_PORT}" "${SSH_TARGET}" "cd ${DEPLOY_DIR} && sudo docker-compose ps")

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
echo -e "${BLUE}📊 Service Status:${NC}"
echo "${SERVER_INFO}"
echo ""
echo -e "${BLUE}📝 Management commands:${NC}"
echo "   ssh -p ${SSH_PORT} ${SSH_TARGET}"
echo "   cd ${DEPLOY_DIR}"
echo "   sudo docker-compose ps          # Check status"
echo "   sudo docker-compose logs -f     # View all logs"
echo "   sudo docker-compose logs -f backend   # Backend logs"
echo "   sudo docker-compose logs -f frontend  # Frontend logs"
echo "   sudo docker-compose restart     # Restart all services"
echo "   sudo docker-compose down        # Stop all services"
echo ""
echo -e "${BLUE}🔄 To update the application:${NC}"
echo "   ./deployment/deploy-local-interactive.sh"
echo ""
echo -e "${GREEN}Happy blockchain tracing! 🔗${NC}"





