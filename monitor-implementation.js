#!/usr/bin/env node

/**
 * Monitor ForgeFlow Implementation Progress
 * Shows real-time progress of ForgeFlow implementing its own Redis integration
 */

const Redis = require('ioredis');

const redis = new Redis({
  host: 'redis-13065.c92.us-east-1-3.ec2.redns.redis-cloud.com',
  port: 13065,
  password: 'lycNeaCgCZMo9i8fQgTiAlRPwxKQgaYV'
});

const subscriber = new Redis({
  host: 'redis-13065.c92.us-east-1-3.ec2.redns.redis-cloud.com',
  port: 13065,
  password: 'lycNeaCgCZMo9i8fQgTiAlRPwxKQgaYV'
});

console.log('🔍 Monitoring ForgeFlow Self-Implementation\n');
console.log('═══════════════════════════════════════════════════════════\n');

// Subscribe to all relevant channels
subscriber.psubscribe('ff2:*');

// Track progress
let tasksCompleted = 0;
let tasksFailed = 0;
let currentTasks = {};

// Handle messages
subscriber.on('pmessage', (pattern, channel, message) => {
  try {
    const data = JSON.parse(message);
    const time = new Date().toLocaleTimeString();
    
    const parts = channel.split(':');
    
    switch(parts[1]) {
      case 'agents':
        if (parts[2] === 'activity') {
          handleAgentActivity(time, data);
        } else if (parts[2] === 'status') {
          handleAgentStatus(time, data);
        } else if (parts[2] === 'progress') {
          handleProgress(time, data);
        }
        break;
        
      case 'tasks':
        if (parts[2] === 'new') {
          console.log(`📥 [${time}] New Task: ${data.title}`);
        } else if (parts[2] === 'complete') {
          tasksCompleted++;
          console.log(`✅ [${time}] Completed: ${data.title}`);
          showStats();
        } else if (parts[2] === 'failed') {
          tasksFailed++;
          console.log(`❌ [${time}] Failed: ${data.title}`);
          showStats();
        }
        break;
        
      case 'team':
        if (parts[3] === 'builds') {
          handleBuildEvent(time, data);
        }
        break;
    }
  } catch (e) {
    // Ignore non-JSON messages
  }
});

function handleAgentActivity(time, data) {
  switch(data.action) {
    case 'task_started':
      currentTasks[data.agentId] = data.issueId;
      console.log(`🚀 [${time}] ${data.agent} started: ${data.issueId}`);
      break;
    case 'task_completed':
      delete currentTasks[data.agentId];
      console.log(`✅ [${time}] ${data.agent} completed: ${data.issueId} (${data.duration}ms)`);
      break;
    case 'task_failed':
      delete currentTasks[data.agentId];
      console.log(`❌ [${time}] ${data.agent} failed: ${data.issueId}`);
      break;
  }
}

function handleAgentStatus(time, data) {
  if (data.status === 'busy') {
    console.log(`💼 [${time}] ${data.agentType}: ${data.message}`);
  }
}

function handleProgress(time, data) {
  const bar = createProgressBar(data.progress);
  console.log(`📊 [${time}] ${bar} ${data.progress.toFixed(0)}% - ${data.message}`);
}

function handleBuildEvent(time, data) {
  switch(data.type) {
    case 'build_started':
      console.log(`🔨 [${time}] Build started: ${data.script}`);
      break;
    case 'build_success':
      console.log(`✅ [${time}] Build succeeded: ${data.script} (${data.duration}ms)`);
      break;
    case 'build_failed':
      console.log(`❌ [${time}] Build failed: ${data.script}`);
      break;
  }
}

function createProgressBar(progress) {
  const width = 20;
  const filled = Math.round((progress / 100) * width);
  const empty = width - filled;
  return '[' + '█'.repeat(filled) + '░'.repeat(empty) + ']';
}

async function showStats() {
  const stats = await redis.hgetall('ff2:metrics:tasks');
  const agents = await redis.hgetall('ff2:agents:status');
  
  console.log('\n───────────── Statistics ─────────────');
  console.log(`Tasks: ✅ ${tasksCompleted} completed, ❌ ${tasksFailed} failed`);
  console.log(`Agents: ${Object.keys(agents).length} active`);
  console.log(`Files Modified: ${await countModifiedFiles()}`);
  console.log('───────────────────────────────────────\n');
}

async function countModifiedFiles() {
  // This would track actual file modifications
  const modifications = await redis.llen('ff2:files:modified');
  return modifications || 0;
}

// Initial check
async function checkCurrentStatus() {
  console.log('📊 Current Implementation Status:\n');
  
  // Check queued tasks
  const pending = await redis.llen('ff2:tasks:pending');
  const active = await redis.llen('ff2:tasks:active');
  const completed = await redis.zcard('ff2:tasks:completed');
  
  console.log(`Tasks: ${pending} pending, ${active} active, ${completed} completed`);
  
  // Check what's been implemented
  const implementations = [
    { file: 'src/agents/base-agent.ts', feature: 'Redis integration' },
    { file: 'package.json', feature: 'Build notifications' },
    { file: 'src/orchestrator/task-queue.js', feature: 'Task distribution' }
  ];
  
  console.log('\nImplementation Checklist:');
  for (const item of implementations) {
    const status = await redis.hget('ff2:implementation:status', item.file);
    const icon = status === 'complete' ? '✅' : status === 'in_progress' ? '🔄' : '⏳';
    console.log(`${icon} ${item.feature} (${item.file})`);
  }
  
  console.log('\n═══════════════════════════════════════════════════════════\n');
}

// Check status on start
checkCurrentStatus();

// Handle exit
process.on('SIGINT', async () => {
  console.log('\n\n📊 Final Statistics:');
  await showStats();
  
  console.log('\n👋 Monitoring stopped');
  redis.disconnect();
  subscriber.disconnect();
  process.exit(0);
});

console.log('👀 Watching for implementation progress...');
console.log('Press Ctrl+C to stop\n');