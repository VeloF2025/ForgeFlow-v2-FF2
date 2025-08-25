// Enhanced CLI Commands - Foundation Layer Integration
// Provides CLI access to Knowledge Management and Memory Layer functionality

import { Command } from 'commander';
import chalk from 'chalk';
import { table } from 'table';
import inquirer from 'inquirer';
import { promises as fs } from 'fs';
import * as path from 'path';

// Import Foundation Layer components
import { 
  MemoryManager, 
  createMemoryLayer, 
  defaultMemoryConfig, 
  developmentMemoryConfig 
} from '../memory';
import { 
  KnowledgeManager, 
  initializeKnowledgeSystem, 
  createKnowledgeConfig 
} from '../knowledge';
import { logger } from '../utils/logger';

// Global instances (lazy-loaded)
let memoryManager: MemoryManager | null = null;
let knowledgeManager: KnowledgeManager | null = null;

/**
 * Check if enhanced commands are available
 * @returns Promise<boolean> True if Foundation Layer is initialized
 */
export async function areEnhancedCommandsAvailable(): Promise<boolean> {
  try {
    // Check if configuration directories exist
    const memoryPath = path.resolve('.ff2/memory');
    const knowledgePath = path.resolve('.ff2/knowledge');
    
    const [memoryExists, knowledgeExists] = await Promise.all([
      fs.access(memoryPath).then(() => true).catch(() => false),
      fs.access(knowledgePath).then(() => true).catch(() => false)
    ]);

    return memoryExists || knowledgeExists;
  } catch {
    return false;
  }
}

/**
 * Initialize Foundation Layer components
 */
async function initializeFoundationLayer(): Promise<void> {
  if (memoryManager && knowledgeManager) {
    return; // Already initialized
  }

  try {
    logger.info('Initializing Foundation Layer components...');

    // Determine environment
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    // Initialize Knowledge Management System
    const knowledgeConfig = createKnowledgeConfig('.ff2/knowledge');
    knowledgeManager = await initializeKnowledgeSystem(knowledgeConfig);

    // Initialize Memory Layer with Knowledge integration
    const memoryConfig = isDevelopment ? developmentMemoryConfig : defaultMemoryConfig;
    memoryManager = await createMemoryLayer(memoryConfig, knowledgeManager);

    logger.info('Foundation Layer initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize Foundation Layer:', error);
    throw new Error(`Foundation Layer initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Add enhanced commands to CLI program
 * @param program Commander program instance
 */
export function addEnhancedCommands(program: Command): void {
  // Memory Layer Commands
  const memoryCmd = program
    .command('memory')
    .description('Memory Layer operations for job tracking and analytics');

  memoryCmd
    .command('init <issueId> <sessionId>')
    .description('Initialize memory for a new job')
    .action(async (issueId: string, sessionId: string) => {
      try {
        await initializeFoundationLayer();
        if (!memoryManager) throw new Error('Memory Manager not available');

        console.log(chalk.cyan('Initializing job memory...'));
        const jobMemory = await memoryManager.initializeJobMemory(issueId, sessionId);

        console.log(chalk.green('✓ Job memory initialized successfully'));
        console.log(`Job ID: ${jobMemory.jobId}`);
        console.log(`Issue ID: ${jobMemory.issueId}`);
        console.log(`Session ID: ${jobMemory.sessionId}`);
        console.log(`Status: ${jobMemory.status}`);
      } catch (error) {
        console.error(chalk.red('Failed to initialize job memory:'), error);
        process.exit(1);
      }
    });

  memoryCmd
    .command('get <jobId>')
    .description('Get job memory details')
    .action(async (jobId: string) => {
      try {
        await initializeFoundationLayer();
        if (!memoryManager) throw new Error('Memory Manager not available');

        const memory = await memoryManager.getJobMemory(jobId);
        if (!memory) {
          console.log(chalk.yellow(`Job memory not found: ${jobId}`));
          return;
        }

        console.log(chalk.cyan('Job Memory Details:'));
        console.log(`Job ID: ${memory.jobId}`);
        console.log(`Issue ID: ${memory.issueId}`);
        console.log(`Status: ${memory.status}`);
        console.log(`Created: ${memory.startTime ? memory.startTime.toISOString() : 'N/A'}`);
        console.log(`Updated: ${memory.endTime ? memory.endTime.toISOString() : 'N/A'}`);
        console.log(`Decisions: ${memory.decisions.length}`);
        console.log(`Gotchas: ${memory.gotchas.length}`);
        console.log(`Context Entries: ${memory.context ? memory.context.length : 0}`);
        console.log(`Outcomes: ${memory.outcomes.length}`);
      } catch (error) {
        console.error(chalk.red('Failed to get job memory:'), error);
        process.exit(1);
      }
    });

  memoryCmd
    .command('analytics <jobId>')
    .description('Get analytics for a job')
    .action(async (jobId: string) => {
      try {
        await initializeFoundationLayer();
        if (!memoryManager) throw new Error('Memory Manager not available');

        console.log(chalk.cyan('Calculating job analytics...'));
        const analytics = await memoryManager.calculateJobAnalytics(jobId);

        const analyticsTable = [
          ['Metric', 'Value'],
          ['Pattern Matches', analytics.patternMatches.length.toString()],
          ['Learning Score', `${(analytics.learningScore * 100).toFixed(1)}%`],
          ['Reuse Score', `${(analytics.reuseScore * 100).toFixed(1)}%`],
          ['Innovation Score', `${(analytics.innovationScore * 100).toFixed(1)}%`],
          ['Avg Decision Time', `${analytics.efficiencyMetrics.decisionTime.toFixed(0)}min`],
          ['Context Retrieval Time', `${analytics.efficiencyMetrics.contextRetrievalTime.toFixed(0)}s`]
        ];

        console.log('\n' + table(analyticsTable));

        if (analytics.patternMatches.length > 0) {
          console.log(chalk.cyan('\nIdentified Patterns:'));
          analytics.patternMatches.forEach((pattern, index) => {
            console.log(`${index + 1}. ${pattern.patternType} [${pattern.patternId}] (confidence: ${(pattern.confidence * 100).toFixed(1)}%)`);
          });
        }
      } catch (error) {
        console.error(chalk.red('Failed to get analytics:'), error);
        process.exit(1);
      }
    });

  memoryCmd
    .command('list')
    .description('List all job memories')
    .option('--issue <issueId>', 'Filter by issue ID')
    .option('--agent <agentType>', 'Filter by agent type')
    .action(async (options) => {
      try {
        await initializeFoundationLayer();
        if (!memoryManager) throw new Error('Memory Manager not available');

        let jobs;
        if (options.issue) {
          jobs = await memoryManager.getJobsByIssue(options.issue);
        } else if (options.agent) {
          jobs = await memoryManager.getJobsByAgent(options.agent);
        } else {
          jobs = await memoryManager.getGlobalJobLog();
        }

        if (jobs.length === 0) {
          console.log(chalk.yellow('No job memories found'));
          return;
        }

        const jobTable = [
          ['Job ID', 'Issue ID', 'Session ID', 'Status', 'Created', 'Duration'],
          ...jobs.map(job => [
            job.jobId.substring(0, 12) + '...',
            job.issueId,
            job.sessionId.substring(0, 12) + '...',
            job.status,
            job.createdAt.toISOString().split('T')[0],
            job.completedAt 
              ? `${Math.floor((new Date(job.completedAt).getTime() - new Date(job.createdAt).getTime()) / 1000 / 60)}min`
              : 'N/A'
          ])
        ];

        console.log('\n' + table(jobTable));
        console.log(chalk.gray(`\nTotal: ${jobs.length} job(s)`));
      } catch (error) {
        console.error(chalk.red('Failed to list jobs:'), error);
        process.exit(1);
      }
    });

  // Knowledge Management Commands
  const knowledgeCmd = program
    .command('knowledge')
    .description('Knowledge Management System operations');

  knowledgeCmd
    .command('create')
    .description('Create a new knowledge card')
    .action(async () => {
      try {
        await initializeFoundationLayer();
        if (!knowledgeManager) throw new Error('Knowledge Manager not available');

        const answers = await inquirer.prompt([
          {
            type: 'input',
            name: 'title',
            message: 'Knowledge card title:',
            validate: input => input.trim() !== '' || 'Title is required'
          },
          {
            type: 'list',
            name: 'category',
            message: 'Category:',
            choices: [
              'architecture',
              'implementation',
              'testing',
              'deployment',
              'security',
              'performance',
              'debugging',
              'best-practice',
              'pattern',
              'other'
            ]
          },
          {
            type: 'list',
            name: 'type',
            message: 'Type:',
            choices: ['pattern', 'solution', 'best-practice', 'gotcha', 'decision']
          },
          {
            type: 'editor',
            name: 'content',
            message: 'Content (markdown supported):'
          },
          {
            type: 'input',
            name: 'tags',
            message: 'Tags (comma-separated):',
            filter: (input: string) => input.split(',').map(tag => tag.trim()).filter(tag => tag !== '')
          },
          {
            type: 'number',
            name: 'effectiveness',
            message: 'Effectiveness score (0.0-1.0):',
            default: 0.8,
            validate: input => (input >= 0 && input <= 1) || 'Must be between 0.0 and 1.0'
          },
          {
            type: 'list',
            name: 'priority',
            message: 'Priority:',
            choices: ['low', 'medium', 'high', 'critical'],
            default: 'medium'
          }
        ]);

        const card = await knowledgeManager.createCard({
          title: answers.title,
          category: answers.category,
          type: answers.type,
          content: answers.content,
          tags: answers.tags,
          effectiveness: answers.effectiveness,
          metadata: {
            difficulty: answers.difficulty || 'medium',
            scope: 'project',
            agentTypes: [],
            relatedIssues: [],
            outcomes: []
          }
        });

        console.log(chalk.green('✓ Knowledge card created successfully'));
        console.log(`ID: ${card.id}`);
        console.log(`Title: ${card.title}`);
        console.log(`Category: ${card.category}`);
      } catch (error) {
        console.error(chalk.red('Failed to create knowledge card:'), error);
        process.exit(1);
      }
    });

  knowledgeCmd
    .command('search <query>')
    .description('Search knowledge cards')
    .option('-c, --category <category>', 'Filter by category')
    .option('-t, --type <type>', 'Filter by type')
    .option('-l, --limit <limit>', 'Limit results', '10')
    .action(async (query: string, options) => {
      try {
        await initializeFoundationLayer();
        if (!knowledgeManager) throw new Error('Knowledge Manager not available');

        const searchOptions: any = {
          query,
          limit: parseInt(options.limit)
        };

        if (options.category) {
          searchOptions.categories = [options.category];
        }

        if (options.type) {
          searchOptions.types = [options.type];
        }

        const results = await knowledgeManager.searchCards(searchOptions);

        if (results.cards.length === 0) {
          console.log(chalk.yellow('No knowledge cards found'));
          return;
        }

        console.log(chalk.cyan(`Found ${results.cards.length} knowledge card(s):\n`));

        results.cards.forEach((card, index) => {
          console.log(chalk.bold(`${index + 1}. ${card.title}`));
          console.log(`   ID: ${card.id}`);
          console.log(`   Category: ${card.category} | Type: ${card.type}`);
          console.log(`   Effectiveness: ${(card.effectiveness * 100).toFixed(1)}%`);
          console.log(`   Usage: ${card.usageCount} times`);
          console.log(`   Tags: ${card.tags.join(', ')}`);
          console.log(`   Preview: ${card.content.substring(0, 100)}...`);
          console.log();
        });
      } catch (error) {
        console.error(chalk.red('Failed to search knowledge:'), error);
        process.exit(1);
      }
    });

  knowledgeCmd
    .command('get <cardId>')
    .description('Get detailed knowledge card information')
    .action(async (cardId: string) => {
      try {
        await initializeFoundationLayer();
        if (!knowledgeManager) throw new Error('Knowledge Manager not available');

        const card = await knowledgeManager.getCard(cardId);
        if (!card) {
          console.log(chalk.yellow(`Knowledge card not found: ${cardId}`));
          return;
        }

        console.log(chalk.cyan('Knowledge Card Details:'));
        console.log(`ID: ${card.id}`);
        console.log(`Title: ${card.title}`);
        console.log(`Category: ${card.category}`);
        console.log(`Type: ${card.type}`);
        console.log(`Effectiveness: ${(card.effectiveness * 100).toFixed(1)}%`);
        console.log(`Applicability: ${(card.applicabilityScore * 100).toFixed(1)}%`);
        console.log(`Usage Count: ${card.usageCount}`);
        console.log(`Created: ${card.createdAt.toISOString()}`);
        console.log(`Last Used: ${card.lastUsed.toISOString()}`);
        console.log(`Tags: ${card.tags.join(', ')}`);
        console.log('\nContent:');
        console.log(card.content);
      } catch (error) {
        console.error(chalk.red('Failed to get knowledge card:'), error);
        process.exit(1);
      }
    });

  knowledgeCmd
    .command('stats')
    .description('Show knowledge management statistics')
    .action(async () => {
      try {
        await initializeFoundationLayer();
        if (!knowledgeManager) throw new Error('Knowledge Manager not available');

        const stats = await knowledgeManager.getStats();

        const statsTable = [
          ['Category', 'Count'],
          ['Total Cards', stats.cards.total.toString()],
          ['Active Cards', stats.cards.active.toString()],
          ['Total Gotchas', stats.gotchas.total.toString()],
          ['Resolved Gotchas', stats.gotchas.resolved.toString()],
          ['Total ADRs', stats.adrs.total.toString()],
          ['Storage Size', `${(stats.storageSize / 1024 / 1024).toFixed(2)} MB`]
        ];

        console.log('\n' + table(statsTable));

        if (stats.topCategories.length > 0) {
          console.log(chalk.cyan('\nTop Categories:'));
          stats.topCategories.forEach((cat, index) => {
            console.log(`${index + 1}. ${cat.name}: ${cat.count} cards`);
          });
        }

        if (stats.recentActivity.length > 0) {
          console.log(chalk.cyan('\nRecent Activity:'));
          stats.recentActivity.slice(0, 5).forEach((activity, index) => {
            console.log(`${index + 1}. ${activity.type}: ${activity.description} (${activity.timestamp.toISOString().split('T')[0]})`);
          });
        }
      } catch (error) {
        console.error(chalk.red('Failed to get knowledge stats:'), error);
        process.exit(1);
      }
    });

  // Learning Commands (Integration workflows)
  const learnCmd = program
    .command('learn')
    .description('Learning and knowledge capture workflows');

  learnCmd
    .command('gotcha <description>')
    .description('Record a gotcha pattern')
    .option('-s, --severity <severity>', 'Severity level', 'medium')
    .option('-c, --category <category>', 'Category', 'general')
    .option('--solution <solution>', 'Solution if known')
    .action(async (description: string, options) => {
      try {
        await initializeFoundationLayer();
        if (!knowledgeManager) throw new Error('Knowledge Manager not available');

        const gotchaPattern = {
          description,
          pattern: description.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), // Escape special chars and store as string
          severity: options.severity as 'low' | 'medium' | 'high' | 'critical',
          category: options.category,
          solution: options.solution,
          preventionSteps: [],
          occurrences: [{
            issueId: 'cli-recorded',
            agentType: 'cli-user',
            context: 'CLI manual recording',
            timestamp: new Date(),
            resolved: !!options.solution,
            resolutionTime: options.solution ? 0 : undefined
          }]
        };

        await knowledgeManager.recordGotcha(gotchaPattern);
        
        console.log(chalk.green('✓ Gotcha pattern recorded successfully'));
        console.log(`Description: ${description}`);
        console.log(`Severity: ${options.severity}`);
        console.log(`Category: ${options.category}`);
        if (options.solution) {
          console.log(`Solution: ${options.solution}`);
        }
      } catch (error) {
        console.error(chalk.red('Failed to record gotcha:'), error);
        process.exit(1);
      }
    });

  // Validation and Testing Commands
  const validateCmd = program
    .command('validate-integration')
    .description('Validate Foundation Layer integration')
    .action(async () => {
      try {
        console.log(chalk.cyan('Validating Foundation Layer integration...'));

        // Test 1: Check if components can be initialized
        console.log('1. Testing component initialization...');
        await initializeFoundationLayer();
        console.log(chalk.green('   ✓ Foundation Layer initialized'));

        // Test 2: Test Knowledge-Memory integration
        console.log('2. Testing Knowledge-Memory integration...');
        const testCard = await knowledgeManager!.createCard({
          title: 'Integration Test Card',
          category: 'testing',
          type: 'pattern',
          content: 'Test card for integration validation',
          tags: ['test', 'integration'],
          effectiveness: 0.8,
          metadata: {
            difficulty: 'low',
            scope: 'project',
            agentTypes: [],
            relatedIssues: [],
            outcomes: []
          }
        });
        
        const testJob = await memoryManager!.initializeJobMemory('test-integration', 'validation-session');
        
        // Record context referencing the knowledge card
        await memoryManager!.recordContext(testJob.jobId, {
          agentType: 'integration-validator',
          type: 'knowledge-card',
          source: `knowledge:${testCard.id}`,
          content: 'Testing knowledge-memory integration',
          relevanceScore: 0.9
        });
        
        console.log(chalk.green('   ✓ Knowledge-Memory integration working'));

        // Test 3: Test performance targets
        console.log('3. Testing performance targets...');
        const perfStart = Date.now();
        
        const searchResults = await knowledgeManager!.searchCards({
          query: 'integration',
          limit: 5
        });
        
        const analytics = await memoryManager!.calculateJobAnalytics(testJob.jobId);
        const perfDuration = Date.now() - perfStart;
        
        if (perfDuration < 500) {
          console.log(chalk.green(`   ✓ Performance targets met (${perfDuration}ms)`));
        } else {
          console.log(chalk.yellow(`   ⚠ Performance slower than expected (${perfDuration}ms)`));
        }

        // Cleanup test data
        await memoryManager!.archiveJobMemory(testJob.jobId);

        console.log(chalk.green('\n✓ Foundation Layer integration validation completed successfully!'));
        console.log('Ready for Phase 2 Intelligence Layer development.');
      } catch (error) {
        console.error(chalk.red('Foundation Layer integration validation failed:'), error);
        process.exit(1);
      }
    });
}

/**
 * Show help for enhanced commands
 */
export function showEnhancedCommandsHelp(): void {
  console.log(chalk.cyan('Enhanced Foundation Layer Commands:'));
  console.log();
  
  console.log(chalk.bold('Memory Layer Commands:'));
  console.log('  memory init <issueId> <sessionId>  Initialize job memory');
  console.log('  memory get <jobId>                 Get job memory details');
  console.log('  memory analytics <jobId>           Get job analytics');
  console.log('  memory list [--issue|--agent]      List job memories');
  console.log();
  
  console.log(chalk.bold('Knowledge Management Commands:'));
  console.log('  knowledge create                   Create knowledge card');
  console.log('  knowledge search <query>           Search knowledge cards');
  console.log('  knowledge get <cardId>             Get knowledge card details');
  console.log('  knowledge stats                    Show knowledge statistics');
  console.log();
  
  console.log(chalk.bold('Learning Commands:'));
  console.log('  learn gotcha <description>         Record gotcha pattern');
  console.log();
  
  console.log(chalk.bold('Validation Commands:'));
  console.log('  validate-integration               Validate Foundation Layer integration');
  console.log();
}