# 🚀 AWS Deployment Instructions

## Quick Fix for AWS Deployment

Your AWS instance is serving an older frontend without the latest features (like the About panel). Here's how to update it:

### Option 1: Automatic Fix (Recommended)

SSH into your AWS EC2 instance and run:

```bash
cd /home/ubuntu/ChainViz
./fix-aws-deployment.sh
```

This script will:
1. ✅ Pull the latest code from GitHub
2. ✅ Rebuild the frontend with all latest changes
3. ✅ Rebuild and restart all Docker services
4. ✅ Test the deployment

### Option 2: Manual Steps

If you prefer to do it manually:

```bash
# 1. Navigate to your ChainViz directory
cd /home/ubuntu/ChainViz

# 2. Stop existing services
docker-compose down

# 3. Pull latest code
git pull origin main

# 4. Rebuild frontend
cd frontend
npm install
npm run build
cd ..

# 5. Rebuild and start services
docker-compose up -d --build

# 6. Wait for services to start
sleep 20

# 7. Check status
docker-compose ps

# 8. Test the deployment
curl http://localhost/api/config
curl http://localhost/
```

## What's New in This Update?

✅ **Fixed nginx configuration** - Uses Docker service names instead of localhost  
✅ **Added nginx service** - Proper reverse proxy setup  
✅ **Rebuilt frontend** - Includes About panel with version tracking  
✅ **Updated deployment scripts** - Automatic frontend rebuild  

## After Deployment

Visit your site to verify:
- 🌐 **Frontend**: http://utxo.link
- 🔧 **API**: http://utxo.link/api/config

You should now see:
- ✅ The Info button (ℹ️) in the header next to Settings
- ✅ About panel with version and build date
- ✅ All latest UI improvements

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

## Next Steps

Once deployed, set up SSL:
```bash
sudo certbot --nginx -d utxo.link -d www.utxo.link
```

This will enable HTTPS for your site. 🔒
