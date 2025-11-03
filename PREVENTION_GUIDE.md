# Service Availability Prevention Guide

## Incident Summary: Frontend Container Exit (502 Errors)

**Date**: November 3, 2025  
**Symptom**: 502 Bad Gateway errors, site unavailable  
**Root Cause**: Frontend container exited cleanly (exit code 0) but didn't restart automatically  
**Impact**: Site down for ~10 minutes until manual intervention  

---

## Why It Happened

### Primary Cause
1. **Restart Policy**: `restart: unless-stopped` means containers won't restart if:
   - Docker daemon restarts while container is stopped
   - Container is manually stopped
   - Container exits cleanly due to internal issues

2. **No Health Checks**: Docker had no way to detect if services were actually working correctly

3. **No Monitoring**: No automated checks to detect and fix issues

---

## Prevention Measures Implemented

### 1. ✅ Improved Restart Policies
**Changed**: `restart: unless-stopped` → `restart: always`

**Why**: Ensures containers ALWAYS restart, even after:
- Manual stops
- Docker daemon restarts
- System reboots
- Clean exits

**Location**: `docker-compose.yml` - all services

### 2. ✅ Health Checks Added
All services now have health checks that verify they're actually responding:

- **Frontend**: Checks if nginx is serving HTTP requests
- **Backend**: Checks if API is responding to `/api/config`
- **Nginx**: Checks if reverse proxy is working
- **Redis**: Checks if Redis is accepting connections

**Configuration**:
```yaml
healthcheck:
  test: ["CMD", "..."]
  interval: 30s      # Check every 30 seconds
  timeout: 10s       # Fail if no response in 10s
  retries: 3         # Retry 3 times before marking unhealthy
  start_period: 10s  # Wait 10s before starting checks
```

### 3. ✅ Service Dependencies
Nginx now waits for backend/frontend to be **healthy** (not just started) before starting:

```yaml
depends_on:
  frontend:
    condition: service_healthy
  backend:
    condition: service_healthy
```

### 4. ✅ Automated Monitoring Script
**Location**: `deployment/monitor-services.sh`

**What it does**:
- Checks all services every 5 minutes (via cron)
- Detects stopped/unhealthy containers
- Automatically restarts failed services
- Logs all events to `/var/log/chainviz-monitor.log`
- Rotates logs when they get too large

**Setup**:
```bash
# Add to crontab
*/5 * * * * /home/ubuntu/ChainViz/deployment/monitor-services.sh >> /home/ubuntu/ChainViz/logs/chainviz-monitor.log 2>&1
```

---

## How to Deploy These Fixes

### 1. Update Docker Compose Configuration
```bash
cd /home/ubuntu/ChainViz
git pull origin main
sudo docker-compose down
sudo docker-compose up -d
```

### 2. Setup Monitoring Cron Job
```bash
# Add monitoring to crontab
(crontab -l 2>/dev/null; echo "*/5 * * * * /home/ubuntu/ChainViz/deployment/monitor-services.sh >> /var/log/chainviz-monitor.log 2>&1") | crontab -

# Verify it's added
crontab -l
```

### 3. Verify Health Checks
```bash
# Check health status
sudo docker-compose ps

# Check individual service health
sudo docker inspect chainviz_frontend_1 | grep -A 10 Health
```

---

## Ongoing Monitoring

### Daily Checks
```bash
# Check service status
sudo docker-compose ps

# Check health
sudo docker ps --format "table {{.Names}}\t{{.Status}}"

# Check logs for errors
sudo docker-compose logs --tail=50 | grep -i error
```

### Weekly Checks
```bash
# Review monitor logs
tail -100 /var/log/chainviz-monitor.log | grep -i warning

# Check disk space
df -h

# Check Docker resource usage
sudo docker stats --no-stream
```

### Alert Setup (Optional)
Consider setting up:
1. **CloudWatch Alarms** for:
   - High HTTP error rates (502s)
   - Container restart counts
   - CPU/Memory usage

2. **Email/Slack Notifications** for:
   - Service failures
   - Repeated restarts
   - Disk space warnings

---

## Troubleshooting

### Service Won't Start
```bash
# Check logs
sudo docker-compose logs [service-name]

# Check health status
sudo docker inspect [container-id] | grep -A 10 Health

# Restart manually
sudo docker-compose restart [service-name]
```

### Health Check Failing
```bash
# Test health check command manually
sudo docker exec chainviz_backend_1 python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/config').read()"

# If it fails, check the service directly
curl http://localhost:8000/api/config
```

### Monitor Script Not Working
```bash
# Test manually
/home/ubuntu/ChainViz/deployment/monitor-services.sh

# Check cron is running
sudo service cron status

# Check cron logs
grep CRON /var/log/syslog | tail -20
```

---

## Best Practices Going Forward

1. **Always use `restart: always`** for production services
2. **Always add health checks** to detect real failures
3. **Monitor service health** regularly (automated + manual)
4. **Keep logs** - review them weekly for patterns
5. **Test disaster recovery** - practice restarting services
6. **Document incidents** - learn from each outage

---

## Related Documentation

- `DISK_SPACE_ANALYSIS.md` - Disk space management
- `DEPLOYMENT_STATUS.md` - Current deployment status
- `AWS_DEPLOYMENT_FIX.md` - AWS-specific fixes

---

**Last Updated**: November 3, 2025  
**Maintained By**: DevOps/Infrastructure Team
