# Seth's Electrum Server Configuration

## ✅ Changes Applied

The backend has been switched to use **Seth's Fulcrum server** as the primary Electrum connection.

---

## 🔧 Configuration Changes

### Backend Config (`backend/app/config.py`)

**Before:**
```python
electrum_host: str = "iu1b96e.glddns.com"
electrum_port: int = 50002
electrum_use_ssl: bool = False
```

**After:**
```python
electrum_host: str = "fulcrum.sethforprivacy.com"
electrum_port: int = 50002
electrum_use_ssl: bool = True
```

---

### Docker Compose (`docker-compose.yml`)

**Added:**
```yaml
environment:
  - ELECTRUM_HOST=fulcrum.sethforprivacy.com
  - ELECTRUM_PORT=50002
  - ELECTRUM_USE_SSL=true  # ← NEW
  - REDIS_HOST=redis
  - REDIS_PORT=6379
```

---

### README (`README.md`)

Updated documentation to reflect SSL-enabled connection.

---

## 🌐 Server Details

**Primary Server:**
- **Host:** `fulcrum.sethforprivacy.com`
- **Port:** `50002`
- **SSL:** Enabled ✅
- **Protocol:** Electrum

**Fallback Server:**
- **Host:** `iu1b96e.glddns.com`
- **Port:** `50002`
- **SSL:** Disabled

---

## 🚀 Deployment Status

### ✅ Local Environment
- **Status:** Running
- **Backend:** http://localhost:8000
- **Health:** ✅ Healthy
- **Electrum:** Connected to fulcrum.sethforprivacy.com:50002

### ⏳ AWS Server (192.168.2.118)
- **Status:** Pending deployment
- **Note:** Server currently unreachable

---

## 🔄 How to Deploy

### Local Development

```bash
cd /Users/t/Documents/vibbbing/ChainViz/backend
source venv/bin/activate

export ELECTRUM_HOST=fulcrum.sethforprivacy.com
export ELECTRUM_PORT=50002
export ELECTRUM_USE_SSL=true
export REDIS_HOST=localhost
export REDIS_PORT=6379

uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

---

### Docker Deployment

```bash
cd /Users/t/Documents/vibbbing/ChainViz
docker compose up -d --build
```

---

### AWS Server Deployment

When the server is reachable:

```bash
# Deploy script
./deployment/deploy-ssh.sh 192.168.2.118 chainviz
```

Or manually:

```bash
ssh chainviz@192.168.2.118
cd ~/ChainViz

# Update configuration
cat > backend/.env << 'EOF'
ELECTRUM_HOST=fulcrum.sethforprivacy.com
ELECTRUM_PORT=50002
ELECTRUM_USE_SSL=true
REDIS_HOST=redis
REDIS_PORT=6379
EOF

# Restart services
sudo docker compose down
sudo docker compose up -d --build
```

---

## 🧪 Testing

### Health Check

```bash
curl http://localhost:8000/health
```

Expected response:
```json
{"status":"healthy"}
```

### Test Electrum Connection

```bash
curl http://localhost:8000/docs
```

Navigate to the API docs and test the `/address/{address}` endpoint.

---

## 📊 Benefits of Seth's Server

1. **Privacy-Focused** - Seth's server respects user privacy
2. **Reliable** - Well-maintained Fulcrum implementation
3. **SSL Enabled** - Secure connection
4. **Public** - No authentication required
5. **Fast** - Optimized for performance

---

## 🔗 Resources

- **Seth's Privacy Blog:** https://sethforprivacy.com
- **Fulcrum Server:** https://github.com/cculianu/Fulcrum
- **Electrum Protocol:** https://electrumx.readthedocs.io

---

## 📝 Notes

- The old server (`iu1b96e.glddns.com`) is now set as a fallback
- SSL is now enabled by default for security
- All cached data will be refreshed with the new connection
- No code changes required - only configuration updates

---

**Last Updated:** October 18, 2025  
**Status:** ✅ Configuration Complete  
**Local:** ✅ Running  
**AWS:** ⏳ Pending Deployment

