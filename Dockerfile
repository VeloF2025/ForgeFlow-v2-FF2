# Multi-stage build for ForgeFlow v2
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY src ./src

# Build the application
RUN npm run build

# Production stage
FROM node:20-alpine

# Install git for worktree operations
RUN apk add --no-cache git openssh-client

# Create non-root user
RUN addgroup -g 1001 -S forgeflow && \
    adduser -S forgeflow -u 1001

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production && \
    npm cache clean --force

# Copy built application from builder
COPY --from=builder /app/dist ./dist

# Copy configuration files
COPY forgeflow.yaml ./
COPY .env.example ./.env.example

# Create necessary directories
RUN mkdir -p logs .worktrees && \
    chown -R forgeflow:forgeflow /app

# Switch to non-root user
USER forgeflow

# Expose ports
EXPOSE 3000 9090

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {r.statusCode === 200 ? process.exit(0) : process.exit(1)})"

# Start the application
CMD ["node", "dist/index.js"]