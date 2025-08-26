/**
 * ForgeFlow Task Queue System
 * Redis-based distributed task queue with atomic operations
 */

const Redis = require('ioredis');
const EventEmitter = require('events');

class TaskQueue extends EventEmitter {
  constructor(redisConfig) {
    super();
    this.redis = new Redis(redisConfig);
    this.subscriber = new Redis(redisConfig);
    this.publisher = new Redis(redisConfig);
    
    // Queue keys
    this.keys = {
      pending: 'ff2:tasks:pending',
      active: 'ff2:tasks:active',
      completed: 'ff2:tasks:completed',
      failed: 'ff2:tasks:failed',
      priority: 'ff2:tasks:priority',
      agents: 'ff2:agents:status',
      metrics: 'ff2:metrics:tasks'
    };
    
    // Subscribe to task events
    this.subscriber.subscribe('ff2:tasks:new');
    this.subscriber.subscribe('ff2:tasks:complete');
    this.subscriber.subscribe('ff2:tasks:failed');
    
    this.subscriber.on('message', (channel, message) => {
      this.emit(channel.split(':').pop(), JSON.parse(message));
    });
  }
  
  /**
   * Add a new task to the queue
   */
  async addTask(task) {
    const taskData = {
      id: `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...task,
      status: 'pending',
      createdAt: new Date().toISOString(),
      attempts: 0
    };
    
    // Store task data
    await this.redis.hset('ff2:tasks:data', taskData.id, JSON.stringify(taskData));
    
    // Add to appropriate queue based on priority
    if (task.priority === 0) {
      await this.redis.lpush(this.keys.priority, taskData.id);
    } else {
      await this.redis.lpush(this.keys.pending, taskData.id);
    }
    
    // Publish new task event
    await this.publisher.publish('ff2:tasks:new', JSON.stringify(taskData));
    
    // Update metrics
    await this.redis.hincrby(this.keys.metrics, 'total_created', 1);
    
    console.log(`✅ Task added: ${taskData.id} - ${taskData.title}`);
    return taskData;
  }
  
  /**
   * Claim next available task atomically
   */
  async claimTask(agentId, capabilities = []) {
    // Try priority queue first
    let taskId = await this.redis.rpoplpush(this.keys.priority, this.keys.active);
    
    // If no priority tasks, try regular queue
    if (!taskId) {
      taskId = await this.redis.rpoplpush(this.keys.pending, this.keys.active);
    }
    
    if (!taskId) {
      return null; // No tasks available
    }
    
    // Get task data
    const taskData = await this.redis.hget('ff2:tasks:data', taskId);
    const task = JSON.parse(taskData);
    
    // Check if agent can handle this task
    if (task.requiredCapability && !capabilities.includes(task.requiredCapability)) {
      // Put task back
      await this.redis.lrem(this.keys.active, 1, taskId);
      await this.redis.lpush(this.keys.pending, taskId);
      return null;
    }
    
    // Update task with agent assignment
    task.status = 'active';
    task.assignedAgent = agentId;
    task.startedAt = new Date().toISOString();
    task.attempts++;
    
    await this.redis.hset('ff2:tasks:data', taskId, JSON.stringify(task));
    
    // Update agent status
    await this.redis.hset(this.keys.agents, agentId, JSON.stringify({
      status: 'busy',
      currentTask: taskId,
      lastActivity: new Date().toISOString()
    }));
    
    // Update metrics
    await this.redis.hincrby(this.keys.metrics, 'total_claimed', 1);
    
    console.log(`🎯 Task claimed by ${agentId}: ${task.title}`);
    return task;
  }
  
  /**
   * Mark task as completed
   */
  async completeTask(taskId, agentId, result = {}) {
    // Remove from active queue
    await this.redis.lrem(this.keys.active, 1, taskId);
    
    // Get task data
    const taskData = await this.redis.hget('ff2:tasks:data', taskId);
    const task = JSON.parse(taskData);
    
    // Update task
    task.status = 'completed';
    task.completedAt = new Date().toISOString();
    task.result = result;
    task.duration = Date.now() - new Date(task.startedAt).getTime();
    
    // Store in completed set with score as timestamp
    await this.redis.zadd(this.keys.completed, Date.now(), taskId);
    await this.redis.hset('ff2:tasks:data', taskId, JSON.stringify(task));
    
    // Update agent status
    await this.redis.hset(this.keys.agents, agentId, JSON.stringify({
      status: 'idle',
      lastTask: taskId,
      lastActivity: new Date().toISOString()
    }));
    
    // Publish completion event
    await this.publisher.publish('ff2:tasks:complete', JSON.stringify(task));
    
    // Update metrics
    await this.redis.hincrby(this.keys.metrics, 'total_completed', 1);
    await this.redis.hincrby(this.keys.metrics, 'total_duration', task.duration);
    
    console.log(`✅ Task completed: ${task.title} (${task.duration}ms)`);
    return task;
  }
  
  /**
   * Mark task as failed
   */
  async failTask(taskId, agentId, error) {
    // Remove from active queue
    await this.redis.lrem(this.keys.active, 1, taskId);
    
    // Get task data
    const taskData = await this.redis.hget('ff2:tasks:data', taskId);
    const task = JSON.parse(taskData);
    
    // Check retry policy
    if (task.attempts < (task.maxAttempts || 3)) {
      // Put back in pending for retry
      await this.redis.lpush(this.keys.pending, taskId);
      task.status = 'pending';
      task.lastError = error.message;
      console.log(`🔄 Task retry ${task.attempts}/${task.maxAttempts}: ${task.title}`);
    } else {
      // Max retries reached, mark as failed
      task.status = 'failed';
      task.failedAt = new Date().toISOString();
      task.error = error.message;
      await this.redis.zadd(this.keys.failed, Date.now(), taskId);
      
      // Publish failure event
      await this.publisher.publish('ff2:tasks:failed', JSON.stringify(task));
      
      // Update metrics
      await this.redis.hincrby(this.keys.metrics, 'total_failed', 1);
      
      console.log(`❌ Task failed: ${task.title} - ${error.message}`);
    }
    
    await this.redis.hset('ff2:tasks:data', taskId, JSON.stringify(task));
    
    // Update agent status
    await this.redis.hset(this.keys.agents, agentId, JSON.stringify({
      status: 'idle',
      lastTask: taskId,
      lastActivity: new Date().toISOString()
    }));
    
    return task;
  }
  
  /**
   * Get queue statistics
   */
  async getStats() {
    const [pending, active, completed, failed] = await Promise.all([
      this.redis.llen(this.keys.pending),
      this.redis.llen(this.keys.active),
      this.redis.zcard(this.keys.completed),
      this.redis.zcard(this.keys.failed)
    ]);
    
    const metrics = await this.redis.hgetall(this.keys.metrics);
    const agents = await this.redis.hgetall(this.keys.agents);
    
    const activeAgents = Object.values(agents)
      .map(a => JSON.parse(a))
      .filter(a => a.status === 'busy').length;
    
    return {
      queues: {
        pending,
        active,
        completed,
        failed
      },
      metrics: {
        totalCreated: parseInt(metrics.total_created || 0),
        totalClaimed: parseInt(metrics.total_claimed || 0),
        totalCompleted: parseInt(metrics.total_completed || 0),
        totalFailed: parseInt(metrics.total_failed || 0),
        avgDuration: metrics.total_completed > 0 
          ? Math.round(parseInt(metrics.total_duration || 0) / parseInt(metrics.total_completed))
          : 0
      },
      agents: {
        total: Object.keys(agents).length,
        active: activeAgents,
        idle: Object.keys(agents).length - activeAgents
      }
    };
  }
  
  /**
   * Get recent tasks
   */
  async getRecentTasks(limit = 10) {
    const completedIds = await this.redis.zrevrange(this.keys.completed, 0, limit - 1);
    const tasks = [];
    
    for (const taskId of completedIds) {
      const data = await this.redis.hget('ff2:tasks:data', taskId);
      if (data) {
        tasks.push(JSON.parse(data));
      }
    }
    
    return tasks;
  }
  
  /**
   * Clear all queues (for testing)
   */
  async clearAll() {
    const keys = Object.values(this.keys);
    keys.push('ff2:tasks:data');
    await this.redis.del(...keys);
    console.log('🗑️  All queues cleared');
  }
  
  /**
   * Disconnect from Redis
   */
  async disconnect() {
    await this.redis.disconnect();
    await this.subscriber.disconnect();
    await this.publisher.disconnect();
  }
}

module.exports = TaskQueue;