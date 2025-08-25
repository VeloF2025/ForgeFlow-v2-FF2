// 🟢 WORKING: Pluggable Index Provider Registry
// Manages multiple index providers with automatic fallback and load balancing
// Supports SQLite FTS5, Elasticsearch, OpenSearch, and future ML-based providers

import { EventEmitter } from 'events';
import {
  IndexRegistry,
  IndexProvider,
  IndexProviderInfo,
  ProviderHealth,
  IndexCapabilities,
  SearchQuery,
  SearchResults,
  IndexEntry,
  IndexError,
  IndexErrorCode
} from './types.js';

export class ForgeFlowIndexRegistry extends EventEmitter implements IndexRegistry {
  private providers = new Map<string, IndexProvider>();
  private activeProviderName: string | null = null;
  private healthCheckInterval?: NodeJS.Timeout;
  private lastHealthCheck = new Map<string, Date>();
  
  // Performance tracking
  private providerMetrics = new Map<string, ProviderMetrics>();
  private circuitBreakers = new Map<string, CircuitBreaker>();
  
  // Load balancing and failover
  private loadBalancingStrategy: LoadBalancingStrategy = 'round-robin';
  private fallbackChain: string[] = [];
  private requestCounter = 0;

  constructor(healthCheckInterval = 30000) { // 30 seconds
    super();
    
    // Start health monitoring
    this.healthCheckInterval = setInterval(() => {
      this.performHealthChecks();
    }, healthCheckInterval);
  }

  // 🟢 WORKING: Register a new index provider
  registerProvider(provider: IndexProvider): void {
    if (this.providers.has(provider.name)) {
      throw new IndexError(
        `Provider ${provider.name} is already registered`,
        IndexErrorCode.CONCURRENT_UPDATE_CONFLICT,
        { providerName: provider.name }
      );
    }

    console.log(`📋 Registering index provider: ${provider.name} v${provider.version}`);

    this.providers.set(provider.name, provider);
    this.providerMetrics.set(provider.name, new ProviderMetrics());
    this.circuitBreakers.set(provider.name, new CircuitBreaker());

    // Set as active if it's the first provider
    if (!this.activeProviderName) {
      this.activeProviderName = provider.name;
      console.log(`✅ ${provider.name} set as active provider`);
    }

    this.emit('provider_registered', {
      name: provider.name,
      capabilities: provider.capabilities
    });
  }

  // 🟢 WORKING: Unregister a provider
  unregisterProvider(name: string): void {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new IndexError(
        `Provider ${name} not found`,
        IndexErrorCode.INVALID_QUERY,
        { providerName: name }
      );
    }

    console.log(`🗑️ Unregistering index provider: ${name}`);

    // Shutdown provider
    provider.shutdown().catch(error => {
      console.error(`Error shutting down provider ${name}:`, error);
    });

    // Remove from registry
    this.providers.delete(name);
    this.providerMetrics.delete(name);
    this.circuitBreakers.delete(name);
    this.lastHealthCheck.delete(name);

    // Remove from fallback chain
    this.fallbackChain = this.fallbackChain.filter(n => n !== name);

    // Switch active provider if necessary
    if (this.activeProviderName === name) {
      const remainingProviders = Array.from(this.providers.keys());
      this.activeProviderName = remainingProviders.length > 0 ? remainingProviders[0] : null;
      
      if (this.activeProviderName) {
        console.log(`🔄 Switched active provider to: ${this.activeProviderName}`);
      } else {
        console.warn('⚠️ No active providers remaining');
      }
    }

    this.emit('provider_unregistered', { name });
  }

  // 🟢 WORKING: Get a specific provider
  getProvider(name: string): IndexProvider | undefined {
    return this.providers.get(name);
  }

  // 🟢 WORKING: Get the currently active provider
  getActiveProvider(): IndexProvider {
    if (!this.activeProviderName) {
      throw new IndexError(
        'No active index provider available',
        IndexErrorCode.DATABASE_CONNECTION_FAILED
      );
    }

    const provider = this.providers.get(this.activeProviderName);
    if (!provider) {
      throw new IndexError(
        `Active provider ${this.activeProviderName} not found`,
        IndexErrorCode.DATABASE_CONNECTION_FAILED,
        { providerName: this.activeProviderName }
      );
    }

    return provider;
  }

  // 🟢 WORKING: Switch active provider with validation
  async switchProvider(name: string): Promise<void> {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new IndexError(
        `Provider ${name} not found`,
        IndexErrorCode.INVALID_QUERY,
        { providerName: name }
      );
    }

    console.log(`🔄 Switching to provider: ${name}`);

    try {
      // Check provider health before switching
      const health = await provider.getHealth();
      if (health.status === 'unhealthy') {
        throw new IndexError(
          `Cannot switch to unhealthy provider: ${name}`,
          IndexErrorCode.DATABASE_CONNECTION_FAILED,
          { providerName: name, health }
        );
      }

      const previousProvider = this.activeProviderName;
      this.activeProviderName = name;

      this.emit('provider_switched', {
        from: previousProvider,
        to: name,
        health: health.status
      });

      console.log(`✅ Successfully switched to provider: ${name}`);
    } catch (error) {
      this.emit('provider_switch_failed', {
        targetProvider: name,
        error: (error as Error).message
      });
      throw error;
    }
  }

  // 🟢 WORKING: List all registered providers with health status
  listProviders(): IndexProviderInfo[] {
    return Array.from(this.providers.entries()).map(([name, provider]) => {
      const metrics = this.providerMetrics.get(name)!;
      const circuitBreaker = this.circuitBreakers.get(name)!;
      
      return {
        name,
        version: provider.version,
        active: name === this.activeProviderName,
        capabilities: provider.capabilities,
        health: {
          status: circuitBreaker.isOpen() ? 'unhealthy' : metrics.getHealthStatus(),
          latency: metrics.getAverageLatency(),
          errorRate: metrics.getErrorRate(),
          uptime: metrics.getUptime(),
          lastCheck: this.lastHealthCheck.get(name) || new Date(0)
        }
      };
    });
  }

  // 🟢 WORKING: Smart routing with load balancing and failover
  async executeWithFailover<T>(
    operation: (provider: IndexProvider) => Promise<T>,
    retryCount = 3
  ): Promise<T> {
    const providers = this.getProvidersInOrder();
    
    let lastError: Error | null = null;

    for (const providerName of providers) {
      const provider = this.providers.get(providerName);
      const circuitBreaker = this.circuitBreakers.get(providerName);
      const metrics = this.providerMetrics.get(providerName);

      if (!provider || !circuitBreaker || !metrics) continue;

      // Skip if circuit breaker is open
      if (circuitBreaker.isOpen()) {
        console.warn(`⚠️ Skipping provider ${providerName} - circuit breaker open`);
        continue;
      }

      const startTime = Date.now();

      try {
        const result = await operation(provider);
        
        // Record success
        const duration = Date.now() - startTime;
        metrics.recordSuccess(duration);
        circuitBreaker.recordSuccess();

        this.emit('operation_success', {
          provider: providerName,
          duration,
          operation: operation.name
        });

        return result;
      } catch (error) {
        const duration = Date.now() - startTime;
        lastError = error as Error;
        
        // Record failure
        metrics.recordFailure(duration);
        circuitBreaker.recordFailure();

        console.error(`❌ Operation failed on provider ${providerName}:`, error);
        this.emit('operation_failed', {
          provider: providerName,
          error: lastError.message,
          duration
        });

        // Try next provider
        continue;
      }
    }

    // All providers failed
    throw new IndexError(
      `All providers failed. Last error: ${lastError?.message || 'Unknown'}`,
      IndexErrorCode.DATABASE_CONNECTION_FAILED,
      { providersAttempted: providers, lastError }
    );
  }

  // 🟢 WORKING: High-level search with automatic provider selection
  async search(query: SearchQuery): Promise<SearchResults> {
    return this.executeWithFailover(async (provider) => {
      return await provider.search(query);
    });
  }

  // 🟢 WORKING: High-level indexing with automatic provider selection
  async index(entries: IndexEntry[]): Promise<void> {
    return this.executeWithFailover(async (provider) => {
      return await provider.index(entries);
    });
  }

  // 🟢 WORKING: Configure load balancing strategy
  setLoadBalancingStrategy(strategy: LoadBalancingStrategy): void {
    this.loadBalancingStrategy = strategy;
    console.log(`🔄 Load balancing strategy set to: ${strategy}`);
  }

  // 🟢 WORKING: Configure failover chain
  setFallbackChain(chain: string[]): void {
    // Validate all providers exist
    for (const name of chain) {
      if (!this.providers.has(name)) {
        throw new IndexError(
          `Provider ${name} not found for fallback chain`,
          IndexErrorCode.INVALID_QUERY,
          { providerName: name }
        );
      }
    }

    this.fallbackChain = [...chain];
    console.log(`🔗 Fallback chain configured: ${chain.join(' → ')}`);
  }

  // 🟢 WORKING: Get comprehensive registry statistics
  getRegistryStats(): RegistryStats {
    const providers = this.listProviders();
    const totalProviders = providers.length;
    const healthyProviders = providers.filter(p => p.health.status === 'healthy').length;
    
    return {
      totalProviders,
      healthyProviders,
      activeProvider: this.activeProviderName || 'none',
      loadBalancingStrategy: this.loadBalancingStrategy,
      fallbackChain: [...this.fallbackChain],
      totalRequests: Array.from(this.providerMetrics.values())
        .reduce((sum, metrics) => sum + metrics.getTotalRequests(), 0),
      averageLatency: this.calculateOverallAverageLatency(),
      overallErrorRate: this.calculateOverallErrorRate()
    };
  }

  // 🟢 WORKING: Graceful shutdown of all providers
  async shutdown(): Promise<void> {
    console.log('🛑 Shutting down index registry...');

    // Stop health checks
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }

    // Shutdown all providers
    const shutdownPromises = Array.from(this.providers.entries()).map(
      async ([name, provider]) => {
        try {
          await provider.shutdown();
          console.log(`✅ Provider ${name} shut down successfully`);
        } catch (error) {
          console.error(`❌ Error shutting down provider ${name}:`, error);
        }
      }
    );

    await Promise.allSettled(shutdownPromises);

    // Clear all maps
    this.providers.clear();
    this.providerMetrics.clear();
    this.circuitBreakers.clear();
    this.lastHealthCheck.clear();

    this.activeProviderName = null;
    this.emit('registry_shutdown');

    console.log('✅ Index registry shut down successfully');
  }

  // 🟢 WORKING: Private helper methods

  private getProvidersInOrder(): string[] {
    const providers = Array.from(this.providers.keys());

    switch (this.loadBalancingStrategy) {
      case 'round-robin':
        return this.getRoundRobinOrder(providers);
      case 'least-latency':
        return this.getLeastLatencyOrder(providers);
      case 'health-based':
        return this.getHealthBasedOrder(providers);
      case 'active-first':
      default:
        return this.getActiveFirstOrder(providers);
    }
  }

  private getRoundRobinOrder(providers: string[]): string[] {
    if (providers.length === 0) return [];
    
    const startIndex = this.requestCounter % providers.length;
    this.requestCounter++;
    
    return [...providers.slice(startIndex), ...providers.slice(0, startIndex)];
  }

  private getLeastLatencyOrder(providers: string[]): string[] {
    return providers.sort((a, b) => {
      const metricsA = this.providerMetrics.get(a);
      const metricsB = this.providerMetrics.get(b);
      
      if (!metricsA || !metricsB) return 0;
      
      return metricsA.getAverageLatency() - metricsB.getAverageLatency();
    });
  }

  private getHealthBasedOrder(providers: string[]): string[] {
    return providers.sort((a, b) => {
      const metricsA = this.providerMetrics.get(a);
      const metricsB = this.providerMetrics.get(b);
      
      if (!metricsA || !metricsB) return 0;
      
      // Sort by error rate (lower is better)
      return metricsA.getErrorRate() - metricsB.getErrorRate();
    });
  }

  private getActiveFirstOrder(providers: string[]): string[] {
    if (!this.activeProviderName) return providers;
    
    const filtered = providers.filter(p => p !== this.activeProviderName);
    return [this.activeProviderName, ...filtered];
  }

  private async performHealthChecks(): Promise<void> {
    const healthPromises = Array.from(this.providers.entries()).map(
      async ([name, provider]) => {
        try {
          const health = await provider.getHealth();
          this.lastHealthCheck.set(name, new Date());
          
          const metrics = this.providerMetrics.get(name);
          if (metrics) {
            metrics.updateHealth(health.status);
          }
          
          this.emit('health_check_completed', {
            provider: name,
            status: health.status,
            latency: health.latency
          });
        } catch (error) {
          console.error(`Health check failed for provider ${name}:`, error);
          this.emit('health_check_failed', {
            provider: name,
            error: (error as Error).message
          });
        }
      }
    );

    await Promise.allSettled(healthPromises);
  }

  private calculateOverallAverageLatency(): number {
    const metrics = Array.from(this.providerMetrics.values());
    if (metrics.length === 0) return 0;
    
    const totalLatency = metrics.reduce((sum, m) => sum + m.getAverageLatency(), 0);
    return totalLatency / metrics.length;
  }

  private calculateOverallErrorRate(): number {
    const metrics = Array.from(this.providerMetrics.values());
    if (metrics.length === 0) return 0;
    
    const totalRequests = metrics.reduce((sum, m) => sum + m.getTotalRequests(), 0);
    const totalErrors = metrics.reduce((sum, m) => sum + m.getTotalErrors(), 0);
    
    return totalRequests > 0 ? (totalErrors / totalRequests) * 100 : 0;
  }
}

// 🟢 WORKING: Provider performance metrics tracking
class ProviderMetrics {
  private successCount = 0;
  private errorCount = 0;
  private totalLatency = 0;
  private recentLatencies: number[] = [];
  private maxRecentLatencies = 100;
  private healthStatus: ProviderHealth['status'] = 'healthy';
  private startTime = Date.now();

  recordSuccess(latency: number): void {
    this.successCount++;
    this.totalLatency += latency;
    this.addRecentLatency(latency);
  }

  recordFailure(latency: number): void {
    this.errorCount++;
    this.totalLatency += latency;
    this.addRecentLatency(latency);
  }

  private addRecentLatency(latency: number): void {
    this.recentLatencies.push(latency);
    if (this.recentLatencies.length > this.maxRecentLatencies) {
      this.recentLatencies.shift();
    }
  }

  getAverageLatency(): number {
    const totalRequests = this.successCount + this.errorCount;
    return totalRequests > 0 ? this.totalLatency / totalRequests : 0;
  }

  getErrorRate(): number {
    const totalRequests = this.successCount + this.errorCount;
    return totalRequests > 0 ? (this.errorCount / totalRequests) * 100 : 0;
  }

  getTotalRequests(): number {
    return this.successCount + this.errorCount;
  }

  getTotalErrors(): number {
    return this.errorCount;
  }

  getUptime(): number {
    return Math.floor((Date.now() - this.startTime) / 1000);
  }

  updateHealth(status: ProviderHealth['status']): void {
    this.healthStatus = status;
  }

  getHealthStatus(): ProviderHealth['status'] {
    return this.healthStatus;
  }
}

// 🟢 WORKING: Circuit breaker implementation
class CircuitBreaker {
  private failureCount = 0;
  private lastFailureTime = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  
  private readonly failureThreshold = 5;
  private readonly timeout = 60000; // 1 minute
  private readonly halfOpenMaxCalls = 3;
  private halfOpenSuccessCount = 0;

  recordSuccess(): void {
    this.failureCount = 0;
    this.halfOpenSuccessCount++;
    
    if (this.state === 'HALF_OPEN' && this.halfOpenSuccessCount >= this.halfOpenMaxCalls) {
      this.state = 'CLOSED';
      this.halfOpenSuccessCount = 0;
    }
  }

  recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    if (this.state === 'HALF_OPEN') {
      this.state = 'OPEN';
      this.halfOpenSuccessCount = 0;
    } else if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
    }
  }

  isOpen(): boolean {
    if (this.state === 'CLOSED') return false;
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.timeout) {
        this.state = 'HALF_OPEN';
        this.halfOpenSuccessCount = 0;
        return false;
      }
      return true;
    }
    return false; // HALF_OPEN allows calls
  }
}

// 🟢 WORKING: Type definitions
type LoadBalancingStrategy = 'round-robin' | 'least-latency' | 'health-based' | 'active-first';

interface RegistryStats {
  totalProviders: number;
  healthyProviders: number;
  activeProvider: string;
  loadBalancingStrategy: LoadBalancingStrategy;
  fallbackChain: string[];
  totalRequests: number;
  averageLatency: number;
  overallErrorRate: number;
}