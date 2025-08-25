import fs from 'fs-extra';
import path from 'path';
import { LogContext } from '../utils/logger';

interface ExternalAgentSource {
  id: string;
  type: 'workspace' | 'docker' | 'redis' | 'process' | 'log-based';
  discoveryMethod: () => Promise<ExternalAgent[]>;
  healthCheck: () => Promise<boolean>;
}

interface ExternalAgent {
  id: string;
  name: string;
  type: string;
  status: 'active' | 'idle' | 'error' | 'unknown';
  source: string;
  location: string;
  lastSeen: Date;
  currentTask?: string;
  capabilities: string[];
  metadata: Record<string, any>;
}

export class CrossProjectAgentDiscovery {
  private sources: Map<string, ExternalAgentSource> = new Map();
  private discoveredAgents: Map<string, ExternalAgent> = new Map();
  private discoveryInterval: NodeJS.Timeout | null = null;
  private logger: LogContext;

  constructor() {
    this.logger = new LogContext('CrossProjectDiscovery');
    this.initializeSources();
  }

  private initializeSources(): void {
    // Agent Workspaces Discovery
    this.registerSource({
      id: 'agent-workspaces',
      type: 'workspace',
      discoveryMethod: this.discoverWorkspaceAgents.bind(this),
      healthCheck: this.checkWorkspaceHealth.bind(this),
    });

    // Redis-based Agents Discovery
    this.registerSource({
      id: 'redis-agents',
      type: 'redis',
      discoveryMethod: this.discoverRedisAgents.bind(this),
      healthCheck: this.checkRedisHealth.bind(this),
    });

    // Docker Agent Discovery
    this.registerSource({
      id: 'docker-agents',
      type: 'docker',
      discoveryMethod: this.discoverDockerAgents.bind(this),
      healthCheck: this.checkDockerHealth.bind(this),
    });

    // Process-based Discovery
    this.registerSource({
      id: 'process-agents',
      type: 'process',
      discoveryMethod: this.discoverProcessAgents.bind(this),
      healthCheck: this.checkProcessHealth.bind(this),
    });

    // Log-based Discovery (for legacy agents)
    this.registerSource({
      id: 'log-agents',
      type: 'log-based',
      discoveryMethod: this.discoverLogBasedAgents.bind(this),
      healthCheck: this.checkLogHealth.bind(this),
    });
  }

  private async discoverWorkspaceAgents(): Promise<ExternalAgent[]> {
    const workspacePath = 'C:\\Jarvis\\AI Workspace\\agent_workspaces';
    const agents: ExternalAgent[] = [];

    try {
      const workspaces = await fs.readdir(workspacePath);

      for (const workspace of workspaces) {
        const configPath = path.join(workspacePath, workspace, 'config.json');

        if (await fs.pathExists(configPath)) {
          try {
            const config = await fs.readJSON(configPath);

            // Check if agent is running (simplified check)
            const status = await this.checkAgentStatus(workspace);

            agents.push({
              id: config.id || workspace,
              name: config.name || workspace,
              type: config.type || 'unknown',
              status,
              source: 'agent-workspaces',
              location: path.join(workspacePath, workspace),
              lastSeen: new Date(),
              capabilities: config.capabilities || [],
              metadata: {
                priority: config.priority,
                sessionId: config.session_id,
                maxMemoryMb: config.max_memory_mb,
                timeoutMinutes: config.timeout_minutes,
              },
            });
          } catch (error) {
            this.logger.error(`Failed to read config for ${workspace}:`, error);
          }
        }
      }
    } catch (error) {
      this.logger.error('Failed to discover workspace agents:', error);
    }

    return agents;
  }

  private async discoverRedisAgents(): Promise<ExternalAgent[]> {
    // Simplified Redis discovery - disabled for now to avoid dependency issues
    const agents: ExternalAgent[] = [];

    try {
      this.logger.info(
        'Redis agent discovery disabled - implement with simple file-based approach',
      );
    } catch (error) {
      this.logger.warn('Redis not available for agent discovery:', error);
    }

    return agents;
  }

  private async discoverDockerAgents(): Promise<ExternalAgent[]> {
    const agents: ExternalAgent[] = [];

    try {
      // Simplified approach - check known project locations for docker agent logs
      const knownProjects = [
        'C:\\Jarvis\\AI Workspace\\life-arrow-v1',
        'C:\\Jarvis\\AI Workspace\\FibreFlow_React',
        'C:\\Jarvis\\AI Workspace\\Jarvis AI',
      ];

      for (const projectPath of knownProjects) {
        const dockerLogPath = path.join(projectPath, 'docker_agent_usage.log');

        if (await fs.pathExists(dockerLogPath)) {
          const projectName = path.basename(projectPath);
          const recentActivity = await this.parseDockerAgentActivity(dockerLogPath);

          if (recentActivity.length > 0) {
            agents.push({
              id: `docker-agent-${projectName}`,
              name: `Docker Agent (${projectName})`,
              type: 'docker-agent',
              status: recentActivity[0].timestamp > Date.now() - 300000 ? 'active' : 'idle', // 5 minutes
              source: 'docker-agents',
              location: projectPath,
              lastSeen: new Date(recentActivity[0].timestamp),
              currentTask: recentActivity[0].task,
              capabilities: ['process-enforcement', 'docker-management', 'project-analysis'],
              metadata: {
                recentActivity: recentActivity.slice(0, 5),
                logFile: dockerLogPath,
              },
            });
          }
        }
      }
    } catch (error) {
      this.logger.error('Failed to discover docker agents:', error);
    }

    return agents;
  }

  private async discoverProcessAgents(): Promise<ExternalAgent[]> {
    const agents: ExternalAgent[] = [];

    try {
      // Simplified approach - check specific known agent scripts
      const knownAgentScripts = [
        'C:\\Jarvis\\AI Workspace\\FibreFlow_React\\activate_forgeflow.py',
        'C:\\Jarvis\\AI Workspace\\FibreFlow_React\\multi_agent_status.py',
        'C:\\Jarvis\\AI Workspace\\life-arrow-v1\\trigger_docker_agents.py',
      ];

      for (const scriptPath of knownAgentScripts) {
        if (await fs.pathExists(scriptPath)) {
          const agentInfo = this.extractAgentInfoFromFile(scriptPath);

          agents.push({
            id: `process-${agentInfo.name}`,
            name: agentInfo.name,
            type: 'process-agent',
            status: 'idle', // Default status
            source: 'process-agents',
            location: agentInfo.location,
            lastSeen: new Date(),
            capabilities: agentInfo.capabilities,
            metadata: {
              scriptPath,
            },
          });
        }
      }
    } catch (error) {
      this.logger.error('Failed to discover process agents:', error);
    }

    return agents;
  }

  private async discoverLogBasedAgents(): Promise<ExternalAgent[]> {
    const agents: ExternalAgent[] = [];

    try {
      // Check specific known log files
      const knownLogFiles = [
        'C:\\Jarvis\\AI Workspace\\master_learning_orchestrator.log',
        'C:\\Jarvis\\AI Workspace\\FibreFlow Data\\real_agent_max.log',
        'C:\\Jarvis\\AI Workspace\\Jarvis AI\\real_agent_max.log',
        'C:\\Jarvis\\AI Workspace\\life-arrow-v1\\real_agent_max.log',
      ];

      for (const logFile of knownLogFiles) {
        if (await fs.pathExists(logFile)) {
          const agentActivity = await this.parseAgentLogActivity(logFile);

          if (agentActivity && agentActivity.recentActivity.length > 0) {
            agents.push({
              id: agentActivity.id,
              name: agentActivity.name,
              type: 'log-based-agent',
              status: agentActivity.status,
              source: 'log-agents',
              location: path.dirname(logFile),
              lastSeen: agentActivity.lastSeen,
              currentTask: agentActivity.currentTask,
              capabilities: agentActivity.capabilities,
              metadata: {
                logFile,
                recentEntries: agentActivity.recentActivity.slice(0, 5),
              },
            });
          }
        }
      }
    } catch (error) {
      this.logger.error('Failed to discover log-based agents:', error);
    }

    return agents;
  }

  // Start discovery process
  public async startDiscovery(intervalMs: number = 30000): Promise<void> {
    this.logger.info('Starting cross-project agent discovery...');

    // Initial discovery
    await this.performDiscovery();

    // Set up periodic discovery
    this.discoveryInterval = setInterval(async () => {
      await this.performDiscovery();
    }, intervalMs);
  }

  public async performDiscovery(): Promise<void> {
    const allAgents = new Map<string, ExternalAgent>();

    for (const [sourceId, source] of this.sources) {
      try {
        const isHealthy = await source.healthCheck();
        if (!isHealthy) {
          this.logger.warn(`Source ${sourceId} is not healthy, skipping...`);
          continue;
        }

        const agents = await source.discoveryMethod();
        this.logger.info(`Discovered ${agents.length} agents from ${sourceId}`);

        for (const agent of agents) {
          allAgents.set(agent.id, agent);
        }
      } catch (error) {
        this.logger.error(`Failed to discover from source ${sourceId}:`, error);
      }
    }

    this.discoveredAgents = allAgents;
    this.logger.info(`Total discovered agents: ${allAgents.size}`);
  }

  public getAllDiscoveredAgents(): ExternalAgent[] {
    return Array.from(this.discoveredAgents.values());
  }

  public getAgentsByStatus(status: ExternalAgent['status']): ExternalAgent[] {
    return this.getAllDiscoveredAgents().filter((agent) => agent.status === status);
  }

  public getBusyAgents(): ExternalAgent[] {
    return this.getAgentsByStatus('active');
  }

  public getAgentMetrics(): {
    total: number;
    byStatus: Record<string, number>;
    byType: Record<string, number>;
    bySource: Record<string, number>;
  } {
    const agents = this.getAllDiscoveredAgents();

    return {
      total: agents.length,
      byStatus: this.groupBy(agents, 'status'),
      byType: this.groupBy(agents, 'type'),
      bySource: this.groupBy(agents, 'source'),
    };
  }

  private groupBy(agents: ExternalAgent[], key: keyof ExternalAgent): Record<string, number> {
    return agents.reduce(
      (acc, agent) => {
        const value = String(agent[key]);
        acc[value] = (acc[value] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );
  }

  // Helper methods
  private registerSource(source: ExternalAgentSource): void {
    this.sources.set(source.id, source);
  }

  private async checkAgentStatus(workspace: string): Promise<ExternalAgent['status']> {
    // Simplified status check - in production would check actual processes
    return Math.random() > 0.7 ? 'active' : 'idle';
  }

  private isAgentScript(filePath: string): boolean {
    const agentIndicators = [
      'agent_main.py',
      'trigger_docker_agents.py',
      'multi_agent',
      'forgeflow',
      'orchestrator',
    ];

    const fileName = path.basename(filePath).toLowerCase();
    return agentIndicators.some((indicator) => fileName.includes(indicator.toLowerCase()));
  }

  private extractAgentInfoFromFile(filePath: string): {
    name: string;
    location: string;
    capabilities: string[];
  } {
    const name = path.basename(filePath, '.py');
    const location = path.dirname(filePath);
    const capabilities = this.inferCapabilities(name, location);

    return { name, location, capabilities };
  }

  private inferCapabilities(name: string, location: string): string[] {
    const capabilities: string[] = [];

    if (name.includes('orchestrator')) capabilities.push('orchestration', 'coordination');
    if (name.includes('architect')) capabilities.push('architecture', 'design');
    if (name.includes('docker')) capabilities.push('docker', 'deployment');
    if (name.includes('multi_agent')) capabilities.push('multi-agent', 'coordination');
    if (location.includes('forgeflow')) capabilities.push('forgeflow', 'ai-orchestration');

    return capabilities;
  }

  private async parseDockerAgentActivity(logFile: string): Promise<
    Array<{
      timestamp: number;
      task: string;
      pid?: number;
    }>
  > {
    try {
      const content = await fs.readFile(logFile, 'utf-8');
      const lines = content.split('\n').filter((line) => line.trim());
      const recentLines = lines.slice(-10); // Last 10 entries

      return recentLines.map((line) => {
        const match = line.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+)/);
        const timestamp = match ? new Date(match[1]).getTime() : Date.now();

        return {
          timestamp,
          task: line.includes('--requirements')
            ? line.split('--requirements')[1]?.trim().replace(/['"]/g, '') || 'unknown'
            : 'agent activity',
          pid: line.includes('PID') ? parseInt(line.match(/PID (\d+)/)?.[1] || '0') : undefined,
        };
      });
    } catch (error) {
      this.logger.error(`Failed to parse docker agent log ${logFile}:`, error);
      return [];
    }
  }

  private async parseAgentLogActivity(logFile: string): Promise<{
    id: string;
    name: string;
    status: ExternalAgent['status'];
    lastSeen: Date;
    currentTask?: string;
    capabilities: string[];
    recentActivity: any[];
  } | null> {
    try {
      const content = await fs.readFile(logFile, 'utf-8');
      const lines = content.split('\n').filter((line) => line.trim());

      if (lines.length === 0) return null;

      const fileName = path.basename(logFile, '.log');
      const lastLine = lines[lines.length - 1];
      const recentLines = lines.slice(-5);

      // Extract timestamp from last line
      const timestampMatch = lastLine.match(/(\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2})/);
      const lastSeen = timestampMatch ? new Date(timestampMatch[1]) : new Date();

      // Determine status based on recent activity (within last 5 minutes)
      const isRecentActivity = Date.now() - lastSeen.getTime() < 300000;
      const status: ExternalAgent['status'] = isRecentActivity ? 'active' : 'idle';

      return {
        id: `log-${fileName}`,
        name: fileName.replace(/[_-]/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
        status,
        lastSeen,
        capabilities: this.inferCapabilities(fileName, path.dirname(logFile)),
        recentActivity: recentLines,
      };
    } catch (error) {
      this.logger.error(`Failed to parse log activity for ${logFile}:`, error);
      return null;
    }
  }

  // Health check methods
  private async checkWorkspaceHealth(): Promise<boolean> {
    try {
      await fs.access('C:\\Jarvis\\AI Workspace\\agent_workspaces');
      return true;
    } catch {
      return false;
    }
  }

  private async checkRedisHealth(): Promise<boolean> {
    // Simplified Redis health check - disabled for now
    return false;
  }

  private async checkDockerHealth(): Promise<boolean> {
    // Always return true for log-based discovery
    return true;
  }

  private async checkProcessHealth(): Promise<boolean> {
    // Always return true for process discovery
    return true;
  }

  private async checkLogHealth(): Promise<boolean> {
    // Always return true for log-based discovery
    return true;
  }

  public stopDiscovery(): void {
    if (this.discoveryInterval) {
      clearInterval(this.discoveryInterval);
      this.discoveryInterval = null;
    }
    this.logger.info('Cross-project agent discovery stopped');
  }
}

export type { ExternalAgent, ExternalAgentSource };
