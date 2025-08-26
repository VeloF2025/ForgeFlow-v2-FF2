#!/bin/bash

# Redis Security Hardening Script for ForgeFlow v2
# Implements security best practices for production Redis deployment

set -e

# Configuration
REDIS_USER="redis"
REDIS_GROUP="redis"
REDIS_HOME="/var/lib/redis"
REDIS_CONFIG="/etc/redis/redis.conf"
REDIS_LOG_DIR="/var/log/redis"
TLS_CERT_DIR="/etc/redis/tls"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${GREEN}🛡️  Redis Security Hardening for ForgeFlow v2${NC}"
echo "=============================================="

# Function to check if running as root
check_root() {
    if [[ $EUID -eq 0 ]]; then
        echo -e "${GREEN}✅ Running as root - proceeding with hardening${NC}"
    else
        echo -e "${RED}❌ This script must be run as root${NC}"
        exit 1
    fi
}

# Function to create Redis user and group
setup_redis_user() {
    echo -e "${BLUE}👤 Setting up Redis user and group...${NC}"
    
    # Create redis group
    if ! getent group ${REDIS_GROUP} > /dev/null 2>&1; then
        groupadd -r ${REDIS_GROUP}
        echo -e "${GREEN}✅ Created Redis group: ${REDIS_GROUP}${NC}"
    else
        echo -e "${YELLOW}⚠️  Redis group already exists${NC}"
    fi
    
    # Create redis user
    if ! getent passwd ${REDIS_USER} > /dev/null 2>&1; then
        useradd -r -g ${REDIS_GROUP} -d ${REDIS_HOME} -s /bin/false ${REDIS_USER}
        echo -e "${GREEN}✅ Created Redis user: ${REDIS_USER}${NC}"
    else
        echo -e "${YELLOW}⚠️  Redis user already exists${NC}"
    fi
}

# Function to set up directory permissions
setup_directories() {
    echo -e "${BLUE}📁 Setting up secure directories...${NC}"
    
    # Create directories
    mkdir -p ${REDIS_HOME}
    mkdir -p ${REDIS_LOG_DIR}
    mkdir -p /etc/redis
    mkdir -p ${TLS_CERT_DIR}
    mkdir -p /run/redis
    
    # Set ownership
    chown -R ${REDIS_USER}:${REDIS_GROUP} ${REDIS_HOME}
    chown -R ${REDIS_USER}:${REDIS_GROUP} ${REDIS_LOG_DIR}
    chown -R ${REDIS_USER}:${REDIS_GROUP} /etc/redis
    chown -R ${REDIS_USER}:${REDIS_GROUP} /run/redis
    
    # Set permissions
    chmod 750 ${REDIS_HOME}
    chmod 755 ${REDIS_LOG_DIR}
    chmod 750 /etc/redis
    chmod 700 ${TLS_CERT_DIR}
    chmod 755 /run/redis
    
    echo -e "${GREEN}✅ Directory permissions configured${NC}"
}

# Function to configure Redis systemd service
setup_systemd_service() {
    echo -e "${BLUE}⚙️  Configuring Redis systemd service...${NC}"
    
    cat > /etc/systemd/system/redis-forgeflow.service << EOF
[Unit]
Description=ForgeFlow Redis In-Memory Data Store
After=network.target
Documentation=https://redis.io/documentation

[Service]
Type=notify
ExecStart=/usr/bin/redis-server /etc/redis/redis.conf --supervised systemd
ExecStop=/bin/redis-cli shutdown
TimeoutStopSec=0
Restart=always
RestartSec=1
User=${REDIS_USER}
Group=${REDIS_GROUP}

# Security hardening
NoNewPrivileges=yes
PrivateTmp=yes
PrivateDevices=yes
ProtectHome=yes
ProtectSystem=strict
ReadWritePaths=${REDIS_HOME} ${REDIS_LOG_DIR} /run/redis
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectControlGroups=yes
RestrictRealtime=yes
RestrictNamespaces=yes
LockPersonality=yes
MemoryDenyWriteExecute=yes
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
SystemCallFilter=@system-service
SystemCallErrorNumber=EPERM

# Resource limits
LimitNOFILE=65535
LimitMEMLOCK=0

[Install]
WantedBy=multi-user.target
EOF
    
    systemctl daemon-reload
    echo -e "${GREEN}✅ Systemd service configured${NC}"
}

# Function to configure firewall
setup_firewall() {
    echo -e "${BLUE}🔥 Configuring firewall rules...${NC}"
    
    # Check if UFW is available
    if command -v ufw &> /dev/null; then
        # Allow Redis TLS port from specific networks only
        ufw allow from 10.0.0.0/8 to any port 6380 comment 'Redis TLS'
        ufw allow from 172.16.0.0/12 to any port 6380 comment 'Redis TLS'
        ufw allow from 192.168.0.0/16 to any port 6380 comment 'Redis TLS'
        
        # Allow Sentinel from same networks
        ufw allow from 10.0.0.0/8 to any port 26379 comment 'Redis Sentinel'
        ufw allow from 172.16.0.0/12 to any port 26379 comment 'Redis Sentinel'
        ufw allow from 192.168.0.0/16 to any port 26379 comment 'Redis Sentinel'
        
        echo -e "${GREEN}✅ UFW firewall rules added${NC}"
    elif command -v firewall-cmd &> /dev/null; then
        # FirewallD configuration
        firewall-cmd --permanent --add-rich-rule='rule family="ipv4" source address="10.0.0.0/8" port protocol="tcp" port="6380" accept'
        firewall-cmd --permanent --add-rich-rule='rule family="ipv4" source address="172.16.0.0/12" port protocol="tcp" port="6380" accept'
        firewall-cmd --permanent --add-rich-rule='rule family="ipv4" source address="192.168.0.0/16" port protocol="tcp" port="6380" accept'
        firewall-cmd --reload
        echo -e "${GREEN}✅ FirewallD rules added${NC}"
    else
        echo -e "${YELLOW}⚠️  No supported firewall found. Please configure manually.${NC}"
    fi
}

# Function to set up log rotation
setup_log_rotation() {
    echo -e "${BLUE}📋 Setting up log rotation...${NC}"
    
    cat > /etc/logrotate.d/redis-forgeflow << EOF
${REDIS_LOG_DIR}/*.log {
    daily
    missingok
    rotate 52
    compress
    delaycompress
    notifempty
    create 644 ${REDIS_USER} ${REDIS_GROUP}
    postrotate
        systemctl reload redis-forgeflow || true
    endscript
}
EOF
    
    echo -e "${GREEN}✅ Log rotation configured${NC}"
}

# Function to create monitoring script
create_monitoring_script() {
    echo -e "${BLUE}📊 Creating monitoring script...${NC}"
    
    cat > /usr/local/bin/redis-health-check.sh << 'EOF'
#!/bin/bash

# Redis Health Check Script for ForgeFlow v2
REDIS_CLI="/usr/bin/redis-cli"
REDIS_HOST="localhost"
REDIS_PORT="6380"
REDIS_TLS="--tls --cert /etc/redis/tls/client.crt --key /etc/redis/tls/client.key --cacert /etc/redis/tls/ca.crt"

# Check Redis connectivity
if ! ${REDIS_CLI} -h ${REDIS_HOST} -p ${REDIS_PORT} ${REDIS_TLS} ping > /dev/null 2>&1; then
    echo "CRITICAL: Redis is not responding"
    exit 2
fi

# Check memory usage
MEMORY_USED=$(${REDIS_CLI} -h ${REDIS_HOST} -p ${REDIS_PORT} ${REDIS_TLS} info memory | grep used_memory_human | cut -d: -f2 | tr -d '\r')
MEMORY_MAX=$(${REDIS_CLI} -h ${REDIS_HOST} -p ${REDIS_PORT} ${REDIS_TLS} config get maxmemory | tail -1)

echo "OK: Redis is running. Memory usage: ${MEMORY_USED}"
exit 0
EOF
    
    chmod +x /usr/local/bin/redis-health-check.sh
    chown root:root /usr/local/bin/redis-health-check.sh
    
    echo -e "${GREEN}✅ Health check script created${NC}"
}

# Function to create backup script
create_backup_script() {
    echo -e "${BLUE}💾 Creating backup script...${NC}"
    
    cat > /usr/local/bin/redis-backup.sh << 'EOF'
#!/bin/bash

# Redis Backup Script for ForgeFlow v2
BACKUP_DIR="/var/backups/redis"
DATE=$(date +%Y%m%d_%H%M%S)
REDIS_CLI="/usr/bin/redis-cli"
REDIS_HOST="localhost"
REDIS_PORT="6380"
REDIS_TLS="--tls --cert /etc/redis/tls/client.crt --key /etc/redis/tls/client.key --cacert /etc/redis/tls/ca.crt"
RETENTION_DAYS=7

# Create backup directory
mkdir -p ${BACKUP_DIR}

# Create RDB snapshot
echo "Creating Redis backup: ${DATE}"
${REDIS_CLI} -h ${REDIS_HOST} -p ${REDIS_PORT} ${REDIS_TLS} --rdb ${BACKUP_DIR}/redis_${DATE}.rdb

# Compress backup
gzip ${BACKUP_DIR}/redis_${DATE}.rdb

# Clean old backups
find ${BACKUP_DIR} -name "redis_*.rdb.gz" -mtime +${RETENTION_DAYS} -delete

echo "Backup completed: ${BACKUP_DIR}/redis_${DATE}.rdb.gz"
EOF
    
    chmod +x /usr/local/bin/redis-backup.sh
    chown root:root /usr/local/bin/redis-backup.sh
    
    # Create backup directory
    mkdir -p /var/backups/redis
    chown ${REDIS_USER}:${REDIS_GROUP} /var/backups/redis
    
    # Add to crontab
    echo "0 2 * * * /usr/local/bin/redis-backup.sh" | crontab -u root -
    
    echo -e "${GREEN}✅ Backup script created and scheduled${NC}"
}

# Function to harden kernel parameters
harden_kernel_parameters() {
    echo -e "${BLUE}⚙️  Hardening kernel parameters...${NC}"
    
    cat >> /etc/sysctl.conf << EOF

# Redis Performance and Security Tuning
vm.overcommit_memory = 1
net.core.somaxconn = 65535
net.ipv4.tcp_max_syn_backlog = 65535
net.core.netdev_max_backlog = 5000
net.ipv4.tcp_fin_timeout = 30
net.ipv4.tcp_keepalive_time = 1200
net.ipv4.tcp_syncookies = 1
net.ipv4.conf.all.rp_filter = 1
net.ipv4.conf.all.accept_source_route = 0
net.ipv4.icmp_echo_ignore_broadcasts = 1
kernel.dmesg_restrict = 1
EOF
    
    sysctl -p
    echo -e "${GREEN}✅ Kernel parameters configured${NC}"
}

# Function to create security audit script
create_security_audit() {
    echo -e "${BLUE}🔍 Creating security audit script...${NC}"
    
    cat > /usr/local/bin/redis-security-audit.sh << 'EOF'
#!/bin/bash

# Redis Security Audit Script for ForgeFlow v2
echo "Redis Security Audit Report - $(date)"
echo "======================================"

# Check Redis process user
REDIS_PROCESS_USER=$(ps aux | grep redis-server | grep -v grep | awk '{print $1}' | head -1)
echo "Redis Process User: ${REDIS_PROCESS_USER}"

# Check file permissions
echo -e "\nFile Permissions:"
ls -la /etc/redis/
ls -la /etc/redis/tls/

# Check listening ports
echo -e "\nListening Ports:"
netstat -tlnp | grep redis

# Check Redis configuration
echo -e "\nRedis Security Configuration:"
redis-cli --tls --cert /etc/redis/tls/client.crt --key /etc/redis/tls/client.key --cacert /etc/redis/tls/ca.crt config get "*auth*"
redis-cli --tls --cert /etc/redis/tls/client.crt --key /etc/redis/tls/client.key --cacert /etc/redis/tls/ca.crt config get "protected-mode"
redis-cli --tls --cert /etc/redis/tls/client.crt --key /etc/redis/tls/client.key --cacert /etc/redis/tls/ca.crt config get "bind"

# Check systemd security features
echo -e "\nSystemd Security Features:"
systemctl show redis-forgeflow | grep -E "(NoNewPrivileges|PrivateTmp|ProtectSystem|ProtectHome)"

echo -e "\nAudit completed."
EOF
    
    chmod +x /usr/local/bin/redis-security-audit.sh
    chown root:root /usr/local/bin/redis-security-audit.sh
    
    echo -e "${GREEN}✅ Security audit script created${NC}"
}

# Main execution
main() {
    echo -e "${BLUE}Starting Redis security hardening...${NC}"
    
    check_root
    setup_redis_user
    setup_directories
    setup_systemd_service
    setup_firewall
    setup_log_rotation
    create_monitoring_script
    create_backup_script
    harden_kernel_parameters
    create_security_audit
    
    echo -e "\n${GREEN}🎉 Redis security hardening completed!${NC}"
    echo -e "\n${YELLOW}Next steps:${NC}"
    echo -e "1. Generate TLS certificates: ./generate-tls-certs.sh"
    echo -e "2. Configure Redis with your specific settings"
    echo -e "3. Start Redis service: systemctl start redis-forgeflow"
    echo -e "4. Run security audit: /usr/local/bin/redis-security-audit.sh"
    echo -e "5. Test backup: /usr/local/bin/redis-backup.sh"
    echo -e "6. Monitor health: /usr/local/bin/redis-health-check.sh"
    echo -e "\n${RED}⚠️  Don't forget to:${NC}"
    echo -e "- Set strong passwords for Redis ACL users"
    echo -e "- Configure proper network segmentation"
    echo -e "- Set up monitoring and alerting"
    echo -e "- Regularly rotate TLS certificates"
}

# Run main function
main "$@"