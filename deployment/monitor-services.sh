#!/bin/bash
# ChainViz Service Monitor
# Checks all Docker services and restarts if unhealthy
# Run via cron: */5 * * * * /home/ubuntu/ChainViz/deployment/monitor-services.sh >> /var/log/chainviz-monitor.log 2>&1

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_FILE="/var/log/chainviz-monitor.log"
MAX_LOG_SIZE=10485760  # 10MB

# Rotate log if too large
if [ -f "$LOG_FILE" ] && [ $(stat -f%z "$LOG_FILE" 2>/dev/null || stat -c%s "$LOG_FILE" 2>/dev/null) -gt $MAX_LOG_SIZE ]; then
    mv "$LOG_FILE" "${LOG_FILE}.old"
fi

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

cd "$PROJECT_DIR"

# Check if docker-compose is available
if ! command -v docker-compose &> /dev/null; then
    log "ERROR: docker-compose not found"
    exit 1
fi

# Check service health
check_service() {
    local service=$1
    local status=$(docker-compose ps -q "$service" | xargs docker inspect --format='{{.State.Status}}' 2>/dev/null || echo "not_running")
    
    if [ "$status" != "running" ]; then
        log "WARNING: Service $service is $status"
        return 1
    fi
    
    # Check health status
    local health=$(docker-compose ps -q "$service" | xargs docker inspect --format='{{.State.Health.Status}}' 2>/dev/null || echo "none")
    
    if [ "$health" = "unhealthy" ]; then
        log "WARNING: Service $service is unhealthy"
        return 1
    fi
    
    return 0
}

# Restart a service
restart_service() {
    local service=$1
    log "Restarting service: $service"
    docker-compose restart "$service" || {
        log "ERROR: Failed to restart $service, trying down/up..."
        docker-compose stop "$service" && docker-compose up -d "$service"
    }
    sleep 5  # Give it time to start
}

# Check all services
SERVICES=("backend" "frontend" "nginx" "redis")
ISSUES=0

for service in "${SERVICES[@]}"; do
    if ! check_service "$service"; then
        ISSUES=$((ISSUES + 1))
        restart_service "$service"
        
        # Check again after restart
        sleep 10
        if ! check_service "$service"; then
            log "ERROR: Service $service failed to recover after restart"
        else
            log "SUCCESS: Service $service recovered"
        fi
    fi
done

# Check if site is responding
if [ $ISSUES -eq 0 ]; then
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost/ 2>/dev/null || echo "000")
    if [ "$HTTP_CODE" != "200" ] && [ "$HTTP_CODE" != "301" ] && [ "$HTTP_CODE" != "302" ]; then
        log "WARNING: Site not responding correctly (HTTP $HTTP_CODE)"
        # Restart nginx
        restart_service "nginx"
    fi
fi

if [ $ISSUES -eq 0 ]; then
    log "OK: All services healthy"
    exit 0
else
    log "WARNING: $ISSUES service(s) had issues"
    exit 1
fi
