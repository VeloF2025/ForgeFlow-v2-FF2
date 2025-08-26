#!/usr/bin/env node

/**
 * FF2 Team CLI - Direct Node.js Implementation
 * Bypasses module resolution issues with a simple approach
 */

const { program } = require('commander');

// Handle potential chalk import issues
let chalk;
try {
  chalk = require('chalk');
  if (typeof chalk.blue !== 'function') {
    chalk = chalk.default;
  }
} catch (error) {
  // Fallback without colors
  chalk = {
    blue: (text) => text,
    green: (text) => text,
    red: (text) => text,
    yellow: (text) => text,
    white: (text) => text,
    gray: (text) => text
  };
}

// Load team configuration
function loadTeamConfig() {
  const fs = require('fs');
  const path = require('path');
  
  const configPath = path.join(process.cwd(), '.ff2', 'team-config.json');
  
  if (!fs.existsSync(configPath)) {
    throw new Error('Team configuration not found. Please run: node setup-team-mode.js');
  }
  
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return config;
  } catch (error) {
    throw new Error(`Failed to load team configuration: ${error.message}`);
  }
}

// Redis connection helper
async function getRedisConnection() {
  const Redis = require('ioredis');
  const config = loadTeamConfig();
  
  if (!config.redis) {
    throw new Error('Redis configuration not found in team config');
  }
  
  const redisOptions = {
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
    db: config.redis.db,
    retryDelayOnFailover: 100,
    maxRetriesPerRequest: 3,
    connectTimeout: 10000,
  };
  
  // Add TLS if needed (for Redis Cloud)
  if (config.redis.tls || config.teamMode?.redisType === 'cloud') {
    redisOptions.tls = {};
  }
  
  const redis = new Redis(redisOptions);
  
  // Test connection
  await redis.ping();
  return redis;
}

// Team initialization command
async function initTeam(options) {
  console.log(chalk.blue('🚀 Creating a new FF2 team...\n'));

  try {
    const redis = await getRedisConnection();

    // Get team details
    let teamName = options.name;
    let teamDescription = options.description;

    if (!teamName) {
      const inquirer = require('inquirer');
      const answers = await inquirer.default.prompt([
        {
          type: 'input',
          name: 'name',
          message: 'Enter team name:',
          validate: (input) => input.length >= 3 || 'Team name must be at least 3 characters',
        },
        {
          type: 'input',
          name: 'description',
          message: 'Enter team description (optional):',
        },
      ]);
      teamName = answers.name;
      teamDescription = answers.description;
    }

    // Create team
    const teamId = 'team_' + Date.now();
    const team = {
      id: teamId,
      name: teamName,
      description: teamDescription || '',
      created: new Date().toISOString(),
      memberCount: 1,
      status: 'active',
      owner: process.env.FF2_USER_EMAIL || 'current-user'
    };

    await redis.hset(`ff2:team:${teamId}`, team);
    
    console.log(chalk.green('✅ Team created successfully!'));
    console.log(chalk.white(`Team ID: ${team.id}`));
    console.log(chalk.white(`Team Name: ${team.name}`));
    if (team.description) {
      console.log(chalk.white(`Description: ${team.description}`));
    }
    console.log(chalk.white(`Owner: ${team.owner}`));

    console.log(chalk.blue('\n📋 Next steps:'));
    console.log(chalk.white('1. Invite team members: node ff2-team.js invite <email>'));
    console.log(chalk.white('2. Join team: node ff2-team.js join'));
    console.log(chalk.white('3. Check status: node ff2-team.js status'));

    redis.disconnect();

  } catch (error) {
    console.error(chalk.red('❌ Failed to create team:'), error.message);
    if (error.message.includes('ECONNREFUSED')) {
      console.log(chalk.yellow('💡 Make sure Redis is running: docker-compose -f infrastructure/docker/docker-compose.redis.yml up -d'));
    }
    process.exit(1);
  }
}

// Team status command
async function teamStatus(options) {
  console.log(chalk.blue('📊 FF2 Team Collaboration Status\n'));

  try {
    const config = loadTeamConfig();
    const redis = await getRedisConnection();
    
    // Display Redis backend info
    console.log(chalk.green('✅ Redis Backend: Connected'));
    console.log(chalk.gray(`   Type: ${config.teamMode?.redisType || 'unknown'}`));
    console.log(chalk.gray(`   Host: ${config.redis.host}`));
    console.log(chalk.gray(`   Port: ${config.redis.port}`));
    console.log(chalk.gray(`   Database: ${config.redis.db}`));
    
    if (config.teamMode?.redisType === 'cloud') {
      console.log(chalk.blue('☁️  Remote team collaboration enabled'));
    } else if (config.teamMode?.redisType === 'docker') {
      console.log(chalk.yellow('🐳 Development mode - local Docker only'));
    }
    
    console.log('');

    // List all teams
    const keys = await redis.keys('ff2:team:*');
    if (keys.length === 0) {
      console.log(chalk.yellow('⚠️  No teams found'));
      console.log(chalk.blue('💡 Create a team: ./ff2.bat team init'));
      redis.disconnect();
      return;
    }

    console.log(chalk.blue(`Found ${keys.length} team(s):\n`));
    for (const key of keys) {
      const team = await redis.hgetall(key);
      if (team.id) {
        console.log(chalk.white(`🏢 ${team.name}`));
        console.log(chalk.gray(`   ID: ${team.id}`));
        console.log(chalk.gray(`   Status: ${team.status}`));
        console.log(chalk.gray(`   Members: ${team.memberCount}`));
        console.log(chalk.gray(`   Owner: ${team.owner}`));
        if (team.description) {
          console.log(chalk.gray(`   Description: ${team.description}`));
        }
        console.log('');
      }
    }

    redis.disconnect();

  } catch (error) {
    if (error.message.includes('Team configuration not found')) {
      console.error(chalk.red('❌ Team mode not initialized'));
      console.log(chalk.blue('💡 Run setup first: node setup-team-mode.js'));
    } else {
      console.error(chalk.red('❌ Redis Backend: Connection failed'));
      console.error(chalk.red('Error:'), error.message);
      
      if (error.message.includes('ECONNREFUSED') || error.message.includes('ENOTFOUND')) {
        const config = loadTeamConfig();
        if (config.teamMode?.redisType === 'cloud') {
          console.log(chalk.yellow('💡 Check your Redis Cloud connection and credentials'));
        } else if (config.teamMode?.redisType === 'docker') {
          console.log(chalk.yellow('💡 Start local Redis: docker-compose -f infrastructure/docker/docker-compose.redis.yml up -d'));
        } else {
          console.log(chalk.yellow('💡 Check your Redis server is running and accessible'));
        }
      }
    }
    process.exit(1);
  }
}

// Team join command
async function joinTeam(options) {
  console.log(chalk.blue('👥 Joining team session...\n'));

  try {
    const redis = await getRedisConnection();

    // Get all teams
    const keys = await redis.keys('ff2:team:*');
    if (keys.length === 0) {
      console.log(chalk.yellow('⚠️  No teams found'));
      console.log(chalk.blue('💡 Create a team: node ff2-team.js init'));
      redis.disconnect();
      return;
    }

    // Get team data
    const teams = [];
    for (const key of keys) {
      const teamData = await redis.hgetall(key);
      if (teamData.id) {
        teams.push(teamData);
      }
    }

    let selectedTeam = options.team;
    if (!selectedTeam) {
      // For now, just use the most recent team (last in list)
      selectedTeam = teams[teams.length - 1].id;
      console.log(chalk.blue(`Auto-selecting team: ${teams[teams.length - 1].name}`));
    }

    const team = teams.find(t => t.id === selectedTeam);
    if (!team) {
      console.log(chalk.red(`❌ Team ${selectedTeam} not found`));
      redis.disconnect();
      return;
    }

    console.log(chalk.green(`✅ Joined team: ${team.name}`));
    console.log(chalk.white(`Team ID: ${team.id}`));
    console.log(chalk.white(`Status: ${team.status}`));
    console.log(chalk.white(`Members: ${team.memberCount}`));

    redis.disconnect();

  } catch (error) {
    console.error(chalk.red('❌ Failed to join team:'), error.message);
    process.exit(1);
  }
}

// Team invite command
async function inviteTeamMember(email, options) {
  console.log(chalk.blue(`📧 Inviting ${email} to team...\n`));

  try {
    const redis = await getRedisConnection();

    // Create invitation
    const invitationId = 'inv_' + Date.now();
    const invitation = {
      id: invitationId,
      email: email,
      role: options.role || 'developer',
      message: options.message || 'Join our FF2 team!',
      status: 'pending',
      created: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
      invitedBy: process.env.FF2_USER_EMAIL || 'current-user'
    };

    await redis.hset(`ff2:invitation:${invitationId}`, invitation);

    console.log(chalk.green('✅ Invitation created successfully!'));
    console.log(chalk.white(`Invitation ID: ${invitation.id}`));
    console.log(chalk.white(`Email: ${invitation.email}`));
    console.log(chalk.white(`Role: ${invitation.role}`));
    console.log(chalk.white(`Expires: ${new Date(invitation.expiresAt).toLocaleString()}`));

    redis.disconnect();

  } catch (error) {
    console.error(chalk.red('❌ Failed to create invitation:'), error.message);
    process.exit(1);
  }
}

// Team list command
async function listTeams() {
  console.log(chalk.blue('📋 Your Teams\n'));

  try {
    const redis = await getRedisConnection();

    const keys = await redis.keys('ff2:team:*');
    if (keys.length === 0) {
      console.log(chalk.yellow('⚠️  You are not a member of any teams'));
      console.log(chalk.blue('💡 Create a team: node ff2-team.js init'));
      redis.disconnect();
      return;
    }

    for (const key of keys) {
      const team = await redis.hgetall(key);
      if (team.id) {
        console.log(chalk.white(`🏢 ${team.name}`));
        console.log(chalk.gray(`   ID: ${team.id}`));
        console.log(chalk.gray(`   Status: ${team.status}`));
        console.log(chalk.gray(`   Members: ${team.memberCount}`));
        console.log(chalk.gray(`   Owner: ${team.owner}`));
        if (team.description) {
          console.log(chalk.gray(`   Description: ${team.description}`));
        }
        console.log('');
      }
    }

    redis.disconnect();

  } catch (error) {
    console.error(chalk.red('❌ Failed to list teams:'), error.message);
    process.exit(1);
  }
}

// Setup CLI commands
program
  .name('ff2-team')
  .description('ForgeFlow v2 Team Collaboration CLI')
  .version('2.0.0');

program
  .command('init')
  .description('Initialize a new team')
  .option('-n, --name <name>', 'Team name')
  .option('-d, --description <description>', 'Team description')
  .action(initTeam);

program
  .command('status')
  .description('Show team status and member activity')
  .option('-v, --verbose', 'Show detailed information')
  .action(teamStatus);

program
  .command('join')
  .description('Join team session')
  .option('-t, --team <teamId>', 'Team ID to join')
  .action(joinTeam);

program
  .command('invite <email>')
  .description('Invite a new team member')
  .option('-r, --role <role>', 'Member role', 'developer')
  .option('-m, --message <message>', 'Invitation message')
  .action(inviteTeamMember);

program
  .command('list')
  .description('List all teams you belong to')
  .action(listTeams);

// Help and examples
program.on('--help', () => {
  console.log('');
  console.log(chalk.cyan('Examples:'));
  console.log('  $ node ff2-team.js init                           Initialize new team');
  console.log('  $ node ff2-team.js init --name "Dev Team"         Create team with name');
  console.log('  $ node ff2-team.js status                         Show team status');
  console.log('  $ node ff2-team.js join                           Join team session');
  console.log('  $ node ff2-team.js invite dev@company.com         Invite team member');
  console.log('  $ node ff2-team.js list                           List all teams');
  console.log('');
});

// Parse command line arguments
program.parse();

// If no command provided, show help
if (!process.argv.slice(2).length) {
  program.outputHelp();
}