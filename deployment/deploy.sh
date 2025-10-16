#!/bin/bash
# Quick deployment script for ChainViz on AWS EC2

set -e

echo "🚀 Deploying ChainViz to AWS..."

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Update system
echo -e "${YELLOW}📦 Updating system...${NC}"
sudo apt update && sudo apt upgrade -y

# Install Docker if not present
if ! command -v docker &> /dev/null; then
    echo -e "${YELLOW}🐳 Installing Docker...${NC}"
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
    rm get-docker.sh
fi

# Install Docker Compose if not present
if ! command -v docker-compose &> /dev/null; then
    echo -e "${YELLOW}📦 Installing Docker Compose...${NC}"
    sudo apt install docker-compose -y
fi

# Install Nginx if not present
if ! command -v nginx &> /dev/null; then
    echo -e "${YELLOW}🌐 Installing Nginx...${NC}"
    sudo apt install nginx -y
fi

# Install Certbot if not present
if ! command -v certbot &> /dev/null; then
    echo -e "${YELLOW}🔒 Installing Certbot...${NC}"
    sudo apt install certbot python3-certbot-nginx -y
fi

# Pull latest code
echo -e "${YELLOW}📥 Pulling latest code...${NC}"
git pull origin main

# Create backend .env if not exists
if [ ! -f backend/.env ]; then
    echo -e "${YELLOW}⚙️  Creating backend/.env...${NC}"
    cat > backend/.env << EOF
ELECTRUM_HOST=fulcrum.sethforprivacy.com
ELECTRUM_PORT=50002
ELECTRUM_USE_SSL=true
REDIS_HOST=redis
REDIS_PORT=6379
EOF
fi

# Build and start services
echo -e "${YELLOW}🏗️  Building and starting services...${NC}"
docker-compose down
docker-compose up -d --build

# Wait for services to start
echo -e "${YELLOW}⏳ Waiting for services to start...${NC}"
sleep 10

# Configure Nginx
echo -e "${YELLOW}🌐 Configuring Nginx...${NC}"
sudo cp deployment/nginx.conf /etc/nginx/sites-available/utxo.link
sudo ln -sf /etc/nginx/sites-available/utxo.link /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl restart nginx

echo -e "${GREEN}✅ Deployment complete!${NC}"
echo ""
echo "📊 Service Status:"
docker-compose ps

echo ""
echo "🌐 Next steps:"
echo "1. Point your domain's nameservers to AWS Route 53"
echo "2. Run: sudo certbot --nginx -d utxo.link -d www.utxo.link"
echo "3. Visit: https://utxo.link"
echo ""
echo "📝 Logs:"
echo "  docker-compose logs -f backend"
echo "  docker-compose logs -f frontend"




