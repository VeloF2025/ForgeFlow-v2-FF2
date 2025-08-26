/**
 * ForgeFlow Agent - Redis-enabled autonomous agent
 * Automatically reports status, pulls tasks, and notifies team
 */

const EventEmitter = require('events');
const Redis = require('ioredis');
const TaskQueue = require('./task-queue');

class ForgeFlowAgent extends EventEmitter {
  constructor(config) {
    super();
    
    this.id = config.id || `agent_${Date.now()}`;
    this.name = config.name || 'Unnamed Agent';
    this.type = config.type || 'generic';
    this.capabilities = config.capabilities || [];
    this.status = 'initializing';
    
    // Redis connections
    this.redis = new Redis(config.redis);
    this.subscriber = new Redis(config.redis);
    this.publisher = new Redis(config.redis);
    
    // Task queue
    this.taskQueue = new TaskQueue(config.redis);
    
    // Agent state
    this.currentTask = null;
    this.isRunning = false;
    this.stats = {
      tasksCompleted: 0,
      tasksFailed: 0,
      totalRuntime: 0,
      startedAt: new Date()
    };
    
    // Subscribe to agent control channel
    this.subscriber.subscribe(`ff2:agents:${this.id}:control`);
    this.subscriber.subscribe('ff2:agents:broadcast');
    
    this.subscriber.on('message', (channel, message) => {
      this.handleControlMessage(channel, JSON.parse(message));
    });
  }
  
  /**
   * Initialize and announce agent
   */
  async initialize() {
    this.status = 'idle';
    
    // Register agent in Redis
    await this.redis.hset('ff2:agents:registry', this.id, JSON.stringify({
      id: this.id,
      name: this.name,
      type: this.type,
      capabilities: this.capabilities,
      status: this.status,
      startedAt: new Date().toISOString()
    }));
    
    // Announce presence
    await this.publishStatus('online', 'Agent initialized and ready');
    
    console.log(`🤖 ${this.name} (${this.id}) initialized`);
    console.log(`   Type: ${this.type}`);
    console.log(`   Capabilities: ${this.capabilities.join(', ')}`);
    
    return this;
  }
  
  /**
   * Start agent work loop
   */
  async start() {
    if (this.isRunning) {
      console.log(`⚠️  ${this.name} is already running`);
      return;
    }
    
    this.isRunning = true;
    await this.publishStatus('idle', 'Agent started, waiting for tasks');
    
    console.log(`🚀 ${this.name} started`);
    
    // Main work loop
    this.workLoop();
  }
  
  /**
   * Main work loop
   */
  async workLoop() {
    while (this.isRunning) {
      try {
        // Try to claim a task
        const task = await this.taskQueue.claimTask(this.id, this.capabilities);
        
        if (task) {
          await this.executeTask(task);
        } else {
          // No task available, wait a bit
          await this.sleep(2000);
        }
      } catch (error) {
        console.error(`❌ ${this.name} error in work loop:`, error);
        await this.publishStatus('error', error.message);
        await this.sleep(5000); // Wait longer after error
      }
    }
  }
  
  /**
   * Execute a task
   */
  async executeTask(task) {
    console.log(`📋 ${this.name} executing: ${task.title}`);
    this.currentTask = task;
    this.status = 'busy';
    
    const startTime = Date.now();
    
    try {
      // Publish task started event
      await this.publishStatus('busy', `Executing task: ${task.title}`);
      await this.publishNotification('task_started', {
        agent: this.name,
        task: task.title,
        taskId: task.id
      });
      
      // Simulate task execution based on type
      const result = await this.performTask(task);
      
      // Mark task complete
      await this.taskQueue.completeTask(task.id, this.id, result);
      
      // Update stats
      this.stats.tasksCompleted++;
      this.stats.totalRuntime += (Date.now() - startTime);
      
      // Publish completion
      await this.publishStatus('idle', `Completed: ${task.title}`);
      await this.publishNotification('task_completed', {
        agent: this.name,
        task: task.title,
        duration: Date.now() - startTime,
        result
      });
      
      console.log(`✅ ${this.name} completed: ${task.title}`);
      
    } catch (error) {
      // Task failed
      console.error(`❌ ${this.name} failed task:`, error);
      
      await this.taskQueue.failTask(task.id, this.id, error);
      this.stats.tasksFailed++;
      
      await this.publishStatus('error', `Failed: ${task.title} - ${error.message}`);
      await this.publishNotification('task_failed', {
        agent: this.name,
        task: task.title,
        error: error.message
      });
    } finally {
      this.currentTask = null;
      this.status = 'idle';
    }
  }
  
  /**
   * Perform actual task work (override in subclasses)
   */
  async performTask(task) {
    // Simulate different task types
    switch (task.type) {
      case 'code_review':
        await this.simulateWork(3000);
        return { linesReviewed: 450, issues: 3, suggestions: 7 };
        
      case 'test_execution':
        await this.simulateWork(5000);
        return { testsRun: 127, passed: 125, failed: 2 };
        
      case 'build':
        await this.simulateWork(8000);
        return { buildTime: 8000, artifacts: ['app.js', 'app.css'], size: '2.3MB' };
        
      case 'deployment':
        await this.simulateWork(4000);
        return { deployed: true, environment: 'staging', version: '2.0.1' };
        
      default:
        await this.simulateWork(2000);
        return { completed: true, message: 'Task processed successfully' };
    }
  }
  
  /**
   * Simulate work with progress updates
   */
  async simulateWork(duration) {
    const steps = 5;
    const stepDuration = duration / steps;
    
    for (let i = 1; i <= steps; i++) {
      await this.sleep(stepDuration);
      const progress = (i / steps) * 100;
      
      await this.publishProgress(progress, `Step ${i}/${steps}`);
    }
  }
  
  /**
   * Publish agent status
   */
  async publishStatus(status, message) {
    this.status = status;
    
    const statusData = {
      agentId: this.id,
      agentName: this.name,
      status,
      message,
      timestamp: new Date().toISOString(),
      currentTask: this.currentTask?.id || null,
      stats: this.stats
    };
    
    await this.redis.hset('ff2:agents:status', this.id, JSON.stringify(statusData));
    await this.publisher.publish('ff2:agents:status', JSON.stringify(statusData));
  }
  
  /**
   * Publish progress update
   */
  async publishProgress(percentage, message) {
    if (!this.currentTask) return;
    
    const progressData = {
      agentId: this.id,
      agentName: this.name,
      taskId: this.currentTask.id,
      taskTitle: this.currentTask.title,
      progress: percentage,
      message,
      timestamp: new Date().toISOString()
    };
    
    await this.publisher.publish('ff2:agents:progress', JSON.stringify(progressData));
  }
  
  /**
   * Publish notification to team
   */
  async publishNotification(type, data) {
    const notification = {
      type,
      source: 'agent',
      agentId: this.id,
      agentName: this.name,
      data,
      timestamp: new Date().toISOString()
    };
    
    // Publish to team notifications channel
    await this.publisher.publish('ff2:team:notifications', JSON.stringify(notification));
    
    // Store in notification history
    await this.redis.lpush('ff2:notifications:history', JSON.stringify(notification));
    await this.redis.ltrim('ff2:notifications:history', 0, 999); // Keep last 1000
  }
  
  /**
   * Handle control messages
   */
  async handleControlMessage(channel, message) {
    switch (message.command) {
      case 'stop':
        await this.stop();
        break;
      case 'pause':
        this.isRunning = false;
        await this.publishStatus('paused', 'Agent paused');
        break;
      case 'resume':
        await this.start();
        break;
      case 'status':
        await this.publishStatus(this.status, 'Status requested');
        break;
      default:
        console.log(`Unknown command: ${message.command}`);
    }
  }
  
  /**
   * Stop agent
   */
  async stop() {
    console.log(`🛑 Stopping ${this.name}...`);
    this.isRunning = false;
    
    // Wait for current task to complete
    if (this.currentTask) {
      console.log(`⏳ Waiting for current task to complete...`);
      while (this.currentTask) {
        await this.sleep(1000);
      }
    }
    
    await this.publishStatus('offline', 'Agent stopped');
    
    // Remove from registry
    await this.redis.hdel('ff2:agents:registry', this.id);
    
    // Disconnect
    await this.redis.disconnect();
    await this.subscriber.disconnect();
    await this.publisher.disconnect();
    await this.taskQueue.disconnect();
    
    console.log(`👋 ${this.name} stopped`);
  }
  
  /**
   * Utility sleep function
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Get agent statistics
   */
  getStats() {
    return {
      ...this.stats,
      uptime: Date.now() - this.stats.startedAt.getTime(),
      avgTaskTime: this.stats.tasksCompleted > 0 
        ? Math.round(this.stats.totalRuntime / this.stats.tasksCompleted)
        : 0
    };
  }
}

// Export for use
module.exports = ForgeFlowAgent;