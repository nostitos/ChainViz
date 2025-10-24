#!/bin/bash

# ChainViz Production Build Script
echo "🚀 Building ChainViz for production deployment..."

# Set production API URL
export VITE_API_BASE_URL=https://utxo.link/api

# Build frontend
echo "📦 Building frontend..."
cd frontend
npm run build

if [ $? -eq 0 ]; then
    echo "✅ Frontend build successful!"
    echo "📁 Built files are in frontend/dist/"
    echo "🌐 API will connect to: https://utxo.link/api"
else
    echo "❌ Frontend build failed!"
    exit 1
fi

# Build Docker image
echo "🐳 Building Docker image..."
cd ..
docker build -f frontend/Dockerfile -t chainviz-frontend:latest frontend/

if [ $? -eq 0 ]; then
    echo "✅ Docker image built successfully!"
    echo "🏷️  Image: chainviz-frontend:latest"
    echo "🚀 Ready for deployment!"
else
    echo "❌ Docker build failed!"
    exit 1
fi

echo ""
echo "🎉 Production build complete!"
echo "📋 Next steps:"
echo "   1. Deploy the Docker image to your server"
echo "   2. Ensure backend is running on utxo.link:8000"
echo "   3. Configure nginx to proxy /api to backend"
