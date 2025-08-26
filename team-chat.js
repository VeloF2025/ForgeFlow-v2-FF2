#!/usr/bin/env node

const Redis = require('ioredis');
const readline = require('readline');
const chalk = require('chalk');

// Your team's Redis connection
const redisConfig = {
  host: 'redis-13065.c92.us-east-1-3.ec2.redns.redis-cloud.com',
  port: 13065,
  password: 'lycNeaCgCZMo9i8fQgTiAlRPwxKQgaYV'
};

// Create two Redis connections (one for pub, one for sub)
const publisher = new Redis(redisConfig);
const subscriber = new Redis(redisConfig);

// Team and user info
const TEAM_ID = 'team_1756204152746';
const CHANNEL = `ff2:team:${TEAM_ID}:chat`;
const username = process.argv[2] || `User_${Math.floor(Math.random() * 1000)}`;

// Colors for different users
const userColors = ['blue', 'green', 'magenta', 'cyan', 'yellow'];
const userColorMap = {};
let colorIndex = 0;

function getUserColor(user) {
  if (!userColorMap[user]) {
    userColorMap[user] = userColors[colorIndex % userColors.length];
    colorIndex++;
  }
  return userColorMap[user];
}

// Create readline interface for input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: '> '
});

console.clear();
console.log(chalk.bold.red('🔴 Redis Pub/Sub Team Chat'));
console.log(chalk.gray('─'.repeat(50)));
console.log(chalk.yellow(`📡 Connected to VeloFlow Team Chat`));
console.log(chalk.blue(`👤 Your username: ${username}`));
console.log(chalk.gray(`📢 Channel: ${CHANNEL}`));
console.log(chalk.gray('─'.repeat(50)));
console.log(chalk.green('💡 Type your message and press Enter to send'));
console.log(chalk.green('💡 Type /help for commands'));
console.log(chalk.gray('─'.repeat(50)));
console.log('');

// Subscribe to team channel
subscriber.subscribe(CHANNEL, (err, count) => {
  if (err) {
    console.error(chalk.red('Failed to subscribe:', err.message));
    process.exit(1);
  }
  
  // Announce joining
  const joinMessage = {
    type: 'system',
    user: username,
    message: `${username} joined the chat`,
    timestamp: new Date().toISOString()
  };
  publisher.publish(CHANNEL, JSON.stringify(joinMessage));
});

// Handle incoming messages
subscriber.on('message', (channel, message) => {
  try {
    const data = JSON.parse(message);
    
    // Don't show our own messages again
    if (data.user === username && data.type !== 'system') {
      return;
    }
    
    // Clear the current line and move cursor up
    readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0);
    
    // Format and display message
    const time = new Date(data.timestamp).toLocaleTimeString();
    
    if (data.type === 'system') {
      console.log(chalk.gray(`[${time}] 📢 ${data.message}`));
    } else if (data.type === 'notification') {
      console.log(chalk.yellow(`[${time}] 🔔 ${data.message}`));
    } else {
      const color = getUserColor(data.user);
      const userDisplay = chalk[color](`${data.user}:`);
      console.log(`[${time}] ${userDisplay} ${data.message}`);
    }
    
    // Restore prompt
    rl.prompt();
  } catch (err) {
    console.error(chalk.red('Error parsing message:', err.message));
  }
});

// Handle user input
rl.on('line', async (input) => {
  const trimmed = input.trim();
  
  if (!trimmed) {
    rl.prompt();
    return;
  }
  
  // Handle commands
  if (trimmed.startsWith('/')) {
    await handleCommand(trimmed);
    rl.prompt();
    return;
  }
  
  // Send chat message
  const chatMessage = {
    type: 'chat',
    user: username,
    message: trimmed,
    timestamp: new Date().toISOString()
  };
  
  // Publish to Redis
  await publisher.publish(CHANNEL, JSON.stringify(chatMessage));
  
  // Show our own message
  const time = new Date().toLocaleTimeString();
  const color = getUserColor(username);
  console.log(`[${time}] ${chalk[color](username + ':')} ${trimmed}`);
  
  rl.prompt();
});

// Handle commands
async function handleCommand(command) {
  const [cmd, ...args] = command.split(' ');
  
  switch (cmd) {
    case '/help':
      console.log(chalk.cyan('\n📚 Available Commands:'));
      console.log(chalk.white('  /help        - Show this help message'));
      console.log(chalk.white('  /users       - List online users'));
      console.log(chalk.white('  /notify <msg>- Send a notification'));
      console.log(chalk.white('  /stats       - Show chat statistics'));
      console.log(chalk.white('  /clear       - Clear the screen'));
      console.log(chalk.white('  /quit        - Leave the chat\n'));
      break;
      
    case '/users':
      const users = await publisher.pubsub('NUMSUB', CHANNEL);
      console.log(chalk.cyan(`\n👥 Users in chat: ${users[1]}`));
      break;
      
    case '/notify':
      const notification = {
        type: 'notification',
        user: username,
        message: args.join(' ') || 'New notification!',
        timestamp: new Date().toISOString()
      };
      await publisher.publish(CHANNEL, JSON.stringify(notification));
      break;
      
    case '/stats':
      const channels = await publisher.pubsub('CHANNELS');
      const stats = await publisher.pubsub('NUMSUB', CHANNEL);
      console.log(chalk.cyan('\n📊 Chat Statistics:'));
      console.log(chalk.white(`  Active channels: ${channels.length}`));
      console.log(chalk.white(`  Users in this chat: ${stats[1]}`));
      console.log(chalk.white(`  Channel: ${CHANNEL}\n`));
      break;
      
    case '/clear':
      console.clear();
      console.log(chalk.yellow('📡 VeloFlow Team Chat'));
      console.log(chalk.gray('─'.repeat(50)));
      break;
      
    case '/quit':
    case '/exit':
      await cleanup();
      break;
      
    default:
      console.log(chalk.red(`Unknown command: ${cmd}. Type /help for commands.`));
  }
}

// Cleanup on exit
async function cleanup() {
  const leaveMessage = {
    type: 'system',
    user: username,
    message: `${username} left the chat`,
    timestamp: new Date().toISOString()
  };
  
  await publisher.publish(CHANNEL, JSON.stringify(leaveMessage));
  
  setTimeout(() => {
    publisher.disconnect();
    subscriber.disconnect();
    process.exit(0);
  }, 100);
}

// Handle Ctrl+C
rl.on('SIGINT', cleanup);
process.on('SIGINT', cleanup);

// Start the prompt
rl.prompt();