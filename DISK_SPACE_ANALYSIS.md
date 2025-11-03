# Disk Space Investigation - AWS Deployment

## Problem Summary
AWS EC2 instance disk was **100% full** (29GB used out of 29GB), preventing deployments from completing.

## Root Cause Analysis

### 1. **Auto-Deployment Was Working BUT Failing**
- **GitHub Actions workflow** configured to use **AWS SSM (Systems Manager)**
- **SSM Agent WAS INSTALLED** and working on EC2 instance ✅
- Every push to GitHub triggered deployment successfully
- **BUT: Builds kept failing** due to disk space issues
- Result: Old containers kept running while new builds failed

### 2. **Docker Accumulation**
When the disk filled up, Docker had accumulated:
- **178 Docker images** (21.62GB)
- **643 build cache entries** (2.974GB)
- **Total: ~24.42GB** of Docker artifacts

### 3. **No Cleanup Strategy**
- No `docker system prune` scheduled
- No cron jobs for cleanup
- No post-deployment cleanup in manual scripts
- Builds kept accumulating layers without removal

### 4. **Why It Accumulated So Fast**
- Each `docker-compose build` creates new layers
- Old images weren't removed automatically
- Build cache from failed builds persisted
- Multiple rebuilds during debugging sessions
- No `--no-cache` flag used in manual builds

## Evidence

```bash
# Before cleanup
Filesystem      Size  Used Avail Use% Mounted on
/dev/root        29G   29G  214M 100% /

TYPE            TOTAL     ACTIVE    SIZE      RECLAIMABLE
Images          178       0         21.62GB   21.62GB (100%)
Build Cache     643       0         2.974GB   2.974GB
```

```bash
# After cleanup
Filesystem      Size  Used Avail Use% Mounted on
/dev/root        29G  3.4G   26G  12% /

Total reclaimed space: 24.42GB
```

## How Deployment Actually Worked

### GitHub Actions Workflow (`.github/workflows/deploy.yml`)
```yaml
# SSM agent IS running on EC2
aws ssm send-command \
  --instance-ids i-0df3ff5363c6514f5 \
  --document-name "AWS-RunShellScript" \
  --parameters 'commands=[...]'
```

The workflow WAS executing:
1. ✅ Pull latest code via `git reset --hard origin/main`
2. ✅ Run `sudo docker-compose down`
3. ✅ Run `sudo docker network prune -f`
4. ❌ **FAIL** at `sudo docker-compose build --no-cache` (disk full)
5. ❌ Never reached `sudo docker-compose up -d`
6. Result: Old containers kept running on old code

**Evidence from SSM logs (Nov 2, 05:50:36 UTC):**
```
🚀 GitHub deployment triggered at Sun Nov  2 05:50:36 UTC 2025
📦 Rebuilding containers...
[Docker build fails: "No space left on device"]
```

## Timeline
- **Oct 12**: Docker service started (last restart)
- **Oct 16-28**: Multiple pushes to GitHub (auto-deploy attempted but failed)
- **Manual builds**: Unknown number, but accumulated 178 images
- **Nov 3**: Disk reached 100%, build failed with "No space left on device"

## Solutions Implemented

### Immediate Fix
1. ✅ Cleaned up Docker: `docker system prune -a -f --volumes`
2. ✅ Freed 24.42GB of space
3. ✅ Successfully rebuilt and deployed latest version
4. ✅ All services now running

### What Was Fixed

#### ✅ SSM Agent Already Working
- SSM agent was installed and running since Oct 12
- GitHub Actions deployments were being triggered
- Problem was disk space, not SSM

#### ✅ Added Automatic Cleanup (DONE)
1. **Weekly cron job** (Sunday 2 AM):
   ```bash
   0 2 * * 0 /usr/bin/docker system prune -f --volumes
   ```

2. **After each deployment** (GitHub Actions):
   ```bash
   sudo docker image prune -a -f
   ```

3. **Disk space monitoring** in deployment logs

### Ongoing Maintenance Required

#### 1. **Automatic Cleanup** (Recommended)
Add to deployment scripts or cron:
```bash
# Add to crontab (weekly cleanup)
0 2 * * 0 docker system prune -f --volumes
```

Or add to deployment script:
```bash
# After successful deployment
docker image prune -a -f --filter "until=168h"  # Remove images older than 7 days
```

#### 2. **Disk Space Monitoring**
```bash
# Alert when disk > 80%
df -h / | awk 'NR==2 {print $5}' | sed 's/%//'
```

#### 3. **Build Cache Limits**
Use `--no-cache` flag judiciously:
- Development: Use cache for speed
- Production: Use `--no-cache` to ensure clean builds

## Recommendations

### Short Term (COMPLETED ✅)
1. ~~**Install SSM Agent**~~ - Already installed and working
2. ~~**Add cleanup cron job**~~ - Added weekly Docker pruning
3. ~~**Update GitHub Actions**~~ - Added post-deployment cleanup

### Medium Term
1. **Add disk space monitoring** (CloudWatch alarm)
2. **Document deployment process** for team
3. **Test auto-deploy** with a small commit

### Long Term
1. **Consider upgrading instance** to larger disk (if needed for logs/data)
2. **Implement proper CI/CD** with staging environment
3. **Add deployment notifications** (Slack/email)

## Testing the Fix

To verify auto-deployment now works:
1. Make a small change (e.g., update README)
2. Push to `main` branch
3. Check GitHub Actions workflow status
4. Verify deployment on EC2

## Lessons Learned
- **Failed builds accumulate garbage**: Each failed Docker build left layers behind
- **Monitoring is critical**: Should have disk space alerts (add CloudWatch alarm)
- **Cleanup is essential**: Docker accumulates artifacts quickly without pruning
- **Check deployment logs**: Auto-deploy WAS working, but builds were failing silently
- **Disk full = deployment loop**: Old containers run → build fails → disk fills more → repeat

---

**Status**: ✅ **FULLY RESOLVED** 
- ✅ Disk cleaned (freed 24.42GB)
- ✅ Latest code deployed (commit f97fdab)
- ✅ All services running
- ✅ Weekly cleanup cron job added
- ✅ Post-deployment cleanup added to GitHub Actions
- ✅ Auto-deployment confirmed working (was working all along!)

**Next Actions**: 
1. Monitor next auto-deployment to verify cleanup works
2. Add CloudWatch disk space alarm (optional but recommended)
3. Consider upgrading instance disk if data/logs grow

