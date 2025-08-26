// Performance Benchmarking Framework
// Comprehensive performance testing and regression validation

import { performance } from 'perf_hooks';
import { promises as fs } from 'fs';
import * as path from 'path';

export interface PerformanceTarget {
  name: string;
  targetValue: number;
  unit: 'ms' | 'ops/sec' | 'mb' | 'percent';
  tolerance: number; // Percentage tolerance for regression
  critical: boolean; // Whether this target is critical for production
}

export interface PerformanceResult {
  name: string;
  value: number;
  unit: string;
  target: number;
  passed: boolean;
  deviation: number; // Percentage deviation from target
  timestamp: string;
  metadata: Record<string, any>;
}

export interface BenchmarkSuite {
  name: string;
  description: string;
  targets: PerformanceTarget[];
  results: PerformanceResult[];
  overallStatus: 'PASS' | 'FAIL' | 'WARNING';
  executionTime: number;
  timestamp: string;
}

export class PerformanceBenchmark {
  private results: Map<string, PerformanceResult[]> = new Map();
  private targets: Map<string, PerformanceTarget> = new Map();
  private baselines: Map<string, number> = new Map();

  constructor(private config: {
    SEARCH_LATENCY_MS: number;
    INDEXING_SPEED_FILES_PER_SEC: number;
    CONTEXT_ASSEMBLY_MS: number;
    MEMORY_OPERATION_MS: number;
    MAX_FILES_SUPPORT: number;
    CONCURRENT_USERS: number;
    P95_RESPONSE_TIME_MS: number;
    MAX_ERROR_RATE_PERCENT: number;
    MIN_TEST_COVERAGE_PERCENT: number;
    MIN_DOCUMENTATION_COVERAGE_PERCENT: number;
  }) {
    this.initializeTargets();
  }

  private initializeTargets() {
    const targets: PerformanceTarget[] = [
      {
        name: 'search_latency',
        targetValue: this.config.SEARCH_LATENCY_MS,
        unit: 'ms',
        tolerance: 10, // 10% tolerance
        critical: true
      },
      {
        name: 'indexing_speed',
        targetValue: this.config.INDEXING_SPEED_FILES_PER_SEC,
        unit: 'ops/sec',
        tolerance: 15,
        critical: true
      },
      {
        name: 'context_assembly_time',
        targetValue: this.config.CONTEXT_ASSEMBLY_MS,
        unit: 'ms',
        tolerance: 20,
        critical: true
      },
      {
        name: 'memory_operation_time',
        targetValue: this.config.MEMORY_OPERATION_MS,
        unit: 'ms',
        tolerance: 25,
        critical: true
      },
      {
        name: 'p95_response_time',
        targetValue: this.config.P95_RESPONSE_TIME_MS,
        unit: 'ms',
        tolerance: 15,
        critical: true
      },
      {
        name: 'error_rate',
        targetValue: this.config.MAX_ERROR_RATE_PERCENT,
        unit: 'percent',
        tolerance: 0, // Zero tolerance for error rate increases
        critical: true
      },
      {
        name: 'test_coverage',
        targetValue: this.config.MIN_TEST_COVERAGE_PERCENT,
        unit: 'percent',
        tolerance: -5, // Can be 5% below minimum
        critical: true
      }
    ];

    targets.forEach(target => {
      this.targets.set(target.name, target);
    });
  }

  /**
   * Measures the execution time of a function
   */
  async measureExecution<T>(
    name: string,
    fn: () => Promise<T> | T,
    metadata: Record<string, any> = {}
  ): Promise<{ result: T; measurement: PerformanceResult }> {
    const startTime = performance.now();
    const startMemory = process.memoryUsage();
    
    try {
      const result = await fn();
      const endTime = performance.now();
      const endMemory = process.memoryUsage();
      
      const executionTime = endTime - startTime;
      const memoryDelta = endMemory.heapUsed - startMemory.heapUsed;
      
      const target = this.targets.get(name);
      const measurement: PerformanceResult = {
        name,
        value: executionTime,
        unit: 'ms',
        target: target?.targetValue || 0,
        passed: target ? executionTime <= target.targetValue * (1 + target.tolerance / 100) : true,
        deviation: target ? ((executionTime - target.targetValue) / target.targetValue) * 100 : 0,
        timestamp: new Date().toISOString(),
        metadata: {
          ...metadata,
          memoryDelta,
          memoryUsage: endMemory,
          executionTimeMs: executionTime
        }
      };

      this.recordResult(measurement);
      
      return { result, measurement };
    } catch (error) {
      const endTime = performance.now();
      const executionTime = endTime - startTime;
      
      const measurement: PerformanceResult = {
        name,
        value: executionTime,
        unit: 'ms',
        target: 0,
        passed: false,
        deviation: 100, // 100% deviation for errors
        timestamp: new Date().toISOString(),
        metadata: {
          ...metadata,
          error: error.message,
          executionTimeMs: executionTime
        }
      };

      this.recordResult(measurement);
      throw error;
    }
  }

  /**
   * Benchmarks throughput (operations per second)
   */
  async measureThroughput(
    name: string,
    operation: () => Promise<any> | any,
    config: {
      duration: number; // Test duration in ms
      warmupDuration?: number; // Warmup duration in ms
      concurrency?: number; // Number of concurrent operations
      maxOperations?: number; // Maximum number of operations to run
    }
  ): Promise<PerformanceResult> {
    const { duration, warmupDuration = 1000, concurrency = 1, maxOperations = Infinity } = config;
    
    // Warmup phase
    const warmupEnd = Date.now() + warmupDuration;
    while (Date.now() < warmupEnd) {
      await operation();
    }

    // Actual benchmark
    const startTime = Date.now();
    const endTime = startTime + duration;
    let operationsCompleted = 0;
    const errors: Error[] = [];
    
    const workers: Promise<void>[] = [];
    
    for (let i = 0; i < concurrency; i++) {
      workers.push((async () => {
        while (Date.now() < endTime && operationsCompleted < maxOperations) {
          try {
            await operation();
            operationsCompleted++;
          } catch (error) {
            errors.push(error);
          }
        }
      })());
    }
    
    await Promise.all(workers);
    
    const actualDuration = Date.now() - startTime;
    const throughput = (operationsCompleted / actualDuration) * 1000; // ops/sec
    
    const target = this.targets.get(name);
    const measurement: PerformanceResult = {
      name,
      value: throughput,
      unit: 'ops/sec',
      target: target?.targetValue || 0,
      passed: target ? throughput >= target.targetValue * (1 - target.tolerance / 100) : true,
      deviation: target ? ((target.targetValue - throughput) / target.targetValue) * 100 : 0,
      timestamp: new Date().toISOString(),
      metadata: {
        operationsCompleted,
        errors: errors.length,
        errorRate: (errors.length / operationsCompleted) * 100,
        durationMs: actualDuration,
        concurrency
      }
    };

    this.recordResult(measurement);
    return measurement;
  }

  /**
   * Measures memory usage during operation
   */
  async measureMemoryUsage(
    name: string,
    operation: () => Promise<any> | any,
    config: {
      sampleInterval?: number; // Memory sampling interval in ms
      collectGarbage?: boolean; // Force garbage collection
    } = {}
  ): Promise<PerformanceResult> {
    const { sampleInterval = 100, collectGarbage = true } = config;
    
    if (collectGarbage && global.gc) {
      global.gc();
    }
    
    const initialMemory = process.memoryUsage();
    const memorySamples: NodeJS.MemoryUsage[] = [initialMemory];
    
    // Start memory monitoring
    const memoryMonitor = setInterval(() => {
      memorySamples.push(process.memoryUsage());
    }, sampleInterval);
    
    try {
      await operation();
    } finally {
      clearInterval(memoryMonitor);
    }
    
    const finalMemory = process.memoryUsage();
    memorySamples.push(finalMemory);
    
    // Calculate memory metrics
    const peakHeap = Math.max(...memorySamples.map(s => s.heapUsed));
    const averageHeap = memorySamples.reduce((sum, s) => sum + s.heapUsed, 0) / memorySamples.length;
    const heapDelta = finalMemory.heapUsed - initialMemory.heapUsed;
    
    const measurement: PerformanceResult = {
      name,
      value: peakHeap / 1024 / 1024, // Convert to MB
      unit: 'mb',
      target: 100, // 100MB default target
      passed: peakHeap < 100 * 1024 * 1024, // 100MB threshold
      deviation: 0,
      timestamp: new Date().toISOString(),
      metadata: {
        initialHeap: initialMemory.heapUsed,
        finalHeap: finalMemory.heapUsed,
        peakHeap,
        averageHeap,
        heapDelta,
        samples: memorySamples.length,
        memoryLeakDetected: heapDelta > 10 * 1024 * 1024 // 10MB threshold
      }
    };

    this.recordResult(measurement);
    return measurement;
  }

  /**
   * Records a performance result
   */
  recordResult(result: PerformanceResult): void {
    const results = this.results.get(result.name) || [];
    results.push(result);
    this.results.set(result.name, results);
  }

  /**
   * Runs regression analysis against previous results
   */
  async runRegressionAnalysis(baselinePath?: string): Promise<{
    regressions: { name: string; currentValue: number; baselineValue: number; regression: number }[];
    improvements: { name: string; currentValue: number; baselineValue: number; improvement: number }[];
    summary: {
      totalMetrics: number;
      regressions: number;
      improvements: number;
      stable: number;
    };
  }> {
    // Load baseline if provided
    if (baselinePath && await this.fileExists(baselinePath)) {
      await this.loadBaseline(baselinePath);
    }

    const regressions = [];
    const improvements = [];
    
    for (const [name, results] of this.results) {
      if (results.length === 0) continue;
      
      const latestResult = results[results.length - 1];
      const baseline = this.baselines.get(name);
      
      if (baseline) {
        const change = ((latestResult.value - baseline) / baseline) * 100;
        const target = this.targets.get(name);
        
        // For metrics where lower is better (latency, error rate)
        const lowerIsBetter = target?.unit === 'ms' || name.includes('error') || name.includes('latency');
        
        if (lowerIsBetter) {
          if (change > (target?.tolerance || 10)) {
            regressions.push({
              name,
              currentValue: latestResult.value,
              baselineValue: baseline,
              regression: change
            });
          } else if (change < -(target?.tolerance || 10)) {
            improvements.push({
              name,
              currentValue: latestResult.value,
              baselineValue: baseline,
              improvement: -change
            });
          }
        } else {
          // For metrics where higher is better (throughput, coverage)
          if (change < -(target?.tolerance || 10)) {
            regressions.push({
              name,
              currentValue: latestResult.value,
              baselineValue: baseline,
              regression: -change
            });
          } else if (change > (target?.tolerance || 10)) {
            improvements.push({
              name,
              currentValue: latestResult.value,
              baselineValue: baseline,
              improvement: change
            });
          }
        }
      }
    }

    const totalMetrics = this.results.size;
    
    return {
      regressions,
      improvements,
      summary: {
        totalMetrics,
        regressions: regressions.length,
        improvements: improvements.length,
        stable: totalMetrics - regressions.length - improvements.length
      }
    };
  }

  /**
   * Generates a comprehensive benchmark report
   */
  generateReport(): BenchmarkSuite {
    const allResults: PerformanceResult[] = [];
    let overallStatus: 'PASS' | 'FAIL' | 'WARNING' = 'PASS';
    let criticalFailures = 0;
    let warnings = 0;

    for (const [name, results] of this.results) {
      if (results.length === 0) continue;
      
      const latestResult = results[results.length - 1];
      allResults.push(latestResult);
      
      const target = this.targets.get(name);
      
      if (!latestResult.passed) {
        if (target?.critical) {
          criticalFailures++;
          overallStatus = 'FAIL';
        } else {
          warnings++;
          if (overallStatus === 'PASS') {
            overallStatus = 'WARNING';
          }
        }
      }
    }

    return {
      name: 'ForgeFlow V2 Performance Benchmark',
      description: 'Comprehensive performance validation for production readiness',
      targets: Array.from(this.targets.values()),
      results: allResults,
      overallStatus,
      executionTime: allResults.reduce((sum, r) => sum + (r.metadata.executionTimeMs || 0), 0),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Saves benchmark results to file
   */
  async saveResults(filePath: string): Promise<void> {
    const report = this.generateReport();
    await fs.writeFile(filePath, JSON.stringify(report, null, 2));
  }

  /**
   * Loads baseline results from file
   */
  async loadBaseline(filePath: string): Promise<void> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const baseline = JSON.parse(content);
      
      if (baseline.results) {
        baseline.results.forEach((result: PerformanceResult) => {
          this.baselines.set(result.name, result.value);
        });
      }
    } catch (error) {
      console.warn(`Failed to load baseline from ${filePath}:`, error.message);
    }
  }

  /**
   * Sets a baseline for a specific metric
   */
  setBaseline(name: string, value: number): void {
    this.baselines.set(name, value);
  }

  /**
   * Gets the latest result for a metric
   */
  getLatestResult(name: string): PerformanceResult | null {
    const results = this.results.get(name);
    return results && results.length > 0 ? results[results.length - 1] : null;
  }

  /**
   * Gets all results for a metric
   */
  getAllResults(name: string): PerformanceResult[] {
    return this.results.get(name) || [];
  }

  /**
   * Clears all results
   */
  clearResults(): void {
    this.results.clear();
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Creates a performance comparison chart data
   */
  createComparisonChart(metricName: string): {
    labels: string[];
    values: number[];
    targets: number[];
    passed: boolean[];
  } {
    const results = this.getAllResults(metricName);
    const target = this.targets.get(metricName);
    
    return {
      labels: results.map(r => new Date(r.timestamp).toLocaleTimeString()),
      values: results.map(r => r.value),
      targets: results.map(() => target?.targetValue || 0),
      passed: results.map(r => r.passed)
    };
  }
}