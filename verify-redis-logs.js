#!/usr/bin/env node

/**
 * Verify Redis Logs - Check what's actually stored in Redis
 * Confirms that the implementation is working
 */

const Redis = require('ioredis');

const redis = new Redis({
  host: 'redis-13065.c92.us-east-1-3.ec2.redns.redis-cloud.com',
  port: 13065,
  password: 'lycNeaCgCZMo9i8fQgTiAlRPwxKQgaYV'
});

async function verifyRedisLogs() {
  console.log('🔍 Verifying Redis Integration - Checking Actual Logs\n');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  // 1. Check Agent Registry
  console.log('📋 1. AGENT REGISTRY (ff2:agents:registry)');
  console.log('─────────────────────────────────────────');
  const agents = await redis.hgetall('ff2:agents:registry');
  if (Object.keys(agents).length > 0) {
    console.log(`✅ Found ${Object.keys(agents).length} registered agents:`);
    for (const [id, data] of Object.entries(agents)) {
      const agent = JSON.parse(data);
      console.log(`   • ${agent.type} (${id})`);
      console.log(`     Capabilities: ${agent.capabilities.join(', ')}`);
      console.log(`     Started: ${agent.startedAt}`);
    }
  } else {
    console.log('❌ No agents registered');
  }
  console.log('');
  
  // 2. Check Agent Status
  console.log('📊 2. AGENT STATUS (ff2:agents:status)');
  console.log('──────────────────────────────────────');
  const statuses = await redis.hgetall('ff2:agents:status');
  if (Object.keys(statuses).length > 0) {
    console.log(`✅ Found ${Object.keys(statuses).length} agent status entries:`);
    for (const [id, data] of Object.entries(statuses)) {
      const status = JSON.parse(data);
      console.log(`   • ${status.agentType || 'Unknown'} (${id})`);
      console.log(`     Status: ${status.status}`);
      console.log(`     Message: ${status.message}`);
      console.log(`     Last Update: ${status.timestamp}`);
    }
  } else {
    console.log('❌ No agent status data');
  }
  console.log('');
  
  // 3. Check Task Queue
  console.log('📦 3. TASK QUEUES');
  console.log('─────────────────');
  const pending = await redis.llen('ff2:tasks:pending');
  const active = await redis.llen('ff2:tasks:active');
  const completed = await redis.zcard('ff2:tasks:completed');
  const failed = await redis.zcard('ff2:tasks:failed');
  
  console.log(`   Pending: ${pending}`);
  console.log(`   Active: ${active}`);
  console.log(`   Completed: ${completed}`);
  console.log(`   Failed: ${failed}`);
  
  // Show recent completed tasks
  if (completed > 0) {
    const recentCompleted = await redis.zrevrange('ff2:tasks:completed', 0, 4);
    console.log('\n   Recent Completed Tasks:');
    for (const taskId of recentCompleted) {
      const taskData = await redis.hget('ff2:tasks:data', taskId);
      if (taskData) {
        const task = JSON.parse(taskData);
        console.log(`   ✅ ${task.title}`);
        console.log(`      Completed: ${task.completedAt}`);
        if (task.duration) {
          console.log(`      Duration: ${task.duration}ms`);
        }
      }
    }
  }
  console.log('');
  
  // 4. Check Metrics
  console.log('📈 4. METRICS (ff2:metrics:*)');
  console.log('─────────────────────────────');
  const taskMetrics = await redis.hgetall('ff2:metrics:tasks');
  const buildMetrics = await redis.hgetall('ff2:metrics:builds');
  
  console.log('   Task Metrics:');
  if (Object.keys(taskMetrics).length > 0) {
    console.log(`   • Total Created: ${taskMetrics.total_created || 0}`);
    console.log(`   • Total Claimed: ${taskMetrics.total_claimed || 0}`);
    console.log(`   • Total Completed: ${taskMetrics.total_completed || 0}`);
    console.log(`   • Total Failed: ${taskMetrics.total_failed || 0}`);
    if (taskMetrics.total_duration && taskMetrics.total_completed) {
      const avg = Math.round(taskMetrics.total_duration / taskMetrics.total_completed);
      console.log(`   • Avg Duration: ${avg}ms`);
    }
  } else {
    console.log('   ❌ No task metrics recorded');
  }
  
  console.log('\n   Build Metrics:');
  if (Object.keys(buildMetrics).length > 0) {
    console.log(`   • Succeeded: ${buildMetrics.succeeded || 0}`);
    console.log(`   • Failed: ${buildMetrics.failed || 0}`);
    console.log(`   • Total Duration: ${buildMetrics.totalDuration || 0}ms`);
  } else {
    console.log('   ❌ No build metrics recorded');
  }
  console.log('');
  
  // 5. Check Notification History
  console.log('🔔 5. NOTIFICATION HISTORY (ff2:notifications:history)');
  console.log('──────────────────────────────────────────────────────');
  const notifications = await redis.lrange('ff2:notifications:history', 0, 9);
  if (notifications.length > 0) {
    console.log(`✅ Found ${notifications.length} recent notifications:`);
    for (const notif of notifications) {
      const data = JSON.parse(notif);
      const time = new Date(data.timestamp).toLocaleTimeString();
      console.log(`   [${time}] ${data.type}`);
      if (data.data && data.data.agent) {
        console.log(`              Agent: ${data.data.agent}`);
      }
    }
  } else {
    console.log('❌ No notifications recorded');
  }
  console.log('');
  
  // 6. Check Build History
  console.log('🔨 6. BUILD HISTORY (ff2:builds:history)');
  console.log('─────────────────────────────────────────');
  const buildHistory = await redis.zrevrange('ff2:builds:history', 0, 4);
  if (buildHistory.length > 0) {
    console.log(`✅ Found ${buildHistory.length} build records:`);
    for (const build of buildHistory) {
      const data = JSON.parse(build);
      const time = new Date(data.timestamp).toLocaleTimeString();
      const icon = data.type === 'build_success' ? '✅' : '❌';
      console.log(`   ${icon} [${time}] ${data.script}`);
      if (data.duration) {
        console.log(`      Duration: ${data.duration}ms`);
      }
    }
  } else {
    console.log('❌ No build history recorded');
  }
  console.log('');
  
  // 7. Check Team Data
  console.log('👥 7. TEAM DATA');
  console.log('───────────────');
  const teamKeys = await redis.keys('ff2:team:*');
  console.log(`Found ${teamKeys.length} team-related keys:`);
  for (const key of teamKeys.slice(0, 10)) {
    const type = await redis.type(key);
    console.log(`   • ${key} (${type})`);
  }
  console.log('');
  
  // 8. Check Implementation Plan
  console.log('📝 8. IMPLEMENTATION PLAN (ff2:implementation:plan)');
  console.log('───────────────────────────────────────────────────');
  const plan = await redis.hgetall('ff2:implementation:plan');
  if (Object.keys(plan).length > 0) {
    console.log('✅ Implementation plan found:');
    console.log(`   Created: ${plan.createdAt}`);
    console.log(`   Total Tasks: ${plan.totalTasks}`);
    console.log(`   Estimated Hours: ${plan.estimatedHours}`);
    console.log(`   Status: ${plan.status}`);
  } else {
    console.log('❌ No implementation plan recorded');
  }
  console.log('');
  
  // Summary
  console.log('═══════════════════════════════════════════════════════════\n');
  console.log('📊 VERIFICATION SUMMARY\n');
  
  const checks = [
    { name: 'Agent Registry', pass: Object.keys(agents).length > 0 },
    { name: 'Agent Status Broadcasting', pass: Object.keys(statuses).length > 0 },
    { name: 'Task Queue System', pass: (pending + active + completed + failed) > 0 },
    { name: 'Metrics Tracking', pass: Object.keys(taskMetrics).length > 0 },
    { name: 'Notification System', pass: notifications.length > 0 },
    { name: 'Build Integration', pass: buildHistory.length > 0 || Object.keys(buildMetrics).length > 0 },
    { name: 'Team Integration', pass: teamKeys.length > 0 }
  ];
  
  let passed = 0;
  for (const check of checks) {
    const icon = check.pass ? '✅' : '❌';
    console.log(`${icon} ${check.name}: ${check.pass ? 'WORKING' : 'NOT WORKING'}`);
    if (check.pass) passed++;
  }
  
  console.log(`\n🎯 Overall: ${passed}/${checks.length} systems working`);
  
  if (passed === checks.length) {
    console.log('\n🎉 SUCCESS: All Redis integration features are working!');
  } else if (passed > checks.length / 2) {
    console.log('\n⚠️  PARTIAL: Some features working, some need attention');
  } else {
    console.log('\n❌ NEEDS WORK: Most features not yet integrated');
  }
  
  console.log('\n═══════════════════════════════════════════════════════════\n');
  
  await redis.disconnect();
}

// Run verification
verifyRedisLogs().catch(console.error);