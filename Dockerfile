# ============================================
# EnviroMaster Backend - Production Dockerfile
# ============================================
# Multi-stage build for optimized production image

# Stage 1: Build stage
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY . .

# Remove development files
RUN rm -rf node_modules && npm ci --production --ignore-scripts

# Stage 2: Production stage
FROM node:20-alpine

# Install PM2 globally for production process management
RUN npm install -g pm2@latest

# Create app directory with proper permissions
RUN mkdir -p /app/logs /app/tmp && \
    addgroup -g 1001 nodejs && \
    adduser -S -u 1001 -G nodejs nodejs && \
    chown -R nodejs:nodejs /app

# Set working directory
WORKDIR /app

# Copy only production dependencies from builder
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules

# Copy application code with proper ownership
COPY --chown=nodejs:nodejs . .

# Create necessary directories with proper permissions
RUN mkdir -p logs tmp templates && \
    chown -R nodejs:nodejs logs tmp templates

# Switch to non-root user for security
USER nodejs

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start application with PM2
CMD ["pm2-runtime", "start", "ecosystem.config.cjs"]
