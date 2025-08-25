#!/usr/bin/env node

import { AntiHallProtocol } from '../antihall-protocol';
import { LogContext } from '../../utils/logger';
import chalk from 'chalk';

async function main() {
  const logger = new LogContext('AntiHall-Validator');
  const codeToValidate = process.argv[2];

  if (!codeToValidate) {
    console.log(chalk.red('❌ ERROR: No code provided for validation'));
    console.log(chalk.yellow('Usage: npm run antihall:check "code or method name"'));
    console.log(chalk.gray('Examples:'));
    console.log(chalk.gray('  npm run antihall:check "authService.login"'));
    console.log(chalk.gray('  npm run antihall:check "useAuth"'));
    console.log(chalk.gray('  npm run antihall:check "ProjectComponent"'));
    process.exit(1);
  }

  try {
    console.log(chalk.blue.bold('🛡️ ANTIHALL VALIDATOR - CODE VERIFICATION'));
    console.log(chalk.gray(`Validating: ${chalk.white(codeToValidate)}\n`));

    const antiHall = new AntiHallProtocol();
    const result = await antiHall.validateCode(codeToValidate, 'cli-validation');

    if (result.valid) {
      console.log(chalk.green.bold('✅ VALIDATION PASSED'));
      console.log(chalk.white('Code references exist in codebase'));
    } else {
      console.log(chalk.red.bold('❌ VALIDATION FAILED'));
      console.log(chalk.red(`Found ${result.violations.length} violations:\n`));

      result.violations.forEach((violation, index) => {
        console.log(chalk.red(`  ${index + 1}. ${violation}`));
      });

      if (result.suggestions && result.suggestions.length > 0) {
        console.log(chalk.yellow('\n💡 SUGGESTIONS:'));
        result.suggestions.forEach((suggestion) => {
          console.log(chalk.yellow(`  - ${suggestion}`));
        });
      }

      console.log(chalk.red('\n🚫 HALLUCINATION DETECTED - DO NOT PROCEED'));
    }

    // Show search results for the term
    const searchResults = await antiHall.findPattern(codeToValidate);
    if (searchResults.length > 0) {
      console.log(chalk.blue('\n🔍 SIMILAR PATTERNS FOUND:'));
      searchResults.slice(0, 5).forEach((result) => {
        console.log(chalk.cyan(`  - ${result}`));
      });
    }

    await antiHall.shutdown();
    process.exit(result.valid ? 0 : 1);
  } catch (error) {
    logger.error('Failed to validate code', error);
    console.log(chalk.red('❌ VALIDATION ERROR'));
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}
