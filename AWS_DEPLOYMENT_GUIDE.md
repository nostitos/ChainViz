# ChainViz (UTXO.link) - AWS Deployment Guide

## Overview

Deploy ChainViz to AWS with the domain **utxo.link** using:
- **EC2** for hosting the application
- **Route 53** for DNS management
- **Certificate Manager** for SSL/HTTPS
- **CloudFront** (optional) for CDN and better SSL integration

---

## Prerequisites

1. **AWS Account** with billing enabled
2. **Domain ownership** - You need to own `utxo.link` or purchase it
3. **AWS CLI** installed locally: `brew install awscli` (macOS)
4. **Terraform** (optional, for Infrastructure as Code)

---

## Phase 1: Purchase Domain (if not owned)

### Option A: AWS Route 53 Domains
```bash
aws route53domains register-domain \
  --domain-name utxo.link \
  --duration-in-years 1 \
  --admin-contact file://contact.json \
  --registrant-contact file://contact.json \
  --tech-contact file://contact.json
```

### Option B: External Registrar (Namecheap, GoDaddy)
- Purchase `utxo.link` from your preferred registrar
- You'll point nameservers to AWS Route 53 later

---

## Phase 2: Set Up AWS Infrastructure

### 2.1 Create EC2 Instance

**Recommended specs:**
- **Instance Type:** `t3.medium` (2 vCPU, 4GB RAM) - $30/month
- **OS:** Ubuntu 22.04 LTS
- **Storage:** 30GB SSD
- **Region:** `us-east-1` (or closest to your users)

**Launch instance:**
```bash
aws ec2 run-instances \
  --image-id ami-0c55b159cbfafe1f0 \
  --instance-type t3.medium \
  --key-name your-key-pair \
  --security-group-ids sg-xxxxxxxx \
  --subnet-id subnet-xxxxxxxx \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=utxo-link-server}]'
```

**Security Group Rules:**
```bash
# Allow SSH (for deployment)
aws ec2 authorize-security-group-ingress \
  --group-id sg-xxxxxxxx \
  --protocol tcp \
  --port 22 \
  --cidr 0.0.0.0/0

# Allow HTTP
aws ec2 authorize-security-group-ingress \
  --group-id sg-xxxxxxxx \
  --protocol tcp \
  --port 80 \
  --cidr 0.0.0.0/0

# Allow HTTPS
aws ec2 authorize-security-group-ingress \
  --group-id sg-xxxxxxxx \
  --protocol tcp \
  --port 443 \
  --cidr 0.0.0.0/0
```

### 2.2 Allocate Elastic IP (Static IP)

```bash
# Allocate IP
aws ec2 allocate-address --domain vpc

# Associate with instance
aws ec2 associate-address \
  --instance-id i-xxxxxxxxx \
  --allocation-id eipalloc-xxxxxxxx
```

**Note the IP address** - you'll need it for DNS!

---

## Phase 3: Set Up Route 53 DNS

### 3.1 Create Hosted Zone

```bash
aws route53 create-hosted-zone \
  --name utxo.link \
  --caller-reference $(date +%s)
```

**Response includes:**
- **4 nameservers** (e.g., ns-123.awsdns-12.com)
- **Hosted Zone ID** (e.g., Z1234567890ABC)

### 3.2 Update Domain Nameservers

**If domain is on Route 53:**
- Already configured!

**If domain is external (Namecheap, GoDaddy):**
1. Go to your domain registrar
2. Find DNS/Nameserver settings
3. Replace nameservers with AWS Route 53 nameservers from step 3.1
4. Wait 24-48 hours for propagation (usually faster)

### 3.3 Create DNS Records

**A Record (points domain to EC2):**
```bash
aws route53 change-resource-record-sets \
  --hosted-zone-id Z1234567890ABC \
  --change-batch '{
    "Changes": [{
      "Action": "CREATE",
      "ResourceRecordSet": {
        "Name": "utxo.link",
        "Type": "A",
        "TTL": 300,
        "ResourceRecords": [{"Value": "YOUR_ELASTIC_IP"}]
      }
    }]
  }'
```

**CNAME for www (optional):**
```bash
aws route53 change-resource-record-sets \
  --hosted-zone-id Z1234567890ABC \
  --change-batch '{
    "Changes": [{
      "Action": "CREATE",
      "ResourceRecordSet": {
        "Name": "www.utxo.link",
        "Type": "CNAME",
        "TTL": 300,
        "ResourceRecords": [{"Value": "utxo.link"}]
      }
    }]
  }'
```

---

## Phase 4: Deploy Application to EC2

### 4.1 SSH into EC2

```bash
ssh -i your-key.pem ubuntu@YOUR_ELASTIC_IP
```

### 4.2 Install Dependencies

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker ubuntu

# Install Docker Compose
sudo apt install docker-compose -y

# Install Nginx (reverse proxy)
sudo apt install nginx -y

# Install Certbot (for SSL)
sudo apt install certbot python3-certbot-nginx -y
```

### 4.3 Deploy ChainViz

```bash
# Clone repository
git clone https://github.com/nostitos/ChainViz.git
cd ChainViz

# Create environment file
cat > backend/.env << EOF
ELECTRUM_HOST=fulcrum.sethforprivacy.com
ELECTRUM_PORT=50002
ELECTRUM_USE_SSL=true
REDIS_HOST=localhost
REDIS_PORT=6379
EOF

# Build and run with Docker
docker-compose up -d --build
```

### 4.4 Configure Nginx Reverse Proxy

Create `/etc/nginx/sites-available/utxo.link`:

```nginx
server {
    listen 80;
    server_name utxo.link www.utxo.link;

    # Frontend (React)
    location / {
        proxy_pass http://localhost:5173;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Increase timeouts for blockchain queries
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }
}
```

**Enable site:**
```bash
sudo ln -s /etc/nginx/sites-available/utxo.link /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 4.5 Set Up SSL Certificate (HTTPS)

```bash
# Automatic SSL with Let's Encrypt
sudo certbot --nginx -d utxo.link -d www.utxo.link

# Follow prompts:
# - Enter email
# - Agree to terms
# - Choose redirect HTTP to HTTPS (recommended)
```

**Certbot auto-renews!** Certificate renews automatically via cron.

---

## Phase 5: Production Configuration

### 5.1 Update Frontend for Production

Edit `frontend/.env.production`:
```
VITE_API_URL=https://utxo.link/api
```

Rebuild frontend:
```bash
cd frontend
npm run build
```

### 5.2 Use Production Docker Compose

Edit `docker-compose.yml`:
```yaml
version: '3.8'

services:
  backend:
    build: ./backend
    ports:
      - "8000:8000"
    environment:
      - ELECTRUM_HOST=fulcrum.sethforprivacy.com
      - ELECTRUM_PORT=50002
      - ELECTRUM_USE_SSL=true
    restart: always

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    ports:
      - "5173:80"
    restart: always

  redis:
    image: redis:alpine
    ports:
      - "6379:6379"
    restart: always
```

### 5.3 Set Up PM2 or Systemd (Alternative to Docker)

**Using PM2:**
```bash
# Install PM2
npm install -g pm2

# Backend
cd ~/ChainViz/backend
source venv/bin/activate
pm2 start "uvicorn app.main:app --host 0.0.0.0 --port 8000" --name chainviz-backend

# Frontend
cd ~/ChainViz/frontend
pm2 start "npm run preview -- --host 0.0.0.0 --port 5173" --name chainviz-frontend

# Save PM2 config
pm2 save
pm2 startup
```

---

## Phase 6: Monitoring & Maintenance

### 6.1 CloudWatch Logs (Optional)

Install CloudWatch agent:
```bash
wget https://s3.amazonaws.com/amazoncloudwatch-agent/ubuntu/amd64/latest/amazon-cloudwatch-agent.deb
sudo dpkg -i amazon-cloudwatch-agent.deb
```

### 6.2 Set Up Alerts

Monitor:
- CPU usage > 80%
- Memory usage > 90%
- Disk space < 10%
- Application errors

### 6.3 Backups

**S3 Backup for graphs:**
```bash
# Daily backup cron
0 2 * * * aws s3 sync /var/chainviz/graphs s3://utxo-link-backups/
```

---

## Phase 7: DNS Final Configuration

### Verify DNS Propagation

```bash
# Check if DNS is working
dig utxo.link
nslookup utxo.link

# Check from multiple locations
curl https://www.whatsmydns.net/#A/utxo.link
```

### DNS Records Summary

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | utxo.link | YOUR_ELASTIC_IP | 300 |
| CNAME | www | utxo.link | 300 |
| TXT | @ | "v=spf1 -all" | 3600 |

---

## Alternative: CloudFront + S3 (For Better Performance)

### Benefits:
- **Global CDN** - Faster load times worldwide
- **DDoS protection**
- **Better SSL integration**
- **Cost effective** for static frontend

### Setup:

1. **Upload frontend build to S3:**
```bash
aws s3 mb s3://utxo-link-frontend
aws s3 sync frontend/dist s3://utxo-link-frontend --acl public-read
```

2. **Create CloudFront distribution:**
```bash
aws cloudfront create-distribution \
  --origin-domain-name utxo-link-frontend.s3.amazonaws.com \
  --default-root-object index.html
```

3. **Update Route 53 A record to point to CloudFront:**
```json
{
  "Type": "A",
  "Name": "utxo.link",
  "AliasTarget": {
    "HostedZoneId": "Z2FDTNDATAQYW2",
    "DNSName": "d123456.cloudfront.net",
    "EvaluateTargetHealth": false
  }
}
```

---

## Cost Estimate

### Option 1: Single EC2 Instance
- **EC2 t3.medium:** $30/month
- **Elastic IP:** $0 (free if attached)
- **Data transfer:** ~$9/GB outbound
- **Route 53:** $0.50/month per hosted zone
- **SSL Certificate:** FREE (Let's Encrypt)

**Total: ~$35-50/month** (depending on traffic)

### Option 2: EC2 + CloudFront
- **EC2 t3.small:** $15/month (backend only)
- **S3:** $0.023/GB (~$1/month)
- **CloudFront:** $0.085/GB first 10TB
- **Route 53:** $0.50/month

**Total: ~$20-40/month** (better for high traffic)

---

## Quick Start Commands

```bash
# 1. SSH to EC2
ssh -i your-key.pem ubuntu@YOUR_IP

# 2. Clone and deploy
git clone https://github.com/nostitos/ChainViz.git
cd ChainViz
docker-compose up -d

# 3. Configure Nginx
sudo cp deployment/nginx.conf /etc/nginx/sites-available/utxo.link
sudo ln -s /etc/nginx/sites-available/utxo.link /etc/nginx/sites-enabled/
sudo systemctl restart nginx

# 4. Get SSL certificate
sudo certbot --nginx -d utxo.link -d www.utxo.link

# 5. Check it's running
curl https://utxo.link
```

---

## Terraform Deployment (Automated)

For fully automated deployment, I can create Terraform configs that will:
1. Create VPC, subnets, security groups
2. Launch EC2 instance
3. Set up Route 53
4. Configure everything automatically

Would you like me to create the Terraform files?

---

## DNS Setup Steps (Detailed)

### If Domain is on Namecheap:

1. **Go to Namecheap Dashboard** → Domain List → Manage
2. **Click "Domain" tab** → "Nameservers"
3. **Select "Custom DNS"**
4. **Enter AWS Route 53 nameservers:**
   ```
   ns-123.awsdns-12.com
   ns-456.awsdns-45.net
   ns-789.awsdns-78.org
   ns-012.awsdns-01.co.uk
   ```
5. **Save** - Propagation takes 1-24 hours

### If Domain is on GoDaddy:

1. **Go to GoDaddy** → My Products → Domains → DNS
2. **Change Nameservers** to Custom
3. **Enter AWS Route 53 nameservers**
4. **Save**

### Verify DNS is Working:

```bash
# Should return your Elastic IP
dig utxo.link +short

# Should return AWS nameservers
dig utxo.link NS +short
```

---

## Monitoring & Maintenance

### Daily Tasks:
- Check application logs: `docker-compose logs -f`
- Monitor resource usage: `htop`

### Weekly Tasks:
- Update dependencies: `docker-compose pull && docker-compose up -d`
- Check SSL expiry: `sudo certbot renew --dry-run`

### Monthly Tasks:
- Review CloudWatch metrics
- Check costs in AWS Billing Dashboard
- Update application code from GitHub

---

## Troubleshooting

### Domain not resolving?
```bash
# Check nameservers
dig utxo.link NS

# Check A record
dig utxo.link A

# Flush DNS cache locally
sudo dscacheutil -flushcache  # macOS
```

### SSL not working?
```bash
# Check certificate status
sudo certbot certificates

# Renew manually
sudo certbot renew --force-renewal
```

### Application not accessible?
```bash
# Check if services are running
docker-compose ps

# Check Nginx status
sudo systemctl status nginx

# Check logs
docker-compose logs backend
```

---

## Next Steps

1. **Choose deployment method:**
   - Manual EC2 setup (30 minutes)
   - Terraform automated (5 minutes after setup)
   - AWS Lightsail (simpler, ~$10/month)

2. **Set up monitoring** (CloudWatch, Datadog, etc.)

3. **Configure backups** (S3, snapshots)

4. **Set up CI/CD** (GitHub Actions for auto-deploy)

Would you like me to:
- Create the Terraform configuration files?
- Create deployment scripts?
- Set up GitHub Actions for auto-deployment?
- Create a simpler AWS Lightsail deployment?

Let me know which approach you prefer!

