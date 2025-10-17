#!/bin/bash
# Setup automatic deployment on the server
# Run this on the server to enable automatic deployments

set -e

DEPLOY_DIR="$HOME/ChainViz"
WEBHOOK_SCRIPT="$DEPLOY_DIR/deployment/webhook-deploy.sh"

echo "🔧 Setting up automatic deployment for ChainViz..."
echo ""

# Ensure git is installed
if ! command -v git &> /dev/null; then
    echo "📦 Installing git..."
    sudo apt update
    sudo apt install -y git
fi

# Initialize git repository if not already
cd "$DEPLOY_DIR"
if [ ! -d ".git" ]; then
    echo "📥 Initializing git repository..."
    git init
    git remote add origin https://github.com/nostitos/ChainViz.git
    git fetch origin
    git checkout main
    git branch --set-upstream-to=origin/main main
else
    echo "✅ Git repository already initialized"
fi

# Make webhook script executable
chmod +x "$WEBHOOK_SCRIPT"
echo "✅ Webhook script is executable"

# Setup cron job for automatic polling (every 5 minutes)
echo ""
echo "Setting up cron job to check for updates every 5 minutes..."

# Check if cron job already exists
if crontab -l 2>/dev/null | grep -q "webhook-deploy.sh"; then
    echo "✅ Cron job already exists"
else
    # Add cron job
    (crontab -l 2>/dev/null; echo "*/5 * * * * $WEBHOOK_SCRIPT >> $DEPLOY_DIR/deployment.log 2>&1") | crontab -
    echo "✅ Cron job added - will check for updates every 5 minutes"
fi

echo ""
echo "📋 Current cron jobs:"
crontab -l

echo ""
echo "✅ Setup complete!"
echo ""
echo "📝 What happens now:"
echo "   - Every 5 minutes, the server checks GitHub for updates"
echo "   - If new commits are found, it automatically deploys them"
echo "   - Logs are saved to: $DEPLOY_DIR/deployment.log"
echo ""
echo "🔧 Management commands:"
echo "   View logs:        tail -f $DEPLOY_DIR/deployment.log"
echo "   Manual deploy:    $WEBHOOK_SCRIPT"
echo "   Edit cron:        crontab -e"
echo "   Remove cron:      crontab -l | grep -v webhook-deploy.sh | crontab -"
echo ""
echo "🎉 Done! Your server will now auto-deploy from GitHub every 5 minutes."




