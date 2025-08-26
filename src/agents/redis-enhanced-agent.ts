import { randomUUID } from 'crypto';
import * as Redis from 'ioredis';
import type { Agent } from '../types';
import { LogContext } from '@utils/logger';
import { BaseAgent } from './base-agent';

// Redis configuration from environment
const REDIS_CONFIG = {
  host: process.env.REDIS_HOST || 'redis-13065.c92.us-east-1-3.ec2.redns.redis-cloud.com',
  port: parseInt(process.env.REDIS_PORT || '13065'),
  password: process.env.REDIS_PASSWORD || 'lycNeaCgCZMo9i8fQgTiAlRPwxKQgaYV'
};

const TEAM_ID = process.env.FF2_TEAM_ID || 'team_1756204152746';

/**
 * Enhanced Base Agent with Redis integration
 * Automatically broadcasts status, progress, and notifications to team
 */
export abstract class RedisEnhancedAgent extends BaseAgent {
  private redis?: Redis.Redis;
  private publisher?: Redis.Redis;
  private taskStartTime?: number;
  private metricsKey: string;
  
  constructor(type: string, capabilities: string[]) {
    super(type, capabilities);
    this.metricsKey = `ff2:agents:${this.id}:metrics`;
    this.initializeRedis();
  }
  
  private async initializeRedis(): Promise<void> {
    try {
      this.redis = new Redis.Redis(REDIS_CONFIG);
      this.publisher = new Redis.Redis(REDIS_CONFIG);
      
      // Register agent in Redis
      await this.redis.hset('ff2:agents:registry', this.id, JSON.stringify({
        id: this.id,
        type: this.type,
        capabilities: this.capabilities,
        status: this.status,
        startedAt: new Date().toISOString()
      }));
      
      this.logger.info(`Redis connection established for agent ${this.id}`);
    } catch (error) {
      this.logger.warn('Redis connection failed, agent will work in offline mode', error);
    }
  }
  
  protected async preExecute(issueId: string, worktreeId: string): Promise<void> {
    super.preExecute(issueId, worktreeId);
    this.taskStartTime = Date.now();
    
    // Broadcast to Redis
    await this.publishStatus('busy', `Starting task: ${issueId}`);
    await this.publishNotification('task_started', {
      agent: this.type,
      agentId: this.id,
      issueId,
      worktreeId,
      timestamp: new Date().toISOString()
    });
  }
  
  protected async postExecute(issueId: string, success: boolean): Promise<void> {
    const duration = this.taskStartTime ? Date.now() - this.taskStartTime : 0;
    super.postExecute(issueId, success);
    
    // Update metrics
    if (this.redis) {
      await this.redis.hincrby(this.metricsKey, success ? 'completed' : 'failed', 1);
      await this.redis.hincrby(this.metricsKey, 'totalTime', duration);
    }
    
    // Broadcast completion
    await this.publishStatus('idle', success ? `Completed: ${issueId}` : `Failed: ${issueId}`);
    await this.publishNotification(success ? 'task_completed' : 'task_failed', {
      agent: this.type,
      agentId: this.id,
      issueId,
      success,
      duration,
      timestamp: new Date().toISOString()
    });
  }
  
  protected async reportProgress(issueId: string, progress: number, message: string): Promise<void> {
    super.reportProgress(issueId, progress, message);
    
    // Broadcast progress to Redis
    if (this.publisher) {
      await this.publisher.publish('ff2:agents:progress', JSON.stringify({
        agentId: this.id,
        agentType: this.type,
        issueId,
        progress,
        message,
        timestamp: new Date().toISOString()
      }));
    }
  }
  
  protected async handleError(error: unknown, issueId: string): Promise<void> {
    super.handleError(error, issueId);
    
    // Broadcast error
    await this.publishStatus('error', `Error in ${issueId}: ${error}`);
    await this.publishNotification('agent_error', {
      agent: this.type,
      agentId: this.id,
      issueId,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString()
    });
  }
  
  private async publishStatus(status: string, message: string): Promise<void> {
    if (!this.redis || !this.publisher) return;
    
    const statusData = {
      agentId: this.id,
      agentType: this.type,
      status,
      message,
      currentIssue: this.currentIssueId,
      timestamp: new Date().toISOString()
    };
    
    // Store current status
    await this.redis.hset('ff2:agents:status', this.id, JSON.stringify(statusData));
    
    // Publish status update
    await this.publisher.publish('ff2:agents:status', JSON.stringify(statusData));
  }
  
  private async publishNotification(type: string, data: any): Promise<void> {
    if (!this.publisher) return;
    
    const notification = {
      type,
      source: 'agent',
      teamId: TEAM_ID,
      data,
      timestamp: new Date().toISOString()
    };
    
    // Publish to team channel
    await this.publisher.publish(`ff2:team:${TEAM_ID}:notifications`, JSON.stringify(notification));
    
    // Also publish to general notifications
    await this.publisher.publish('ff2:notifications', JSON.stringify(notification));
    
    // Store in notification history
    if (this.redis) {
      await this.redis.lpush('ff2:notifications:history', JSON.stringify(notification));
      await this.redis.ltrim('ff2:notifications:history', 0, 999); // Keep last 1000
    }
  }
  
  public async getMetrics(): Promise<any> {
    if (!this.redis) return null;
    
    const metrics = await this.redis.hgetall(this.metricsKey);
    return {
      completed: parseInt(metrics.completed || '0'),
      failed: parseInt(metrics.failed || '0'),
      totalTime: parseInt(metrics.totalTime || '0'),
      avgTime: metrics.completed ? 
        Math.round(parseInt(metrics.totalTime || '0') / parseInt(metrics.completed)) : 0
    };
  }
  
  public async cleanup(): Promise<void> {
    if (this.redis) {
      // Remove from registry
      await this.redis.hdel('ff2:agents:registry', this.id);
      await this.redis.hdel('ff2:agents:status', this.id);
      
      // Disconnect
      this.redis.disconnect();
      this.publisher?.disconnect();
    }
  }
}

// Export a factory function to convert existing agents
export function enhanceAgentWithRedis(AgentClass: any): any {
  return class extends AgentClass {
    private redis?: Redis.Redis;
    private publisher?: Redis.Redis;
    
    constructor(...args: any[]) {
      super(...args);
      this.initializeRedis();
    }
    
    private async initializeRedis(): Promise<void> {
      try {
        this.redis = new Redis.Redis(REDIS_CONFIG);
        this.publisher = new Redis.Redis(REDIS_CONFIG);
      } catch (error) {
        console.warn('Redis enhancement failed:', error);
      }
    }
    
    async execute(issueId: string, worktreeId: string): Promise<void> {
      // Broadcast start
      if (this.publisher) {
        await this.publisher.publish('ff2:agents:activity', JSON.stringify({
          agent: this.type || this.constructor.name,
          action: 'started',
          issueId,
          worktreeId,
          timestamp: new Date().toISOString()
        }));
      }
      
      try {
        // Call original execute
        const result = await super.execute(issueId, worktreeId);
        
        // Broadcast success
        if (this.publisher) {
          await this.publisher.publish('ff2:agents:activity', JSON.stringify({
            agent: this.type || this.constructor.name,
            action: 'completed',
            issueId,
            worktreeId,
            timestamp: new Date().toISOString()
          }));
        }
        
        return result;
      } catch (error) {
        // Broadcast failure
        if (this.publisher) {
          await this.publisher.publish('ff2:agents:activity', JSON.stringify({
            agent: this.type || this.constructor.name,
            action: 'failed',
            issueId,
            worktreeId,
            error: error instanceof Error ? error.message : String(error),
            timestamp: new Date().toISOString()
          }));
        }
        throw error;
      }
    }
  };
}