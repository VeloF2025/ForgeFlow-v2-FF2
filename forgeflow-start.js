#!/usr/bin/env node

/**
 * ForgeFlow v2 Production Launcher
 * Starts ForgeFlow with Redis integration, task queue, and monitoring
 */

const Redis = require('ioredis');
const TaskQueue = require('./src/orchestrator/task-queue');
const ForgeFlowAgent = require('./src/orchestrator/forgeflow-agent');
const path = require('path');
const fs = require('fs');

// Configuration
const config = {
  redis: {
    host: process.env.REDIS_HOST || 'redis-13065.c92.us-east-1-3.ec2.redns.redis-cloud.com',
    port: parseInt(process.env.REDIS_PORT || '13065'),
    password: process.env.REDIS_PASSWORD || 'lycNeaCgCZMo9i8fQgTiAlRPwxKQgaYV'
  },
  teamId: process.env.FF2_TEAM_ID || 'team_1756204152746'
};

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

class ForgeFlowLauncher {
  constructor() {
    this.redis = new Redis(config.redis);
    this.subscriber = new Redis(config.redis);
    this.taskQueue = new TaskQueue(config.redis);
    this.agents = [];
    this.isRunning = false;
  }
  
  async initialize() {
    console.log(`${colors.bright}${colors.blue}
╔═══════════════════════════════════════════════════════════╗
║                    ForgeFlow v2.0                        ║
║              Redis-Enhanced AI Orchestration             ║
╚═══════════════════════════════════════════════════════════╝
${colors.reset}`);
    
    // Test Redis connection
    try {
      await this.redis.ping();
      console.log(`${colors.green}✅ Redis connected${colors.reset}`);
      console.log(`   Host: ${config.redis.host}:${config.redis.port}`);
      console.log(`   Team: ${config.teamId}\n`);
    } catch (error) {
      console.error(`${colors.red}❌ Redis connection failed${colors.reset}`, error.message);
      console.log(`${colors.yellow}⚠️  Running in offline mode${colors.reset}\n`);
    }
    
    // Subscribe to events
    this.setupEventListeners();
    
    // Show current status
    await this.showStatus();
  }
  
  setupEventListeners() {
    // Subscribe to all ForgeFlow events
    this.subscriber.psubscribe('ff2:*');
    
    this.subscriber.on('pmessage', (pattern, channel, message) => {
      try {
        const data = JSON.parse(message);
        this.handleEvent(channel, data);
      } catch (e) {
        // Handle non-JSON messages
      }
    });
  }
  
  handleEvent(channel, data) {
    const parts = channel.split(':');
    const time = new Date().toLocaleTimeString();
    
    switch(parts[1]) {
      case 'agents':
        if (parts[2] === 'status') {
          console.log(`${colors.cyan}[${time}] Agent Status:${colors.reset} ${data.agentType} - ${data.status} - ${data.message}`);
        } else if (parts[2] === 'progress') {
          console.log(`${colors.yellow}[${time}] Progress:${colors.reset} ${data.progress.toFixed(0)}% - ${data.message}`);
        }
        break;
        
      case 'tasks':
        if (parts[2] === 'new') {
          console.log(`${colors.green}[${time}] New Task:${colors.reset} ${data.title}`);
        } else if (parts[2] === 'complete') {
          console.log(`${colors.green}[${time}] ✅ Completed:${colors.reset} ${data.title}`);
        }
        break;
        
      case 'team':
        if (parts[3] === 'notifications') {
          const icon = data.type === 'task_completed' ? '✅' : 
                       data.type === 'task_failed' ? '❌' : '📢';
          console.log(`${colors.blue}[${time}] ${icon} ${data.data.message || data.type}${colors.reset}`);
        }
        break;
    }
  }
  
  async showStatus() {
    console.log(`${colors.bright}${colors.cyan}═══ System Status ═══${colors.reset}`);
    
    // Get queue stats
    const stats = await this.taskQueue.getStats();
    console.log(`Tasks: Pending=${stats.queues.pending}, Active=${stats.queues.active}, Completed=${stats.queues.completed}`);
    
    // Get active agents
    const agents = await this.redis.hgetall('ff2:agents:registry');
    console.log(`Agents: ${Object.keys(agents).length} registered`);
    
    // Get recent activity
    const recent = await this.redis.lrange('ff2:notifications:history', 0, 4);
    if (recent.length > 0) {
      console.log(`\n${colors.cyan}Recent Activity:${colors.reset}`);
      recent.forEach(item => {
        const data = JSON.parse(item);
        const time = new Date(data.timestamp).toLocaleTimeString();
        console.log(`  [${time}] ${data.type}`);
      });
    }
    
    console.log(`${colors.cyan}${'═'.repeat(20)}${colors.reset}\n`);
  }
  
  async createSampleTasks() {
    console.log(`${colors.yellow}Creating sample tasks...${colors.reset}`);
    
    const tasks = [
      {
        title: 'Code Review: Authentication Module',
        type: 'code_review',
        priority: 1,
        requiredCapability: 'code_review'
      },
      {
        title: 'Run Integration Tests',
        type: 'test_execution',
        priority: 0,
        requiredCapability: 'testing'
      },
      {
        title: 'Build Production Bundle',
        type: 'build',
        priority: 1,
        requiredCapability: 'build_automation'
      },
      {
        title: 'Deploy to Staging',
        type: 'deployment',
        priority: 2,
        requiredCapability: 'deployment'
      }
    ];
    
    for (const task of tasks) {
      await this.taskQueue.addTask(task);
    }
    
    console.log(`${colors.green}✅ ${tasks.length} tasks added to queue${colors.reset}\n`);
  }
  
  async startAgents() {
    console.log(`${colors.yellow}Starting AI agents...${colors.reset}`);
    
    // Create different types of agents
    const agentConfigs = [
      {
        id: 'reviewer_001',
        name: 'Code Reviewer',
        type: 'reviewer',
        capabilities: ['code_review', 'quality_assurance'],
        redis: config.redis
      },
      {
        id: 'tester_001',
        name: 'Test Runner',
        type: 'tester',
        capabilities: ['testing', 'test_execution'],
        redis: config.redis
      },
      {
        id: 'builder_001',
        name: 'Build Agent',
        type: 'builder',
        capabilities: ['build_automation', 'compilation'],
        redis: config.redis
      }
    ];
    
    for (const agentConfig of agentConfigs) {
      const agent = new ForgeFlowAgent(agentConfig);
      await agent.initialize();
      this.agents.push(agent);
      console.log(`${colors.green}✅ Started:${colors.reset} ${agent.name}`);
    }
    
    // Start agents working
    for (const agent of this.agents) {
      agent.start();
    }
    
    console.log(`${colors.green}✅ ${this.agents.length} agents running${colors.reset}\n`);
  }
  
  async startMonitoring() {
    console.log(`${colors.cyan}📊 Real-time monitoring active${colors.reset}`);
    console.log(`${colors.cyan}Press Ctrl+C to stop${colors.reset}\n`);
    
    // Periodic status updates
    this.monitorInterval = setInterval(async () => {
      const stats = await this.taskQueue.getStats();
      const line = `Queue: P=${stats.queues.pending} A=${stats.queues.active} C=${stats.queues.completed} | Agents: ${stats.agents.active}/${stats.agents.total}`;
      process.stdout.write(`\r${colors.cyan}${line}${colors.reset}  `);
    }, 2000);
  }
  
  async runMenu() {
    console.log(`\n${colors.bright}${colors.cyan}═══ ForgeFlow Control Menu ═══${colors.reset}`);
    console.log('1. Create sample tasks');
    console.log('2. Start AI agents');
    console.log('3. Show status');
    console.log('4. Clear all queues');
    console.log('5. Start monitoring');
    console.log('6. Run full demo');
    console.log('0. Exit');
    console.log(`${colors.cyan}${'═'.repeat(30)}${colors.reset}`);
    
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    rl.question('\nSelect option: ', async (answer) => {
      console.log('');
      
      switch(answer) {
        case '1':
          await this.createSampleTasks();
          break;
        case '2':
          await this.startAgents();
          break;
        case '3':
          await this.showStatus();
          break;
        case '4':
          await this.taskQueue.clearAll();
          console.log(`${colors.yellow}✅ All queues cleared${colors.reset}`);
          break;
        case '5':
          await this.startMonitoring();
          break;
        case '6':
          await this.runFullDemo();
          break;
        case '0':
          await this.cleanup();
          process.exit(0);
          break;
        default:
          console.log(`${colors.red}Invalid option${colors.reset}`);
      }
      
      rl.close();
      
      if (answer !== '0' && answer !== '5') {
        setTimeout(() => this.runMenu(), 1000);
      }
    });
  }
  
  async runFullDemo() {
    console.log(`${colors.bright}${colors.green}🚀 Running Full ForgeFlow Demo${colors.reset}\n`);
    
    await this.taskQueue.clearAll();
    await this.createSampleTasks();
    await this.startAgents();
    await this.startMonitoring();
  }
  
  async cleanup() {
    console.log(`\n${colors.yellow}Shutting down...${colors.reset}`);
    
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
    }
    
    for (const agent of this.agents) {
      await agent.stop();
    }
    
    await this.redis.disconnect();
    await this.subscriber.disconnect();
    await this.taskQueue.disconnect();
    
    console.log(`${colors.green}✅ Shutdown complete${colors.reset}`);
  }
  
  async run() {
    try {
      await this.initialize();
      
      // Check command line arguments
      const args = process.argv.slice(2);
      
      if (args.includes('--demo')) {
        await this.runFullDemo();
      } else if (args.includes('--monitor')) {
        await this.startMonitoring();
      } else {
        await this.runMenu();
      }
      
    } catch (error) {
      console.error(`${colors.red}Fatal error:${colors.reset}`, error);
      process.exit(1);
    }
  }
}

// Handle signals
process.on('SIGINT', async () => {
  console.log(`\n${colors.yellow}Interrupted by user${colors.reset}`);
  if (launcher) {
    await launcher.cleanup();
  }
  process.exit(0);
});

// Start ForgeFlow
const launcher = new ForgeFlowLauncher();
launcher.run();