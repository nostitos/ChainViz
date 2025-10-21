# Installation Guide

## Quick Start (Docker - Recommended)

The easiest way to run ChainViz is with Docker Compose:

```bash
cd /Users/t/Documents/vibbbing/ChainViz
docker-compose up -d
```

Wait for services to start (about 30 seconds), then open:
- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs

### Stop Services

```bash
docker-compose down
```

---

## Manual Setup

### Prerequisites

- **Python 3.11+** (for backend)
- **Node.js 18+** (for frontend)
- **Redis** (optional, for caching)
- **pnpm** (for frontend package management)

### Backend Setup

1. **Navigate to backend directory**:
   ```bash
   cd backend
   ```

2. **Create virtual environment**:
   ```bash
   python3 -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

4. **Configure environment** (optional):
   ```bash
   export ELECTRUM_HOST=fulcrum.sethforprivacy.com
   export ELECTRUM_PORT=50002
   export ELECTRUM_USE_SSL=true
   ```

5. **Start backend server**:
   ```bash
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```

Backend will be available at: http://localhost:8000

### Frontend Setup

1. **Navigate to frontend directory**:
   ```bash
   cd frontend
   ```

2. **Install dependencies**:
   ```bash
   npm install
   # or
   pnpm install
   ```

3. **Start development server**:
   ```bash
   npm run dev
   # or
   pnpm dev
   ```

Frontend will be available at: http://localhost:5173 (or the port shown in terminal)

### Redis Setup (Optional)

Redis is used for caching to improve performance:

```bash
# Install Redis
brew install redis  # macOS
# or
sudo apt-get install redis-server  # Linux

# Start Redis
brew services start redis  # macOS
# or
sudo systemctl start redis  # Linux

# Test Redis
redis-cli ping
# Should return: PONG
```

---

## Configuration

### Electrum Server Settings

ChainViz connects to an Electrum server to fetch blockchain data. You can configure the server in the UI:

1. Click the **⚙️ Settings** button
2. Select an Electrum server from the dropdown or enter custom settings
3. Click **🧪 Test Connection** to verify
4. Click **💾 Save & Apply** to update

**Default Server**: `fulcrum.sethforprivacy.com:50002` (SSL enabled)

**Recommended Servers**:
- DIYNodes (Fastest)
- Bitcoin.lu.ke
- Electrum Emzy
- Electrum Bitaroo
- Seth's Fulcrum (fallback)

### Environment Variables

You can also set these via environment variables:

```bash
export ELECTRUM_HOST=your-server.com
export ELECTRUM_PORT=50002
export ELECTRUM_USE_SSL=true
export REDIS_HOST=localhost
export REDIS_PORT=6379
```

---

## Verify Installation

### Test Backend

```bash
curl http://localhost:8000/api/address/1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa
```

Should return JSON with address information.

### Test Frontend

Open http://localhost:5173 in your browser. You should see the ChainViz interface.

### Test Tracing

1. Enter address: `1Gw5PwF6sGVxomatMbj5p4bkk7ED4pyfbu`
2. Set hops before: `0`
3. Set hops after: `0`
4. Click **Trace**

You should see a graph with the address and its connected transactions.

---

## Next Steps

- Read the [Quick Start Guide](quick-start.md) to learn the basics
- Check the [Tracing Guide](../guides/tracing-guide.md) for detailed usage
- See the [UI Guide](../guides/ui-guide.md) for interface features
- Review [Troubleshooting](../troubleshooting/common-issues.md) if you encounter issues

---

## Troubleshooting

### Backend won't start?

**Check Python version**:
```bash
python3 --version
# Should be 3.11 or higher
```

**Check dependencies**:
```bash
cd backend
source venv/bin/activate
pip list
```

**Check port availability**:
```bash
lsof -i :8000
# Kill process if needed: kill -9 <PID>
```

### Frontend won't start?

**Check Node version**:
```bash
node --version
# Should be 18 or higher
```

**Clear cache and reinstall**:
```bash
cd frontend
rm -rf node_modules package-lock.json
npm install
```

### Can't connect to Electrum server?

1. Check your internet connection
2. Try a different server from the settings dropdown
3. Verify the server supports verbose transactions (use the test button)
4. Check firewall settings

For more help, see [Common Issues](../troubleshooting/common-issues.md).

