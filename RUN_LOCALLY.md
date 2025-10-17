# Run ChainViz Locally (Without Docker)

## 🎯 Quick Start

Since Docker Desktop requires installation, here's how to run ChainViz locally using the development servers directly.

---

## 📋 Prerequisites

Make sure you have these installed:
- Python 3.11+ (for backend)
- Node.js 18+ (for frontend)
- Redis (for caching)

---

## 🚀 Option 1: Install Docker Desktop (Recommended)

### Step 1: Install Docker Desktop

```bash
# Install Docker Desktop (requires password)
brew install --cask docker
```

Then open Docker Desktop from Applications folder and wait for it to start.

### Step 2: Start ChainViz

```bash
cd /Users/t/Documents/vibbbing/ChainViz
docker compose up -d --build
```

### Step 3: Access

- Frontend: http://localhost
- Backend: http://localhost:8000
- API Docs: http://localhost:8000/docs

---

## 🛠️ Option 2: Run Without Docker (Development Mode)

### Step 1: Install Dependencies

**Backend:**
```bash
cd /Users/t/Documents/vibbbing/ChainViz/backend

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

**Frontend:**
```bash
cd /Users/t/Documents/vibbbing/ChainViz/frontend

# Install dependencies
npm install
```

**Redis:**
```bash
# Install Redis
brew install redis

# Start Redis
brew services start redis
```

---

### Step 2: Start Backend

```bash
cd /Users/t/Documents/vibbbing/ChainViz/backend
source venv/bin/activate

# Set environment variables
export ELECTRUM_HOST=fulcrum.sethforprivacy.com
export ELECTRUM_PORT=50002
export ELECTRUM_USE_SSL=true
export REDIS_HOST=localhost
export REDIS_PORT=6379

# Start backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Backend will be available at: http://localhost:8000

---

### Step 3: Start Frontend

Open a new terminal:

```bash
cd /Users/t/Documents/vibbbing/ChainViz/frontend

# Start development server
npm run dev
```

Frontend will be available at: http://localhost:5173 (or the port shown)

---

## 🎉 Done!

You now have ChainViz running locally:
- **Frontend:** http://localhost:5173
- **Backend:** http://localhost:8000
- **API Docs:** http://localhost:8000/docs

---

## 📝 Quick Commands

### Stop Services

**Backend:** Press `Ctrl+C` in the backend terminal

**Frontend:** Press `Ctrl+C` in the frontend terminal

**Redis:** 
```bash
brew services stop redis
```

---

## 🔧 Troubleshooting

### Backend won't start?

**Check Redis is running:**
```bash
redis-cli ping
```
Should return: `PONG`

**Check Python version:**
```bash
python3 --version
```
Should be 3.11 or higher

---

### Frontend won't start?

**Check Node version:**
```bash
node --version
```
Should be 18 or higher

**Clear node_modules and reinstall:**
```bash
cd frontend
rm -rf node_modules package-lock.json
npm install
```

---

### Port already in use?

**Find what's using the port:**
```bash
# For port 8000 (backend)
lsof -i :8000

# For port 5173 (frontend)
lsof -i :5173
```

**Kill the process:**
```bash
kill -9 <PID>
```

---

## 🎯 Which Option Should I Use?

### Use Docker (Option 1) if:
- ✅ You want the simplest setup
- ✅ You want production-like environment
- ✅ You don't want to manage dependencies

### Use Development Mode (Option 2) if:
- ✅ You want to develop/debug easily
- ✅ You want hot-reload for changes
- ✅ You prefer running services directly

---

## 📚 Next Steps

Once running locally, you can:
1. Make changes to the code
2. See changes immediately (hot-reload)
3. Test new features
4. Debug easily

---

## 🔄 Auto-Reload

Both options support auto-reload:

**Docker:**
- Changes to code will trigger rebuild
- Use `docker compose up --build` to rebuild

**Development Mode:**
- Backend: Auto-reloads with `--reload` flag
- Frontend: Auto-reloads with Vite dev server

---

**Happy coding! 🚀**

