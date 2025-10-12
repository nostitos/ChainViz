# 🚀 Auto-Deployment Setup Complete!

Your ChainViz application now has **automatic deployment** set up. Here's what you need to do to enable it:

## ✅ What's Already Done

1. ✅ Deployment script created and tested (`deployment/auto-deploy.sh`)
2. ✅ GitHub Actions workflow created (`.github/workflows/deploy.yml`)
3. ✅ Git permissions fixed on EC2 instance
4. ✅ Script works and tests endpoints after deployment

## 🔧 Final Step: Add GitHub Secrets

To enable GitHub Actions auto-deployment, you need to add your AWS credentials to GitHub:

### Step 1: Go to GitHub Secrets
1. Open your browser and go to: https://github.com/nostitos/ChainViz/settings/secrets/actions
2. Click "New repository secret"

### Step 2: Add AWS_ACCESS_KEY_ID
- **Name**: `AWS_ACCESS_KEY_ID`
- **Value**: Your AWS Access Key ID (from `~/.aws/credentials` or AWS Console)
- Click "Add secret"

### Step 3: Add AWS_SECRET_ACCESS_KEY
- **Name**: `AWS_SECRET_ACCESS_KEY`
- **Value**: Your AWS Secret Access Key
- Click "Add secret"

### Step 4: Test It!
Make any change to your code and push to main:

```bash
cd /Users/t/Documents/vibbbing/ChainViz
echo "# Test auto-deploy" >> README.md
git add README.md
git commit -m "Test auto-deployment"
git push origin main
```

Then check the deployment at: https://github.com/nostitos/ChainViz/actions

## 🎯 How It Works

### When You Push to GitHub:
1. GitHub Actions triggers automatically
2. Connects to your EC2 instance via AWS SSM (no SSH needed!)
3. Pulls latest code from GitHub
4. **Smart Rebuild**: Only rebuilds containers that changed
   - Frontend changes → Rebuilds frontend only
   - Backend changes → Rebuilds backend only
   - Both or docker-compose.yml → Rebuilds everything
5. Restarts services
6. Tests endpoints to verify deployment

### Deployment Time:
- **No code changes**: ~10 seconds (restart only)
- **Frontend only**: ~5 minutes (rebuild frontend)
- **Backend only**: ~2 minutes (rebuild backend)
- **Everything**: ~6 minutes (full rebuild)

## 📊 Monitoring Deployments

### Check GitHub Actions
https://github.com/nostitos/ChainViz/actions

You'll see:
- ✅ Green checkmark = Deployment successful
- ❌ Red X = Deployment failed (check logs)
- 🟡 Yellow dot = Deployment in progress

### Check Live Site
After deployment completes (usually 5-6 minutes):
- Frontend: https://utxo.link
- API: https://utxo.link/api/docs

## 🔄 Manual Deployment

If you ever need to manually trigger deployment:

```bash
# From your local machine
aws ssm send-command \
  --instance-ids i-0df3ff5363c6514f5 \
  --document-name "AWS-RunShellScript" \
  --parameters 'commands=["sudo -u ubuntu bash -c '\''cd /home/ubuntu/ChainViz && ./deployment/auto-deploy.sh'\''"]' \
  --region us-east-1
```

## 🐛 Troubleshooting

### GitHub Action Fails with "AccessDeniedException"
- Make sure you added both AWS secrets in GitHub
- Verify your AWS IAM user has these permissions:
  - `ssm:SendCommand`
  - `ssm:GetCommandInvocation`

### Containers Not Updating
The script is smart and only rebuilds what changed. To force a full rebuild:

```bash
# SSH or SSM into EC2, then:
cd /home/ubuntu/ChainViz
sudo docker-compose down
sudo docker system prune -af
sudo docker-compose build --no-cache
sudo docker-compose up -d
```

### Check Deployment Logs
View recent deployment activity:

```bash
aws ssm send-command \
  --instance-ids i-0df3ff5363c6514f5 \
  --document-name "AWS-RunShellScript" \
  --parameters 'commands=["sudo docker-compose logs --tail=100"]' \
  --region us-east-1
```

## 🎉 That's It!

Once you add the GitHub secrets, your deployment pipeline is **fully automated**:

1. Write code locally
2. `git push origin main`
3. ☕ Wait 5-6 minutes
4. 🚀 Live on https://utxo.link

No manual SSH, no running commands on the server, just push and it deploys!

## 📝 Current Status

- ✅ EC2 Instance: Running at `i-0df3ff5363c6514f5`
- ✅ Domain: https://utxo.link (with SSL)
- ✅ Deployment Script: Tested and working
- ⏳ GitHub Actions: Waiting for AWS credentials to be added

**Next Action**: Add the 2 AWS secrets to GitHub (takes 1 minute)

