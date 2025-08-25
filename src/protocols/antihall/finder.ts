#!/usr/bin/env node

import { AntiHallProtocol } from '../antihall-protocol';
import { LogContext } from '../../utils/logger';
import chalk from 'chalk';

async function main() {
  const logger = new LogContext('AntiHall-Finder');
  const searchTerm = process.argv[2];

  if (!searchTerm) {
    console.log(chalk.red('❌ ERROR: No search term provided'));
    console.log(chalk.yellow('Usage: npm run antihall:find "searchTerm"'));
    console.log(chalk.gray('Examples:'));
    console.log(chalk.gray('  npm run antihall:find "auth"'));
    console.log(chalk.gray('  npm run antihall:find "user"'));
    console.log(chalk.gray('  npm run antihall:find "Component"'));
    process.exit(1);
  }

  try {
    console.log(chalk.blue.bold('🔍 ANTIHALL FINDER - PATTERN SEARCH'));
    console.log(chalk.gray(`Searching for: ${chalk.white(searchTerm)}\n`));

    const antiHall = new AntiHallProtocol();
    await antiHall.initialize();
    const results = await antiHall.findPattern(searchTerm);

    if (results.length > 0) {
      console.log(chalk.green(`✅ FOUND ${results.length} MATCHING PATTERNS:`));
      console.log();

      results.forEach((result, index) => {
        console.log(chalk.cyan(`  ${index + 1}. ${result}`));
      });
    } else {
      console.log(chalk.yellow('⚠️  NO PATTERNS FOUND'));
      console.log(
        chalk.gray('Try a different search term or check if the codebase has been parsed'),
      );
    }

    const stats = antiHall.getStatistics();
    console.log(chalk.blue('\n📊 INDEX STATISTICS:'));
    console.log(chalk.white(`Files Indexed: ${chalk.yellow(stats.filesIndexed)}`));
    console.log(chalk.white(`Total Patterns: ${chalk.yellow(stats.patternsFound)}`));

    await antiHall.shutdown();
  } catch (error) {
    logger.error('Failed to search patterns', error);
    console.log(chalk.red('❌ SEARCH ERROR'));
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}
