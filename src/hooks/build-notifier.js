#!/usr/bin/env node

/**
 * Build Notification Hook for ForgeFlow
 * Automatically sends build status to Redis when npm scripts run
 */

const Redis = require('ioredis');

// Redis configuration
const redis = new Redis({
  host: process.env.REDIS_HOST || 'redis-13065.c92.us-east-1-3.ec2.redns.redis-cloud.com',
  port: parseInt(process.env.REDIS_PORT || '13065'),
  password: process.env.REDIS_PASSWORD || 'lycNeaCgCZMo9i8fQgTiAlRPwxKQgaYV'
});

const TEAM_ID = process.env.FF2_TEAM_ID || 'team_1756204152746';

// Get build info from environment or arguments
const buildInfo = {
  script: process.env.npm_lifecycle_event || 'unknown',
  command: process.env.npm_lifecycle_script || process.argv.slice(2).join(' '),
  startTime: Date.now(),
  pid: process.pid
};

// Send build started notification
async function notifyBuildStart() {
  const notification = {
    type: 'build_started',
    script: buildInfo.script,
    command: buildInfo.command,
    timestamp: new Date().toISOString()
  };
  
  await redis.publish(`ff2:team:${TEAM_ID}:builds`, JSON.stringify(notification));
  await redis.hset('ff2:builds:active', buildInfo.pid, JSON.stringify(buildInfo));
  
  console.log(`📦 Build started: ${buildInfo.script}`);
}

// Send build completed notification
async function notifyBuildComplete(exitCode) {
  const duration = Date.now() - buildInfo.startTime;
  const success = exitCode === 0;
  
  const notification = {
    type: success ? 'build_success' : 'build_failed',
    script: buildInfo.script,
    command: buildInfo.command,
    exitCode,
    duration,
    timestamp: new Date().toISOString()
  };
  
  await redis.publish(`ff2:team:${TEAM_ID}:builds`, JSON.stringify(notification));
  await redis.hdel('ff2:builds:active', buildInfo.pid);
  
  // Store in build history
  await redis.zadd('ff2:builds:history', Date.now(), JSON.stringify({
    ...notification,
    pid: buildInfo.pid
  }));
  
  // Update metrics
  await redis.hincrby('ff2:metrics:builds', success ? 'succeeded' : 'failed', 1);
  await redis.hincrby('ff2:metrics:builds', 'totalDuration', duration);
  
  console.log(success ? 
    `✅ Build succeeded: ${buildInfo.script} (${duration}ms)` :
    `❌ Build failed: ${buildInfo.script} (exit code: ${exitCode})`
  );
  
  await redis.disconnect();
}

// Handle process exit
process.on('exit', (code) => {
  notifyBuildComplete(code).catch(console.error);
});

// Handle signals
process.on('SIGINT', () => {
  notifyBuildComplete(130).then(() => process.exit(130));
});

process.on('SIGTERM', () => {
  notifyBuildComplete(143).then(() => process.exit(143));
});

// Start monitoring
notifyBuildStart().catch(console.error);

// If this is a wrapper, execute the actual command
if (process.argv.length > 2) {
  const { spawn } = require('child_process');
  const command = process.argv[2];
  const args = process.argv.slice(3);
  
  const child = spawn(command, args, {
    stdio: 'inherit',
    shell: true
  });
  
  child.on('exit', (code) => {
    process.exit(code);
  });
}