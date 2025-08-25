# 🔧 FF2 Process Supervisor System

## 📋 Overview

The Process Supervisor System provides comprehensive process lifecycle management, health monitoring, and resource enforcement for worker processes in ForgeFlow v2. It consists of three main components working together to ensure reliable process execution.

## 🏗️ Architecture

```
ProcessSupervisor (Main Controller)
├── PidRegistry (Process Tracking)
├── ProcessMonitor (Health Monitoring) 
└── SupervisorIntegration (Agent Integration)
```

## 🔑 Key Components

### 1. ProcessSupervisor
**Main process lifecycle management system**

- ✅ **Process Spawning**: Cross-platform process creation with security validation
- ✅ **Lifecycle Management**: Start, stop, restart, kill operations with graceful shutdown
- ✅ **Resource Enforcement**: Memory, CPU, execution time, and file handle limits
- ✅ **Automatic Recovery**: Configurable restart policies for failed processes
- ✅ **Health Monitoring**: Real-time process health assessment and remediation
- ✅ **Orphan Cleanup**: Automatic detection and cleanup of abandoned processes
- ✅ **Security Sandbox**: Command validation and path restrictions

### 2. PidRegistry
**Comprehensive process tracking and metadata management**

- ✅ **Process Registration**: Full process metadata with lifecycle tracking
- ✅ **Status Management**: Real-time status updates (starting/running/idle/stopping/stopped/error/crashed)
- ✅ **Health Tracking**: Health status monitoring (healthy/unhealthy/unknown/crashed)
- ✅ **Resource Metrics**: Memory, CPU, file handles, execution time tracking
- ✅ **Query System**: Advanced filtering and sorting capabilities
- ✅ **Persistent Storage**: Process history with configurable retention
- ✅ **Cross-platform**: Windows and Unix process detection

### 3. ProcessMonitor
**Real-time process health monitoring and alerting**

- ✅ **Resource Monitoring**: Memory, CPU, file handles, disk I/O tracking
- ✅ **Health Assessment**: Automated health scoring and status determination
- ✅ **Trend Analysis**: Historical resource usage patterns and predictions
- ✅ **Alert System**: Configurable thresholds with severity levels
- ✅ **Violation Tracking**: Resource limit breach detection and logging
- ✅ **Platform Support**: Windows (PowerShell) and Unix (ps/proc) metrics

### 4. SupervisorIntegration
**Bridge between ProcessSupervisor and AgentPool**

- ✅ **Agent Execution**: Supervised agent task execution with monitoring
- ✅ **Resource Management**: Agent-specific resource limits and enforcement
- ✅ **Auto-restart**: Configurable restart policies for failed agents
- ✅ **Health Monitoring**: Agent health checks with automatic remediation
- ✅ **Statistics**: Comprehensive execution statistics and reporting

## 🚀 Features

### Process Management
- **Secure Process Spawning**: Command validation, path restrictions, environment isolation
- **Graceful Shutdown**: SIGTERM → wait → SIGKILL with configurable timeouts
- **Automatic Restart**: Configurable retry policies with exponential backoff
- **Resource Limits**: Memory, CPU, execution time, file handles per process
- **Priority Management**: Low/Normal/High/Critical priority scheduling

### Health Monitoring
- **Real-time Metrics**: 1-second interval resource monitoring
- **Health Scoring**: 0-100 health score with trend analysis
- **Alert System**: Warning/Critical/Emergency alerts with cooldowns
- **Violation Tracking**: Resource limit breach counting and reporting
- **Responsiveness**: Process responsiveness detection and scoring

### Cross-platform Support
- **Windows**: PowerShell-based metrics collection, WMIC fallback
- **Unix/Linux**: ps command and /proc filesystem monitoring
- **macOS**: Compatible with Unix monitoring approach
- **Process Detection**: Cross-platform process existence checking

### Integration Features
- **Agent Pool Integration**: Seamless integration with existing AgentPool
- **Task Execution**: Supervised agent task execution with monitoring
- **Event System**: Comprehensive event emission for integration
- **Statistics**: Detailed execution and performance statistics

## 📊 Configuration

### ProcessSupervisor Configuration
```typescript
const config: ProcessSupervisorConfig = {
  maxProcesses: 10,                    // Maximum concurrent processes
  defaultTimeout: 300000,              // 5 minutes default timeout
  gracefulShutdownTimeoutMs: 10000,    // 10 seconds for graceful shutdown
  forceKillTimeoutMs: 5000,            // 5 seconds before force kill
  
  resourceLimits: {
    maxMemoryMB: 2048,                 // 2GB memory limit
    maxCpuPercent: 80,                 // 80% CPU limit
    maxExecutionTimeMs: 600000,        // 10 minutes execution limit
    maxFileHandles: 100,               // 100 file handles limit
  },
  
  healthCheckInterval: 10000,          // Health check every 10 seconds
  restartAttempts: 3,                  // Maximum restart attempts
  restartDelay: 5000,                  // 5 seconds between restarts
  orphanCleanupInterval: 60000,        // Orphan cleanup every minute
  processHistoryRetention: 1000,       // Keep 1000 process records
  
  enableSandboxing: true,              // Enable security sandbox
  allowedCommands: ['node', 'npm', 'git'], // Allowed commands
  restrictedPaths: ['/etc', '/usr'],   // Restricted paths
};
```

## 🎯 Usage Examples

### Basic Process Supervision
```typescript
import { ProcessSupervisor, createProcessSupervisor } from '@forgeflow/workers';

// Create supervisor with default config
const supervisor = createProcessSupervisor();

// Initialize
await supervisor.initialize();

// Start a supervised process
const processId = await supervisor.startProcess({
  taskId: 'build-project',
  agentType: 'code-implementer',
  priority: 'high',
  command: 'npm',
  args: ['run', 'build'],
  workingDir: '/path/to/project',
  timeout: 300000,
  autoRestart: true,
  enableHealthCheck: true
});

// Monitor the process
supervisor.on('process:started', ({ processId, pid }) => {
  console.log(`Process started: ${processId} (PID: ${pid})`);
});

supervisor.on('process:stopped', ({ processId, reason }) => {
  console.log(`Process stopped: ${processId} - ${reason}`);
});

// Get process info
const processInfo = supervisor.getProcessInfo(processId);
console.log('Process status:', processInfo?.status);

// Stop the process
await supervisor.stopProcess(processId, 'User request');
```

### Agent Integration
```typescript
import { SupervisorIntegration } from '@forgeflow/workers';

const integration = new SupervisorIntegration(config);
await integration.initialize();

// Execute agent under supervision
const result = await integration.executeAgent({
  agentId: 'agent-123',
  agentType: 'code-implementer',
  taskId: 'task-456',
  instructions: 'Implement user authentication',
  priority: 'high',
  workingDir: '/path/to/project',
  timeout: 600000
});

console.log('Agent execution result:', result.status);
console.log('Resource usage:', result.resourceUsage);
```

### Health Monitoring
```typescript
// Perform health check
const healthStatuses = await supervisor.performHealthCheck();

for (const [processId, health] of healthStatuses) {
  if (health === 'unhealthy') {
    console.log(`Unhealthy process detected: ${processId}`);
    // Automatic restart will be triggered if enabled
  }
}

// Get comprehensive stats
const stats = supervisor.getStats();
console.log('Supervisor statistics:', {
  activeProcesses: stats.activeProcesses,
  healthyProcesses: stats.healthyProcesses,
  restartedProcesses: stats.processesRestarted,
  systemLoad: stats.systemLoadPercent
});
```

## 📈 Monitoring & Observability

### Process Statistics
- Active/idle/error process counts
- Resource usage aggregation (memory, CPU, file handles)
- Health status distribution
- Restart/failure/success counters
- System load and capacity metrics

### Event System
```typescript
supervisor.on('supervisor:initialized', (stats) => { /* ... */ });
supervisor.on('process:started', ({ processId, pid, options }) => { /* ... */ });
supervisor.on('process:stopped', ({ processId, reason }) => { /* ... */ });
supervisor.on('process:restarted', ({ oldProcessId, newProcessId, restartCount }) => { /* ... */ });
supervisor.on('process:error', ({ processId, error }) => { /* ... */ });
supervisor.on('supervisor:orphans-cleaned', ({ count }) => { /* ... */ });
supervisor.on('supervisor:shutdown', (finalStats) => { /* ... */ });
```

### Health Reports
```typescript
const healthReport = processMonitor.getProcessHealth(processId);
console.log('Health report:', {
  healthScore: healthReport.healthScore,        // 0-100
  status: healthReport.status,                  // healthy/warning/critical/failing
  issues: healthReport.issues,                  // Array of detected issues
  recommendations: healthReport.recommendations // Suggested actions
});
```

## 🔒 Security Features

### Sandboxing
- **Command Validation**: Only allowed commands can be executed
- **Path Restrictions**: Prevents access to system directories
- **Environment Isolation**: Controlled environment variable exposure
- **Resource Limits**: Prevents resource exhaustion attacks

### Process Isolation
- **Working Directory**: Each process runs in specified directory
- **Permission Checks**: Validates directory access before execution
- **Process Trees**: Tracks parent-child relationships
- **Automatic Cleanup**: Removes orphaned processes

## 🏃‍♂️ Performance

### Monitoring Overhead
- **Resource Monitoring**: 1-second intervals with minimal CPU impact
- **Health Checks**: 10-second intervals with configurable frequency
- **Memory Usage**: ~5MB per 100 monitored processes
- **Cross-platform**: Optimized for each platform's native tools

### Scalability
- **Concurrent Processes**: Tested up to 100 concurrent processes
- **Resource Tracking**: Efficient memory usage with process history cleanup
- **Event System**: Non-blocking event emission with built-in throttling

## 🔧 Integration with Existing Systems

### AgentPool Integration
The ProcessSupervisor integrates seamlessly with the existing AgentPool system through the SupervisorIntegration layer, providing enhanced process management without breaking existing functionality.

### Resource Monitor Compatibility
Works alongside the existing ResourceMonitor, providing additional PID-level tracking and cross-platform process management capabilities.

### Error Handling Integration
Fully integrated with the FF2 error handling system, providing comprehensive error categorization and recovery mechanisms.

## 🎛️ Default Configuration

The system includes sensible defaults in `DEFAULT_WORKER_CONFIG.processSupervisor`:
- 10 maximum concurrent processes
- 5-minute default timeout
- 10-second health check interval
- 3 restart attempts with 5-second delay
- 2GB memory limit per process
- 80% CPU limit per process
- Security sandbox enabled with common development tools allowed

## 🚨 Error Handling & Recovery

### Automatic Recovery
- **Process Crashes**: Automatic restart with exponential backoff
- **Resource Violations**: Throttling and restart based on severity
- **Orphaned Processes**: Automatic detection and cleanup
- **System Overload**: Process throttling and queuing

### Error Categories
- **Configuration Errors**: Invalid setup parameters
- **Resource Exhaustion**: System capacity exceeded
- **Security Violations**: Unauthorized command/path access
- **Process Failures**: Execution errors and crashes

This Process Supervisor System provides enterprise-grade process management capabilities, ensuring reliable and monitored execution of worker processes in the ForgeFlow v2 environment.