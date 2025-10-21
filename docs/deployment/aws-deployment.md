# AWS Deployment Guide

Guide to deploying ChainViz on Amazon Web Services (AWS).

---

## Overview

This guide covers deploying ChainViz on AWS using:
- **EC2** for compute
- **Docker** for containerization
- **Nginx** for reverse proxy
- **SSL/TLS** with Let's Encrypt

---

## Prerequisites

- AWS account with EC2 access
- Domain name (optional, for SSL)
- SSH key pair for EC2 access
- Docker installed locally

---

## Step 1: Launch EC2 Instance

### Choose Instance Type

**Recommended**: `t3.medium` or larger
- 2 vCPUs
- 4 GB RAM
- Good for small to medium workloads

**For production**: `t3.large` or `t3.xlarge`
- More resources
- Better performance
- Handles more concurrent users

### Launch Instance

1. **Go to EC2 Console**: https://console.aws.amazon.com/ec2/
2. **Click "Launch Instance"**
3. **Configure**:
   - **Name**: `chainviz-server`
   - **AMI**: Ubuntu Server 22.04 LTS
   - **Instance Type**: t3.medium
   - **Key Pair**: Select or create new
   - **Network**: Default VPC
   - **Storage**: 20 GB gp3
   - **Security Group**: Create new (see below)

### Security Group Configuration

**Inbound Rules**:
- **SSH (22)**: Your IP only
- **HTTP (80)**: 0.0.0.0/0 (all)
- **HTTPS (443)**: 0.0.0.0/0 (all)
- **Custom TCP (8000)**: Your IP only (backend)

**Outbound Rules**:
- **All traffic**: 0.0.0.0/0

### Launch and Connect

```bash
# Get your instance IP
aws ec2 describe-instances --instance-ids i-xxxxxxxxx

# SSH into instance
ssh -i your-key.pem ubuntu@your-instance-ip
```

---

## Step 2: Install Dependencies

### Update System

```bash
sudo apt update
sudo apt upgrade -y
```

### Install Docker

```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add user to docker group
sudo usermod -aG docker ubuntu

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Verify installation
docker --version
docker-compose --version
```

### Install Nginx

```bash
sudo apt install nginx -y
sudo systemctl enable nginx
sudo systemctl start nginx
```

---

## Step 3: Deploy ChainViz

### Clone Repository

```bash
# Create app directory
mkdir -p /home/ubuntu/apps
cd /home/ubuntu/apps

# Clone repository
git clone https://github.com/yourusername/ChainViz.git
cd ChainViz
```

### Configure Environment

```bash
# Create .env file
cat > .env << EOF
# Electrum Server
ELECTRUM_HOST=fulcrum.sethforprivacy.com
ELECTRUM_PORT=50002
ELECTRUM_USE_SSL=true

# Redis
REDIS_HOST=redis
REDIS_PORT=6379

# Frontend
VITE_API_URL=http://your-domain.com:8000
EOF
```

### Start Services

```bash
# Build and start
docker-compose up -d --build

# Check status
docker-compose ps

# View logs
docker-compose logs -f
```

---

## Step 4: Configure Nginx

### Create Nginx Config

```bash
sudo nano /etc/nginx/sites-available/chainviz
```

**Content**:
```nginx
server {
    listen 80;
    server_name your-domain.com;

    # Frontend
    location / {
        proxy_pass http://localhost:5173;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Backend WebSocket
    location /ws {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Enable Site

```bash
# Create symlink
sudo ln -s /etc/nginx/sites-available/chainviz /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx
```

---

## Step 5: Configure SSL

### Install Certbot

```bash
sudo apt install certbot python3-certbot-nginx -y
```

### Obtain SSL Certificate

```bash
# Replace with your domain
sudo certbot --nginx -d your-domain.com

# Follow prompts:
# - Enter email
# - Agree to terms
# - Choose to redirect HTTP to HTTPS
```

### Auto-Renewal

```bash
# Test renewal
sudo certbot renew --dry-run

# Certbot auto-renews certificates
# Check with: sudo systemctl status certbot.timer
```

---

## Step 6: Configure Domain

### DNS Configuration

**A Record**:
```
Type: A
Name: @
Value: your-instance-ip
TTL: 300
```

**CNAME (optional)**:
```
Type: CNAME
Name: www
Value: your-domain.com
TTL: 300
```

### Verify DNS

```bash
# Check DNS propagation
dig your-domain.com

# Should return your instance IP
```

---

## Step 7: Firewall Configuration

### Configure UFW

```bash
# Enable UFW
sudo ufw enable

# Allow SSH
sudo ufw allow 22/tcp

# Allow HTTP/HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Check status
sudo ufw status
```

---

## Step 8: Monitoring

### View Logs

```bash
# Docker logs
docker-compose logs -f

# Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# System logs
sudo journalctl -u nginx -f
```

### Check Status

```bash
# Docker services
docker-compose ps

# Nginx
sudo systemctl status nginx

# Certbot
sudo systemctl status certbot.timer
```

---

## Step 9: Auto-Deploy (Optional)

### Set Up Git Webhook

See [Auto-Deploy Guide](auto-deploy.md) for automated deployments.

### Manual Deploy Script

```bash
#!/bin/bash
# deploy.sh

cd /home/ubuntu/apps/ChainViz
git pull
docker-compose down
docker-compose up -d --build
docker-compose logs -f
```

Make executable:
```bash
chmod +x deploy.sh
```

---

## Troubleshooting

### Services Won't Start

**Check Docker**:
```bash
docker-compose logs
docker-compose ps
```

**Check ports**:
```bash
sudo netstat -tlnp | grep -E ':(80|443|8000|5173)'
```

### Nginx 502 Bad Gateway

**Check backend**:
```bash
curl http://localhost:8000/api/config
```

**Check Nginx config**:
```bash
sudo nginx -t
```

**Check logs**:
```bash
sudo tail -f /var/log/nginx/error.log
```

### SSL Certificate Issues

**Check certificate**:
```bash
sudo certbot certificates
```

**Renew certificate**:
```bash
sudo certbot renew
```

**Check auto-renewal**:
```bash
sudo systemctl status certbot.timer
```

### High Memory Usage

**Check memory**:
```bash
free -h
docker stats
```

**Increase swap**:
```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

---

## Cost Optimization

### Use Spot Instances

**Save up to 90%** on compute costs:
```bash
# Launch spot instance
aws ec2 request-spot-instances \
  --spot-price "0.05" \
  --instance-count 1 \
  --type "one-time" \
  --launch-specification file://spot-spec.json
```

### Use Reserved Instances

**Save up to 75%** with 1-year or 3-year commitments:
- Go to EC2 Console
- Click "Reserved Instances"
- Purchase RI for your instance type

### Use CloudWatch Monitoring

**Set up billing alerts**:
1. Go to CloudWatch Console
2. Click "Billing"
3. Create alarm for estimated charges

---

## Security Best Practices

1. **Use SSH keys**: Never use passwords
2. **Restrict SSH access**: Only from your IP
3. **Keep system updated**: Regular `apt update && apt upgrade`
4. **Use firewall**: Configure UFW properly
5. **Enable SSL**: Always use HTTPS
6. **Regular backups**: Backup data and configurations
7. **Monitor logs**: Check logs regularly
8. **Use IAM roles**: For AWS API access

---

## Scaling

### Vertical Scaling

**Increase instance size**:
1. Stop instance
2. Change instance type
3. Start instance

### Horizontal Scaling

**Use Load Balancer**:
1. Create Application Load Balancer
2. Create target group
3. Register instances
4. Configure health checks

### Auto Scaling

**Set up auto-scaling group**:
1. Create launch template
2. Create auto-scaling group
3. Configure scaling policies
4. Set up CloudWatch alarms

---

## Backup

### Backup Data

```bash
# Backup Docker volumes
docker run --rm -v chainviz_redis_data:/data -v $(pwd):/backup ubuntu tar czf /backup/redis-backup.tar.gz /data

# Backup configurations
tar czf config-backup.tar.gz .env docker-compose.yml nginx.conf
```

### Restore Data

```bash
# Restore Docker volumes
docker run --rm -v chainviz_redis_data:/data -v $(pwd):/backup ubuntu tar xzf /backup/redis-backup.tar.gz -C /

# Restore configurations
tar xzf config-backup.tar.gz
```

---

## Next Steps

- Set up [Auto-Deploy](auto-deploy.md) for automated deployments
- Configure [Monitoring](monitoring.md) for production
- Set up [Backups](backups.md) for data protection
- See [Troubleshooting](../../troubleshooting/common-issues.md) for help

---

**Happy deploying! ☁️**

