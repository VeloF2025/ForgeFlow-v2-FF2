# Terraform configuration for AWS ElastiCache Redis deployment
# ForgeFlow v2 Production Infrastructure

terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket = "forgeflow-terraform-state"
    key    = "redis/terraform.tfstate"
    region = "us-west-2"
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "ForgeFlow-v2"
      Environment = var.environment
      ManagedBy   = "Terraform"
      Component   = "Redis"
    }
  }
}

# Variables
variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-west-2"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "production"
}

variable "vpc_id" {
  description = "VPC ID where Redis will be deployed"
  type        = string
}

variable "private_subnet_ids" {
  description = "Private subnet IDs for Redis deployment"
  type        = list(string)
}

variable "redis_node_type" {
  description = "ElastiCache node type"
  type        = string
  default     = "cache.r7g.large"
}

variable "redis_num_cache_nodes" {
  description = "Number of cache nodes"
  type        = number
  default     = 3
}

variable "redis_parameter_group_family" {
  description = "Redis parameter group family"
  type        = string
  default     = "redis7.x"
}

variable "backup_retention_limit" {
  description = "Backup retention period in days"
  type        = number
  default     = 5
}

variable "maintenance_window" {
  description = "Maintenance window"
  type        = string
  default     = "sun:05:00-sun:06:00"
}

variable "allowed_cidr_blocks" {
  description = "CIDR blocks allowed to access Redis"
  type        = list(string)
  default     = ["10.0.0.0/8"]
}

# Data sources
data "aws_availability_zones" "available" {
  state = "available"
}

# Security Group for Redis
resource "aws_security_group" "redis" {
  name_prefix = "forgeflow-redis-${var.environment}-"
  vpc_id      = var.vpc_id

  ingress {
    description = "Redis port"
    from_port   = 6379
    to_port     = 6379
    protocol    = "tcp"
    cidr_blocks = var.allowed_cidr_blocks
  }

  ingress {
    description = "Redis TLS port"
    from_port   = 6380
    to_port     = 6380
    protocol    = "tcp"
    cidr_blocks = var.allowed_cidr_blocks
  }

  egress {
    description = "All outbound traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "forgeflow-redis-sg-${var.environment}"
  }

  lifecycle {
    create_before_destroy = true
  }
}

# ElastiCache Subnet Group
resource "aws_elasticache_subnet_group" "redis" {
  name       = "forgeflow-redis-subnet-group-${var.environment}"
  subnet_ids = var.private_subnet_ids

  tags = {
    Name = "forgeflow-redis-subnet-group-${var.environment}"
  }
}

# ElastiCache Parameter Group
resource "aws_elasticache_parameter_group" "redis" {
  family = var.redis_parameter_group_family
  name   = "forgeflow-redis-params-${var.environment}"

  # Performance and security optimizations
  parameter {
    name  = "maxmemory-policy"
    value = "allkeys-lru"
  }

  parameter {
    name  = "notify-keyspace-events"
    value = "Ex"
  }

  parameter {
    name  = "timeout"
    value = "300"
  }

  parameter {
    name  = "tcp-keepalive"
    value = "300"
  }

  parameter {
    name  = "maxmemory-samples"
    value = "10"
  }

  # Enable AOF persistence
  parameter {
    name  = "appendonly"
    value = "yes"
  }

  parameter {
    name  = "appendfsync"
    value = "everysec"
  }

  # Slow log configuration
  parameter {
    name  = "slowlog-log-slower-than"
    value = "10000"
  }

  parameter {
    name  = "slowlog-max-len"
    value = "128"
  }

  tags = {
    Name = "forgeflow-redis-params-${var.environment}"
  }
}

# ElastiCache Replication Group (Redis Cluster)
resource "aws_elasticache_replication_group" "redis" {
  replication_group_id       = "forgeflow-redis-${var.environment}"
  description                = "ForgeFlow v2 Redis cluster for ${var.environment}"

  # Node configuration
  node_type                  = var.redis_node_type
  port                       = 6379
  parameter_group_name       = aws_elasticache_parameter_group.redis.name
  subnet_group_name          = aws_elasticache_subnet_group.redis.name
  security_group_ids         = [aws_security_group.redis.id]

  # Cluster configuration
  num_cache_clusters         = var.redis_num_cache_nodes
  automatic_failover_enabled = true
  multi_az_enabled          = true

  # Engine configuration
  engine_version            = "7.0"
  
  # Security configuration
  at_rest_encryption_enabled   = true
  transit_encryption_enabled   = true
  auth_token_update_strategy   = "ROTATE"
  auth_token                  = random_password.redis_auth_token.result

  # Backup configuration
  backup_retention_limit    = var.backup_retention_limit
  backup_window            = "03:00-04:00"
  maintenance_window       = var.maintenance_window
  
  # Notification configuration
  notification_topic_arn   = aws_sns_topic.redis_notifications.arn

  # Logging configuration
  log_delivery_configuration {
    destination      = aws_cloudwatch_log_group.redis_slow_log.name
    destination_type = "cloudwatch-logs"
    log_format      = "text"
    log_type        = "slow-log"
  }

  tags = {
    Name = "forgeflow-redis-${var.environment}"
  }

  depends_on = [
    aws_cloudwatch_log_group.redis_slow_log
  ]
}

# Random password for Redis AUTH
resource "random_password" "redis_auth_token" {
  length  = 32
  special = true
  
  keepers = {
    # Change this value to force password rotation
    rotation_date = "2024-08-26"
  }
}

# CloudWatch Log Group for Redis slow log
resource "aws_cloudwatch_log_group" "redis_slow_log" {
  name              = "/aws/elasticache/redis/${var.environment}/slow-log"
  retention_in_days = 30

  tags = {
    Name = "forgeflow-redis-slow-log-${var.environment}"
  }
}

# SNS Topic for Redis notifications
resource "aws_sns_topic" "redis_notifications" {
  name = "forgeflow-redis-notifications-${var.environment}"

  tags = {
    Name = "forgeflow-redis-notifications-${var.environment}"
  }
}

# CloudWatch Alarms
resource "aws_cloudwatch_metric_alarm" "redis_cpu_high" {
  alarm_name          = "forgeflow-redis-cpu-high-${var.environment}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ElastiCache"
  period              = "300"
  statistic           = "Average"
  threshold           = "80"
  alarm_description   = "This metric monitors redis cpu utilization"
  alarm_actions       = [aws_sns_topic.redis_notifications.arn]

  dimensions = {
    CacheClusterId = aws_elasticache_replication_group.redis.id
  }

  tags = {
    Name = "forgeflow-redis-cpu-alarm-${var.environment}"
  }
}

resource "aws_cloudwatch_metric_alarm" "redis_memory_high" {
  alarm_name          = "forgeflow-redis-memory-high-${var.environment}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "DatabaseMemoryUsagePercentage"
  namespace           = "AWS/ElastiCache"
  period              = "300"
  statistic           = "Average"
  threshold           = "80"
  alarm_description   = "This metric monitors redis memory usage"
  alarm_actions       = [aws_sns_topic.redis_notifications.arn]

  dimensions = {
    CacheClusterId = aws_elasticache_replication_group.redis.id
  }

  tags = {
    Name = "forgeflow-redis-memory-alarm-${var.environment}"
  }
}

resource "aws_cloudwatch_metric_alarm" "redis_connections_high" {
  alarm_name          = "forgeflow-redis-connections-high-${var.environment}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CurrConnections"
  namespace           = "AWS/ElastiCache"
  period              = "300"
  statistic           = "Average"
  threshold           = "800"
  alarm_description   = "This metric monitors redis connection count"
  alarm_actions       = [aws_sns_topic.redis_notifications.arn]

  dimensions = {
    CacheClusterId = aws_elasticache_replication_group.redis.id
  }

  tags = {
    Name = "forgeflow-redis-connections-alarm-${var.environment}"
  }
}

# IAM Role for Redis Enhanced Monitoring
resource "aws_iam_role" "redis_enhanced_monitoring" {
  name = "forgeflow-redis-enhanced-monitoring-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "monitoring.rds.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name = "forgeflow-redis-enhanced-monitoring-${var.environment}"
  }
}

resource "aws_iam_role_policy_attachment" "redis_enhanced_monitoring" {
  role       = aws_iam_role.redis_enhanced_monitoring.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}

# Systems Manager Parameters for configuration
resource "aws_ssm_parameter" "redis_endpoint" {
  name        = "/forgeflow/${var.environment}/redis/endpoint"
  description = "Redis cluster endpoint"
  type        = "String"
  value       = aws_elasticache_replication_group.redis.configuration_endpoint_address

  tags = {
    Name = "forgeflow-redis-endpoint-${var.environment}"
  }
}

resource "aws_ssm_parameter" "redis_port" {
  name        = "/forgeflow/${var.environment}/redis/port"
  description = "Redis cluster port"
  type        = "String"
  value       = aws_elasticache_replication_group.redis.port

  tags = {
    Name = "forgeflow-redis-port-${var.environment}"
  }
}

resource "aws_ssm_parameter" "redis_auth_token" {
  name        = "/forgeflow/${var.environment}/redis/auth_token"
  description = "Redis authentication token"
  type        = "SecureString"
  value       = random_password.redis_auth_token.result

  tags = {
    Name = "forgeflow-redis-auth-token-${var.environment}"
  }
}

# Outputs
output "redis_endpoint" {
  description = "Redis cluster endpoint"
  value       = aws_elasticache_replication_group.redis.configuration_endpoint_address
}

output "redis_port" {
  description = "Redis cluster port"
  value       = aws_elasticache_replication_group.redis.port
}

output "redis_auth_token" {
  description = "Redis authentication token"
  value       = random_password.redis_auth_token.result
  sensitive   = true
}

output "security_group_id" {
  description = "Redis security group ID"
  value       = aws_security_group.redis.id
}

output "subnet_group_name" {
  description = "Redis subnet group name"
  value       = aws_elasticache_subnet_group.redis.name
}

output "parameter_group_name" {
  description = "Redis parameter group name"
  value       = aws_elasticache_parameter_group.redis.name
}

output "sns_topic_arn" {
  description = "SNS topic ARN for Redis notifications"
  value       = aws_sns_topic.redis_notifications.arn
}

output "cloudwatch_log_group" {
  description = "CloudWatch log group for Redis"
  value       = aws_cloudwatch_log_group.redis_slow_log.name
}