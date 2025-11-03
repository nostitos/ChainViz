# AWS Deployment Status

## Current State

**AWS (utxo.link)**: Serving older frontend
- Bundle: `index-be500b36.js` (OLD)
- Last deployment: Unknown
- Status: ⚠️ Needs update

**Local**: Latest frontend
- Bundle: `index-27aeec8b.js` (NEW)
- Build date: Oct 26 11:10
- Includes: About panel, version tracking

## Recent Changes Pushed

1. ✅ **Fixed nginx configuration** - Docker service names
2. ✅ **Added nginx service** - Proper reverse proxy
3. ✅ **Updated deployment scripts** - Auto frontend rebuild
4. ✅ **Updated GitHub Actions** - Frontend build before Docker

## Latest Commit

```
7e16806 Update GitHub Actions deployment to rebuild frontend before Docker build
```

This commit includes:
- Frontend build steps (`npm install`, `npm run build`)
- Updated Docker deployment configuration
- Improved endpoint testing

## Deployment Status

The GitHub Actions workflow was triggered by the last push. Check status:
https://github.com/nostitos/ChainViz/actions

Expected timeline:
- Build: 5-6 minutes
- Total: ~6-7 minutes

## What Happens During Deployment

1. Pulls latest code from GitHub
2. Runs `npm install` in frontend directory
3. Runs `npm run build` to create new bundle
4. Rebuilds Docker containers with updated frontend
5. Restarts services
6. Tests endpoints

## Expected Result After Deployment

- ✅ New bundle: `index-27aeec8b.js`
- ✅ About button (ℹ️) in header
- ✅ Version and build date display
- ✅ All latest UI improvements

## Verify Deployment

Once deployment completes:

```bash
# Check if new bundle is deployed
curl -s https://utxo.link/ | grep "index-"

# Should see: index-27aeec8b.js (or newer)
```

## If Deployment Fails

Manual deployment:

```bash
# SSH into AWS
ssh -i your-key.pem ubuntu@your-aws-ip

# Run fix script
cd /home/ubuntu/ChainViz
./fix-aws-deployment.sh
```

Or check logs:

```bash
# On AWS instance
docker-compose logs -f
```
