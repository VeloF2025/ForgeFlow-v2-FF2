/**
 * ForgeFlow v2 - Claude Code Worker Adapter Bridge
 *
 * This module provides the bridge between FF2 orchestration and Claude Code execution,
 * enabling agents to execute tasks in isolated worktree environments with real-time
 * monitoring, resource management, and bidirectional communication.
 *
 * Key Components:
 * - ClaudeCodeAdapter: Main bridge interface
 * - TaskExecutor: Task execution in isolated environments
 * - CommunicationProtocol: Real-time bidirectional messaging
 * - ProcessSupervisor: Advanced process lifecycle management
 * - PidRegistry: Process tracking and metadata management
 * - ProcessMonitor: Real-time process health monitoring
 */

import { ClaudeCodeAdapter } from './claude-code-adapter';
import { ProcessSupervisor } from './process-supervisor';
import type { ProcessSupervisorConfig } from './process-supervisor';

export { ClaudeCodeAdapter } from './claude-code-adapter';
export { TaskExecutor } from './task-executor';
export { CommunicationProtocol } from './communication-protocol';
export { ResourceMonitor } from './resource-monitor';
export { ProcessSupervisor } from './process-supervisor';
export { PidRegistry } from './pid-registry';
export { ProcessMonitor } from './process-monitor';
export { SupervisorIntegration } from './supervisor-integration';

// Types and interfaces
export type {
  ClaudeCodeAdapterConfig,
  TaskExecutionRequest,
  TaskExecutionResult,
  TaskProgress,
} from './claude-code-adapter';

export type { CommunicationMessage, ClientConnection } from './communication-protocol';

export type {
  ResourceLimits,
  ProcessResourceUsage,
  SystemResourceUsage,
  ResourceAlert,
} from './resource-monitor';

export type {
  ProcessSupervisorConfig,
  SupervisedProcessOptions,
  ProcessSupervisorStats,
} from './process-supervisor';

export type {
  ProcessInfo,
  ProcessStatus,
  ProcessHealthStatus,
  ProcessPriority,
  ProcessQueryOptions,
  ProcessRegistryStats,
} from './pid-registry';

export type {
  ProcessResourceLimits,
  ProcessMonitoringData,
  ProcessHealthReport,
  ProcessMonitorConfig,
} from './process-monitor';

export type {
  SupervisedAgentConfig,
  AgentExecutionRequest,
  SupervisedAgentResult,
} from './supervisor-integration';

// Default configuration for the worker system
export const DEFAULT_WORKER_CONFIG = {
  maxConcurrentTasks: 4,
  taskTimeout: 300000, // 5 minutes
  resourceLimits: {
    maxMemoryMB: 2048,
    maxCpuPercent: 80,
    maxExecutionTimeMs: 600000, // 10 minutes
  },
  communicationPort: 3011,
  worktreeBasePath: '.ff2-worktrees',
  enableSandboxing: true,
  logLevel: 'info' as const,

  // Process Supervisor configuration
  processSupervisor: {
    maxProcesses: 10,
    defaultTimeout: 300000,
    gracefulShutdownTimeoutMs: 10000,
    forceKillTimeoutMs: 5000,
    resourceLimits: {
      maxMemoryMB: 2048,
      maxCpuPercent: 80,
      maxExecutionTimeMs: 600000,
      maxFileHandles: 100,
    },
    healthCheckInterval: 10000,
    restartAttempts: 3,
    restartDelay: 5000,
    orphanCleanupInterval: 60000,
    processHistoryRetention: 1000,
    enableSandboxing: true,
    allowedCommands: [
      'node',
      'npm',
      'yarn',
      'pnpm',
      'claude',
      'git',
      'python',
      'pip',
      'tsc',
      'eslint',
      'prettier',
      'jest',
      'vitest',
      'playwright',
    ],
    restrictedPaths: ['/etc', '/usr', '/var', '/boot', '/sys', '/proc'],
  },
};

// Utility function to create a Claude Code Adapter instance
export function createClaudeCodeAdapter(
  config: Partial<typeof DEFAULT_WORKER_CONFIG>,
  worktreeManager: any,
  agentPool: any,
) {
  const finalConfig = { ...DEFAULT_WORKER_CONFIG, ...config };
  return new ClaudeCodeAdapter(finalConfig, worktreeManager, agentPool);
}

// Utility function to create a Process Supervisor instance
export function createProcessSupervisor(
  config?: Partial<ProcessSupervisorConfig>,
): ProcessSupervisor {
  const finalConfig = { ...DEFAULT_WORKER_CONFIG.processSupervisor, ...config };
  return new ProcessSupervisor(finalConfig);
}
