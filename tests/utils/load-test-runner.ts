// Load Testing Framework
// Enterprise-scale load testing for ForgeFlow V2

import { promises as fs } from 'fs';
import * as path from 'path';
import { performance } from 'perf_hooks';
import { createTestDataFiles } from './test-helpers';

export interface LoadTestConfig {
  duration: number; // Test duration in ms
  maxConcurrentUsers: number;
  rampUpTime: number; // Time to ramp up to max users
  rampDownTime: number; // Time to ramp down
  thinkTime: { min: number; max: number }; // User think time between operations
  operations: LoadTestOperation[];
  targets: {
    maxResponseTime: number;
    p95ResponseTime: number;
    maxErrorRate: number; // Percentage
    minThroughput: number; // Operations per second
  };
}

export interface LoadTestOperation {
  name: string;
  weight: number; // Relative weight for selection
  operation: (context: LoadTestContext) => Promise<LoadTestResult>;
  timeout: number;
}

export interface LoadTestContext {
  userId: string;
  sessionData: Record<string, any>;
  iteration: number;
  startTime: number;
}

export interface LoadTestResult {
  success: boolean;
  responseTime: number;
  errorMessage?: string;
  metadata?: Record<string, any>;
}

export interface LoadTestReport {
  config: LoadTestConfig;
  summary: {
    totalOperations: number;
    totalErrors: number;
    errorRate: number;
    averageResponseTime: number;
    p50ResponseTime: number;
    p95ResponseTime: number;
    p99ResponseTime: number;
    maxResponseTime: number;
    throughput: number; // ops/sec
    concurrentUsersMax: number;
    duration: number;
    dataTransferred: number; // bytes
  };
  operationStats: {
    [operationName: string]: {
      count: number;
      errors: number;
      averageResponseTime: number;
      minResponseTime: number;
      maxResponseTime: number;
      p95ResponseTime: number;
    };
  };
  timeline: Array<{
    timestamp: number;
    concurrentUsers: number;
    throughput: number;
    responseTime: number;
    errors: number;
  }>;
  errors: Array<{
    timestamp: number;
    operation: string;
    error: string;
    userId: string;
  }>;
  passed: boolean;
  recommendations: string[];
}

export class LoadTestRunner {
  private results: LoadTestResult[] = [];
  private errors: Array<{ timestamp: number; operation: string; error: string; userId: string }> = [];
  private timeline: Array<{ timestamp: number; concurrentUsers: number; throughput: number; responseTime: number; errors: number }> = [];
  private activeUsers = new Set<string>();

  constructor(private basePath: string) {}

  /**
   * Runs a comprehensive load test
   */
  async runLoadTest(config: LoadTestConfig): Promise<LoadTestReport> {
    console.log(`🚀 Starting load test: ${config.maxConcurrentUsers} users, ${config.duration}ms duration`);
    
    this.results = [];
    this.errors = [];
    this.timeline = [];
    this.activeUsers.clear();

    const startTime = Date.now();
    const endTime = startTime + config.duration;
    
    // Start monitoring timeline
    const timelineInterval = setInterval(() => {
      this.recordTimelineSnapshot();
    }, 1000);

    try {
      // Ramp up phase
      const rampUpPromise = this.rampUpUsers(config, startTime);
      
      // Main test execution
      const testPromise = this.executeLoadTest(config, startTime, endTime);
      
      await Promise.all([rampUpPromise, testPromise]);
      
    } finally {
      clearInterval(timelineInterval);
    }

    // Generate and return report
    return this.generateReport(config, Date.now() - startTime);
  }

  /**
   * Generates a large dataset for testing
   */
  async generateLargeDataset(fileCount: number): Promise<{
    files: Array<{ path: string; content: string; size: number }>;
    categories: string[];
    totalSize: number;
  }> {
    const categories = ['code', 'docs', 'config', 'tests', 'assets'];
    const avgSize = 2048; // 2KB average file size
    
    const files = await createTestDataFiles({
      basePath: path.join(this.basePath, 'large-dataset'),
      fileCount,
      categories,
      avgSize
    });

    const totalSize = files.reduce((sum, file) => sum + file.size, 0);

    return {
      files: files.map(f => ({
        path: f.path,
        content: f.content,
        size: f.size
      })),
      categories,
      totalSize
    };
  }

  /**
   * Generates enterprise-scale dataset
   */
  async generateEnterpriseDataset(config: {
    fileCount: number;
    avgFileSize: number;
    categories: string[];
  }): Promise<{
    files: Array<{ path: string; content: string; size: number; category: string }>;
    totalSize: number;
    structure: Record<string, number>;
  }> {
    const files = await createTestDataFiles({
      basePath: path.join(this.basePath, 'enterprise-dataset'),
      fileCount: config.fileCount,
      categories: config.categories,
      avgSize: config.avgFileSize
    });

    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    const structure = config.categories.reduce((acc, category) => {
      acc[category] = files.filter(f => f.category === category).length;
      return acc;
    }, {} as Record<string, number>);

    return {
      files: files.map(f => ({
        path: f.path,
        content: f.content,
        size: f.size,
        category: f.category
      })),
      totalSize,
      structure
    };
  }

  /**
   * Creates standard load test operations for ForgeFlow V2
   */
  createStandardOperations(): LoadTestOperation[] {
    return [
      {
        name: 'search_operation',
        weight: 40, // 40% of operations
        timeout: 2000,
        operation: async (context: LoadTestContext) => {
          const startTime = performance.now();
          
          try {
            // Simulate search operation
            const searchQuery = `test query ${context.iteration}`;
            await this.simulateSearch(searchQuery);
            
            return {
              success: true,
              responseTime: performance.now() - startTime,
              metadata: { query: searchQuery }
            };
          } catch (error) {
            return {
              success: false,
              responseTime: performance.now() - startTime,
              errorMessage: error.message
            };
          }
        }
      },
      {
        name: 'index_operation',
        weight: 20, // 20% of operations
        timeout: 5000,
        operation: async (context: LoadTestContext) => {
          const startTime = performance.now();
          
          try {
            // Simulate indexing operation
            const fileContent = `Test file content for user ${context.userId} iteration ${context.iteration}`;
            await this.simulateIndexing(fileContent);
            
            return {
              success: true,
              responseTime: performance.now() - startTime,
              metadata: { contentSize: fileContent.length }
            };
          } catch (error) {
            return {
              success: false,
              responseTime: performance.now() - startTime,
              errorMessage: error.message
            };
          }
        }
      },
      {
        name: 'memory_operation',
        weight: 25, // 25% of operations
        timeout: 1000,
        operation: async (context: LoadTestContext) => {
          const startTime = performance.now();
          
          try {
            // Simulate memory operation
            await this.simulateMemoryOperation(context.userId, context.iteration);
            
            return {
              success: true,
              responseTime: performance.now() - startTime
            };
          } catch (error) {
            return {
              success: false,
              responseTime: performance.now() - startTime,
              errorMessage: error.message
            };
          }
        }
      },
      {
        name: 'knowledge_operation',
        weight: 15, // 15% of operations
        timeout: 1500,
        operation: async (context: LoadTestContext) => {
          const startTime = performance.now();
          
          try {
            // Simulate knowledge operation
            await this.simulateKnowledgeOperation(context.userId);
            
            return {
              success: true,
              responseTime: performance.now() - startTime
            };
          } catch (error) {
            return {
              success: false,
              responseTime: performance.now() - startTime,
              errorMessage: error.message
            };
          }
        }
      }
    ];
  }

  /**
   * Runs a stress test to find system limits
   */
  async runStressTest(config: {
    startUsers: number;
    maxUsers: number;
    userIncrement: number;
    testDurationPerLevel: number;
    breakOnFailure: boolean;
  }): Promise<{
    maxStableUsers: number;
    breakingPoint: number;
    results: Array<{
      users: number;
      throughput: number;
      responseTime: number;
      errorRate: number;
      stable: boolean;
    }>;
  }> {
    const results = [];
    let maxStableUsers = 0;
    let breakingPoint = config.maxUsers;

    for (let users = config.startUsers; users <= config.maxUsers; users += config.userIncrement) {
      console.log(`🔄 Testing with ${users} concurrent users...`);

      const testConfig: LoadTestConfig = {
        duration: config.testDurationPerLevel,
        maxConcurrentUsers: users,
        rampUpTime: Math.min(5000, config.testDurationPerLevel * 0.2),
        rampDownTime: 1000,
        thinkTime: { min: 100, max: 500 },
        operations: this.createStandardOperations(),
        targets: {
          maxResponseTime: 5000,
          p95ResponseTime: 2000,
          maxErrorRate: 5,
          minThroughput: users * 0.5 // 0.5 ops/sec per user minimum
        }
      };

      const report = await this.runLoadTest(testConfig);
      
      const stable = report.summary.errorRate < 5 && 
                    report.summary.p95ResponseTime < 2000 &&
                    report.summary.throughput >= testConfig.targets.minThroughput;

      results.push({
        users,
        throughput: report.summary.throughput,
        responseTime: report.summary.p95ResponseTime,
        errorRate: report.summary.errorRate,
        stable
      });

      if (stable) {
        maxStableUsers = users;
      } else {
        breakingPoint = users;
        if (config.breakOnFailure) {
          break;
        }
      }

      // Cool down period between tests
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    return {
      maxStableUsers,
      breakingPoint,
      results
    };
  }

  private async rampUpUsers(config: LoadTestConfig, startTime: number): Promise<void> {
    const usersPerInterval = Math.max(1, Math.floor(config.maxConcurrentUsers / (config.rampUpTime / 1000)));
    const interval = config.rampUpTime / (config.maxConcurrentUsers / usersPerInterval);

    let currentUsers = 0;
    
    while (currentUsers < config.maxConcurrentUsers && Date.now() - startTime < config.rampUpTime) {
      const newUsers = Math.min(usersPerInterval, config.maxConcurrentUsers - currentUsers);
      
      for (let i = 0; i < newUsers; i++) {
        const userId = `user-${currentUsers + i}`;
        this.activeUsers.add(userId);
        this.startUserSession(userId, config);
      }
      
      currentUsers += newUsers;
      await new Promise(resolve => setTimeout(resolve, interval));
    }
  }

  private async executeLoadTest(config: LoadTestConfig, startTime: number, endTime: number): Promise<void> {
    // Main test execution is handled by individual user sessions
    // This method just waits for the test duration
    while (Date.now() < endTime) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Stop all user sessions
    this.activeUsers.clear();
  }

  private async startUserSession(userId: string, config: LoadTestConfig): Promise<void> {
    const context: LoadTestContext = {
      userId,
      sessionData: {},
      iteration: 0,
      startTime: Date.now()
    };

    // User session loop
    while (this.activeUsers.has(userId)) {
      try {
        // Select operation based on weight
        const operation = this.selectOperation(config.operations);
        
        // Execute operation with timeout
        const result = await Promise.race([
          operation.operation(context),
          new Promise<LoadTestResult>((_, reject) => 
            setTimeout(() => reject(new Error('Operation timeout')), operation.timeout)
          )
        ]);

        this.results.push(result);

        if (!result.success) {
          this.errors.push({
            timestamp: Date.now(),
            operation: operation.name,
            error: result.errorMessage || 'Unknown error',
            userId
          });
        }

        // Think time
        const thinkTime = Math.random() * (config.thinkTime.max - config.thinkTime.min) + config.thinkTime.min;
        await new Promise(resolve => setTimeout(resolve, thinkTime));

        context.iteration++;
        
      } catch (error) {
        this.errors.push({
          timestamp: Date.now(),
          operation: 'unknown',
          error: error.message,
          userId
        });
      }
    }
  }

  private selectOperation(operations: LoadTestOperation[]): LoadTestOperation {
    const totalWeight = operations.reduce((sum, op) => sum + op.weight, 0);
    let random = Math.random() * totalWeight;

    for (const operation of operations) {
      random -= operation.weight;
      if (random <= 0) {
        return operation;
      }
    }

    return operations[0]; // Fallback
  }

  private recordTimelineSnapshot(): void {
    const now = Date.now();
    const recentResults = this.results.filter(r => now - r.metadata?.timestamp < 5000);
    const recentErrors = this.errors.filter(e => now - e.timestamp < 5000);

    this.timeline.push({
      timestamp: now,
      concurrentUsers: this.activeUsers.size,
      throughput: recentResults.length / 5, // ops/sec over last 5 seconds
      responseTime: recentResults.length > 0 ? 
        recentResults.reduce((sum, r) => sum + r.responseTime, 0) / recentResults.length : 0,
      errors: recentErrors.length
    });
  }

  private generateReport(config: LoadTestConfig, duration: number): LoadTestReport {
    const responseTimes = this.results.map(r => r.responseTime).sort((a, b) => a - b);
    const errors = this.results.filter(r => !r.success);
    
    // Calculate percentiles
    const p50 = this.percentile(responseTimes, 50);
    const p95 = this.percentile(responseTimes, 95);
    const p99 = this.percentile(responseTimes, 99);

    // Calculate operation stats
    const operationStats: Record<string, any> = {};
    
    // Group results by operation
    const operationGroups: Record<string, LoadTestResult[]> = {};
    this.results.forEach(result => {
      const opName = result.metadata?.operation || 'unknown';
      if (!operationGroups[opName]) {
        operationGroups[opName] = [];
      }
      operationGroups[opName].push(result);
    });

    Object.entries(operationGroups).forEach(([name, results]) => {
      const opResponseTimes = results.map(r => r.responseTime).sort((a, b) => a - b);
      const opErrors = results.filter(r => !r.success);
      
      operationStats[name] = {
        count: results.length,
        errors: opErrors.length,
        averageResponseTime: results.reduce((sum, r) => sum + r.responseTime, 0) / results.length,
        minResponseTime: Math.min(...opResponseTimes),
        maxResponseTime: Math.max(...opResponseTimes),
        p95ResponseTime: this.percentile(opResponseTimes, 95)
      };
    });

    const summary = {
      totalOperations: this.results.length,
      totalErrors: errors.length,
      errorRate: (errors.length / this.results.length) * 100,
      averageResponseTime: responseTimes.reduce((sum, t) => sum + t, 0) / responseTimes.length,
      p50ResponseTime: p50,
      p95ResponseTime: p95,
      p99ResponseTime: p99,
      maxResponseTime: Math.max(...responseTimes),
      throughput: (this.results.length / duration) * 1000, // ops/sec
      concurrentUsersMax: Math.max(...this.timeline.map(t => t.concurrentUsers), 0),
      duration,
      dataTransferred: this.results.reduce((sum, r) => sum + (r.metadata?.bytes || 0), 0)
    };

    // Check if test passed
    const passed = summary.errorRate <= config.targets.maxErrorRate &&
                   summary.p95ResponseTime <= config.targets.p95ResponseTime &&
                   summary.maxResponseTime <= config.targets.maxResponseTime &&
                   summary.throughput >= config.targets.minThroughput;

    // Generate recommendations
    const recommendations = [];
    if (summary.errorRate > config.targets.maxErrorRate) {
      recommendations.push(`High error rate (${summary.errorRate.toFixed(2)}%). Investigate error handling and system stability.`);
    }
    if (summary.p95ResponseTime > config.targets.p95ResponseTime) {
      recommendations.push(`P95 response time (${summary.p95ResponseTime.toFixed(2)}ms) exceeds target. Consider performance optimization.`);
    }
    if (summary.throughput < config.targets.minThroughput) {
      recommendations.push(`Throughput (${summary.throughput.toFixed(2)} ops/sec) below target. Scale resources or optimize performance.`);
    }

    return {
      config,
      summary,
      operationStats,
      timeline: this.timeline,
      errors: this.errors,
      passed,
      recommendations
    };
  }

  private percentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0;
    const index = Math.floor((percentile / 100) * values.length);
    return values[Math.min(index, values.length - 1)];
  }

  // Simulation methods for testing
  private async simulateSearch(query: string): Promise<void> {
    const delay = Math.random() * 100 + 50; // 50-150ms
    await new Promise(resolve => setTimeout(resolve, delay));
    
    // Simulate occasional search failures
    if (Math.random() < 0.02) { // 2% failure rate
      throw new Error('Search service temporarily unavailable');
    }
  }

  private async simulateIndexing(content: string): Promise<void> {
    const delay = Math.random() * 200 + 100; // 100-300ms
    await new Promise(resolve => setTimeout(resolve, delay));
    
    // Simulate occasional indexing failures
    if (Math.random() < 0.01) { // 1% failure rate
      throw new Error('Indexing service overloaded');
    }
  }

  private async simulateMemoryOperation(userId: string, iteration: number): Promise<void> {
    const delay = Math.random() * 50 + 25; // 25-75ms
    await new Promise(resolve => setTimeout(resolve, delay));
    
    // Simulate occasional memory failures
    if (Math.random() < 0.005) { // 0.5% failure rate
      throw new Error('Memory service unavailable');
    }
  }

  private async simulateKnowledgeOperation(userId: string): Promise<void> {
    const delay = Math.random() * 150 + 75; // 75-225ms
    await new Promise(resolve => setTimeout(resolve, delay));
    
    // Simulate occasional knowledge failures
    if (Math.random() < 0.01) { // 1% failure rate
      throw new Error('Knowledge base timeout');
    }
  }

  /**
   * Saves load test report to file
   */
  async saveReport(report: LoadTestReport, filePath: string): Promise<void> {
    await fs.writeFile(filePath, JSON.stringify(report, null, 2));
  }
}