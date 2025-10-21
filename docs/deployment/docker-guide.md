# Docker Deployment Guide

Complete guide to deploying ChainViz with Docker and Docker Compose.

---

## Quick Start

### Prerequisites

- **Docker** installed and running
- **Docker Compose** installed

### Start ChainViz

```bash
cd /Users/t/Documents/vibbbing/ChainViz
docker-compose up -d
```

Wait ~30 seconds for services to start, then access:
- **Frontend**: http://localhost:5173
- **Backend**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs

### Stop ChainViz

```bash
docker-compose down
```

---

## Docker Compose Configuration

### Services

**Frontend**:
- Port: 5173
- Build: `frontend/Dockerfile.dev`
- Volumes: Hot-reload enabled
- Environment: Vite dev server

**Backend**:
- Port: 8000
- Build: `backend/Dockerfile`
- Volumes: Hot-reload enabled
- Environment: Python virtual environment

### docker-compose.yml

```yaml
version: '3.8'

services:
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile.dev
    ports:
      - "5173:5173"
    volumes:
      - ./frontend/src:/app/src
      - ./frontend/public:/app/public
    environment:
      - VITE_API_URL=http://localhost:8000
    depends_on:
      - backend

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    ports:
      - "8000:8000"
    volumes:
      - ./backend/app:/app/app
    environment:
      - ELECTRUM_HOST=fulcrum.sethforprivacy.com
      - ELECTRUM_PORT=50002
      - ELECTRUM_USE_SSL=true
      - REDIS_HOST=redis
      - REDIS_PORT=6379
    depends_on:
      - redis

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

volumes:
  redis_data:
```

---

## Development Mode

### Hot-Reload Enabled

Both frontend and backend support hot-reload in development mode:

**Frontend**:
- Vite dev server watches for file changes
- Automatically refreshes browser
- Fast HMR (Hot Module Replacement)

**Backend**:
- Uvicorn with `--reload` flag
- Automatically restarts on file changes
- Preserves state where possible

### Making Changes

1. Edit code in your editor
2. Save the file
3. Changes appear automatically (no rebuild needed)

### View Logs

```bash
# All services
docker-compose logs -f

# Frontend only
docker-compose logs -f frontend

# Backend only
docker-compose logs -f backend

# Redis only
docker-compose logs -f redis
```

---

## Production Mode

### Build Production Images

```bash
# Build both services
docker-compose build

# Build specific service
docker-compose build frontend
docker-compose build backend
```

### Use Production Dockerfiles

**Frontend** (`frontend/Dockerfile`):
```dockerfile
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

**Backend** (`backend/Dockerfile`):
```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### Run Production

```bash
# Build and start
docker-compose -f docker-compose.prod.yml up -d

# Or build separately
docker-compose build
docker-compose up -d
```

---

## Customization

### Environment Variables

Create `.env` file:

```bash
# Electrum Server
ELECTRUM_HOST=fulcrum.sethforprivacy.com
ELECTRUM_PORT=50002
ELECTRUM_USE_SSL=true

# Redis
REDIS_HOST=redis
REDIS_PORT=6379

# Frontend
VITE_API_URL=http://localhost:8000
```

Update `docker-compose.yml`:

```yaml
services:
  backend:
    environment:
      - ELECTRUM_HOST=${ELECTRUM_HOST}
      - ELECTRUM_PORT=${ELECTRUM_PORT}
      - ELECTRUM_USE_SSL=${ELECTRUM_USE_SSL}
```

### Port Configuration

Change exposed ports:

```yaml
services:
  frontend:
    ports:
      - "8080:5173"  # Access on port 8080 instead of 5173

  backend:
    ports:
      - "9000:8000"  # Access on port 9000 instead of 8000
```

### Volume Mounts

Add persistent data:

```yaml
services:
  backend:
    volumes:
      - ./backend/app:/app/app
      - ./backend/data:/app/data  # Add data directory
      - ./backend/logs:/app/logs  # Add logs directory
```

---

## Troubleshooting

### Containers Won't Start

**Check Docker is running**:
```bash
docker ps
```

**Check logs**:
```bash
docker-compose logs
```

**Rebuild containers**:
```bash
docker-compose down
docker-compose up --build
```

### Port Already in Use

**Find process using port**:
```bash
lsof -i :5173  # Frontend
lsof -i :8000  # Backend
```

**Kill process**:
```bash
kill -9 <PID>
```

**Or change port**:
```yaml
services:
  frontend:
    ports:
      - "8080:5173"
```

### Hot-Reload Not Working

**Check volumes are mounted**:
```bash
docker-compose exec frontend ls -la /app/src
```

**Restart services**:
```bash
docker-compose restart
```

### Backend Connection Errors

**Check backend is running**:
```bash
docker-compose ps
```

**Check backend logs**:
```bash
docker-compose logs backend
```

**Test backend**:
```bash
curl http://localhost:8000/api/config
```

---

## Advanced Configuration

### Multi-Stage Builds

Optimize image size with multi-stage builds:

```dockerfile
# Frontend multi-stage
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

### Health Checks

Add health checks to services:

```yaml
services:
  backend:
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
```

### Resource Limits

Limit container resources:

```yaml
services:
  backend:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          cpus: '1'
          memory: 1G
```

---

## Docker Commands Cheat Sheet

```bash
# Start services
docker-compose up -d

# Stop services
docker-compose down

# View logs
docker-compose logs -f

# Restart service
docker-compose restart backend

# Rebuild service
docker-compose up --build backend

# Execute command in container
docker-compose exec backend bash

# View running containers
docker-compose ps

# Stop and remove volumes
docker-compose down -v

# Pull latest images
docker-compose pull

# Scale services
docker-compose up --scale backend=3
```

---

## Best Practices

1. **Use .dockerignore**: Exclude unnecessary files from builds
2. **Layer caching**: Order Dockerfile commands for optimal caching
3. **Multi-stage builds**: Reduce final image size
4. **Health checks**: Ensure services are healthy
5. **Resource limits**: Prevent resource exhaustion
6. **Secrets management**: Use Docker secrets for sensitive data
7. **Logging**: Configure proper log rotation
8. **Backup**: Regular backups of persistent data

---

## Next Steps

- Deploy to [AWS](../deployment/aws-deployment.md)
- Set up [Auto-Deploy](../deployment/auto-deploy.md)
- Configure [Local Deployment](../deployment/local-deployment.md)
- See [Troubleshooting](../../troubleshooting/common-issues.md)

---

**Happy deploying! 🐳**

