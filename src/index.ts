#!/usr/bin/env node

import { createCLI } from './cli/commands';
import { Orchestrator } from './core/orchestrator';
import { loadConfig } from './utils/config';
import { logger } from './utils/logger';
import { DashboardServer } from './web/server';

// Export all public APIs
export { Orchestrator } from './core/orchestrator';
export { WorktreeManager } from './core/worktree-manager';
export { GitHubIntegration } from './integrations/github';
export { AgentPool } from './agents/agent-pool';
export { BaseAgent } from './agents/base-agent';
export { QualityGates } from './quality/quality-gates';
export { ProtocolEnforcer } from './protocols/protocol-enforcer';
export { NLNHProtocol } from './protocols/nlnh-protocol';
export { AntiHallProtocol } from './protocols/antihall-protocol';
export { RYRProtocol } from './protocols/ryr-protocol';
export { loadConfig, saveConfig, getDefaultConfig } from './utils/config';
export { logger, LogContext } from './utils/logger';
export * from './types';

async function main(): Promise<void> {
  // Check if running as CLI
  const args = process.argv.slice(2);

  if (args.length > 0 && !args[0].startsWith('--')) {
    // Running as CLI command
    const program = createCLI();
    await program.parseAsync(process.argv);
  } else {
    // Running as server/daemon
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║     ███████╗ ██████╗ ██████╗  ██████╗ ███████╗           ║
║     ██╔════╝██╔═══██╗██╔══██╗██╔════╝ ██╔════╝           ║
║     █████╗  ██║   ██║██████╔╝██║  ███╗█████╗             ║
║     ██╔══╝  ██║   ██║██╔══██╗██║   ██║██╔══╝             ║
║     ██║     ╚██████╔╝██║  ██║╚██████╔╝███████╗           ║
║     ╚═╝      ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚══════╝           ║
║                                                           ║
║         ███████╗██╗      ██████╗ ██╗    ██╗              ║
║         ██╔════╝██║     ██╔═══██╗██║    ██║              ║
║         █████╗  ██║     ██║   ██║██║ █╗ ██║              ║
║         ██╔══╝  ██║     ██║   ██║██║███╗██║              ║
║         ██║     ███████╗╚██████╔╝╚███╔███╔╝              ║
║         ╚═╝     ╚══════╝ ╚═════╝  ╚══╝╚══╝               ║
║                                                           ║
║              ██╗   ██╗██████╗                             ║
║              ██║   ██║╚════██╗                            ║
║              ██║   ██║ █████╔╝                            ║
║              ╚██╗ ██╔╝██╔═══╝                             ║
║               ╚████╔╝ ███████╗                            ║
║                ╚═══╝  ╚══════╝                            ║
║                                                           ║
║     True Parallel AI Orchestration System                ║
║     With Enterprise Protocols & Zero-Tolerance Quality    ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
  `);

    logger.info('ForgeFlow v2 Starting...');
    logger.info('Initializing True Parallel AI Orchestration');

    try {
      const config = await loadConfig();
      const orchestrator = new Orchestrator(config);

      // Start dashboard server if not in test mode
      if (process.env.NODE_ENV !== 'test') {
        const dashboardPort = parseInt(process.env.DASHBOARD_PORT || '3000');
        const dashboard = new DashboardServer(dashboardPort);
        dashboard.setOrchestrator(orchestrator);
        await dashboard.start();

        logger.info(`📊 Dashboard available at: http://localhost:${dashboardPort}`);
        logger.info(`📈 Metrics endpoint: http://localhost:${dashboardPort}/metrics`);
        logger.info(`🔌 API endpoint: http://localhost:${dashboardPort}/api`);
      }

      logger.info('🚀 ForgeFlow v2 Ready!');
      logger.info('');
      logger.info('Quick Start:');
      logger.info('  forgeflow init                  - Initialize in current repo');
      logger.info('  forgeflow start-parallel <epic> - Start parallel execution');
      logger.info('  forgeflow status                - Check execution status');
      logger.info('  forgeflow validate              - Run quality gates');
      logger.info('  forgeflow protocol <name>       - Activate protocol');
      logger.info('  forgeflow webhook-setup         - Setup GitHub webhooks');
      logger.info('');
      logger.info('Emergency Mode:');
      logger.info('  forgeflow ! <task>              - Bypass all prompts');
      logger.info('');

      // Handle graceful shutdown
      process.on('SIGINT', async () => {
        logger.info('\nShutting down gracefully...');
        await orchestrator.shutdown();
        process.exit(0);
      });

      process.on('SIGTERM', async () => {
        logger.info('\nShutting down gracefully...');
        await orchestrator.shutdown();
        process.exit(0);
      });
    } catch (error) {
      logger.error('Failed to start ForgeFlow v2', error);
      process.exit(1);
    }
  }
}

// Run main function
if (require.main === module) {
  main().catch((error) => {
    logger.error('Unhandled error', error);
    process.exit(1);
  });
}
