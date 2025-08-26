// Search CLI Commands - Enhanced search interface for FF2
// Provides powerful search capabilities through command line interface

import type { Command } from 'commander';
import chalk from 'chalk';
import { table } from 'table';
import inquirer from 'inquirer';
import type {
  ForgeFlowSearchEngine,
  SearchQuery,
  SearchResults,
  IndexConfig,
} from '../../indexing/index.js';
import { ForgeFlowIndexManager, IndexStats } from '../../indexing/index.js';
import { join } from 'path';
import { existsSync } from 'fs';

export class SearchCommands {
  private indexManager: ForgeFlowIndexManager;
  private searchEngine: ForgeFlowSearchEngine;
  private config: IndexConfig;

  constructor() {
    this.config = this.createDefaultConfig();
    this.indexManager = new ForgeFlowIndexManager(this.config);
    this.searchEngine = this.indexManager.getSearchEngine();
  }

  private createDefaultConfig(): IndexConfig {
    const dataPath = process.env.FF2_DATA_PATH || join(process.cwd(), '.ff2', 'data');

    return {
      databasePath: join(dataPath, 'index.db'),
      maxDatabaseSize: 500 * 1024 * 1024, // 500MB
      tokenizer: 'porter',
      removeAccents: true,
      caseSensitive: false,
      cacheSize: 2000,
      synchronous: 'normal',
      journalMode: 'wal',
      batchSize: 200,
      maxContentLength: 50000,
      enableVectorIndex: false,
      autoVacuum: true,
      vacuumThreshold: 25,
      retentionDays: 90,
      defaultLimit: 20,
      maxLimit: 1000,
      snippetLength: 150,
      maxSnippets: 3,
    };
  }

  // Register all search-related commands
  registerCommands(program: Command): void {
    const searchCmd = program
      .command('search')
      .alias('s')
      .description('Search through knowledge, memory, and content');

    // Basic search command
    searchCmd
      .command('query <searchTerms...>')
      .alias('q')
      .description('Search for content')
      .option('-t, --type <type>', 'Filter by content type (knowledge|memory|adr|gotcha|code)')
      .option('-c, --category <category>', 'Filter by category')
      .option('--tags <tags>', 'Filter by tags (comma-separated)')
      .option('-l, --limit <limit>', 'Number of results to return', '20')
      .option('--no-snippets', 'Disable content snippets')
      .option('--no-highlight', 'Disable result highlighting')
      .option('--json', 'Output results in JSON format')
      .option('--recent', 'Boost recent content in results')
      .option('--effective', 'Boost effective content in results')
      .action(async (searchTerms, options) => {
        await this.handleSearchQuery(searchTerms.join(' '), options);
      });

    // Interactive search
    searchCmd
      .command('interactive')
      .alias('i')
      .description('Start interactive search session')
      .action(async () => {
        await this.handleInteractiveSearch();
      });

    // Search similar content
    searchCmd
      .command('similar <entryId>')
      .description('Find content similar to a specific entry')
      .option('-l, --limit <limit>', 'Number of results to return', '10')
      .action(async (entryId, options) => {
        await this.handleSimilarSearch(entryId, options);
      });

    // Search statistics
    searchCmd
      .command('stats')
      .description('Display search and index statistics')
      .option('--days <days>', 'Number of days for analytics', '7')
      .action(async (options) => {
        await this.handleSearchStats(options);
      });

    // Index management commands
    const indexCmd = program.command('index').description('Manage search index');

    indexCmd
      .command('rebuild')
      .description('Rebuild the entire search index')
      .option('--type <type>', 'Rebuild only specific content type')
      .action(async (options) => {
        await this.handleIndexRebuild(options);
      });

    indexCmd
      .command('vacuum')
      .description('Optimize the search index database')
      .action(async () => {
        await this.handleIndexVacuum();
      });

    indexCmd
      .command('status')
      .description('Show index status and statistics')
      .action(async () => {
        await this.handleIndexStatus();
      });
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.indexManager) {
      throw new Error('Index manager not initialized');
    }

    // Initialize if not already done
    try {
      await this.indexManager.initialize();
    } catch (error) {
      console.error(chalk.red('❌ Failed to initialize search index:'), error);
      process.exit(1);
    }
  }

  private async handleSearchQuery(query: string, options: any): Promise<void> {
    await this.ensureInitialized();

    try {
      console.log(chalk.blue(`🔍 Searching for: "${query}"`));

      const searchQuery: SearchQuery = {
        query,
        type: options.type,
        category: options.category,
        tags: options.tags ? options.tags.split(',').map((t: string) => t.trim()) : undefined,
        limit: parseInt(options.limit) || 20,
        includeSnippets: options.snippets !== false,
        highlightResults: options.highlight !== false,
        boostRecent: options.recent,
        boostEffective: options.effective,
      };

      const startTime = Date.now();
      const results = await this.searchEngine.search(searchQuery);
      const searchTime = Date.now() - startTime;

      if (options.json) {
        console.log(JSON.stringify(results, null, 2));
        return;
      }

      this.displaySearchResults(results, searchTime);
    } catch (error) {
      console.error(chalk.red('❌ Search failed:'), error);
      process.exit(1);
    }
  }

  private async handleInteractiveSearch(): Promise<void> {
    await this.ensureInitialized();

    console.log(chalk.green('🔍 Interactive Search Mode'));
    console.log(chalk.gray('Type your search queries. Use "exit" to quit, "help" for commands.'));
    console.log();

    while (true) {
      try {
        const answers = await inquirer.prompt([
          {
            type: 'input',
            name: 'query',
            message: 'Search:',
            validate: (input: string) => {
              if (input.trim().length === 0) {
                return 'Please enter a search query';
              }
              return true;
            },
          },
        ]);

        const query = answers.query.trim();

        if (query.toLowerCase() === 'exit') {
          console.log(chalk.green('👋 Goodbye!'));
          break;
        }

        if (query.toLowerCase() === 'help') {
          this.displayInteractiveHelp();
          continue;
        }

        // Handle special commands
        if (query.startsWith('/')) {
          await this.handleInteractiveCommand(query);
          continue;
        }

        // Perform search
        const startTime = Date.now();
        const results = await this.searchEngine.search({
          query,
          limit: 10,
          includeSnippets: true,
          highlightResults: true,
        });
        const searchTime = Date.now() - startTime;

        this.displaySearchResults(results, searchTime);

        // Offer to view detailed result
        if (results.results.length > 0) {
          const viewAnswer = await inquirer.prompt([
            {
              type: 'list',
              name: 'action',
              message: 'What would you like to do?',
              choices: [
                'Continue searching',
                'View detailed result',
                'Find similar content',
                'Exit',
              ],
            },
          ]);

          if (viewAnswer.action === 'Exit') {
            break;
          } else if (viewAnswer.action === 'View detailed result') {
            await this.handleDetailedView(results);
          } else if (viewAnswer.action === 'Find similar content') {
            await this.handleSimilarFromResults(results);
          }
        }
      } catch (error) {
        if (error.name === 'ExitPromptError') {
          break;
        }
        console.error(chalk.red('❌ Search error:'), error);
      }
    }
  }

  private displayInteractiveHelp(): void {
    console.log();
    console.log(chalk.yellow('🚀 Interactive Search Commands:'));
    console.log(chalk.gray('  Basic search:     ') + 'authentication error');
    console.log(chalk.gray('  Phrase search:    ') + '"exact phrase"');
    console.log(chalk.gray('  Boolean search:   ') + 'auth AND (login OR signin)');
    console.log(chalk.gray('  Type filter:      ') + '/type:knowledge error handling');
    console.log(chalk.gray('  Category filter:  ') + '/category:security auth');
    console.log(chalk.gray('  Tag filter:       ') + '/tags:api,rest integration');
    console.log(chalk.gray('  Recent boost:     ') + '/recent database connection');
    console.log(chalk.gray('  Effective boost:  ') + '/effective error solution');
    console.log(chalk.gray('  Help:             ') + 'help');
    console.log(chalk.gray('  Exit:             ') + 'exit');
    console.log();
  }

  private async handleInteractiveCommand(command: string): Promise<void> {
    const parts = command.slice(1).split(':');
    if (parts.length !== 2) {
      console.log(chalk.red('Invalid command format. Use /command:value search terms'));
      return;
    }

    const [cmd, value] = parts;
    const searchTerms = value.split(' ').slice(1).join(' ');

    const searchQuery: SearchQuery = {
      query: searchTerms || value,
      limit: 10,
      includeSnippets: true,
      highlightResults: true,
    };

    switch (cmd.toLowerCase()) {
      case 'type':
        searchQuery.type = value as any;
        break;
      case 'category':
        searchQuery.category = value;
        break;
      case 'tags':
        searchQuery.tags = value.split(',').map((t) => t.trim());
        break;
      case 'recent':
        searchQuery.boostRecent = true;
        searchQuery.query = searchTerms || 'recent content';
        break;
      case 'effective':
        searchQuery.boostEffective = true;
        searchQuery.query = searchTerms || 'effective solutions';
        break;
      default:
        console.log(chalk.red(`Unknown command: ${cmd}`));
        return;
    }

    const startTime = Date.now();
    const results = await this.searchEngine.search(searchQuery);
    const searchTime = Date.now() - startTime;

    this.displaySearchResults(results, searchTime);
  }

  private async handleDetailedView(results: SearchResults): Promise<void> {
    const choices = results.results.map((result, index) => ({
      name: `${index + 1}. ${result.entry.title} (Score: ${result.score.toFixed(2)})`,
      value: index,
    }));

    const answer = await inquirer.prompt([
      {
        type: 'list',
        name: 'resultIndex',
        message: 'Select result to view:',
        choices,
      },
    ]);

    const selectedResult = results.results[answer.resultIndex];
    this.displayDetailedResult(selectedResult);
  }

  private async handleSimilarFromResults(results: SearchResults): Promise<void> {
    const choices = results.results.map((result, index) => ({
      name: `${index + 1}. ${result.entry.title}`,
      value: result.entry.id,
    }));

    const answer = await inquirer.prompt([
      {
        type: 'list',
        name: 'entryId',
        message: 'Find content similar to:',
        choices,
      },
    ]);

    await this.handleSimilarSearch(answer.entryId, { limit: '10' });
  }

  private async handleSimilarSearch(entryId: string, options: any): Promise<void> {
    await this.ensureInitialized();

    try {
      console.log(chalk.blue(`🎯 Finding content similar to: ${entryId}`));

      const startTime = Date.now();
      const results = await this.searchEngine.searchSimilar(entryId, parseInt(options.limit) || 10);
      const searchTime = Date.now() - startTime;

      this.displaySearchResults(results, searchTime, 'Similar Content');
    } catch (error) {
      console.error(chalk.red('❌ Similar search failed:'), error);
    }
  }

  private async handleSearchStats(options: any): Promise<void> {
    await this.ensureInitialized();

    try {
      const days = parseInt(options.days) || 7;
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

      console.log(chalk.blue(`📊 Search Analytics (Last ${days} days)`));

      const analytics = await this.searchEngine.getAnalytics(startDate, endDate);

      console.log();
      console.log(chalk.green('Query Statistics:'));
      console.log(`  Total queries: ${chalk.yellow(analytics.totalQueries.toLocaleString())}`);
      console.log(`  Unique queries: ${chalk.yellow(analytics.uniqueQueries.toLocaleString())}`);
      console.log(
        `  Average query length: ${chalk.yellow(analytics.averageQueryLength.toFixed(1))} chars`,
      );
      console.log(
        `  Zero result queries: ${chalk.yellow(analytics.zeroResultQueries.toLocaleString())}`,
      );

      console.log();
      console.log(chalk.green('Performance Metrics:'));
      console.log(
        `  Average response time: ${chalk.yellow(analytics.averageResponseTime.toFixed(2))}ms`,
      );
      console.log(`  Cache hit rate: ${chalk.yellow(analytics.cacheMetrics.hitRate.toFixed(1))}%`);
      console.log(
        `  Average results per query: ${chalk.yellow(analytics.averageResults.toFixed(1))}`,
      );

      if (analytics.topQueries.length > 0) {
        console.log();
        console.log(chalk.green('Top Queries:'));
        const topQueriesTable = analytics.topQueries
          .slice(0, 10)
          .map((q) => [
            q.query,
            q.count.toString(),
            `${q.averageResults.toFixed(1)}`,
            `${q.averageResponseTime.toFixed(0)}ms`,
            `${(q.successRate * 100).toFixed(1)}%`,
          ]);

        console.log(
          table(
            [['Query', 'Count', 'Avg Results', 'Avg Time', 'Success Rate'], ...topQueriesTable],
            {
              header: {
                alignment: 'center',
                content: chalk.bold('Top Search Queries'),
              },
            },
          ),
        );
      }

      if (analytics.slowQueries.length > 0) {
        console.log();
        console.log(chalk.yellow('Slow Queries (>1s):'));
        analytics.slowQueries.slice(0, 5).forEach((sq) => {
          console.log(`  ${chalk.red(sq.responseTime)}ms: "${sq.query}"`);
        });
      }
    } catch (error) {
      console.error(chalk.red('❌ Failed to get search statistics:'), error);
    }
  }

  private async handleIndexRebuild(options: any): Promise<void> {
    await this.ensureInitialized();

    try {
      console.log(chalk.yellow('🔄 Rebuilding search index...'));

      const startTime = Date.now();

      if (options.type) {
        await this.indexManager.rebuildPartialIndex(options.type);
        console.log(chalk.green(`✅ Rebuilt ${options.type} index in ${Date.now() - startTime}ms`));
      } else {
        await this.indexManager.rebuildIndex();
        console.log(chalk.green(`✅ Rebuilt complete index in ${Date.now() - startTime}ms`));
      }

      const stats = await this.indexManager.getStats();
      console.log(
        `📊 Index now contains ${chalk.yellow(stats.totalEntries.toLocaleString())} entries`,
      );
    } catch (error) {
      console.error(chalk.red('❌ Index rebuild failed:'), error);
    }
  }

  private async handleIndexVacuum(): Promise<void> {
    await this.ensureInitialized();

    try {
      console.log(chalk.yellow('🧹 Optimizing search index...'));

      const result = await this.indexManager.vacuum();

      if (result.vacuumPerformed) {
        console.log(chalk.green('✅ Index optimization completed'));
        console.log(
          `💾 Space reclaimed: ${chalk.yellow((result.spaceReclaimed / 1024 / 1024).toFixed(2))}MB`,
        );
        console.log(`⏱️  Duration: ${chalk.yellow(result.duration)}ms`);
      } else {
        console.log(chalk.yellow('⚠️ Index optimization not needed'));
      }

      if (result.errors.length > 0) {
        console.log(chalk.red('Errors encountered:'));
        result.errors.forEach((error) => console.log(`  ${error}`));
      }
    } catch (error) {
      console.error(chalk.red('❌ Index vacuum failed:'), error);
    }
  }

  private async handleIndexStatus(): Promise<void> {
    await this.ensureInitialized();

    try {
      console.log(chalk.blue('📊 Search Index Status'));

      const stats = await this.indexManager.getStats();

      console.log();
      console.log(chalk.green('General Information:'));
      console.log(`  Total entries: ${chalk.yellow(stats.totalEntries.toLocaleString())}`);
      console.log(
        `  Database size: ${chalk.yellow((stats.databaseSize / 1024 / 1024).toFixed(2))}MB`,
      );
      console.log(`  Index size: ${chalk.yellow((stats.indexSize / 1024 / 1024).toFixed(2))}MB`);
      console.log(`  Last updated: ${chalk.yellow(stats.lastUpdated.toLocaleString())}`);

      console.log();
      console.log(chalk.green('Performance Metrics:'));
      console.log(`  Average search time: ${chalk.yellow(stats.averageSearchTime.toFixed(2))}ms`);
      console.log(
        `  Average index time: ${chalk.yellow(stats.averageIndexTime.toFixed(2))}ms per entry`,
      );
      console.log(`  Cache hit rate: ${chalk.yellow(stats.cacheHitRate.toFixed(1))}%`);

      console.log();
      console.log(chalk.green('Content Breakdown:'));
      Object.entries(stats.typeBreakdown).forEach(([type, breakdown]) => {
        if (breakdown.count > 0) {
          console.log(`  ${type}: ${chalk.yellow(breakdown.count.toLocaleString())} entries`);
        }
      });

      console.log();
      console.log(chalk.green('Maintenance:'));
      console.log(`  Vacuum needed: ${stats.vacuumNeeded ? chalk.red('Yes') : chalk.green('No')}`);

      if (stats.vacuumNeeded) {
        console.log(chalk.yellow('💡 Run "ff2 index vacuum" to optimize the database'));
      }
    } catch (error) {
      console.error(chalk.red('❌ Failed to get index status:'), error);
    }
  }

  private displaySearchResults(
    results: SearchResults,
    searchTime: number,
    title = 'Search Results',
  ): void {
    console.log();
    console.log(chalk.green(`📋 ${title}`));
    console.log(chalk.gray(`Found ${results.totalMatches} results in ${searchTime}ms`));

    if (results.results.length === 0) {
      console.log(chalk.yellow('No results found.'));

      if (results.suggestions.length > 0) {
        console.log();
        console.log(chalk.blue('💡 Did you mean:'));
        results.suggestions.slice(0, 5).forEach((suggestion) => {
          console.log(`  ${chalk.cyan(suggestion)}`);
        });
      }
      return;
    }

    console.log();

    results.results.forEach((result, index) => {
      const entry = result.entry;

      console.log(chalk.bold(`${index + 1}. ${entry.title}`));
      console.log(
        chalk.gray(
          `   Type: ${entry.type} | Score: ${result.score.toFixed(2)} | Path: ${entry.path}`,
        ),
      );

      if (entry.metadata.tags.length > 0) {
        console.log(chalk.blue(`   Tags: ${entry.metadata.tags.join(', ')}`));
      }

      if (result.contentSnippets.length > 0) {
        const snippet = result.contentSnippets[0];
        const cleanHighlight = snippet.highlighted
          .replace(/<mark>/g, chalk.yellow(''))
          .replace(/<\/mark>/g, chalk.reset(''));
        console.log(chalk.gray(`   ${cleanHighlight.substring(0, 120)}...`));
      }

      console.log();
    });

    // Show pagination info
    if (results.totalPages > 1) {
      console.log(chalk.gray(`Page ${results.currentPage} of ${results.totalPages}`));
    }

    // Show facets if available
    if (
      results.facets &&
      (results.facets.types.length > 0 || results.facets.categories.length > 0)
    ) {
      console.log();
      console.log(chalk.blue('🏷️  Available Filters:'));

      if (results.facets.types.length > 0) {
        const types = results.facets.types
          .slice(0, 5)
          .map((f) => `${f.value} (${f.count})`)
          .join(', ');
        console.log(chalk.gray(`   Types: ${types}`));
      }

      if (results.facets.categories.length > 0) {
        const categories = results.facets.categories
          .slice(0, 5)
          .map((f) => `${f.value} (${f.count})`)
          .join(', ');
        console.log(chalk.gray(`   Categories: ${categories}`));
      }
    }
  }

  private displayDetailedResult(result: any): void {
    const entry = result.entry;

    console.log();
    console.log(chalk.bold.green(`📄 ${entry.title}`));
    console.log(chalk.gray(`ID: ${entry.id}`));
    console.log(chalk.gray(`Type: ${entry.type}`));
    console.log(chalk.gray(`Path: ${entry.path}`));
    console.log(chalk.gray(`Last Modified: ${entry.lastModified.toLocaleString()}`));
    console.log(chalk.gray(`Score: ${result.score.toFixed(2)}`));

    if (entry.metadata.tags.length > 0) {
      console.log(chalk.blue(`Tags: ${entry.metadata.tags.join(', ')}`));
    }

    if (entry.metadata.category) {
      console.log(chalk.blue(`Category: ${entry.metadata.category}`));
    }

    console.log();
    console.log(chalk.bold('Content:'));
    console.log(
      chalk.white(entry.content.substring(0, 500) + (entry.content.length > 500 ? '...' : '')),
    );

    if (result.contentSnippets.length > 0) {
      console.log();
      console.log(chalk.bold('Relevant Snippets:'));
      result.contentSnippets.forEach((snippet: any, index: number) => {
        const cleanHighlight = snippet.highlighted
          .replace(/<mark>/g, chalk.yellow(''))
          .replace(/<\/mark>/g, chalk.reset(''));
        console.log(`${index + 1}. ${cleanHighlight}`);
      });
    }

    console.log();
  }

  // Cleanup
  async destroy(): Promise<void> {
    if (this.indexManager) {
      await this.indexManager.shutdown();
    }
  }
}
