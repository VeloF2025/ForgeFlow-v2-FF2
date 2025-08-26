#!/bin/bash
# FF2 Redis Development Setup Script

echo "🚀 Setting up Redis backend for FF2 team collaboration..."

# Create infrastructure directories
mkdir -p infrastructure/redis/{config,security,scripts,monitoring}
mkdir -p infrastructure/docker

# Create Redis configuration
cat > infrastructure/redis/config/redis.conf << 'EOF'
# FF2 Team Collaboration Redis Configuration
port 6379
bind 127.0.0.1
protected-mode yes
requirepass ff2_team_redis_2024

# Memory optimization
maxmemory 2gb
maxmemory-policy allkeys-lru

# Persistence for team data
save 900 1
save 300 10
save 60 10000

# Append-only file for durability
appendonly yes
appendfsync everysec

# Performance tuning
tcp-keepalive 300
timeout 0
tcp-backlog 511

# Logging
loglevel notice
logfile "/var/log/redis/redis-server.log"
EOF

# Create Docker Compose for development
cat > infrastructure/docker/docker-compose.redis.yml << 'EOF'
version: '3.8'

services:
  redis:
    image: redis:7-alpine
    container_name: ff2-redis
    ports:
      - "6379:6379"
    volumes:
      - ../redis/config/redis.conf:/usr/local/etc/redis/redis.conf
      - redis_data:/data
    command: redis-server /usr/local/etc/redis/redis.conf
    restart: unless-stopped
    networks:
      - ff2-network

  redis-commander:
    image: rediscommander/redis-commander:latest
    container_name: ff2-redis-commander
    environment:
      - REDIS_HOSTS=redis:ff2-redis:6379:0:ff2_team_redis_2024
    ports:
      - "8081:8081"
    depends_on:
      - redis
    networks:
      - ff2-network

volumes:
  redis_data:

networks:
  ff2-network:
    driver: bridge
EOF

# Create environment configuration
cat > .env.redis << 'EOF'
# FF2 Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=ff2_team_redis_2024
REDIS_DB=0

# Team collaboration settings
REDIS_SESSION_TTL=86400
REDIS_LOCK_TTL=300
REDIS_MAX_CONNECTIONS=50
REDIS_CONNECTION_TIMEOUT=5000

# Monitoring
REDIS_METRICS_ENABLED=true
REDIS_LOG_LEVEL=info
EOF

echo "✅ Redis configuration files created!"

# Start Redis development environment
echo "🔄 Starting Redis development environment..."
cd infrastructure/docker
docker-compose -f docker-compose.redis.yml up -d

# Wait for Redis to start
sleep 5

# Test Redis connection
echo "🧪 Testing Redis connection..."
if redis-cli -h localhost -p 6379 -a ff2_team_redis_2024 ping | grep -q PONG; then
    echo "✅ Redis is running and accessible!"
    echo "🌐 Redis Commander: http://localhost:8081 (username: admin, password: admin123)"
else
    echo "❌ Redis connection failed. Check Docker logs:"
    docker-compose -f docker-compose.redis.yml logs redis
fi

echo "🎉 Redis backend setup complete!"
echo "📝 Environment file created: .env.redis"
echo "🐳 Redis running in Docker on port 6379"