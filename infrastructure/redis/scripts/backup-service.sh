#!/bin/bash

# Redis Automated Backup Service for ForgeFlow v2
# Handles RDB snapshots, compression, encryption, and cloud storage

set -e

# Configuration from environment variables
REDIS_HOST=${REDIS_HOST:-localhost}
REDIS_PORT=${REDIS_PORT:-6379}
REDIS_PASSWORD=${REDIS_PASSWORD}
BACKUP_DIR=${BACKUP_DIR:-/backups}
BACKUP_SCHEDULE=${BACKUP_SCHEDULE:-"0 2 * * *"}
BACKUP_RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-7}
ENCRYPTION_KEY=${BACKUP_ENCRYPTION_KEY}
S3_BUCKET=${S3_BUCKET}
SLACK_WEBHOOK=${SLACK_WEBHOOK}
HEALTH_CHECK_URL=${HEALTH_CHECK_URL}

# Internal variables
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="redis_backup_${TIMESTAMP}"
LOG_FILE="/var/log/redis-backup.log"

# Colors for logging
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Logging function
log() {
    local level=$1
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    case $level in
        INFO)  color=$GREEN ;;
        WARN)  color=$YELLOW ;;
        ERROR) color=$RED ;;
        *)     color=$NC ;;
    esac
    
    echo -e "${color}[$timestamp] [$level] $message${NC}" | tee -a "$LOG_FILE"
}

# Health check ping
ping_health_check() {
    if [[ -n "$HEALTH_CHECK_URL" ]]; then
        curl -fsS -m 10 --retry 3 "$HEALTH_CHECK_URL" > /dev/null 2>&1 || true
    fi
}

# Send Slack notification
send_slack_notification() {
    local status=$1
    local message=$2
    
    if [[ -n "$SLACK_WEBHOOK" ]]; then
        local payload="{\"text\":\"Redis Backup $status: $message\", \"username\":\"Redis Backup Bot\"}"
        curl -X POST -H 'Content-type: application/json' --data "$payload" "$SLACK_WEBHOOK" > /dev/null 2>&1 || true
    fi
}

# Check prerequisites
check_prerequisites() {
    log INFO "Checking prerequisites..."
    
    # Check if redis-cli is available
    if ! command -v redis-cli &> /dev/null; then
        log ERROR "redis-cli is not installed"
        exit 1
    fi
    
    # Check if backup directory exists
    mkdir -p "$BACKUP_DIR"
    
    # Check Redis connectivity
    if ! redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -a "$REDIS_PASSWORD" ping > /dev/null 2>&1; then
        log ERROR "Cannot connect to Redis at $REDIS_HOST:$REDIS_PORT"
        send_slack_notification "FAILED" "Cannot connect to Redis"
        exit 1
    fi
    
    log INFO "Prerequisites check passed"
}

# Create Redis backup
create_backup() {
    log INFO "Starting Redis backup creation..."
    
    local backup_path="$BACKUP_DIR/$BACKUP_FILE.rdb"
    
    # Create RDB snapshot
    log INFO "Triggering BGSAVE..."
    if ! redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -a "$REDIS_PASSWORD" BGSAVE > /dev/null 2>&1; then
        log ERROR "Failed to trigger BGSAVE"
        send_slack_notification "FAILED" "BGSAVE command failed"
        return 1
    fi
    
    # Wait for background save to complete
    log INFO "Waiting for background save to complete..."
    while true; do
        local last_save=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -a "$REDIS_PASSWORD" LASTSAVE 2>/dev/null)
        local current_time=$(date +%s)
        
        # If LASTSAVE is within the last 60 seconds, backup is likely fresh
        if (( current_time - last_save < 60 )); then
            break
        fi
        
        sleep 5
    done
    
    # Copy RDB file from Redis data directory (assumes volume mount)
    if docker cp "forgeflow-redis-master:/data/dump.rdb" "$backup_path" 2>/dev/null; then
        log INFO "RDB file copied successfully"
    else
        log WARN "Direct copy failed, using redis-cli --rdb"
        redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -a "$REDIS_PASSWORD" --rdb "$backup_path"
    fi
    
    if [[ ! -f "$backup_path" ]]; then
        log ERROR "Backup file was not created"
        send_slack_notification "FAILED" "Backup file creation failed"
        return 1
    fi
    
    local backup_size=$(stat -f%z "$backup_path" 2>/dev/null || stat -c%s "$backup_path")
    log INFO "Backup created: $backup_path (${backup_size} bytes)"
    
    return 0
}

# Compress backup
compress_backup() {
    log INFO "Compressing backup..."
    
    local backup_path="$BACKUP_DIR/$BACKUP_FILE.rdb"
    local compressed_path="$BACKUP_DIR/$BACKUP_FILE.rdb.gz"
    
    if gzip "$backup_path"; then
        log INFO "Backup compressed: $compressed_path"
        
        # Update backup file path
        BACKUP_FILE="${BACKUP_FILE}.rdb.gz"
        return 0
    else
        log ERROR "Failed to compress backup"
        return 1
    fi
}

# Encrypt backup (optional)
encrypt_backup() {
    if [[ -z "$ENCRYPTION_KEY" ]]; then
        log INFO "No encryption key provided, skipping encryption"
        return 0
    fi
    
    log INFO "Encrypting backup..."
    
    local backup_path="$BACKUP_DIR/$BACKUP_FILE"
    local encrypted_path="$BACKUP_DIR/$BACKUP_FILE.enc"
    
    if openssl enc -aes-256-cbc -salt -in "$backup_path" -out "$encrypted_path" -pass pass:"$ENCRYPTION_KEY"; then
        rm "$backup_path"
        BACKUP_FILE="${BACKUP_FILE}.enc"
        log INFO "Backup encrypted: $encrypted_path"
        return 0
    else
        log ERROR "Failed to encrypt backup"
        return 1
    fi
}

# Upload to cloud storage
upload_to_cloud() {
    if [[ -z "$S3_BUCKET" ]]; then
        log INFO "No S3 bucket configured, skipping cloud upload"
        return 0
    fi
    
    log INFO "Uploading backup to S3..."
    
    local backup_path="$BACKUP_DIR/$BACKUP_FILE"
    local s3_key="redis-backups/$(date +%Y/%m/%d)/$BACKUP_FILE"
    
    if aws s3 cp "$backup_path" "s3://$S3_BUCKET/$s3_key" --storage-class STANDARD_IA; then
        log INFO "Backup uploaded to S3: s3://$S3_BUCKET/$s3_key"
        
        # Record backup metadata
        local metadata_file="$BACKUP_DIR/backup_metadata.json"
        local backup_info="{\"timestamp\":\"$TIMESTAMP\",\"file\":\"$BACKUP_FILE\",\"s3_key\":\"$s3_key\",\"size\":$(stat -f%z "$backup_path" 2>/dev/null || stat -c%s "$backup_path")}"
        echo "$backup_info" >> "$metadata_file"
        
        return 0
    else
        log ERROR "Failed to upload backup to S3"
        return 1
    fi
}

# Cleanup old backups
cleanup_old_backups() {
    log INFO "Cleaning up old backups (retention: ${BACKUP_RETENTION_DAYS} days)..."
    
    # Local cleanup
    find "$BACKUP_DIR" -name "redis_backup_*.rdb*" -mtime +"$BACKUP_RETENTION_DAYS" -delete
    local deleted_count=$(find "$BACKUP_DIR" -name "redis_backup_*.rdb*" -mtime +"$BACKUP_RETENTION_DAYS" 2>/dev/null | wc -l)
    
    if (( deleted_count > 0 )); then
        log INFO "Deleted $deleted_count old local backups"
    fi
    
    # S3 cleanup (if configured)
    if [[ -n "$S3_BUCKET" ]]; then
        local cutoff_date=$(date -d "-${BACKUP_RETENTION_DAYS} days" +%Y-%m-%d)
        aws s3 ls "s3://$S3_BUCKET/redis-backups/" --recursive | \
        awk -v cutoff="$cutoff_date" '$1 < cutoff {print $4}' | \
        while read -r key; do
            aws s3 rm "s3://$S3_BUCKET/$key"
            log INFO "Deleted old S3 backup: $key"
        done
    fi
}

# Verify backup integrity
verify_backup() {
    log INFO "Verifying backup integrity..."
    
    local backup_path="$BACKUP_DIR/$BACKUP_FILE"
    
    # Check if file exists and is not empty
    if [[ ! -s "$backup_path" ]]; then
        log ERROR "Backup file is empty or missing"
        return 1
    fi
    
    # For compressed files, test the archive
    if [[ "$BACKUP_FILE" == *.gz ]]; then
        if gzip -t "$backup_path"; then
            log INFO "Backup compression integrity verified"
        else
            log ERROR "Backup compression integrity check failed"
            return 1
        fi
    fi
    
    # For encrypted files, we can't easily verify without decryption
    if [[ "$BACKUP_FILE" == *.enc ]]; then
        log INFO "Backup is encrypted (integrity check skipped)"
    fi
    
    return 0
}

# Generate backup report
generate_report() {
    local status=$1
    local backup_path="$BACKUP_DIR/$BACKUP_FILE"
    
    log INFO "Generating backup report..."
    
    local report_file="$BACKUP_DIR/backup_report_${TIMESTAMP}.json"
    local backup_size=0
    
    if [[ -f "$backup_path" ]]; then
        backup_size=$(stat -f%z "$backup_path" 2>/dev/null || stat -c%s "$backup_path")
    fi
    
    cat > "$report_file" << EOF
{
    "timestamp": "$TIMESTAMP",
    "status": "$status",
    "backup_file": "$BACKUP_FILE",
    "backup_size": $backup_size,
    "redis_host": "$REDIS_HOST",
    "redis_port": $REDIS_PORT,
    "s3_bucket": "$S3_BUCKET",
    "retention_days": $BACKUP_RETENTION_DAYS,
    "encrypted": $([ -n "$ENCRYPTION_KEY" ] && echo "true" || echo "false"),
    "cloud_uploaded": $([ -n "$S3_BUCKET" ] && echo "true" || echo "false")
}
EOF
    
    log INFO "Backup report saved: $report_file"
}

# Main backup function
perform_backup() {
    log INFO "Starting Redis backup process..."
    local start_time=$(date +%s)
    
    if check_prerequisites && \
       create_backup && \
       compress_backup && \
       encrypt_backup && \
       verify_backup && \
       upload_to_cloud; then
        
        cleanup_old_backups
        
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        
        log INFO "Backup completed successfully in ${duration} seconds"
        generate_report "SUCCESS"
        send_slack_notification "SUCCESS" "Backup completed in ${duration}s"
        ping_health_check
        
        return 0
    else
        log ERROR "Backup process failed"
        generate_report "FAILED"
        send_slack_notification "FAILED" "Backup process encountered errors"
        
        return 1
    fi
}

# Schedule backups using cron
setup_scheduler() {
    log INFO "Setting up backup scheduler with cron..."
    
    # Create cron job
    echo "$BACKUP_SCHEDULE /backup-service.sh backup" | crontab -
    
    # Start cron daemon
    crond -f &
    
    log INFO "Backup scheduler started with schedule: $BACKUP_SCHEDULE"
}

# Main execution
main() {
    case "${1:-backup}" in
        "backup")
            perform_backup
            ;;
        "schedule")
            setup_scheduler
            # Keep container running
            tail -f /dev/null
            ;;
        "test")
            check_prerequisites
            log INFO "Prerequisites test completed"
            ;;
        *)
            echo "Usage: $0 {backup|schedule|test}"
            exit 1
            ;;
    esac
}

# Install required packages if running in Alpine
if command -v apk &> /dev/null; then
    apk add --no-cache redis aws-cli curl openssl dcron
fi

# Create log directory
mkdir -p "$(dirname "$LOG_FILE")"

# Run main function
main "$@"