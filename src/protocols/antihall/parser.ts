#!/usr/bin/env node

import { AntiHallProtocol } from '../antihall-protocol';
import { LogContext } from '../../utils/logger';
import chalk from 'chalk';

async function main() {
  const logger = new LogContext('AntiHall-Parser');

  try {
    console.log(chalk.blue.bold('🔍 ANTIHALL PARSER - CODEBASE ANALYSIS'));
    console.log(chalk.gray('Parsing codebase for code pattern validation...\n'));

    const antiHall = new AntiHallProtocol();
    await antiHall.parseCodebase();

    const stats = antiHall.getStatistics();

    console.log(chalk.green('✅ PARSING COMPLETE'));
    console.log(chalk.white(`Files Indexed: ${chalk.yellow(stats.filesIndexed)}`));
    console.log(chalk.white(`Patterns Found: ${chalk.yellow(stats.patternsFound)}`));
    console.log(chalk.white(`Last Updated: ${chalk.yellow(stats.lastUpdated.toISOString())}`));

    console.log(chalk.blue('\n📊 VALIDATION CAPABILITIES ACTIVATED'));
    console.log(chalk.gray('- Method/Function existence validation'));
    console.log(chalk.gray('- Import path verification'));
    console.log(chalk.gray('- Component name matching'));
    console.log(chalk.gray('- API endpoint checking'));
    console.log(chalk.gray('- Database entity validation'));

    await antiHall.shutdown();
  } catch (error) {
    logger.error('Failed to parse codebase', error);
    console.log(chalk.red('❌ PARSING FAILED'));
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}
