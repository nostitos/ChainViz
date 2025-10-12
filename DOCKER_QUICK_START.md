# 🐳 Docker Quick Start (No docker-compose needed!)

## ✅ Your System
- ✅ Docker: Installed (v28.2.2)
- ⚠️ docker-compose: Not installed (not needed!)
- ✅ Node: v16 (will use Node 18 in container)

---

## 🚀 Super Simple Start

### One Command:

```bash
cd /Users/t/Documents/vibbbing/ChainViz
./run-docker.sh
```

**That's it!** Wait 30 seconds, then:

🎨 **Open:** http://localhost:5173

---

## What It Does

The script:
1. ✅ Creates Docker network
2. ✅ Starts Redis (port 6379)
3. ✅ Builds & starts Backend (port 8000)
4. ✅ Builds & starts Frontend with Node 18 (port 5173)

**Your Mac stays at Node 16** - everything runs in containers!

---

## Usage

### Start Everything
```bash
./run-docker.sh
```

### Stop Everything
```bash
./stop-docker.sh
```

### View Logs
```bash
# Frontend
docker logs -f chainviz-frontend-dev

# Backend
docker logs -f chainviz-backend

# All at once
docker logs -f chainviz-frontend-dev &
docker logs -f chainviz-backend
```

### Restart One Service
```bash
# Restart frontend
docker restart chainviz-frontend-dev

# Restart backend
docker restart chainviz-backend
```

---

## First Time Running

### 1. Start Services
```bash
cd /Users/t/Documents/vibbbing/ChainViz
./run-docker.sh
```

**Output:**
```
🐳 Starting ChainViz with Docker...

Starting Redis...
Starting Backend...
Waiting for backend...
Starting Frontend (Dev mode)...

✅ ChainViz is starting!

Wait 30 seconds for services to initialize...

Then access:
  🎨 Frontend: http://localhost:5173
  📡 Backend:  http://localhost:8000
  📚 API Docs: http://localhost:8000/docs
```

### 2. Check Status
```bash
docker ps
```

**Should show:**
```
chainviz-frontend-dev   (port 5173)
chainviz-backend        (port 8000)
chainviz-redis          (port 6379)
```

### 3. Test It!

Open: **http://localhost:5173**

Enter test address:
```
bc1qsgzcjtvhtx6nzcsh26xrntqsd6xreunnawcjj8
```

Click **Trace** → Watch the graph build! 🎉

---

## Ports Used

- **5173** - Frontend (React + Vite)
- **8000** - Backend (FastAPI)
- **6379** - Redis (Cache)

---

## File Changes

The frontend is **volume-mounted**, so changes you make to files in `frontend/src/` will **automatically reload** in the browser!

Edit any file → See changes instantly! ✨

---

## Troubleshooting

### Port Already in Use

If you see "port is already allocated":

```bash
# Find what's using the port
lsof -i :5173

# Kill it
kill -9 <PID>

# Or stop your existing services
./stop-docker.sh
```

### Frontend Won't Start

```bash
# Check logs
docker logs chainviz-frontend-dev

# Restart
docker restart chainviz-frontend-dev
```

### Backend Connection Error

```bash
# Check if backend is running
curl http://localhost:8000/health

# Check logs
docker logs chainviz-backend

# Restart
docker restart chainviz-backend
```

### Redis Issues

```bash
# Check Redis
docker logs chainviz-redis

# Test Redis
docker exec chainviz-redis redis-cli ping
```

### Nuclear Option (Clean Restart)

```bash
# Stop everything
./stop-docker.sh

# Remove network
docker network rm chainviz

# Remove images
docker rmi chainviz-frontend-dev chainviz-backend

# Start fresh
./run-docker.sh
```

---

## What's Running Where

```
Your Mac (Node 16)
│
└── Docker Containers
    ├── chainviz-redis (Redis 7)
    ├── chainviz-backend (Python 3.13)
    │   └── FastAPI + Electrum Client
    └── chainviz-frontend-dev (Node 18)
        └── Vite + React + React Flow
```

**No changes to your Mac!** Everything isolated in Docker.

---

## Stop Services

```bash
# Stop and remove containers
./stop-docker.sh

# If you want to also remove images (free disk space)
docker rmi chainviz-frontend-dev chainviz-backend
```

---

## Advanced: Install docker-compose (Optional)

If you want to use `docker-compose.yml`:

```bash
# Option 1: Homebrew
brew install docker-compose

# Option 2: Docker Desktop
# Enable "Use Docker Compose V2" in settings

# Then use:
docker-compose up
```

But the simple scripts work great without it!

---

## 🎊 Summary

**Simple Commands:**
```bash
# Start
./run-docker.sh

# Stop
./stop-docker.sh

# Logs
docker logs -f chainviz-frontend-dev
```

**URLs:**
- Frontend: http://localhost:5173
- Backend: http://localhost:8000

**Requirements:**
- ✅ Docker (you have this!)
- ✅ That's it!

**Your Node version:**
- Local: v16 (unchanged)
- Container: v18 (isolated)

---

**Ready to go! Run `./run-docker.sh` and enjoy your professional UI! 🚀**




