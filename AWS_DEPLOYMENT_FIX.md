# AWS Deployment Fix

## Issues Identified

1. **Nginx Configuration**: The nginx.conf was using `localhost:8000` and `localhost:80` instead of Docker service names
2. **Docker Compose**: Missing nginx service in docker-compose.yml
3. **Service Communication**: Services need to communicate using Docker service names, not localhost

## Fixes Applied

### 1. Updated nginx.conf
- Changed `proxy_pass http://localhost:8000` → `proxy_pass http://backend:8000`
- Changed `proxy_pass http://localhost:80` → `proxy_pass http://frontend:80`
- Changed port from 8080 to 80

### 2. Updated docker-compose.yml
- Added nginx service
- Changed frontend to expose port 80 instead of binding to host
- Added proper service dependencies

### 3. Created Deployment Scripts
- `deploy-aws.sh`: Complete deployment script
- `fix-aws-deployment.sh`: Quick fix for existing deployment

## How to Deploy to AWS

### Option 1: Quick Fix (if already deployed)
```bash
# On your AWS EC2 instance
cd /path/to/ChainViz
./fix-aws-deployment.sh
```

### Option 2: Fresh Deployment
```bash
# On your AWS EC2 instance
cd /path/to/ChainViz
./deploy-aws.sh
```

### Option 3: Manual Steps
```bash
# 1. Pull latest code
git pull origin main

# 2. Stop existing services
docker-compose down

# 3. Build and start services
docker-compose up -d --build

# 4. Wait for services to start
sleep 20

# 5. Check status
docker-compose ps

# 6. Test API
curl http://localhost/api/config

# 7. Test frontend
curl http://localhost/
```

## Service Architecture

```
Internet → Nginx (port 80/443) → Frontend (port 80) + Backend (port 8000)
```

- **Nginx**: Reverse proxy handling SSL termination and routing
- **Frontend**: Serves static files on port 80 (internal)
- **Backend**: API server on port 8000 (internal)
- **Redis**: Cache service on port 6379 (internal)

## Troubleshooting

### Check Service Status
```bash
docker-compose ps
```

### View Logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend
docker-compose logs -f frontend
docker-compose logs -f nginx
```

### Restart Services
```bash
docker-compose restart
```

### Complete Reset
```bash
docker-compose down
docker-compose up -d --build
```

## Expected Results

After deployment, you should see:
- ✅ API responding at `http://utxo.link/api/config`
- ✅ Frontend loading at `http://utxo.link/`
- ✅ All services running: `docker-compose ps`

## Next Steps

1. Deploy the fixes to AWS
2. Test the deployment
3. Set up SSL with Let's Encrypt:
   ```bash
   sudo certbot --nginx -d utxo.link -d www.utxo.link
   ```
4. Verify HTTPS is working
