# Multi-stage build for ChainViz Frontend
FROM node:18-alpine AS builder

WORKDIR /app

# Set production API URL BEFORE copying source code
ENV VITE_API_BASE_URL=https://utxo.link/api

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build for production
RUN npm run build

# Production stage
FROM nginx:alpine

# Copy built files
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
