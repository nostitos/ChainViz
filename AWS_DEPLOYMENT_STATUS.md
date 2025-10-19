# AWS Deployment Status

## ⚠️ Server Currently Offline

**Server:** 192.168.2.118  
**Status:** 🔴 Offline / Unreachable  
**Last Check:** October 18, 2025

---

## 📦 Latest Frontend Changes (Not Deployed)

The following changes are in your local codebase but **NOT yet deployed** to AWS:

### Recent Updates (Commit: `8d582d5`)

**New Features:**
1. **Tree Layout Algorithm** 🌳
   - New `treeLayout.ts` utility with hierarchical node positioning
   - `findRootNode()` function to identify graph root
   - `buildTreeLayout()` with customizable spacing and direction
   - Toggle in UI: "Tree Layout" button

2. **Edge Tension System** 🎯
   - New `useEdgeTension.ts` hook
   - Automatically pulls nodes closer when edges are too long
   - Configurable strength, min/max length
   - Toggle in UI: "Edge Tension" button

3. **Enhanced App.tsx** ⚛️
   - New state management for tree layout and edge tension
   - Cookie persistence for new settings
   - Improved expansion handling with repulsion pause
   - Better node positioning during graph updates

4. **Updated Node Components** 🎨
   - `AddressNode.tsx` - Visual improvements
   - `TransactionClusterNode.tsx` - Enhanced clustering display

5. **Backend Configuration** ⚙️
   - Switched to Seth's Fulcrum server (SSL enabled)
   - Primary: `fulcrum.sethforprivacy.com:50002`
   - Fallback: `iu1b96e.glddns.com:50002`

---

## 🚀 Deploy When Server is Online

### Quick Deploy Script

```bash
cd /Users/t/Documents/vibbbing/ChainViz
chmod +x /tmp/deploy-latest-aws.exp
/tmp/deploy-latest-aws.exp
```

### Manual Deploy

```bash
# 1. Create package
cd /Users/t/Documents/vibbbing/ChainViz
tar czf /tmp/chainviz-latest.tar.gz \
  --exclude='node_modules' \
  --exclude='venv' \
  --exclude='.git' \
  --exclude='__pycache__' \
  --exclude='*.log' \
  --exclude='backend/venv' \
  --exclude='frontend/node_modules' .

# 2. Upload to server
scp /tmp/chainviz-latest.tar.gz chainviz@192.168.2.118:/tmp/

# 3. SSH to server
ssh chainviz@192.168.2.118

# 4. Extract and deploy
cd /tmp && tar xzf chainviz-latest.tar.gz
mkdir -p ~/ChainViz
cp -rf /tmp/ChainViz/* ~/ChainViz/

# 5. Update config
cd ~/ChainViz
cat > backend/.env << 'EOF'
ELECTRUM_HOST=fulcrum.sethforprivacy.com
ELECTRUM_PORT=50002
ELECTRUM_USE_SSL=true
REDIS_HOST=redis
REDIS_PORT=6379
EOF

# 6. Rebuild and restart
sudo docker compose down
sudo docker compose up -d --build

# 7. Check status
sudo docker compose ps
curl http://localhost:8000/health
```

---

## 📊 What Will Be Deployed

### Frontend Changes
- ✅ Tree layout algorithm
- ✅ Edge tension system
- ✅ Enhanced node components
- ✅ Improved expansion handling
- ✅ Cookie persistence for new settings

### Backend Changes
- ✅ Seth's Fulcrum server (SSL)
- ✅ Updated configuration
- ✅ Fallback server setup

### Files Modified
```
frontend/src/App.tsx                              | +182 lines
frontend/src/utils/treeLayout.ts                  | +230 lines (NEW)
frontend/src/hooks/useEdgeTension.ts              | +100 lines (NEW)
frontend/src/components/nodes/AddressNode.tsx     | +10 lines
frontend/src/components/nodes/TransactionClusterNode.tsx | +56 lines
backend/app/config.py                             | +4 lines
```

**Total:** 558 insertions, 24 deletions

---

## 🧪 Testing After Deployment

### 1. Health Check
```bash
curl http://192.168.2.118:8000/health
```
Expected: `{"status":"healthy"}`

### 2. Frontend Load
```bash
curl -I http://192.168.2.118
```
Expected: `HTTP/1.1 200 OK`

### 3. UI Features
Open http://192.168.2.118 and check:
- ✅ "Tree Layout" button appears in controls
- ✅ "Edge Tension" toggle appears
- ✅ New layout algorithm works when clicked
- ✅ Edge tension pulls nodes together
- ✅ Settings persist across page refreshes

### 4. API Docs
Visit: http://192.168.2.118:8000/docs
- ✅ Interactive API documentation loads
- ✅ All endpoints are accessible

---

## 🔍 Troubleshooting

### Server Won't Start?

```bash
ssh chainviz@192.168.2.118
cd ~/ChainViz

# Check logs
sudo docker compose logs

# Check status
sudo docker compose ps

# Force rebuild
sudo docker compose down
sudo docker compose up -d --build --force-recreate
```

### Frontend Not Updating?

```bash
# Clear browser cache
# Or hard refresh: Cmd+Shift+R (Mac) / Ctrl+Shift+R (Windows)

# Check if frontend container is using old image
sudo docker compose ps
sudo docker compose logs frontend
```

### Backend Connection Issues?

```bash
# Check backend logs
sudo docker compose logs backend

# Test Electrum connection
sudo docker compose exec backend python -c "
from app.services.electrum_client import ElectrumClient
client = ElectrumClient()
print('Connected:', client.is_connected())
"
```

---

## 📝 Deployment Checklist

Before deploying:
- [ ] Server is online and reachable
- [ ] SSH access works
- [ ] Latest code is committed locally
- [ ] No uncommitted changes

During deployment:
- [ ] Package created successfully
- [ ] Upload to server successful
- [ ] Files extracted correctly
- [ ] Docker containers rebuilt
- [ ] Services started successfully
- [ ] Health check passes

After deployment:
- [ ] Frontend loads at http://192.168.2.118
- [ ] Backend responds at http://192.168.2.118:8000
- [ ] New UI features are visible
- [ ] Settings persist correctly
- [ ] No console errors in browser

---

## 🔄 Auto-Deploy Alternative

If the server comes online, you can also use the auto-deploy script:

```bash
cd /Users/t/Documents/vibbbing/ChainViz
./deployment/local-auto-deploy.sh &
```

This will automatically check for changes every 30 seconds and deploy when detected.

---

## 📞 Next Steps

1. **Wait for server to come online**
2. **Run deployment script:** `/tmp/deploy-latest-aws.exp`
3. **Test all new features**
4. **Verify everything works**
5. **Update this document with deployment status**

---

**Last Updated:** October 18, 2025  
**Status:** ⏳ Waiting for server to come online  
**Latest Commit:** `8d582d5` - "more"  
**Changes:** 558 insertions, 24 deletions

