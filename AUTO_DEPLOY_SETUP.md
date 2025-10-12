# Auto-Deployment Setup for ChainViz

This guide sets up automatic deployment from GitHub to AWS EC2 whenever you push to the main branch.

## Option 1: GitHub Actions with AWS SSM (Recommended)

### Setup Steps:

1. **Add GitHub Secrets**
   Go to your GitHub repository → Settings → Secrets and variables → Actions → New repository secret
   
   Add these secrets:
   - `AWS_ACCESS_KEY_ID`: Your AWS access key
   - `AWS_SECRET_ACCESS_KEY`: Your AWS secret key

2. **Commit and Push the Workflow**
   The workflow file is already created at `.github/workflows/deploy.yml`
   
   ```bash
   git add .github/workflows/deploy.yml deployment/auto-deploy.sh
   git commit -m "Add auto-deployment workflow"
   git push origin main
   ```

3. **Done!**
   Every push to main will now trigger automatic deployment.

## Option 2: Simple Cron-based Auto-Pull (Easiest)

Set up a cron job on the EC2 instance to check for updates every 5 minutes:

```bash
# On EC2 instance
crontab -e

# Add this line:
*/5 * * * * /home/ubuntu/ChainViz/deployment/auto-deploy.sh >> /var/log/chainviz-deploy.log 2>&1
```

## Deployment Script

The auto-deployment script (`deployment/auto-deploy.sh`) is smart:
- ✅ Only rebuilds containers that changed
- ✅ Tests endpoints after deployment
- ✅ Shows detailed status
- ✅ Logs everything

### Manual Deployment

To manually trigger deployment:

```bash
# On EC2 instance
cd /home/ubuntu/ChainViz
./deployment/auto-deploy.sh
```

Or from your local machine using AWS SSM:

```bash
aws ssm send-command \
  --instance-ids i-0df3ff5363c6514f5 \
  --document-name "AWS-RunShellScript" \
  --parameters 'commands=["/home/ubuntu/ChainViz/deployment/auto-deploy.sh"]' \
  --region us-east-1
```

## Monitoring Deployments

### Check GitHub Actions
Go to: https://github.com/nostitos/ChainViz/actions

### Check EC2 Logs
```bash
# Via SSM
aws ssm send-command \
  --instance-ids i-0df3ff5363c6514f5 \
  --document-name "AWS-RunShellScript" \
  --parameters 'commands=["tail -50 /var/log/chainviz-deploy.log"]' \
  --region us-east-1

# Or if using cron
tail -f /var/log/chainviz-deploy.log
```

## Rollback

If a deployment fails, rollback to the previous version:

```bash
cd /home/ubuntu/ChainViz
git log --oneline -5  # See recent commits
git reset --hard <previous-commit-hash>
sudo docker-compose build --no-cache
sudo docker-compose up -d
```

## Troubleshooting

### Deployment stuck?
```bash
# Check container status
sudo docker-compose ps

# Check logs
sudo docker-compose logs --tail=50

# Force rebuild
sudo docker-compose down
sudo docker system prune -af
sudo docker-compose build --no-cache
sudo docker-compose up -d
```

### GitHub Actions failing?
1. Check that AWS credentials are set in GitHub Secrets
2. Verify IAM user has SSM permissions: `ssm:SendCommand`, `ssm:GetCommandInvocation`
3. Check Actions logs for specific errors

## Security Notes

- ✅ GitHub Actions uses AWS SSM (no SSH keys needed)
- ✅ Deployment script is idempotent (safe to run multiple times)
- ✅ Git ownership issues are handled automatically
- ✅ Only main branch triggers deployment

## What Gets Deployed

The workflow automatically deploys:
- Frontend changes → Rebuilds frontend container
- Backend changes → Rebuilds backend container  
- docker-compose.yml changes → Rebuilds everything
- Other changes → Restarts services only

This smart detection saves time by only rebuilding what's necessary.

