// Test Helper Utilities
// Support utilities for comprehensive integration testing

import { promises as fs } from 'fs';
import * as path from 'path';
import type { Agent, GitHubAPI, TestAgent } from '../../src/types';

export interface MockAgent extends TestAgent {
  id: string;
  type: string;
  status: 'idle' | 'busy' | 'error';
  capabilities: string[];
  performance: {
    tasksCompleted: number;
    averageExecutionTime: number;
    successRate: number;
  };
}

export interface MockGitHubAPI extends GitHubAPI {
  repositories: Map<string, any>;
  issues: Map<string, any>;
  pullRequests: Map<string, any>;
  workflows: Map<string, any>;
}

/**
 * Creates a test agent with specified capabilities
 */
export function createTestAgent(config: {
  type: string;
  capabilities: string[];
  performance?: Partial<MockAgent['performance']>;
}): MockAgent {
  return {
    id: `test-${config.type}-${Date.now()}`,
    type: config.type,
    status: 'idle',
    capabilities: config.capabilities,
    performance: {
      tasksCompleted: 0,
      averageExecutionTime: 1000,
      successRate: 1.0,
      ...config.performance
    },

    async executeTask(task: any) {
      this.status = 'busy';
      
      // Simulate execution time
      const executionTime = Math.random() * 2000 + 500; // 500-2500ms
      await new Promise(resolve => setTimeout(resolve, executionTime));
      
      // Update performance metrics
      this.performance.tasksCompleted++;
      this.performance.averageExecutionTime = 
        (this.performance.averageExecutionTime + executionTime) / 2;
      
      // Simulate occasional failures for testing
      const success = Math.random() > 0.05; // 95% success rate
      if (!success) {
        this.status = 'error';
        this.performance.successRate = 
          this.performance.successRate * 0.95;
        throw new Error(`Test agent ${this.type} simulated failure`);
      }
      
      this.status = 'idle';
      return {
        success: true,
        result: `Task completed by ${this.type} agent`,
        executionTime,
        metadata: task.metadata || {}
      };
    },

    async getStatus() {
      return {
        id: this.id,
        type: this.type,
        status: this.status,
        capabilities: this.capabilities,
        performance: this.performance
      };
    },

    async initialize() {
      this.status = 'idle';
      return Promise.resolve();
    },

    async cleanup() {
      this.status = 'idle';
      this.performance.tasksCompleted = 0;
      return Promise.resolve();
    }
  };
}

/**
 * Creates a mock GitHub API for testing
 */
export function createMockGitHubAPI(): MockGitHubAPI {
  const repositories = new Map();
  const issues = new Map();
  const pullRequests = new Map();
  const workflows = new Map();

  return {
    repositories,
    issues,
    pullRequests,
    workflows,

    async createRepository(config: any) {
      const repo = {
        id: `repo-${Date.now()}`,
        name: config.name,
        owner: config.owner,
        private: config.private || false,
        created_at: new Date().toISOString(),
        ...config
      };
      repositories.set(repo.id, repo);
      return repo;
    },

    async getRepository(owner: string, repo: string) {
      for (const [id, repository] of repositories) {
        if (repository.owner === owner && repository.name === repo) {
          return repository;
        }
      }
      throw new Error(`Repository ${owner}/${repo} not found`);
    },

    async createIssue(owner: string, repo: string, config: any) {
      const issue = {
        id: `issue-${Date.now()}`,
        number: issues.size + 1,
        title: config.title,
        body: config.body,
        labels: config.labels || [],
        assignees: config.assignees || [],
        state: 'open',
        created_at: new Date().toISOString(),
        repository: `${owner}/${repo}`,
        ...config
      };
      issues.set(issue.id, issue);
      return issue;
    },

    async updateIssue(owner: string, repo: string, issueNumber: number, updates: any) {
      for (const [id, issue] of issues) {
        if (issue.number === issueNumber && issue.repository === `${owner}/${repo}`) {
          Object.assign(issue, updates, { updated_at: new Date().toISOString() });
          return issue;
        }
      }
      throw new Error(`Issue #${issueNumber} not found in ${owner}/${repo}`);
    },

    async createPullRequest(owner: string, repo: string, config: any) {
      const pr = {
        id: `pr-${Date.now()}`,
        number: pullRequests.size + 1,
        title: config.title,
        body: config.body,
        head: config.head,
        base: config.base,
        state: 'open',
        created_at: new Date().toISOString(),
        repository: `${owner}/${repo}`,
        ...config
      };
      pullRequests.set(pr.id, pr);
      return pr;
    },

    async listIssues(owner: string, repo: string, params: any = {}) {
      const repoIssues = Array.from(issues.values())
        .filter(issue => issue.repository === `${owner}/${repo}`);
      
      if (params.state) {
        return repoIssues.filter(issue => issue.state === params.state);
      }
      
      return repoIssues;
    },

    async listPullRequests(owner: string, repo: string, params: any = {}) {
      const repoPRs = Array.from(pullRequests.values())
        .filter(pr => pr.repository === `${owner}/${repo}`);
      
      if (params.state) {
        return repoPRs.filter(pr => pr.state === params.state);
      }
      
      return repoPRs;
    },

    async createWorkflowRun(owner: string, repo: string, workflowId: string, config: any) {
      const run = {
        id: `run-${Date.now()}`,
        workflow_id: workflowId,
        status: 'queued',
        conclusion: null,
        created_at: new Date().toISOString(),
        repository: `${owner}/${repo}`,
        ...config
      };
      workflows.set(run.id, run);
      
      // Simulate workflow execution
      setTimeout(() => {
        run.status = 'in_progress';
      }, 100);
      
      setTimeout(() => {
        run.status = 'completed';
        run.conclusion = Math.random() > 0.1 ? 'success' : 'failure';
      }, 1000 + Math.random() * 2000);
      
      return run;
    },

    async getWorkflowRun(owner: string, repo: string, runId: string) {
      return workflows.get(runId) || null;
    },

    // Test utility methods
    reset() {
      repositories.clear();
      issues.clear();
      pullRequests.clear();
      workflows.clear();
    },

    getStats() {
      return {
        repositories: repositories.size,
        issues: issues.size,
        pullRequests: pullRequests.size,
        workflows: workflows.size
      };
    }
  };
}

/**
 * Creates test data files for load testing
 */
export async function createTestDataFiles(config: {
  basePath: string;
  fileCount: number;
  categories: string[];
  avgSize: number;
}) {
  const files = [];
  
  for (let i = 0; i < config.fileCount; i++) {
    const category = config.categories[i % config.categories.length];
    const fileName = `${category}-test-file-${i}`;
    const extension = getExtensionForCategory(category);
    const filePath = path.join(config.basePath, category, `${fileName}.${extension}`);
    
    // Ensure directory exists
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    
    // Generate content based on category and size
    const content = generateTestContent(category, config.avgSize, i);
    await fs.writeFile(filePath, content);
    
    files.push({
      path: filePath,
      relativePath: path.relative(config.basePath, filePath),
      category,
      size: content.length,
      content: content.substring(0, 1000) // Preview for testing
    });
  }
  
  return files;
}

function getExtensionForCategory(category: string): string {
  const extensions = {
    code: 'ts',
    docs: 'md',
    config: 'json',
    tests: 'test.ts',
    assets: 'txt'
  };
  return extensions[category] || 'txt';
}

function generateTestContent(category: string, targetSize: number, index: number): string {
  const templates = {
    code: `
// Generated test file ${index} for category ${category}
interface TestInterface${index} {
  id: string;
  name: string;
  value: number;
  metadata?: Record<string, any>;
}

export class TestClass${index} {
  private data: TestInterface${index}[] = [];
  
  constructor(private config: any) {
    this.initialize();
  }
  
  private initialize() {
    // Initialize test data
    for (let i = 0; i < 10; i++) {
      this.data.push({
        id: \`test-\${i}\`,
        name: \`Test Item \${i}\`,
        value: Math.random() * 100,
        metadata: { index: i, category: '${category}' }
      });
    }
  }
  
  public getData(): TestInterface${index}[] {
    return this.data;
  }
  
  public addItem(item: TestInterface${index}): void {
    this.data.push(item);
  }
  
  public findById(id: string): TestInterface${index} | undefined {
    return this.data.find(item => item.id === id);
  }
}
`,
    docs: `
# Test Documentation ${index}

This is a generated test documentation file for load testing purposes.

## Overview

This document describes test scenario ${index} in category ${category}.

## Features

- Feature 1: Advanced testing capabilities
- Feature 2: Performance optimization
- Feature 3: Error handling and recovery
- Feature 4: Integration testing
- Feature 5: Documentation validation

## Usage Examples

\`\`\`typescript
const test${index} = new TestClass${index}({ mode: 'testing' });
const data = test${index}.getData();
console.log(\`Test ${index} has \${data.length} items\`);
\`\`\`

## Performance Considerations

- Operation complexity: O(n)
- Memory usage: Moderate
- Network impact: Low
- Disk I/O: Minimal

## Testing Notes

This file is part of the load testing suite for ForgeFlow V2 production readiness validation.
`,
    config: `{
  "testFile": ${index},
  "category": "${category}",
  "configuration": {
    "enabled": true,
    "mode": "testing",
    "performance": {
      "timeout": 30000,
      "retries": 3,
      "concurrency": 10
    },
    "features": {
      "loadTesting": true,
      "performanceMonitoring": true,
      "errorHandling": true,
      "documentation": true
    }
  },
  "testData": {
    "items": [
      { "id": "item-1", "value": 100 },
      { "id": "item-2", "value": 200 },
      { "id": "item-3", "value": 300 }
    ],
    "metadata": {
      "created": "2024-01-01T00:00:00Z",
      "version": "1.0.0",
      "author": "load-test-generator"
    }
  }
}`,
    tests: `
// Test file ${index} for ${category} category
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestClass${index} } from '../src/TestClass${index}';

describe('TestClass${index}', () => {
  let testInstance: TestClass${index};

  beforeEach(() => {
    testInstance = new TestClass${index}({ mode: 'testing' });
  });

  afterEach(() => {
    // Cleanup if needed
  });

  describe('Initialization', () => {
    it('should initialize with default data', () => {
      const data = testInstance.getData();
      expect(data).toHaveLength(10);
      expect(data[0]).toHaveProperty('id');
      expect(data[0]).toHaveProperty('name');
      expect(data[0]).toHaveProperty('value');
    });
  });

  describe('Data Operations', () => {
    it('should add new items', () => {
      const newItem = {
        id: 'new-item',
        name: 'New Test Item',
        value: 42,
        metadata: { test: true }
      };
      
      testInstance.addItem(newItem);
      const found = testInstance.findById('new-item');
      
      expect(found).toBeDefined();
      expect(found?.name).toBe('New Test Item');
      expect(found?.value).toBe(42);
    });

    it('should find items by id', () => {
      const found = testInstance.findById('test-0');
      expect(found).toBeDefined();
      expect(found?.id).toBe('test-0');
    });

    it('should return undefined for non-existent items', () => {
      const found = testInstance.findById('non-existent');
      expect(found).toBeUndefined();
    });
  });

  describe('Performance Tests', () => {
    it('should handle large datasets efficiently', () => {
      const startTime = Date.now();
      
      // Add many items
      for (let i = 0; i < 1000; i++) {
        testInstance.addItem({
          id: \`perf-test-\${i}\`,
          name: \`Performance Test Item \${i}\`,
          value: i,
          metadata: { performance: true }
        });
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(1000); // Should complete in under 1 second
      expect(testInstance.getData().length).toBe(1010); // 10 initial + 1000 added
    });
  });
});
`,
    assets: `Test Asset File ${index}

This is a generated test asset file for load testing.
Category: ${category}
Index: ${index}
Generated at: ${new Date().toISOString()}

Content for performance testing...
`.repeat(Math.max(1, Math.floor(targetSize / 200)))
  };

  let content = templates[category] || templates.assets;
  
  // Pad content to reach target size
  while (content.length < targetSize) {
    content += `\n// Padding content ${content.length}/${targetSize}`;
  }
  
  return content.substring(0, targetSize);
}

/**
 * Waits for a condition to be true with timeout
 */
export async function waitForCondition(
  condition: () => boolean | Promise<boolean>,
  timeout: number = 5000,
  interval: number = 100
): Promise<void> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  
  throw new Error(`Condition not met within ${timeout}ms`);
}

/**
 * Measures execution time of a function
 */
export async function measureExecutionTime<T>(
  fn: () => Promise<T> | T
): Promise<{ result: T; duration: number }> {
  const startTime = performance.now();
  const result = await fn();
  const duration = performance.now() - startTime;
  
  return { result, duration };
}

/**
 * Creates a temporary directory for testing
 */
export async function createTempDir(prefix: string = 'ff2-test'): Promise<string> {
  const tempDir = path.join(process.cwd(), '.temp', `${prefix}-${Date.now()}`);
  await fs.mkdir(tempDir, { recursive: true });
  return tempDir;
}

/**
 * Cleans up a temporary directory
 */
export async function cleanupTempDir(dirPath: string): Promise<void> {
  try {
    await fs.rm(dirPath, { recursive: true, force: true });
  } catch (error) {
    console.warn(`Failed to cleanup temp directory ${dirPath}:`, error);
  }
}

// Real Implementation Test Utilities
// Added to support real database and file system testing

import fsExtra from 'fs-extra';
import { tmpdir } from 'os';
import { createTestIndexEntry, TestSearchEngine } from '../../src/retrieval/__tests__/test-search-engine.js';
import { IndexEntry, IndexConfig } from '../../src/indexing/types.js';
import { ForgeFlowIndexManager } from '../../src/indexing/index-manager.js';

/**
 * Test environment setup utilities for real implementations
 */
export class RealTestEnvironment {
  public tempDir: string;
  public testDbPath: string;
  public configPath: string;
  public projectPath: string;

  constructor(testName?: string) {
    const prefix = testName ? `ff2-real-test-${testName}-` : 'ff2-real-test-';
    this.tempDir = '';
    this.testDbPath = '';
    this.configPath = '';
    this.projectPath = '';
  }

  /**
   * Setup test environment with temporary directories and files
   */
  async setup(): Promise<void> {
    this.tempDir = await fsExtra.mkdtemp(path.join(tmpdir(), 'ff2-real-test-'));
    this.testDbPath = path.join(this.tempDir, 'test.db');
    this.configPath = path.join(this.tempDir, 'config');
    this.projectPath = this.tempDir;

    // Create directory structure
    await fsExtra.ensureDir(path.join(this.tempDir, 'config', 'environments'));
    await fsExtra.ensureDir(path.join(this.tempDir, 'data'));
    await fsExtra.ensureDir(path.join(this.tempDir, 'logs'));
    await fsExtra.ensureDir(path.join(this.tempDir, 'src'));
    await fsExtra.ensureDir(path.join(this.tempDir, 'tests'));

    // Create basic project files
    await this.createBasicProjectFiles();
  }

  /**
   * Cleanup test environment
   */
  async cleanup(): Promise<void> {
    if (this.tempDir && await fsExtra.pathExists(this.tempDir)) {
      await fsExtra.remove(this.tempDir);
    }
  }

  /**
   * Create a real test database with index manager
   */
  async createTestDatabase(): Promise<ForgeFlowIndexManager> {
    const config: IndexConfig = {
      databasePath: this.testDbPath,
      maxDatabaseSize: 100 * 1024 * 1024, // 100MB
      tokenizer: 'porter',
      removeAccents: true,
      caseSensitive: false,
      cacheSize: 1000,
      synchronous: 'normal',
      journalMode: 'wal',
      batchSize: 50,
      maxContentLength: 10000,
      enableVectorIndex: false,
      autoVacuum: true,
      vacuumThreshold: 20,
      retentionDays: 30,
      defaultLimit: 20,
      maxLimit: 1000,
      snippetLength: 150,
      maxSnippets: 5
    };

    const indexManager = new ForgeFlowIndexManager(config);
    await indexManager.initialize();
    return indexManager;
  }

  /**
   * Create a test search engine with real data
   */
  createTestSearchEngine(entries?: IndexEntry[]): TestSearchEngine {
    const defaultEntries = entries || [
      createTestIndexEntry({
        id: 'test-auth-guide',
        title: 'User Authentication Implementation Guide',
        content: 'Comprehensive guide covering JWT tokens, password hashing, OAuth 2.0 integration, session management, and security best practices for modern web applications.',
        type: 'knowledge',
        metadata: {
          category: 'security',
          tags: ['authentication', 'security', 'jwt', 'oauth', 'passwords'],
          projectId: 'test-project',
          agentTypes: ['security-auditor', 'code-implementer'],
          effectiveness: 0.92,
          usageCount: 35,
          lastUsed: new Date(Date.now() - 12 * 60 * 60 * 1000), // 12 hours ago
          fileSize: 8192,
          language: 'en',
          relatedIds: ['test-security-patterns'],
          parentId: undefined,
          childIds: []
        }
      }),
      createTestIndexEntry({
        id: 'test-security-patterns',
        title: 'Security Patterns and Best Practices',
        content: 'Learn about common security patterns, threat modeling, input validation, CSRF protection, SQL injection prevention, and secure coding practices.',
        type: 'knowledge',
        metadata: {
          category: 'security',
          tags: ['security', 'patterns', 'threats', 'validation', 'csrf'],
          projectId: 'test-project',
          agentTypes: ['security-auditor', 'code-implementer'],
          effectiveness: 0.88,
          usageCount: 28,
          lastUsed: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
          fileSize: 6144,
          language: 'en',
          relatedIds: ['test-auth-guide'],
          parentId: undefined,
          childIds: []
        }
      }),
      createTestIndexEntry({
        id: 'test-db-optimization',
        title: 'Database Performance Optimization',
        content: 'Advanced database optimization techniques including indexing strategies, query optimization, connection pooling, caching, and performance monitoring.',
        type: 'knowledge',
        metadata: {
          category: 'database',
          tags: ['database', 'performance', 'optimization', 'indexing', 'caching'],
          projectId: 'test-project',
          agentTypes: ['database-specialist', 'performance-optimizer'],
          effectiveness: 0.85,
          usageCount: 22,
          lastUsed: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
          fileSize: 7168,
          language: 'en',
          relatedIds: [],
          parentId: undefined,
          childIds: []
        }
      })
    ];

    return new TestSearchEngine(defaultEntries);
  }

  /**
   * Create basic project files for testing
   */
  private async createBasicProjectFiles(): Promise<void> {
    // package.json
    await fsExtra.writeJson(path.join(this.tempDir, 'package.json'), {
      name: 'test-project',
      version: '1.0.0',
      type: 'module',
      dependencies: {
        'fs-extra': '^11.0.0',
        'sqlite3': '^5.0.0'
      },
      devDependencies: {
        '@types/node': '^20.0.0',
        'typescript': '^5.0.0',
        'vitest': '^1.0.0'
      }
    });

    // tsconfig.json
    await fsExtra.writeJson(path.join(this.tempDir, 'tsconfig.json'), {
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        lib: ['ES2022'],
        moduleResolution: 'node',
        resolveJsonModule: true,
        allowSyntheticDefaultImports: true,
        esModuleInterop: true,
        allowJs: true,
        strict: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true
      },
      include: ['src/**/*', 'tests/**/*'],
      exclude: ['node_modules', 'dist']
    });

    // Basic config files
    await fsExtra.writeFile(path.join(this.tempDir, '.gitignore'), 'node_modules/\n*.log\ndist/\n.env\n');
    await fsExtra.writeFile(path.join(this.tempDir, 'README.md'), '# Test Project\n\nThis is a test project for ForgeFlow V2.');

    // Environment configs
    await fsExtra.writeFile(path.join(this.tempDir, 'config', 'environments', 'development.yaml'), 'environment: development\ndatabase:\n  url: sqlite://./dev.db');
    await fsExtra.writeFile(path.join(this.tempDir, 'config', 'environments', 'test.yaml'), 'environment: test\ndatabase:\n  url: sqlite://./test.db');
  }

  /**
   * Create a valid configuration file
   */
  async createValidConfigFile(overrides: any = {}): Promise<string> {
    const config = {
      project: { name: 'test-project', type: 'nodejs' },
      environment: 'development',
      agents: { maxConcurrent: 5, timeout: 30000 },
      quality: { coverage: 90 },
      features: {
        enableFeatureFlags: true,
        enableBackups: false,
        enableMonitoring: true
      },
      ...overrides
    };

    const configFile = path.join(this.tempDir, 'forgeflow.config.json');
    await fsExtra.writeJson(configFile, config);
    return configFile;
  }

  /**
   * Create a feature flags file with real data
   */
  async createFeatureFlagsFile(flags: any[] = []): Promise<string> {
    const defaultFlags = flags.length > 0 ? flags : [
      {
        key: 'ff2.realtime_updates',
        name: 'Real-time Updates',
        description: 'Enable real-time updates for collaborative editing',
        defaultValue: true,
        rolloutPercentage: 100,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        key: 'ff2.parallel_execution',
        name: 'Parallel Execution',
        description: 'Enable parallel execution of agent tasks',
        defaultValue: false,
        rolloutPercentage: 25,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ];

    const flagsData = {
      version: '1.0.0',
      flags: defaultFlags
    };

    const flagsFile = path.join(this.tempDir, 'config', 'feature-flags.json');
    await fsExtra.writeJson(flagsFile, flagsData);
    return flagsFile;
  }

  /**
   * Create a test file with content
   */
  async createTestFile(relativePath: string, content: string): Promise<string> {
    const fullPath = path.join(this.tempDir, relativePath);
    await fsExtra.ensureDir(path.dirname(fullPath));
    await fsExtra.writeFile(fullPath, content);
    return fullPath;
  }

  /**
   * Get path relative to temp directory
   */
  getPath(relativePath: string): string {
    return path.join(this.tempDir, relativePath);
  }

  /**
   * Check if a file exists in the test environment
   */
  async fileExists(relativePath: string): Promise<boolean> {
    return fsExtra.pathExists(this.getPath(relativePath));
  }

  /**
   * Read a file from the test environment
   */
  async readFile(relativePath: string): Promise<string> {
    return fsExtra.readFile(this.getPath(relativePath), 'utf-8');
  }

  /**
   * Read a JSON file from the test environment
   */
  async readJsonFile(relativePath: string): Promise<any> {
    return fsExtra.readJson(this.getPath(relativePath));
  }
}

/**
 * Helper function to create a real test environment
 */
export async function createRealTestEnvironment(testName?: string): Promise<RealTestEnvironment> {
  const env = new RealTestEnvironment(testName);
  await env.setup();
  return env;
}

/**
 * Helper function to run a test with automatic cleanup using real environment
 */
export async function withRealTestEnvironment<T>(
  testFn: (env: RealTestEnvironment) => Promise<T>,
  testName?: string
): Promise<T> {
  const env = await createRealTestEnvironment(testName);
  try {
    return await testFn(env);
  } finally {
    await env.cleanup();
  }
}

/**
 * Assert that a function completes within a time limit
 */
export async function assertPerformanceWithin<T>(
  fn: () => Promise<T>,
  maxMs: number,
  description?: string
): Promise<T> {
  const start = performance.now();
  const result = await fn();
  const duration = performance.now() - start;

  if (duration > maxMs) {
    throw new Error(
      `${description || 'Operation'} took ${duration.toFixed(2)}ms, expected < ${maxMs}ms`
    );
  }

  return result;
}

/**
 * Performance monitoring utility for real tests
 */
export class RealPerformanceTracker {
  private measurements = new Map<string, number[]>();

  /**
   * Time a function and record the measurement
   */
  async time<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const start = performance.now();
    const result = await fn();
    const duration = performance.now() - start;
    
    if (!this.measurements.has(name)) {
      this.measurements.set(name, []);
    }
    this.measurements.get(name)!.push(duration);
    
    return result;
  }

  /**
   * Get statistics for a measurement
   */
  getStats(name: string): { count: number; avg: number; min: number; max: number } | null {
    const measurements = this.measurements.get(name);
    if (!measurements || measurements.length === 0) {
      return null;
    }

    return {
      count: measurements.length,
      avg: measurements.reduce((sum, val) => sum + val, 0) / measurements.length,
      min: Math.min(...measurements),
      max: Math.max(...measurements)
    };
  }

  /**
   * Get all measurement names
   */
  getMeasurementNames(): string[] {
    return Array.from(this.measurements.keys());
  }

  /**
   * Clear all measurements
   */
  clear(): void {
    this.measurements.clear();
  }
}