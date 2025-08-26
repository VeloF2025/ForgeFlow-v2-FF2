import { randomUUID } from 'crypto';
import * as Redis from 'ioredis';
import type { Agent } from '../types';
import { LogContext } from '@utils/logger';

export abstract class BaseAgent implements Agent {
  public readonly id: string;
  public readonly type: string;
  public readonly capabilities: string[];
  public status: 'idle' | 'busy' | 'error';
  protected logger: LogContext;
  protected currentIssueId?: string;
  protected redis?: Redis.Redis;
  protected publisher?: Redis.Redis;
  protected taskStartTime?: number;

  constructor(type: string, capabilities: string[]) {
    this.id = `${type}-${randomUUID().slice(0, 8)}`;
    this.type = type;
    this.capabilities = capabilities;
    this.status = 'idle';
    this.logger = new LogContext(`Agent:${type}`);
    this.initializeRedis();
  }

  protected async initializeRedis(): Promise<void> {
    try {
      const redisConfig = {
        host: process.env.REDIS_HOST || 'redis-13065.c92.us-east-1-3.ec2.redns.redis-cloud.com',
        port: parseInt(process.env.REDIS_PORT || '13065'),
        password: process.env.REDIS_PASSWORD || 'lycNeaCgCZMo9i8fQgTiAlRPwxKQgaYV'
      };
      
      this.redis = new Redis.Redis(redisConfig);
      this.publisher = new Redis.Redis(redisConfig);
      
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
      this.logger.warn('Redis connection failed, agent will work in offline mode');
    }
  }

  abstract execute(issueId: string, worktreeId: string): Promise<void>;

  protected async preExecute(issueId: string, worktreeId: string): Promise<void> {
    this.currentIssueId = issueId;
    this.taskStartTime = Date.now();
    this.logger.info(`Starting execution for issue: ${issueId} in worktree: ${worktreeId}`);
    this.status = 'busy';
    
    // Broadcast to Redis
    await this.publishStatus('busy', `Starting task: ${issueId}`);
    if (this.publisher) {
      await this.publisher.publish('ff2:agents:activity', JSON.stringify({
        agent: this.type,
        agentId: this.id,
        action: 'task_started',
        issueId,
        worktreeId,
        timestamp: new Date().toISOString()
      }));
    }
  }

  protected async postExecute(issueId: string, success: boolean): Promise<void> {
    const duration = this.taskStartTime ? Date.now() - this.taskStartTime : 0;
    this.status = 'idle';
    this.currentIssueId = undefined;
    const statusMsg = success ? 'completed successfully' : 'failed';
    this.logger.info(`Execution ${statusMsg} for issue: ${issueId}`);
    
    // Broadcast to Redis
    await this.publishStatus('idle', success ? `Completed: ${issueId}` : `Failed: ${issueId}`);
    if (this.publisher) {
      await this.publisher.publish('ff2:agents:activity', JSON.stringify({
        agent: this.type,
        agentId: this.id,
        action: success ? 'task_completed' : 'task_failed',
        issueId,
        success,
        duration,
        timestamp: new Date().toISOString()
      }));
    }
    
    // Update metrics
    if (this.redis) {
      const metricsKey = `ff2:agents:${this.id}:metrics`;
      await this.redis.hincrby(metricsKey, success ? 'completed' : 'failed', 1);
      await this.redis.hincrby(metricsKey, 'totalTime', duration);
    }
  }

  protected handleError(error: unknown, issueId: string): void {
    this.status = 'error';
    this.logger.error(`Error executing issue ${issueId}`, error);
    throw error;
  }

  protected async reportProgress(issueId: string, progress: number, message: string): Promise<void> {
    this.logger.debug(`[${issueId}] Progress: ${progress}% - ${message}`);
    
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

  public getCapabilities(): string[] {
    return [...this.capabilities];
  }

  public canHandle(requirement: string): boolean {
    return this.capabilities.includes(requirement);
  }

  public getStatus(): 'idle' | 'busy' | 'error' {
    return this.status;
  }

  public reset(): void {
    this.status = 'idle';
    this.logger.debug('Agent reset to idle state');
  }

  protected async publishStatus(status: string, message: string): Promise<void> {
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
