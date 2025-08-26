#!/usr/bin/env node

const Redis = require('ioredis');
const chalk = require('chalk');

// Parse command line arguments
const args = process.argv.slice(2);
if (args.length < 2) {
  console.log(chalk.yellow('Usage: node send-notification.js <type> <message>'));
  console.log(chalk.gray('Types: chat, task, commit, alert, system'));
  console.log(chalk.gray('Example: node send-notification.js task "New bug reported"'));
  process.exit(1);
}

const [type, ...messageParts] = args;
const message = messageParts.join(' ');

// Redis connection
const redis = new Redis({
  host: 'redis-13065.c92.us-east-1-3.ec2.redns.redis-cloud.com',
  port: 13065,
  password: 'lycNeaCgCZMo9i8fQgTiAlRPwxKQgaYV'
});

const TEAM_ID = 'team_1756204152746';

// Channel mapping
const channels = {
  chat: `ff2:team:${TEAM_ID}:chat`,
  task: `ff2:team:${TEAM_ID}:tasks`,
  tasks: `ff2:team:${TEAM_ID}:tasks`,
  commit: `ff2:team:${TEAM_ID}:commits`,
  commits: `ff2:team:${TEAM_ID}:commits`,
  alert: `ff2:team:${TEAM_ID}:alerts`,
  alerts: `ff2:team:${TEAM_ID}:alerts`,
  system: `ff2:team:${TEAM_ID}:system`
};

const channel = channels[type.toLowerCase()];

if (!channel) {
  console.log(chalk.red(`Unknown type: ${type}`));
  console.log(chalk.gray('Valid types: chat, task, commit, alert, system'));
  process.exit(1);
}

// Send notification
async function sendNotification() {
  const notification = {
    type: type,
    message: message,
    user: process.env.USER || 'System',
    timestamp: new Date().toISOString()
  };
  
  try {
    const subscribers = await redis.publish(channel, JSON.stringify(notification));
    
    console.log(chalk.green('✅ Notification sent!'));
    console.log(chalk.gray(`Channel: ${channel}`));
    console.log(chalk.gray(`Message: ${message}`));
    console.log(chalk.gray(`Subscribers: ${subscribers}`));
    
  } catch (error) {
    console.error(chalk.red('❌ Failed to send notification:'), error.message);
  } finally {
    redis.disconnect();
  }
}

sendNotification();