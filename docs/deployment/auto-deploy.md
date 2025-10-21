# Auto-Deploy Guide

Set up automated deployments for ChainViz using Git webhooks.

---

## Overview

Auto-deploy automatically deploys ChainViz when you push to GitHub:
- **GitHub webhook** triggers deployment
- **Server pulls latest code**
- **Docker containers rebuild and restart**
- **Zero-downtime deployment**

---

## Prerequisites

- ChainViz deployed on server (see [AWS Deployment](aws-deployment.md))
- GitHub repository
- SSH access to server
- Webhook server (this guide uses the built-in webhook)

---

## Option 1: Built-in Webhook Server

### Step 1: Set Up Webhook Server

**On your server**:

```bash
# Create webhook directory
mkdir -p /home/ubuntu/webhooks
cd /home/ubuntu/webhooks

# Create webhook script
cat > webhook-deploy.sh << 'EOF'
#!/bin/bash
cd /home/ubuntu/apps/ChainViz
git pull origin main
docker-compose down
docker-compose up -d --build
docker-compose logs -f
EOF

# Make executable
chmod +x webhook-deploy.sh
```

### Step 2: Install Webhook Server

```bash
# Download webhook binary
wget https://github.com/adnanh/webhook/releases/latest/download/webhook-linux-amd64.tar.gz
tar -xzf webhook-linux-amd64.tar.gz
sudo mv webhook-linux-amd64/webhook /usr/local/bin/
rm -rf webhook-linux-amd64*

# Verify installation
webhook --version
```

### Step 3: Create Webhook Configuration

```bash
# Create webhook config
cat > /home/ubuntu/webhooks/hooks.json << 'EOF'
[
  {
    "id": "chainviz-deploy",
    "execute-command": "/home/ubuntu/webhooks/webhook-deploy.sh",
    "command-working-directory": "/home/ubuntu/webhooks",
    "trigger-rule": {
      "match": {
        "type": "value",
        "value": "refs/heads/main",
        "parameter": {
          "source": "payload",
          "name": "ref"
        }
      }
    }
  }
]
EOF
```

### Step 4: Create Systemd Service

```bash
# Create service file
sudo nano /etc/systemd/system/webhook.service
```

**Content**:
```ini
[Unit]
Description=Webhook Server
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/webhooks
ExecStart=/usr/local/bin/webhook -hooks hooks.json -verbose
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

### Step 5: Start Webhook Server

```bash
# Enable and start service
sudo systemctl enable webhook
sudo systemctl start webhook

# Check status
sudo systemctl status webhook

# View logs
sudo journalctl -u webhook -f
```

### Step 6: Configure GitHub Webhook

1. **Go to GitHub repository**
2. **Click "Settings" → "Webhooks"**
3. **Click "Add webhook"**
4. **Configure**:
   - **Payload URL**: `http://your-server-ip:9000/hooks/chainviz-deploy`
   - **Content type**: `application/json`
   - **Secret**: (optional, for security)
   - **Events**: "Just the push event"
5. **Click "Add webhook"**

### Step 7: Test Deployment

```bash
# Make a small change
echo "# Test" >> README.md
git add README.md
git commit -m "Test auto-deploy"
git push origin main

# Watch logs on server
sudo journalctl -u webhook -f
docker-compose logs -f
```

---

## Option 2: GitHub Actions

### Step 1: Create GitHub Actions Workflow

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Server

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
    - name: Deploy to server
      uses: appleboy/ssh-action@master
      with:
        host: ${{ secrets.SERVER_HOST }}
        username: ${{ secrets.SERVER_USER }}
        key: ${{ secrets.SSH_PRIVATE_KEY }}
        script: |
          cd /home/ubuntu/apps/ChainViz
          git pull origin main
          docker-compose down
          docker-compose up -d --build
          docker-compose logs -f
```

### Step 2: Configure GitHub Secrets

1. **Go to repository → Settings → Secrets**
2. **Add secrets**:
   - `SERVER_HOST`: Your server IP
   - `SERVER_USER`: `ubuntu`
   - `SSH_PRIVATE_KEY`: Your SSH private key

### Step 3: Test Deployment

```bash
# Make a change
echo "# Test" >> README.md
git add README.md
git commit -m "Test GitHub Actions deploy"
git push origin main

# Check GitHub Actions tab
```

---

## Option 3: Simple Cron Job

### Set Up Cron Job

```bash
# Edit crontab
crontab -e

# Add this line (checks every 5 minutes)
*/5 * * * * cd /home/ubuntu/apps/ChainViz && git pull origin main && docker-compose up -d --build
```

### Manual Deploy Script

```bash
#!/bin/bash
# deploy.sh

set -e

echo "🚀 Starting deployment..."

# Navigate to app directory
cd /home/ubuntu/apps/ChainViz

# Pull latest code
echo "📥 Pulling latest code..."
git pull origin main

# Stop services
echo "⏹️  Stopping services..."
docker-compose down

# Build and start services
echo "🔨 Building and starting services..."
docker-compose up -d --build

# Wait for services to be ready
echo "⏳ Waiting for services to be ready..."
sleep 10

# Check status
echo "✅ Checking service status..."
docker-compose ps

# Show logs
echo "📋 Recent logs:"
docker-compose logs --tail=50

echo "✅ Deployment complete!"
```

Make executable:
```bash
chmod +x deploy.sh
```

---

## Security Best Practices

### 1. Use Secrets for Webhooks

**Generate secret**:
```bash
openssl rand -hex 32
```

**Add to webhook config**:
```json
{
  "id": "chainviz-deploy",
  "execute-command": "/home/ubuntu/webhooks/webhook-deploy.sh",
  "trigger-rule": {
    "match": {
      "type": "payload-hmac-sha256",
      "secret": "your-secret-here",
      "parameter": {
        "source": "header",
        "name": "X-Hub-Signature-256"
      }
    }
  }
}
```

**Add to GitHub webhook**:
- Secret: `your-secret-here`

### 2. Restrict Webhook Access

**Firewall rule**:
```bash
# Only allow GitHub IPs
sudo ufw allow from 140.82.112.0/20 to any port 9000
sudo ufw allow from 143.55.64.0/20 to any port 9000
```

### 3. Use SSH Keys

**Generate SSH key**:
```bash
ssh-keygen -t ed25519 -C "deploy@chainviz"
```

**Add to authorized_keys**:
```bash
cat ~/.ssh/id_ed25519.pub >> ~/.ssh/authorized_keys
```

### 4. Enable HTTPS

**Use Nginx reverse proxy**:
```nginx
server {
    listen 443 ssl;
    server_name webhook.your-domain.com;

    ssl_certificate /etc/letsencrypt/live/webhook.your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/webhook.your-domain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:9000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## Monitoring

### Check Deployment Status

```bash
# Webhook logs
sudo journalctl -u webhook -f

# Docker logs
docker-compose logs -f

# Recent deployments
ls -lah /home/ubuntu/apps/ChainViz/.git/logs/
```

### Set Up Notifications

**Email on deployment**:
```bash
#!/bin/bash
# deploy-with-notification.sh

# Run deployment
./deploy.sh

# Send email
echo "Deployment completed at $(date)" | mail -s "ChainViz Deployed" your-email@example.com
```

**Slack notification**:
```bash
curl -X POST -H 'Content-type: application/json' \
  --data '{"text":"ChainViz deployed successfully!"}' \
  YOUR_SLACK_WEBHOOK_URL
```

---

## Troubleshooting

### Webhook Not Triggering

**Check webhook server**:
```bash
sudo systemctl status webhook
sudo journalctl -u webhook -f
```

**Check GitHub webhook**:
- Go to repository → Settings → Webhooks
- Click on webhook
- Check "Recent Deliveries"
- Look for errors

### Deployment Fails

**Check logs**:
```bash
docker-compose logs
sudo journalctl -u webhook -f
```

**Manual deploy**:
```bash
cd /home/ubuntu/apps/ChainViz
git pull origin main
docker-compose down
docker-compose up -d --build
```

### Services Not Starting

**Check Docker**:
```bash
docker-compose ps
docker-compose logs
```

**Check ports**:
```bash
sudo netstat -tlnp | grep -E ':(80|443|8000|5173)'
```

---

## Best Practices

1. **Test before deploying**: Use staging environment
2. **Backup before deploy**: Always backup data
3. **Use secrets**: Never hardcode credentials
4. **Monitor deployments**: Check logs after each deploy
5. **Use HTTPS**: Secure webhook communication
6. **Restrict access**: Limit webhook access to GitHub IPs
7. **Version control**: Keep deployment scripts in Git
8. **Document changes**: Log all deployment changes

---

## Next Steps

- Set up [Monitoring](../monitoring.md) for production
- Configure [Backups](../backups.md) for data protection
- See [Troubleshooting](../../troubleshooting/common-issues.md) for help

---

**Happy deploying! 🚀**

