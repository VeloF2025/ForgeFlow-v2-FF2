// 🟢 WORKING: Custom Agent Definition Schema Types
// Comprehensive type definitions for custom agent configurations

export interface CustomAgentDefinition {
  name: string;
  type: string;
  version: string;
  displayName?: string;
  description?: string;
  author?: AgentAuthor;
  capabilities: string[];
  dependencies?: AgentDependencies;
  configuration?: AgentConfiguration;
  implementation: AgentImplementation;
  execution?: AgentExecution;
  quality?: AgentQuality;
  testing?: AgentTesting;
  security?: AgentSecurity;
  compatibility?: AgentCompatibility;
  documentation?: AgentDocumentation;
  metadata?: AgentMetadata;
}

export interface AgentAuthor {
  name: string;
  email?: string;
  url?: string;
}

export interface AgentDependencies {
  agents?: string[];
  tools?: AgentTool[];
  npm?: Record<string, string>;
}

export interface AgentTool {
  name: string;
  version: string;
  optional?: boolean;
}

export interface AgentConfiguration {
  schema?: Record<string, unknown>;
  defaults?: Record<string, unknown>;
  required?: string[];
}

export interface AgentImplementation {
  type: 'javascript' | 'typescript' | 'python' | 'shell' | 'docker';
  main?: string;
  class?: string;
  function?: string;
  dockerImage?: string;
  entrypoint?: string[];
  environment?: Record<string, string>;
}

export interface AgentExecution {
  timeout?: number;
  retries?: number;
  parallel?: boolean;
  isolation?: 'none' | 'process' | 'container';
  resources?: AgentResources;
}

export interface AgentResources {
  maxMemory?: string;
  maxCpu?: number;
}

export interface AgentQuality {
  gates?: QualityGate[];
  metrics?: QualityMetric[];
}

export interface QualityGate {
  name: string;
  criteria: string[];
  blocking?: boolean;
}

export interface QualityMetric {
  name: string;
  type: 'counter' | 'gauge' | 'histogram' | 'timer';
  description?: string;
  tags?: string[];
}

export interface AgentTesting {
  unitTests?: UnitTestConfig;
  integrationTests?: IntegrationTestConfig;
}

export interface UnitTestConfig {
  framework?: 'jest' | 'vitest' | 'mocha' | 'pytest' | 'go-test';
  pattern?: string;
  coverage?: {
    minimum?: number;
  };
}

export interface IntegrationTestConfig {
  enabled?: boolean;
  pattern?: string;
}

export interface AgentSecurity {
  permissions?: SecurityPermission[];
  sandbox?: boolean;
  trustedSources?: string[];
}

export type SecurityPermission =
  | 'filesystem:read'
  | 'filesystem:write'
  | 'network:http'
  | 'network:socket'
  | 'process:spawn'
  | 'environment:read'
  | 'environment:write';

export interface AgentCompatibility {
  forgeflowVersion?: string;
  platforms?: Platform[];
  nodeVersion?: string;
}

export type Platform = 'windows' | 'linux' | 'darwin' | 'docker';

export interface AgentDocumentation {
  readme?: string;
  examples?: DocumentationExample[];
  changelog?: string;
}

export interface DocumentationExample {
  name: string;
  description: string;
  file?: string;
}

export interface AgentMetadata {
  tags?: string[];
  category?: AgentCategory;
  maturity?: 'experimental' | 'beta' | 'stable' | 'deprecated';
  license?: string;
  repository?: string;
}

export type AgentCategory =
  | 'planning'
  | 'implementation'
  | 'testing'
  | 'security'
  | 'performance'
  | 'deployment'
  | 'monitoring'
  | 'analysis'
  | 'integration'
  | 'utility';

// 🟢 WORKING: Plugin Interface for Custom Agents
export interface CustomAgentPlugin {
  definition: CustomAgentDefinition;
  implementation?: CustomAgentImplementation;
  validated: boolean;
  loadedAt: Date;
  source: 'file' | 'registry' | 'git';
  sourcePath: string;
}

export interface CustomAgentImplementation {
  AgentClass?: new (...args: any[]) => any;
  executeFunction?: (...args: any[]) => Promise<any>;
  initialize?: () => Promise<void>;
  cleanup?: () => Promise<void>;
  validate?: () => Promise<boolean>;
}

// 🟢 WORKING: Validation Result Types
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  path: string;
  message: string;
  severity: 'error';
  code: string;
}

export interface ValidationWarning {
  path: string;
  message: string;
  severity: 'warning';
  code: string;
}

// 🟢 WORKING: Custom Agent Registry Types
export interface AgentRegistryEntry {
  definition: CustomAgentDefinition;
  downloadUrl: string;
  checksums: {
    sha256: string;
    md5: string;
  };
  downloads: number;
  rating: number;
  reviews: AgentReview[];
  publishedAt: Date;
  updatedAt: Date;
}

export interface AgentReview {
  author: string;
  rating: number;
  comment: string;
  version: string;
  createdAt: Date;
}

// 🟢 WORKING: Runtime Configuration
export interface CustomAgentRuntimeConfig {
  agentId: string;
  definition: CustomAgentDefinition;
  configuration: Record<string, unknown>;
  isolation: 'none' | 'process' | 'container';
  resources: {
    memory: string;
    cpu: number;
  };
  permissions: SecurityPermission[];
  sandbox: boolean;
}

// 🟢 WORKING: Agent Loading Events
export interface AgentLoadEvent {
  type: 'loading' | 'loaded' | 'error' | 'unloaded';
  agentType: string;
  timestamp: Date;
  message?: string;
  error?: Error;
  metadata?: Record<string, unknown>;
}

// 🟢 WORKING: Hot Reload Configuration
export interface HotReloadConfig {
  enabled: boolean;
  watchPaths: string[];
  debounceMs: number;
  excludePatterns: string[];
  reloadStrategy: 'immediate' | 'graceful' | 'scheduled';
}
