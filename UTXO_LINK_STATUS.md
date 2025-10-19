# utxo.link Status

## ✅ Site is LIVE and Working!

**URL:** http://utxo.link (and https://utxo.link)

---

## 🔍 Verification Results

### ✅ Frontend
- **Status:** Running and accessible
- **HTTP Response:** 200 OK
- **Last Rebuild:** October 18, 2025 at 18:29 UTC
- **JavaScript Bundle:** `index-f9bb6c99.js` (407KB)
- **CSS Bundle:** `index-f894e3ea.css` (37KB)
- **Latest Code:** ✅ Confirmed (treeLayoutEnabled found in bundle)

### ✅ Backend
- **Status:** Running and healthy
- **Health Check:** `{"status":"healthy"}`
- **Port:** 8000 (internal)
- **Electrum Server:** fulcrum.sethforprivacy.com:50002 (SSL)

### ✅ Services
All Docker containers are running:
- `chainviz-frontend-1` - Up 20 minutes
- `chainviz-backend-1` - Up 20 minutes
- `chainviz-redis-1` - Up 20 minutes

---

## 🌐 How to Access

### Option 1: HTTP (Works)
```
http://utxo.link
```

### Option 2: HTTPS (May need SSL setup)
```
https://utxo.link
```

**Note:** HTTPS may not work yet if SSL certificate isn't configured. Use HTTP for now.

---

## 🐛 Troubleshooting

### If you see a blank page:

1. **Clear Browser Cache**
   - Chrome/Edge: `Cmd+Shift+R` (Mac) or `Ctrl+Shift+R` (Windows)
   - Safari: `Cmd+Option+E` then `Cmd+R`
   - Firefox: `Ctrl+Shift+Delete`

2. **Check Browser Console**
   - Press `F12` to open DevTools
   - Look for JavaScript errors in Console tab
   - Check Network tab for failed requests

3. **Try Incognito/Private Mode**
   - This bypasses all cache
   - Chrome: `Cmd+Shift+N` (Mac) or `Ctrl+Shift+N` (Windows)

4. **Check if JavaScript is Enabled**
   - Make sure JavaScript isn't blocked by browser settings

---

## 🧪 Test Commands

### From Command Line

**Test HTTP:**
```bash
curl -I http://utxo.link
# Expected: HTTP/1.1 200 OK
```

**Test Frontend HTML:**
```bash
curl http://utxo.link
# Should return HTML with React app
```

**Test JavaScript Bundle:**
```bash
curl -I http://utxo.link/assets/index-f9bb6c99.js
# Expected: HTTP/1.1 200 OK
```

**Test Backend (from server):**
```bash
ssh -i ~/.ssh/chainviz-deploy-key.pem ubuntu@98.82.75.132
curl http://localhost:8000/health
# Expected: {"status":"healthy"}
```

---

## 📊 Deployment Details

**Server:** AWS EC2 (98.82.75.132)  
**Domain:** utxo.link  
**OS:** Ubuntu 22.04.5 LTS  
**Docker:** Running  
**Nginx:** Running  

**Latest Deployment:**
- Date: October 18, 2025
- Time: 18:29 UTC
- Commit: 8d582d5 ("more")
- Changes: Tree layout, edge tension, enhanced nodes

---

## 🔧 Common Issues

### Issue: Blank Page / Nothing Showing

**Possible Causes:**
1. Browser cache showing old version
2. JavaScript disabled or blocked
3. Ad blocker blocking scripts
4. Network firewall blocking resources
5. React app failing to mount

**Solutions:**
1. Clear cache and hard reload
2. Check browser console for errors
3. Try different browser
4. Try incognito mode
5. Check if other websites work

### Issue: "Connection Refused"

**Possible Causes:**
1. Services not running
2. Firewall blocking access
3. Wrong URL

**Solutions:**
1. Check services: `sudo docker compose ps`
2. Check logs: `sudo docker compose logs`
3. Verify URL: Use `http://utxo.link` not `https://`

### Issue: API Not Working

**Possible Causes:**
1. Backend not accessible from outside
2. CORS issues
3. Frontend can't reach backend

**Solutions:**
1. Backend is internal-only (port 8000)
2. Frontend proxies API requests
3. Check browser console for API errors

---

## 📝 What's Deployed

### Frontend Features
- ✅ Tree Layout Algorithm
- ✅ Edge Tension System
- ✅ Enhanced Node Components
- ✅ Improved Expansion Handling
- ✅ Cookie Persistence
- ✅ Interactive Graph Visualization

### Backend Features
- ✅ Seth's Fulcrum Server (SSL)
- ✅ UTXO Tracing
- ✅ Heuristics Engine
- ✅ Redis Caching
- ✅ Bulk Import Support
- ✅ xpub Derivation

---

## 🚀 Quick Commands

**Check Status:**
```bash
ssh -i ~/.ssh/chainviz-deploy-key.pem ubuntu@98.82.75.132
cd ~/ChainViz
sudo docker compose ps
```

**View Logs:**
```bash
sudo docker compose logs -f
```

**Restart Services:**
```bash
sudo docker compose restart
```

**Rebuild and Deploy:**
```bash
/tmp/fix-utxo-deploy.exp
```

---

## 📞 Support

If the site is still not working:

1. Check browser console for errors
2. Try different browser/device
3. Check if JavaScript is enabled
4. Clear all cache and cookies
5. Try incognito/private mode

---

**Last Updated:** October 18, 2025  
**Status:** ✅ LIVE and Working  
**URL:** http://utxo.link

