#!/bin/bash
# EC2 initial setup and deployment script for ChainViz

set -e

echo "🚀 Setting up ChainViz on EC2..."

# Update system
echo "📦 Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install Docker
echo "🐳 Installing Docker..."
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker ubuntu
rm get-docker.sh

# Install Docker Compose
echo "📦 Installing Docker Compose..."
sudo apt install docker-compose -y

# Install Nginx
echo "🌐 Installing Nginx..."
sudo apt install nginx -y

# Install Certbot
echo "🔒 Installing Certbot for SSL..."
sudo apt install certbot python3-certbot-nginx -y

# Install Git
sudo apt install git -y

# Clone repository
echo "📥 Cloning ChainViz repository..."
cd /home/ubuntu
git clone https://github.com/nostitos/ChainViz.git
cd ChainViz

# Create backend environment file
echo "⚙️  Creating backend configuration..."
cat > backend/.env << 'EOF'
ELECTRUM_HOST=fulcrum.sethforprivacy.com
ELECTRUM_PORT=50002
ELECTRUM_USE_SSL=true
REDIS_HOST=redis
REDIS_PORT=6379
EOF

# Build and start services
echo "🏗️  Building and starting Docker containers..."
sudo docker-compose up -d --build

# Configure Nginx
echo "🌐 Configuring Nginx..."
sudo cp deployment/nginx.conf /etc/nginx/sites-available/utxo.link
sudo ln -sf /etc/nginx/sites-available/utxo.link /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx

echo "✅ Setup complete!"
echo ""
echo "📊 Service Status:"
sudo docker-compose ps

echo ""
echo "🌐 Next steps:"
echo "1. Update your domain registrar nameservers to:"
echo "   ns-1171.awsdns-18.org"
echo "   ns-993.awsdns-60.net"
echo "   ns-1719.awsdns-22.co.uk"
echo "   ns-110.awsdns-13.com"
echo ""
echo "2. Wait for DNS propagation (1-24 hours)"
echo ""
echo "3. Run SSL setup:"
echo "   sudo certbot --nginx -d utxo.link -d www.utxo.link"
echo ""
echo "4. Visit: http://98.82.75.132 (IP) or http://utxo.link (after DNS)"

