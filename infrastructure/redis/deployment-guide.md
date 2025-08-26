# Redis Deployment Guide for ForgeFlow v2

Complete deployment guide for production-ready Redis infrastructure supporting team collaboration.

## 🎯 Deployment Options

### 1. Local Development
**Use Case**: Development and testing
**Resources**: 4GB RAM, 2 CPU cores
**Components**: Redis master + 2 replicas, basic monitoring

### 2. Staging Environment  
**Use Case**: Pre-production testing
**Resources**: 8GB RAM, 4 CPU cores
**Components**: Full HA setup with Sentinel, monitoring, backups

### 3. Production Environment
**Use Case**: Live ForgeFlow v2 deployment
**Resources**: 16GB+ RAM, 8+ CPU cores
**Components**: Multi-node HA, full monitoring, security hardening

---

## 🚀 Development Deployment

### Prerequisites
```bash
# Required software
- Docker 20.10+
- Docker Compose 1.29+
- 4GB available RAM
- 10GB available disk space
```

### Step 1: Environment Setup
```bash
# Clone repository
git clone <forgeflow-repo>
cd infrastructure/redis

# Configure environment
cp docker/.env.example docker/.env
nano docker/.env  # Edit with your settings
```

### Step 2: Start Redis Cluster
```bash
# Start Redis services
docker-compose -f docker/docker-compose.redis.yml up -d

# Verify services
docker ps | grep forgeflow-redis
```

### Step 3: Enable Monitoring (Optional)
```bash
# Start monitoring stack
docker-compose -f monitoring/docker-compose.monitoring.yml up -d

# Access dashboards
open http://localhost:3001  # Grafana
open http://localhost:9090  # Prometheus
```

### Step 4: Test Connection
```bash
# Test Redis connectivity
redis-cli -h localhost -p 6379 -a $(grep REDIS_PASSWORD docker/.env | cut -d= -f2) ping

# Expected output: PONG
```

---

## 🏢 Staging Deployment

### Prerequisites
```bash
# Infrastructure requirements
- Ubuntu 20.04+ or RHEL 8+
- 8GB RAM, 4 CPU cores
- 50GB SSD storage
- Network access to Redis ports (6379, 26379)
```

### Step 1: System Preparation
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Install Redis CLI
sudo apt install redis-tools -y
```

### Step 2: Security Hardening
```bash
# Run security hardening script
sudo ./scripts/redis-security-hardening.sh

# Generate TLS certificates
./security/generate-tls-certs.sh

# Configure firewall
sudo ufw allow 6379/tcp comment 'Redis'
sudo ufw allow 26379/tcp comment 'Redis Sentinel'
sudo ufw enable
```

### Step 3: Deploy Redis Infrastructure
```bash
# Set environment variables
export REDIS_PASSWORD=$(openssl rand -base64 32)
export REDIS_ADMIN_PASSWORD=$(openssl rand -base64 32)

# Start services with production configuration
docker-compose -f docker/docker-compose.redis.yml \
               -f monitoring/docker-compose.monitoring.yml \
               up -d
```

### Step 4: Configure Monitoring
```bash
# Set up Grafana dashboards
curl -X POST \
  http://admin:$GRAFANA_PASSWORD@localhost:3001/api/dashboards/db \
  -H 'Content-Type: application/json' \
  -d @monitoring/dashboards/redis-overview.json

# Configure alerts
curl -X POST \
  http://admin:$GRAFANA_PASSWORD@localhost:3001/api/alert-notifications \
  -H 'Content-Type: application/json' \
  -d @monitoring/alert-channels/slack.json
```

---

## 🎯 Production Deployment (Kubernetes)

### Prerequisites
```bash
# Infrastructure requirements
- Kubernetes cluster 1.20+
- 3+ worker nodes with 16GB+ RAM each
- High-performance SSD storage class
- Load balancer capability
- Monitoring infrastructure (Prometheus/Grafana)
```

### Step 1: Cluster Preparation
```bash
# Create namespace
kubectl apply -f kubernetes/namespace.yaml

# Verify storage classes
kubectl get storageclass

# If no fast SSD class exists, create one:
kubectl apply -f - <<EOF
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: fast-ssd
provisioner: kubernetes.io/gce-pd
parameters:
  type: pd-ssd
  replication-type: regional-pd
reclaimPolicy: Retain
allowVolumeExpansion: true
EOF
```

### Step 2: Security Configuration
```bash
# Generate TLS certificates
./security/generate-tls-certs.sh

# Create TLS secret
kubectl create secret generic redis-tls \
  --from-file=security/tls/ \
  -n forgeflow-redis

# Update passwords in secret
kubectl apply -f kubernetes/redis-secret.yaml
```

### Step 3: Deploy Redis Infrastructure
```bash
# Deploy in order (dependencies matter)
kubectl apply -f kubernetes/redis-configmap.yaml
kubectl apply -f kubernetes/redis-secret.yaml
kubectl apply -f kubernetes/redis-master.yaml

# Wait for master to be ready
kubectl wait --for=condition=ready pod -l app.kubernetes.io/component=master -n forgeflow-redis --timeout=300s

# Deploy replicas
kubectl apply -f kubernetes/redis-replica.yaml

# Deploy sentinels
kubectl apply -f kubernetes/redis-sentinel.yaml
```

### Step 4: Verify Deployment
```bash
# Check all pods are running
kubectl get pods -n forgeflow-redis

# Test Redis connectivity
kubectl exec -it redis-master-0 -n forgeflow-redis -- redis-cli ping

# Check replication status
kubectl exec -it redis-master-0 -n forgeflow-redis -- redis-cli info replication
```

### Step 5: Configure Load Balancer
```bash
# Create load balancer service
kubectl apply -f - <<EOF
apiVersion: v1
kind: Service
metadata:
  name: redis-lb
  namespace: forgeflow-redis
spec:
  type: LoadBalancer
  selector:
    app.kubernetes.io/name: redis
    app.kubernetes.io/component: master
  ports:
  - port: 6379
    targetPort: 6379
    name: redis
  - port: 26379
    targetPort: 26379
    name: sentinel
EOF
```

---

## 🔧 Configuration Management

### Environment-Specific Configurations

#### Development
```yaml
# redis-dev.conf
maxmemory 512mb
save 900 1
appendonly no
tcp-keepalive 60
```

#### Staging
```yaml
# redis-staging.conf
maxmemory 2gb
save 900 1 300 10 60 10000
appendonly yes
appendfsync everysec
tcp-keepalive 300
```

#### Production
```yaml
# redis-prod.conf
maxmemory 8gb
save 900 1 300 10 60 10000
appendonly yes
appendfsync everysec
aof-use-rdb-preamble yes
tcp-keepalive 300
notify-keyspace-events Ex
```

### ForgeFlow Integration Configuration

```typescript
// config/redis.ts
export const getRedisConfig = (environment: string): RedisConnectionConfig => {
  const baseConfig = {
    password: process.env.REDIS_PASSWORD,
    commandTimeout: 5000,
    connectTimeout: 10000,
    maxRetriesPerRequest: 3,
    retryDelayOnFailover: 100,
    keepAlive: 30000
  };

  switch (environment) {
    case 'development':
      return {
        ...baseConfig,
        host: 'localhost',
        port: 6379
      };
    
    case 'staging':
      return {
        ...baseConfig,
        sentinels: [
          { host: 'redis-sentinel-1', port: 26379 },
          { host: 'redis-sentinel-2', port: 26379 },
          { host: 'redis-sentinel-3', port: 26379 }
        ],
        name: 'forgeflow-master'
      };
    
    case 'production':
      return {
        ...baseConfig,
        sentinels: [
          { host: 'redis-sentinel-1.forgeflow-redis.svc.cluster.local', port: 26379 },
          { host: 'redis-sentinel-2.forgeflow-redis.svc.cluster.local', port: 26379 },
          { host: 'redis-sentinel-3.forgeflow-redis.svc.cluster.local', port: 26379 }
        ],
        name: 'forgeflow-master',
        tls: {
          cert: fs.readFileSync('/etc/redis/tls/client.crt'),
          key: fs.readFileSync('/etc/redis/tls/client.key'),
          ca: fs.readFileSync('/etc/redis/tls/ca.crt')
        }
      };
  }
};
```

---

## 📊 Performance Tuning

### Memory Optimization
```bash
# System-level optimizations
echo 'vm.overcommit_memory = 1' >> /etc/sysctl.conf
echo 'net.core.somaxconn = 65535' >> /etc/sysctl.conf
sysctl -p

# Redis-specific tuning
redis-cli config set maxmemory-policy allkeys-lru
redis-cli config set maxmemory-samples 10
redis-cli config set hash-max-ziplist-entries 512
redis-cli config set hash-max-ziplist-value 64
```

### Network Optimization
```bash
# TCP tuning for Redis
echo 'net.ipv4.tcp_keepalive_time = 1200' >> /etc/sysctl.conf
echo 'net.ipv4.tcp_keepalive_probes = 3' >> /etc/sysctl.conf
echo 'net.ipv4.tcp_keepalive_intvl = 75' >> /etc/sysctl.conf
echo 'net.core.netdev_max_backlog = 5000' >> /etc/sysctl.conf
sysctl -p
```

### Disk I/O Optimization
```bash
# For SSD storage
echo deadline > /sys/block/sda/queue/scheduler
echo 1 > /sys/block/sda/queue/nomerges

# Mount options for Redis data directory
mount -o noatime,nodiratime /dev/sdb1 /var/lib/redis
```

---

## 🧪 Deployment Validation

### Automated Testing Script
```bash
#!/bin/bash
# deployment-test.sh

set -e

echo "🧪 Running Redis deployment validation..."

# Test 1: Basic connectivity
echo "Testing basic connectivity..."
redis-cli -h $REDIS_HOST -p $REDIS_PORT -a $REDIS_PASSWORD ping

# Test 2: Replication status
echo "Checking replication..."
REPLICA_COUNT=$(redis-cli -h $REDIS_HOST -p $REDIS_PORT -a $REDIS_PASSWORD info replication | grep connected_slaves | cut -d: -f2)
if [ "$REPLICA_COUNT" -ge 2 ]; then
    echo "✅ Replication: $REPLICA_COUNT replicas connected"
else
    echo "❌ Replication: Only $REPLICA_COUNT replicas connected"
    exit 1
fi

# Test 3: Sentinel connectivity
echo "Testing Sentinel..."
for i in {1..3}; do
    redis-cli -h redis-sentinel-$i -p 26379 ping
done

# Test 4: Performance benchmark
echo "Running performance test..."
redis-benchmark -h $REDIS_HOST -p $REDIS_PORT -a $REDIS_PASSWORD -c 50 -n 10000 -q

# Test 5: TLS connectivity (if enabled)
if [ "$REDIS_TLS_ENABLED" = "true" ]; then
    echo "Testing TLS connectivity..."
    redis-cli --tls --cert /etc/redis/tls/client.crt --key /etc/redis/tls/client.key --cacert /etc/redis/tls/ca.crt -h $REDIS_HOST -p 6380 ping
fi

# Test 6: Distributed locking
echo "Testing distributed locking..."
node scripts/test-distributed-locks.js

echo "🎉 All deployment tests passed!"
```

### Health Check Endpoints
```bash
# Create health check service
kubectl apply -f - <<EOF
apiVersion: v1
kind: Service
metadata:
  name: redis-health
  namespace: forgeflow-redis
spec:
  selector:
    app.kubernetes.io/name: redis
    app.kubernetes.io/component: master
  ports:
  - port: 8080
    targetPort: 8080
    name: health
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: redis-health-check
  namespace: forgeflow-redis
spec:
  replicas: 1
  selector:
    matchLabels:
      app: redis-health-check
  template:
    metadata:
      labels:
        app: redis-health-check
    spec:
      containers:
      - name: health-check
        image: nginx:alpine
        ports:
        - containerPort: 8080
        livenessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 8080
          initialDelaySeconds: 5
          periodSeconds: 5
EOF
```

---

## 🚨 Troubleshooting

### Common Issues

#### 1. Connection Refused
```bash
# Check if Redis is running
docker ps | grep redis
kubectl get pods -n forgeflow-redis

# Check port binding
netstat -tlnp | grep 6379

# Check firewall
sudo ufw status
iptables -L
```

#### 2. Memory Issues
```bash
# Check memory usage
redis-cli info memory
docker stats

# Check system memory
free -h
df -h
```

#### 3. Replication Lag
```bash
# Check replication status on master
redis-cli -h master info replication

# Check replication status on replica
redis-cli -h replica info replication

# Monitor replication lag
redis-cli --latency-dist -i 1 -h replica
```

#### 4. Sentinel Issues
```bash
# Check Sentinel status
redis-cli -p 26379 sentinel masters

# Check Sentinel configuration
redis-cli -p 26379 sentinel get-master-addr-by-name forgeflow-master

# Test failover
redis-cli -p 26379 sentinel failover forgeflow-master
```

### Log Analysis
```bash
# Docker logs
docker logs forgeflow-redis-master
docker logs forgeflow-redis-sentinel-1

# Kubernetes logs
kubectl logs redis-master-0 -n forgeflow-redis
kubectl logs redis-sentinel-0 -n forgeflow-redis

# System logs
journalctl -u redis-forgeflow -f
tail -f /var/log/redis/redis-server.log
```

---

## 📋 Post-Deployment Checklist

### Immediate (0-24 hours)
- [ ] All services running and healthy
- [ ] Basic connectivity tests passing
- [ ] Replication working correctly
- [ ] Monitoring dashboards populated
- [ ] Backup system operational
- [ ] Alert rules triggering correctly

### Short-term (1-7 days)
- [ ] Performance baselines established
- [ ] Security audit completed
- [ ] Documentation updated
- [ ] Team training completed
- [ ] Disaster recovery tested
- [ ] Scaling tests performed

### Long-term (1-4 weeks)
- [ ] Capacity planning reviewed
- [ ] Performance optimization completed
- [ ] Security policies enforced
- [ ] Operational runbooks validated
- [ ] Compliance requirements met
- [ ] Cost optimization implemented

---

## 🎓 Training & Documentation

### Team Training Materials
- [Redis Administration Basics](docs/training/redis-admin.md)
- [ForgeFlow Integration Guide](docs/training/forgeflow-integration.md)
- [Troubleshooting Workshop](docs/training/troubleshooting.md)
- [Security Best Practices](docs/training/security.md)

### Operational Documentation
- [Daily Operations Guide](docs/operations/daily-ops.md)
- [Emergency Response Procedures](docs/operations/emergency.md)
- [Maintenance Schedules](docs/operations/maintenance.md)
- [Performance Optimization](docs/operations/performance.md)

---

For additional support, refer to the main [README.md](README.md) or contact the DevOps team.