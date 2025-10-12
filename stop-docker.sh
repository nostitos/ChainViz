#!/bin/bash
# Stop and remove ChainViz Docker containers

echo "🛑 Stopping ChainViz containers..."

docker stop chainviz-frontend-dev 2>/dev/null || true
docker stop chainviz-backend 2>/dev/null || true
docker stop chainviz-redis 2>/dev/null || true

docker rm chainviz-frontend-dev 2>/dev/null || true
docker rm chainviz-backend 2>/dev/null || true
docker rm chainviz-redis 2>/dev/null || true

echo "✅ Stopped and removed containers"
echo ""
echo "To remove the network:"
echo "  docker network rm chainviz"
echo ""
echo "To remove images:"
echo "  docker rmi chainviz-frontend-dev chainviz-backend"
echo ""




