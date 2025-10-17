# Local Auto-Deploy Guide

## 🎯 Overview

You now have **automatic deployment** set up! Every time you push changes to GitHub, they will automatically deploy to your server at **192.168.2.118**.

---

## 🚀 Current Setup

### ✅ What's Running Now

1. **Local Auto-Deploy Script** (Running in background)
   - Checks GitHub every 30 seconds for new commits
   - Automatically deploys when changes are detected
   - Process ID: Check with `ps aux | grep local-auto-deploy`

2. **Server Auto-Deploy** (Via Cron)
   - Server checks GitHub every 5 minutes
   - Deploys automatically when changes found
   - Logs saved to: `~/ChainViz/deployment.log` on server

---

## 📝 How to Use

### Method 1: Push to GitHub (Recommended)

Simply push your changes to GitHub and they'll deploy automatically:

```bash
cd /Users/t/Documents/vibbbing/ChainViz

# Make your changes...

# Commit
git add .
git commit -m "Your commit message"

# Push to GitHub
git push origin main
```

**What happens next:**
1. Local script detects the push within 30 seconds
2. Downloads and deploys to server automatically
3. You'll see deployment progress in the terminal
4. Services restart with new code

---

### Method 2: Manual Deploy

If you want to deploy immediately without waiting:

```bash
# Deploy from local machine
cd /Users/t/Documents/vibbbing/ChainViz
./deployment/deploy-ssh.sh 192.168.2.118 chainviz
```

Or SSH to server and deploy manually:

```bash
ssh chainviz@192.168.2.118
cd ~/ChainViz
./deployment/webhook-deploy.sh
```

---

## 🔧 Management Commands

### Local Machine

**Stop auto-deploy:**
```bash
pkill -f local-auto-deploy
```

**Start auto-deploy:**
```bash
cd /Users/t/Documents/vibbbing/ChainViz
./deployment/local-auto-deploy.sh &
```

**Check if running:**
```bash
ps aux | grep local-auto-deploy | grep -v grep
```

**View deployment logs (if using file watcher):**
```bash
tail -f deployment.log
```

---

### Server

**SSH to server:**
```bash
ssh chainviz@192.168.2.118
```

**Check service status:**
```bash
sudo docker compose ps
```

**View logs:**
```bash
# All services
sudo docker compose logs -f

# Backend only
sudo docker compose logs -f backend

# Frontend only
sudo docker compose logs -f frontend
```

**View deployment log:**
```bash
tail -f ~/ChainViz/deployment.log
```

**Manual deploy on server:**
```bash
cd ~/ChainViz
./deployment/webhook-deploy.sh
```

**Restart services:**
```bash
sudo docker compose restart
```

**Stop services:**
```bash
sudo docker compose down
```

**Start services:**
```bash
sudo docker compose up -d
```

---

## 🎨 Two Auto-Deploy Methods

### Method 1: Local Script (Currently Running)

**Pros:**
- ✅ Immediate deployment (30 seconds)
- ✅ See deployment progress locally
- ✅ Easy to stop/start

**Cons:**
- ❌ Must keep local machine running
- ❌ Uses local resources

**Usage:**
```bash
cd /Users/t/Documents/vibbbing/ChainViz
./deployment/local-auto-deploy.sh &
```

---

### Method 2: Server Cron Job

**Pros:**
- ✅ Works even if local machine is off
- ✅ No local resources needed
- ✅ Always running

**Cons:**
- ❌ Slower (5 minutes)
- ❌ Less visibility

**Setup (already done):**
```bash
ssh chainviz@192.168.2.118
cd ~/ChainViz
./deployment/setup-auto-deploy-server.sh
```

---

## 🔄 Deployment Flow

```
┌─────────────┐
│  Make Code  │
│   Changes   │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Commit &    │
│ Push to     │
│ GitHub      │
└──────┬──────┘
       │
       ├─────────────────────┐
       │                     │
       ▼                     ▼
┌──────────────┐    ┌─────────────────┐
│ Local Script │    │ Server Cron Job │
│ (30 seconds) │    │ (5 minutes)     │
└──────┬───────┘    └────────┬────────┘
       │                     │
       └──────────┬──────────┘
                  │
                  ▼
         ┌────────────────┐
         │ Download Code  │
         │ from GitHub    │
         └────────┬───────┘
                  │
                  ▼
         ┌────────────────┐
         │ Rebuild Docker │
         │ Containers     │
         └────────┬───────┘
                  │
                  ▼
         ┌────────────────┐
         │ Restart        │
         │ Services       │
         └────────┬───────┘
                  │
                  ▼
         ┌────────────────┐
         │ Health Check   │
         │ & Verify       │
         └────────────────┘
```

---

## 🧪 Testing Auto-Deploy

### Test 1: Make a Small Change

```bash
cd /Users/t/Documents/vibbbing/ChainViz

# Edit a file
echo "# Test deployment" >> README.md

# Commit and push
git add README.md
git commit -m "Test auto-deployment"
git push origin main
```

**Expected result:**
- Within 30 seconds, you'll see deployment starting
- Services will restart with the change
- Visit http://192.168.2.118 to verify

---

### Test 2: Check Deployment Log

```bash
# On local machine (if using local script)
# Watch the terminal output

# On server
ssh chainviz@192.168.2.118
tail -f ~/ChainViz/deployment.log
```

---

## 🐛 Troubleshooting

### Auto-deploy not working?

**Check local script is running:**
```bash
ps aux | grep local-auto-deploy | grep -v grep
```

If not running, start it:
```bash
cd /Users/t/Documents/vibbbing/ChainViz
./deployment/local-auto-deploy.sh &
```

---

### Deployment fails?

**Check server logs:**
```bash
ssh chainviz@192.168.2.118
cd ~/ChainViz
sudo docker compose logs --tail=50
```

**Check deployment log:**
```bash
tail -50 ~/ChainViz/deployment.log
```

**Manual deploy to see errors:**
```bash
./deployment/webhook-deploy.sh
```

---

### Services won't start?

```bash
ssh chainviz@192.168.2.118
cd ~/ChainViz

# Check what's wrong
sudo docker compose ps
sudo docker compose logs

# Force rebuild
sudo docker compose down
sudo docker compose up -d --build

# Check again
sudo docker compose ps
```

---

## 📊 Monitoring

### Check Service Health

```bash
# From any machine
curl http://192.168.2.118:8000/health
```

Expected: `{"status":"healthy"}`

---

### View Real-time Logs

```bash
ssh chainviz@192.168.2.118
cd ~/ChainViz

# All services
sudo docker compose logs -f

# Backend only
sudo docker compose logs -f backend

# Frontend only  
sudo docker compose logs -f frontend
```

---

## 🔒 Security Notes

### Current Setup
- Uses password authentication (simple but less secure)
- Server credentials stored locally
- Suitable for local network deployment

### For Production
Consider upgrading to:
1. SSH key authentication
2. GitHub Actions with secrets
3. Encrypted credentials
4. VPN or private network

---

## 📝 Quick Reference

| Task | Command |
|------|---------|
| **Deploy manually** | `./deployment/deploy-ssh.sh 192.168.2.118 chainviz` |
| **Stop auto-deploy** | `pkill -f local-auto-deploy` |
| **Start auto-deploy** | `./deployment/local-auto-deploy.sh &` |
| **Check status** | `ps aux \| grep local-auto-deploy` |
| **View logs (server)** | `ssh chainviz@192.168.2.118 'tail -f ~/ChainViz/deployment.log'` |
| **Restart services** | `ssh chainviz@192.168.2.118 'cd ~/ChainViz && sudo docker compose restart'` |
| **Check health** | `curl http://192.168.2.118:8000/health` |

---

## 🎉 Summary

You now have **automatic deployment** configured! 

**What happens when you push to GitHub:**
1. ✅ Local script detects changes (30 seconds)
2. ✅ OR server detects changes (5 minutes)
3. ✅ Code is downloaded and deployed
4. ✅ Docker containers are rebuilt
5. ✅ Services are restarted
6. ✅ Health check verifies everything works

**Access your app:**
- Frontend: http://192.168.2.118
- Backend: http://192.168.2.118:8000
- API Docs: http://192.168.2.118:8000/docs

**Happy coding! 🚀**

