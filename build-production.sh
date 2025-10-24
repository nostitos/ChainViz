#!/bin/bash

# ChainViz Production Build Script
echo "🚀 Building ChainViz for production deployment..."

# Get current version and increment it
VERSION_FILE="frontend/src/version.ts"
CURRENT_VERSION=$(grep "export const VERSION" $VERSION_FILE | sed "s/.*'\(.*\)'.*/\1/")
IFS='.' read -ra VERSION_PARTS <<< "$CURRENT_VERSION"
MAJOR=${VERSION_PARTS[0]}
MINOR=${VERSION_PARTS[1]}
PATCH=${VERSION_PARTS[2]}
NEW_PATCH=$((PATCH + 1))
NEW_VERSION="$MAJOR.$MINOR.$NEW_PATCH"

echo "📈 Updating version from $CURRENT_VERSION to $NEW_VERSION"

# Update version in version.ts
sed -i.bak "s/export const VERSION = '.*';/export const VERSION = '$NEW_VERSION';/" $VERSION_FILE
sed -i.bak "s/export const BUILD_DATE = new Date().toISOString();/export const BUILD_DATE = '$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)';/" $VERSION_FILE
sed -i.bak "s/export const BUILD_TIMESTAMP = Date.now();/export const BUILD_TIMESTAMP = $(date +%s)000;/" $VERSION_FILE

# Add new version to history
echo "  {
    version: '$NEW_VERSION',
    date: '$(date +%Y-%m-%d)',
    changes: ['Production deployment', 'Fixed API URL detection', 'Added version tracking']
  }," >> temp_version_entry.txt

# Insert new version entry into VERSION_HISTORY array
sed -i.bak "/export const VERSION_HISTORY = \[/r temp_version_entry.txt" $VERSION_FILE
rm temp_version_entry.txt

# Clean up backup files
rm -f $VERSION_FILE.bak

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
