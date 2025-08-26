#!/usr/bin/env node

const Redis = require('ioredis');
const chalk = require('chalk');

// Redis connection
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

const TEAM_ID = 'team_1756204152746';

// Different notification channels
const CHANNELS = {
  chat: `ff2:team:${TEAM_ID}:chat`,
  tasks: `ff2:team:${TEAM_ID}:tasks`,
  commits: `ff2:team:${TEAM_ID}:commits`,
  alerts: `ff2:team:${TEAM_ID}:alerts`,
  system: `ff2:team:${TEAM_ID}:system`
};

console.clear();
console.log(chalk.bold.blue('🔔 VeloFlow Team Notification Center'));
console.log(chalk.gray('─'.repeat(50)));
console.log(chalk.yellow('📡 Monitoring all team channels...'));
console.log(chalk.gray('─'.repeat(50)));
console.log('');

// Subscribe to all channels
Object.values(CHANNELS).forEach(channel => {
  subscriber.subscribe(channel, (err) => {
    if (!err) {
      console.log(chalk.green(`✅ Subscribed to ${channel.split(':').pop()}`));
    }
  });
});

// Handle messages from different channels
subscriber.on('message', (channel, message) => {
  const channelName = channel.split(':').pop();
  const time = new Date().toLocaleTimeString();
  
  try {
    const data = JSON.parse(message);
    
    // Format based on channel type
    switch (channelName) {
      case 'chat':
        if (data.type === 'system') {
          console.log(`[${time}] 💬 Chat: ${chalk.gray(data.message)}`);
        } else if (data.type === 'notification') {
          console.log(`[${time}] 💬 ${chalk.yellow.bold('Alert:')} ${data.message}`);
        }
        break;
        
      case 'tasks':
        console.log(`[${time}] 📋 Task: ${chalk.cyan(data.message || 'Task update')}`);
        break;
        
      case 'commits':
        console.log(`[${time}] 🔧 Commit: ${chalk.green(data.message || 'New commit')}`);
        break;
        
      case 'alerts':
        console.log(`[${time}] 🚨 ${chalk.red.bold('ALERT:')} ${chalk.red(data.message)}`);
        break;
        
      case 'system':
        console.log(`[${time}] ⚙️  System: ${chalk.blue(data.message)}`);
        break;
        
      default:
        console.log(`[${time}] 📢 ${channelName}: ${data.message}`);
    }
  } catch (err) {
    // Handle plain text messages
    console.log(`[${time}] 📢 ${channelName}: ${message}`);
  }
});

// Demo: Send different types of notifications
async function sendDemoNotifications() {
  console.log(chalk.yellow('\n📤 Sending demo notifications in 3 seconds...\n'));
  
  setTimeout(async () => {
    // Task notification
    await redis.publish(CHANNELS.tasks, JSON.stringify({
      type: 'task',
      message: 'New task assigned: Fix authentication bug',
      user: 'System',
      timestamp: new Date().toISOString()
    }));
    
    // Commit notification
    setTimeout(async () => {
      await redis.publish(CHANNELS.commits, JSON.stringify({
        type: 'commit',
        message: 'John pushed 3 commits to main branch',
        timestamp: new Date().toISOString()
      }));
    }, 1000);
    
    // Alert
    setTimeout(async () => {
      await redis.publish(CHANNELS.alerts, JSON.stringify({
        type: 'alert',
        message: 'Build failed on main branch!',
        timestamp: new Date().toISOString()
      }));
    }, 2000);
    
    // System notification
    setTimeout(async () => {
      await redis.publish(CHANNELS.system, JSON.stringify({
        type: 'system',
        message: 'System maintenance scheduled for 2 AM',
        timestamp: new Date().toISOString()
      }));
    }, 3000);
    
  }, 3000);
}

// Send demo notifications
sendDemoNotifications();

// Handle exit
process.on('SIGINT', () => {
  console.log(chalk.yellow('\n\n👋 Closing notification center...'));
  subscriber.disconnect();
  redis.disconnect();
  process.exit(0);
});

console.log(chalk.gray('\nPress Ctrl+C to exit\n'));