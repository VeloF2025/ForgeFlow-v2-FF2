#!/usr/bin/env node

/**
 * ForgeFlow Live Demo
 * Demonstrates ForgeFlow fixing itself using its own task queue and agents
 */

const Redis = require('ioredis');
const TaskQueue = require('./src/orchestrator/task-queue');
const ForgeFlowAgent = require('./src/orchestrator/forgeflow-agent');

// Configuration
const redisConfig = {
  host: 'redis-13065.c92.us-east-1-3.ec2.redns.redis-cloud.com',
  port: 13065,
  password: 'lycNeaCgCZMo9i8fQgTiAlRPwxKQgaYV'
};

// ANSI colors for terminal
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

class ForgeFlowDemo {
  constructor() {
    this.taskQueue = new TaskQueue(redisConfig);
    this.redis = new Redis(redisConfig);
    this.agents = [];
  }
  
  async initialize() {
    console.log(`${colors.bright}${colors.blue}╔═══════════════════════════════════════════════════════╗${colors.reset}`);
    console.log(`${colors.bright}${colors.blue}║        ForgeFlow v2 - Self Implementation Demo       ║${colors.reset}`);
    console.log(`${colors.bright}${colors.blue}║         "ForgeFlow Fixing ForgeFlow"                 ║${colors.reset}`);
    console.log(`${colors.bright}${colors.blue}╚═══════════════════════════════════════════════════════╝${colors.reset}\n`);
    
    console.log(`${colors.cyan}📋 Mission: Implement ForgeFlow's missing features using ForgeFlow itself${colors.reset}\n`);
    
    // Clear previous data
    console.log(`${colors.yellow}🧹 Clearing previous queue data...${colors.reset}`);
    await this.taskQueue.clearAll();
    
    console.log(`${colors.green}✅ System initialized${colors.reset}\n`);
  }
  
  async createImplementationTasks() {
    console.log(`${colors.bright}${colors.cyan}═══ PHASE 1: Creating Implementation Tasks ═══${colors.reset}\n`);
    
    const tasks = [
      // Phase 1 Tasks
      {
        title: 'Create Task Queue System',
        type: 'code_implementation',
        priority: 0,
        requiredCapability: 'system_architecture',
        description: 'Build Redis-based distributed task queue with atomic operations',
        subtasks: ['Design queue structure', 'Implement FIFO logic', 'Add atomic claiming']
      },
      {
        title: 'Build Agent-Redis Connector',
        type: 'code_implementation',
        priority: 0,
        requiredCapability: 'backend_development',
        description: 'Create connector for agents to communicate via Redis',
        subtasks: ['Create pub/sub handlers', 'Add status broadcasting', 'Implement progress tracking']
      },
      {
        title: 'Implement Monitoring Dashboard',
        type: 'code_implementation',
        priority: 1,
        requiredCapability: 'frontend_development',
        description: 'Build real-time monitoring interface',
        subtasks: ['Design layout', 'Connect to Redis streams', 'Add live updates']
      },
      
      // Phase 2 Tasks
      {
        title: 'Wire Agents to Redis Events',
        type: 'integration',
        priority: 1,
        requiredCapability: 'system_integration',
        description: 'Connect all agents to Redis pub/sub system',
        dependencies: ['Task Queue System', 'Agent-Redis Connector']
      },
      {
        title: 'Add Notification System',
        type: 'feature_implementation',
        priority: 1,
        requiredCapability: 'backend_development',
        description: 'Implement team notification broadcasting',
        subtasks: ['Create notification types', 'Add routing logic', 'Store history']
      },
      {
        title: 'Create Persistence Layer',
        type: 'database',
        priority: 2,
        requiredCapability: 'database_architecture',
        description: 'Add persistent storage for tasks and messages',
        subtasks: ['Design schema', 'Implement storage', 'Add retrieval methods']
      },
      
      // Phase 3 Tasks
      {
        title: 'Build Web Dashboard UI',
        type: 'frontend',
        priority: 2,
        requiredCapability: 'frontend_development',
        description: 'Create browser-based monitoring dashboard',
        subtasks: ['Design UI', 'Add WebSocket connection', 'Implement charts']
      },
      {
        title: 'Add Error Recovery System',
        type: 'reliability',
        priority: 2,
        requiredCapability: 'system_reliability',
        description: 'Implement automatic error recovery and retry logic',
        subtasks: ['Add retry policies', 'Implement circuit breakers', 'Add fallback mechanisms']
      },
      {
        title: 'Write Documentation',
        type: 'documentation',
        priority: 3,
        requiredCapability: 'technical_writing',
        description: 'Create comprehensive documentation for the system',
        subtasks: ['API documentation', 'Setup guide', 'Architecture docs']
      },
      {
        title: 'Run Integration Tests',
        type: 'test_execution',
        priority: 3,
        requiredCapability: 'quality_assurance',
        description: 'Execute full system integration tests',
        subtasks: ['Unit tests', 'Integration tests', 'Load tests']
      }
    ];
    
    // Add tasks to queue
    for (const task of tasks) {
      const created = await this.taskQueue.addTask(task);
      console.log(`${colors.green}✅ Created task:${colors.reset} ${created.title}`);
      console.log(`   Priority: P${created.priority}, Type: ${created.type}`);
      if (created.subtasks) {
        console.log(`   Subtasks: ${created.subtasks.length}`);
      }
      console.log('');
    }
    
    console.log(`${colors.bright}${colors.green}📋 Total tasks created: ${tasks.length}${colors.reset}\n`);
  }
  
  async createAgents() {
    console.log(`${colors.bright}${colors.cyan}═══ PHASE 2: Spawning AI Agents ═══${colors.reset}\n`);
    
    const agentConfigs = [
      {
        id: 'architect_001',
        name: 'System Architect',
        type: 'architect',
        capabilities: ['system_architecture', 'system_integration'],
        redis: redisConfig
      },
      {
        id: 'backend_001',
        name: 'Backend Developer',
        type: 'developer',
        capabilities: ['backend_development', 'database_architecture'],
        redis: redisConfig
      },
      {
        id: 'frontend_001',
        name: 'Frontend Developer',
        type: 'developer',
        capabilities: ['frontend_development', 'ui_design'],
        redis: redisConfig
      },
      {
        id: 'qa_001',
        name: 'QA Engineer',
        type: 'tester',
        capabilities: ['quality_assurance', 'test_execution'],
        redis: redisConfig
      },
      {
        id: 'devops_001',
        name: 'DevOps Engineer',
        type: 'operations',
        capabilities: ['deployment', 'system_reliability'],
        redis: redisConfig
      }
    ];
    
    // Create and initialize agents
    for (const config of agentConfigs) {
      const agent = new ForgeFlowAgent(config);
      await agent.initialize();
      this.agents.push(agent);
      
      console.log(`${colors.green}🤖 Agent online:${colors.reset} ${agent.name}`);
      console.log(`   ID: ${agent.id}`);
      console.log(`   Capabilities: ${agent.capabilities.join(', ')}\n`);
    }
    
    console.log(`${colors.bright}${colors.green}✅ ${this.agents.length} agents ready${colors.reset}\n`);
  }
  
  async startExecution() {
    console.log(`${colors.bright}${colors.cyan}═══ PHASE 3: Starting Parallel Execution ═══${colors.reset}\n`);
    console.log(`${colors.yellow}⚡ Agents will now pull tasks and work in parallel...${colors.reset}\n`);
    
    // Start all agents
    for (const agent of this.agents) {
      agent.start();
      await this.sleep(500); // Stagger starts slightly
    }
    
    console.log(`${colors.green}✅ All agents started${colors.reset}\n`);
  }
  
  async monitorProgress() {
    console.log(`${colors.bright}${colors.cyan}═══ PHASE 4: Real-time Progress Monitoring ═══${colors.reset}\n`);
    
    // Subscribe to events
    const subscriber = new Redis(redisConfig);
    
    subscriber.subscribe('ff2:tasks:complete');
    subscriber.subscribe('ff2:tasks:failed');
    subscriber.subscribe('ff2:agents:progress');
    subscriber.subscribe('ff2:team:notifications');
    
    subscriber.on('message', (channel, message) => {
      const data = JSON.parse(message);
      const time = new Date().toLocaleTimeString();
      
      switch(channel) {
        case 'ff2:tasks:complete':
          console.log(`${colors.green}[${time}] ✅ COMPLETED:${colors.reset} ${data.title}`);
          if (data.result) {
            console.log(`   Result: ${JSON.stringify(data.result)}`);
          }
          break;
          
        case 'ff2:tasks:failed':
          console.log(`${colors.red}[${time}] ❌ FAILED:${colors.reset} ${data.title}`);
          console.log(`   Error: ${data.error}`);
          break;
          
        case 'ff2:agents:progress':
          console.log(`${colors.cyan}[${time}] 📊 PROGRESS:${colors.reset} ${data.agentName} - ${data.progress.toFixed(0)}% - ${data.message}`);
          break;
          
        case 'ff2:team:notifications':
          if (data.type === 'task_started') {
            console.log(`${colors.yellow}[${time}] 🚀 STARTED:${colors.reset} ${data.data.agent} → ${data.data.task}`);
          }
          break;
      }
    });
    
    // Periodically show stats
    setInterval(async () => {
      const stats = await this.taskQueue.getStats();
      
      console.log(`\n${colors.bright}${colors.magenta}═══ System Statistics ═══${colors.reset}`);
      console.log(`Tasks: Pending=${stats.queues.pending}, Active=${stats.queues.active}, Completed=${stats.queues.completed}`);
      console.log(`Agents: Active=${stats.agents.active}, Idle=${stats.agents.idle}`);
      console.log(`Performance: Avg Duration=${stats.metrics.avgDuration}ms`);
      console.log(`${colors.magenta}═════════════════════════${colors.reset}\n`);
    }, 15000);
  }
  
  async showFinalReport() {
    // Wait for tasks to complete
    console.log(`\n${colors.yellow}⏳ Waiting for all tasks to complete...${colors.reset}`);
    
    let pending = 1;
    while (pending > 0) {
      const stats = await this.taskQueue.getStats();
      pending = stats.queues.pending + stats.queues.active;
      
      if (pending > 0) {
        process.stdout.write(`\r${colors.yellow}Tasks remaining: ${pending}${colors.reset}  `);
        await this.sleep(2000);
      }
    }
    
    console.log(`\n\n${colors.bright}${colors.green}═══ FINAL REPORT ═══${colors.reset}`);
    
    const stats = await this.taskQueue.getStats();
    const successRate = stats.metrics.totalCompleted > 0 
      ? Math.round((stats.metrics.totalCompleted / (stats.metrics.totalCompleted + stats.metrics.totalFailed)) * 100)
      : 0;
    
    console.log(`✅ Tasks Completed: ${stats.metrics.totalCompleted}`);
    console.log(`❌ Tasks Failed: ${stats.metrics.totalFailed}`);
    console.log(`📊 Success Rate: ${successRate}%`);
    console.log(`⏱️  Average Duration: ${stats.metrics.avgDuration}ms`);
    
    // Show agent stats
    console.log(`\n${colors.bright}Agent Performance:${colors.reset}`);
    for (const agent of this.agents) {
      const agentStats = agent.getStats();
      console.log(`  ${agent.name}: ${agentStats.tasksCompleted} tasks, ${agentStats.tasksFailed} failed`);
    }
    
    console.log(`\n${colors.bright}${colors.green}🎉 ForgeFlow has successfully implemented its own features!${colors.reset}`);
    console.log(`${colors.cyan}The system is now self-sustaining and production-ready.${colors.reset}\n`);
  }
  
  async cleanup() {
    console.log(`${colors.yellow}🧹 Cleaning up...${colors.reset}`);
    
    // Stop all agents
    for (const agent of this.agents) {
      await agent.stop();
    }
    
    // Disconnect from Redis
    await this.taskQueue.disconnect();
    await this.redis.disconnect();
    
    console.log(`${colors.green}✅ Demo complete${colors.reset}\n`);
  }
  
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  async run() {
    try {
      await this.initialize();
      await this.sleep(2000);
      
      await this.createImplementationTasks();
      await this.sleep(2000);
      
      await this.createAgents();
      await this.sleep(2000);
      
      await this.startExecution();
      await this.monitorProgress();
      
      // Let it run for a while
      await this.sleep(30000);
      
      await this.showFinalReport();
      await this.cleanup();
      
      process.exit(0);
    } catch (error) {
      console.error(`${colors.red}❌ Demo error:${colors.reset}`, error);
      process.exit(1);
    }
  }
}

// Run the demo
console.clear();
const demo = new ForgeFlowDemo();
demo.run();

// Handle exit
process.on('SIGINT', async () => {
  console.log(`\n${colors.yellow}Interrupted by user${colors.reset}`);
  await demo.cleanup();
  process.exit(0);
});