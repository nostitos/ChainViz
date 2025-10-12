# 🐳 Docker Setup for ChainViz

## Why Docker?

Run the **professional React UI** with Node 18 inside a container - **no need to change your local Node version!**

Your local system stays at Node v16, but the frontend runs in an isolated Node 18 environment.

---

## 🚀 Quick Start

### Option A: Development Mode (Recommended)

**Hot-reload enabled** - changes reflect instantly!

```bash
# Start everything
docker-compose up

# Or in background
docker-compose up -d

# View logs
docker-compose logs -f
```

**Access**:
- 🎨 Frontend: http://localhost:5173
- 📡 Backend API: http://localhost:8000
- 📊 API Docs: http://localhost:8000/docs
- 🔴 Redis: localhost:6379

### Option B: Production Mode

**Optimized build** with Nginx:

```bash
# Build and run production
docker-compose --profile production up

# Or build separately
docker-compose build frontend-prod
docker-compose --profile production up -d
```

**Access**:
- 🎨 Frontend: http://localhost:3001 (production build)
- 📡 Backend API: http://localhost:8000

---

## 📦 What's Included

### Services

1. **frontend-dev** (Port 5173)
   - Node 18 Alpine
   - Vite dev server with hot-reload
   - Volume mounted for instant updates

2. **backend** (Port 8000)
   - Python 3.13
   - FastAPI with uvicorn
   - Connected to Redis

3. **frontend-prod** (Port 3001) - *Optional*
   - Nginx Alpine
   - Production build
   - Optimized assets

4. **redis** (Port 6379)
   - Redis 7 Alpine
   - Persistent data volume
   - For caching blockchain data

---

## 🎮 Usage

### Start Services

```bash
# Start all (dev mode)
docker-compose up

# Start specific service
docker-compose up frontend-dev

# Start in background
docker-compose up -d

# Start with production frontend
docker-compose --profile production up
```

### Stop Services

```bash
# Stop all
docker-compose down

# Stop and remove volumes
docker-compose down -v

# Stop specific service
docker-compose stop frontend-dev
```

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f frontend-dev
docker-compose logs -f backend

# Last 100 lines
docker-compose logs --tail=100 backend
```

### Rebuild

```bash
# Rebuild all
docker-compose build

# Rebuild specific service
docker-compose build frontend-dev

# Rebuild without cache
docker-compose build --no-cache
```

---

## 🔧 Development Workflow

### 1. Start Docker Services

```bash
cd /Users/t/Documents/vibbbing/ChainViz
docker-compose up
```

Wait for:
```
frontend-dev | ➜  Local:   http://localhost:5173/
backend      | INFO: Uvicorn running on http://0.0.0.0:8000
redis        | Ready to accept connections
```

### 2. Open Browser

Navigate to: **http://localhost:5173**

### 3. Make Changes

Edit files in `frontend/src/` - **changes appear instantly!**

### 4. Trace Bitcoin Addresses

1. Enter address: `bc1qsgzcjtvhtx6nzcsh26xrntqsd6xreunnawcjj8`
2. Set depth: `3`
3. Click **Trace**
4. Watch the interactive graph build! 🎉

---

## 📁 Docker Files

```
ChainViz/
├── docker-compose.yml              # Main orchestration
├── backend/
│   └── Dockerfile                  # Backend container
└── frontend/
    ├── Dockerfile                  # Production build
    ├── Dockerfile.dev              # Development mode
    └── nginx.conf                  # Production server config
```

---

## 🐛 Troubleshooting

### Port Already in Use

If port 5173 is already used:

```bash
# Find what's using it
lsof -i :5173

# Kill the process
kill -9 <PID>

# Or change port in docker-compose.yml
ports:
  - "5174:5173"  # Use 5174 locally
```

### Frontend Not Loading

```bash
# Check if container is running
docker-compose ps

# View frontend logs
docker-compose logs frontend-dev

# Restart frontend
docker-compose restart frontend-dev
```

### Backend Connection Issues

```bash
# Check backend logs
docker-compose logs backend

# Check if backend is healthy
curl http://localhost:8000/health

# Restart backend
docker-compose restart backend
```

### Redis Connection Issues

```bash
# Check Redis
docker-compose logs redis

# Connect to Redis CLI
docker-compose exec redis redis-cli ping
```

### Clear Everything and Start Fresh

```bash
# Stop and remove everything
docker-compose down -v

# Remove old images
docker-compose build --no-cache

# Start fresh
docker-compose up
```

---

## 🎯 Advantages

### ✅ No Local Node Upgrade
- Your Mac stays at Node 16
- Frontend runs Node 18 in container
- Backend uses Python 3.13 in container

### ✅ Isolated Environment
- No conflicts with other projects
- Clean dependencies
- Easy to reset

### ✅ Same on All Machines
- Works on Mac, Linux, Windows
- Same versions everywhere
- No "works on my machine" issues

### ✅ Includes Redis
- Caching for faster queries
- Persistent storage
- Production-ready

### ✅ Production Ready
- Can deploy the same setup
- Nginx for static files
- Optimized builds

---

## 📊 Resource Usage

### Development Mode
- **Memory**: ~500MB total
- **CPU**: Minimal when idle
- **Disk**: ~1GB (images + volumes)

### Production Mode
- **Memory**: ~200MB total
- **CPU**: Minimal when idle
- **Disk**: ~500MB

---

## 🚀 Next Steps

### 1. First Time Setup

```bash
# Navigate to project
cd /Users/t/Documents/vibbbing/ChainViz

# Start services
docker-compose up
```

### 2. Wait for Build

First time will take 2-3 minutes to:
- Download Node 18 image
- Install npm dependencies
- Download Python 3.13 image
- Install pip dependencies
- Download Redis image

### 3. Access UI

Open: **http://localhost:5173**

### 4. Test It!

Try the test address:
```
bc1qsgzcjtvhtx6nzcsh26xrntqsd6xreunnawcjj8
```

---

## 💡 Tips

### Hot Reload
Edit any file in `frontend/src/` and see changes instantly!

### Backend Changes
If you edit backend Python code:
```bash
docker-compose restart backend
```

### Clean Start
```bash
docker-compose down -v && docker-compose up
```

### Production Build
```bash
docker-compose --profile production up
```

### Save Resources
```bash
# Stop when not using
docker-compose stop

# Restart later
docker-compose start
```

---

## 🎊 Summary

**Commands**:
```bash
# Start
docker-compose up

# Stop
docker-compose down

# Rebuild
docker-compose build

# Logs
docker-compose logs -f
```

**URLs**:
- Frontend: http://localhost:5173
- Backend: http://localhost:8000
- API Docs: http://localhost:8000/docs

**That's it!** Your professional UI is now running with Node 18, while your Mac stays at Node 16! 🎉




