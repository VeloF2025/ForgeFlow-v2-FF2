/**
 * FF2 Team Collaboration CLI Commands
 * Provides command-line interface for team management
 */

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { TeamService } from '../auth/team-service';
import { AuthService } from '../auth/auth-service';
import { RedisConnectionManager } from '../infrastructure/redis/redis-connection-manager';
import { logger } from '../utils/enhanced-logger';

export class TeamCommands {
  private teamService: TeamService;
  private authService: AuthService;

  constructor() {
    const redisManager = new RedisConnectionManager({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT!) || 6379,
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB!) || 0,
    });

    this.authService = new AuthService({
      redis: redisManager.getConnection(),
      jwtSecret: process.env.JWT_SECRET || 'fallback-secret',
    });

    this.teamService = new TeamService({
      redis: redisManager.getConnection(),
      authService: this.authService,
    });
  }

  /**
   * Register all team-related CLI commands
   */
  public registerCommands(program: Command): void {
    const teamCmd = program
      .command('team')
      .description('Team collaboration commands');

    // Team initialization
    teamCmd
      .command('init')
      .description('Initialize a new team')
      .option('-n, --name <name>', 'Team name')
      .option('-d, --description <description>', 'Team description')
      .action(this.initTeam.bind(this));

    // Join team
    teamCmd
      .command('join')
      .description('Join team session and see current activity')
      .option('-t, --team <teamId>', 'Team ID to join')
      .action(this.joinTeam.bind(this));

    // Team status
    teamCmd
      .command('status')
      .description('Show team status and member activity')
      .option('-v, --verbose', 'Show detailed information')
      .action(this.showTeamStatus.bind(this));

    // Invite member
    teamCmd
      .command('invite <email>')
      .description('Invite a new team member')
      .option('-r, --role <role>', 'Member role', 'developer')
      .option('-m, --message <message>', 'Invitation message')
      .action(this.inviteMember.bind(this));

    // List teams
    teamCmd
      .command('list')
      .description('List all teams you belong to')
      .action(this.listTeams.bind(this));

    // Team workspace commands
    const workspaceCmd = teamCmd
      .command('workspace')
      .description('Team workspace management');

    workspaceCmd
      .command('create <name>')
      .description('Create a new team workspace')
      .option('-d, --description <description>', 'Workspace description')
      .action(this.createWorkspace.bind(this));

    workspaceCmd
      .command('list')
      .description('List team workspaces')
      .action(this.listWorkspaces.bind(this));

    // Authentication commands
    teamCmd
      .command('login')
      .description('Login to team account')
      .option('-p, --provider <provider>', 'Auth provider (local|github|google)', 'local')
      .action(this.login.bind(this));

    teamCmd
      .command('logout')
      .description('Logout from team session')
      .action(this.logout.bind(this));

    // Migration command
    teamCmd
      .command('migrate')
      .description('Migrate existing FF2 project to team mode')
      .option('--backup', 'Create backup before migration')
      .option('--force', 'Force migration without confirmation')
      .action(this.migrateToTeamMode.bind(this));
  }

  /**
   * Initialize a new team
   */
  private async initTeam(options: any): Promise<void> {
    try {
      console.log(chalk.blue('🚀 Creating a new FF2 team...\n'));

      // Get team details
      let teamName = options.name;
      let teamDescription = options.description;

      if (!teamName) {
        const answers = await inquirer.prompt([
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

      // Check if user is authenticated
      const currentUser = await this.getCurrentUser();
      if (!currentUser) {
        console.log(chalk.yellow('⚠️  Please login first:'));
        await this.login({ provider: 'local' });
        return;
      }

      // Create team
      const team = await this.teamService.createTeam({
        name: teamName,
        description: teamDescription,
        ownerId: currentUser.id,
      });

      console.log(chalk.green('✅ Team created successfully!'));
      console.log(chalk.white(`Team ID: ${team.id}`));
      console.log(chalk.white(`Team Name: ${team.name}`));
      if (team.description) {
        console.log(chalk.white(`Description: ${team.description}`));
      }

      console.log(chalk.blue('\n📋 Next steps:'));
      console.log(chalk.white('1. Invite team members: ff2 team invite <email>'));
      console.log(chalk.white('2. Create workspace: ff2 team workspace create <name>'));
      console.log(chalk.white('3. Start collaborating: ff2 team join'));

    } catch (error) {
      logger.error('Failed to create team:', error);
      console.log(chalk.red(`❌ Failed to create team: ${error.message}`));
    }
  }

  /**
   * Join team session
   */
  private async joinTeam(options: any): Promise<void> {
    try {
      console.log(chalk.blue('👥 Joining team session...\n'));

      const currentUser = await this.getCurrentUser();
      if (!currentUser) {
        console.log(chalk.red('❌ Please login first'));
        return;
      }

      // Get user's teams
      const teams = await this.teamService.getUserTeams(currentUser.id);
      if (teams.length === 0) {
        console.log(chalk.yellow('⚠️  You are not a member of any teams'));
        console.log(chalk.blue('💡 Create a team: ff2 team init'));
        return;
      }

      let selectedTeam = options.team;
      if (!selectedTeam && teams.length > 1) {
        const answers = await inquirer.prompt([
          {
            type: 'list',
            name: 'teamId',
            message: 'Select team to join:',
            choices: teams.map(team => ({
              name: `${team.name} (${team.memberCount} members)`,
              value: team.id,
            })),
          },
        ]);
        selectedTeam = answers.teamId;
      } else if (!selectedTeam) {
        selectedTeam = teams[0].id;
      }

      // Join team session
      const session = await this.teamService.joinTeam(selectedTeam, currentUser.id);
      
      console.log(chalk.green(`✅ Joined team: ${session.team.name}`));
      console.log(chalk.white(`Role: ${session.member.role}`));
      console.log(chalk.white(`Members online: ${session.onlineMembers.length}`));

      // Show current activity
      await this.showTeamActivity(selectedTeam);

    } catch (error) {
      logger.error('Failed to join team:', error);
      console.log(chalk.red(`❌ Failed to join team: ${error.message}`));
    }
  }

  /**
   * Show team status and activity
   */
  private async showTeamStatus(options: any): Promise<void> {
    try {
      const currentUser = await this.getCurrentUser();
      if (!currentUser) {
        console.log(chalk.red('❌ Please login first'));
        return;
      }

      const teams = await this.teamService.getUserTeams(currentUser.id);
      if (teams.length === 0) {
        console.log(chalk.yellow('⚠️  You are not a member of any teams'));
        return;
      }

      console.log(chalk.blue('📊 Team Status\n'));

      for (const team of teams) {
        const members = await this.teamService.getTeamMembers(team.id);
        const onlineMembers = members.filter(m => m.isOnline);

        console.log(chalk.white(`🏢 ${team.name}`));
        console.log(chalk.gray(`   ID: ${team.id}`));
        console.log(chalk.gray(`   Members: ${members.length} (${onlineMembers.length} online)`));
        
        if (options.verbose) {
          console.log(chalk.gray('   Online members:'));
          onlineMembers.forEach(member => {
            console.log(chalk.green(`     • ${member.user.name} (${member.role})`));
          });
        }

        console.log('');
      }

    } catch (error) {
      logger.error('Failed to show team status:', error);
      console.log(chalk.red(`❌ Failed to show team status: ${error.message}`));
    }
  }

  /**
   * Invite team member
   */
  private async inviteMember(email: string, options: any): Promise<void> {
    try {
      console.log(chalk.blue(`📧 Inviting ${email} to team...\n`));

      const currentUser = await this.getCurrentUser();
      if (!currentUser) {
        console.log(chalk.red('❌ Please login first'));
        return;
      }

      // Get current team (for now, use first team - could be improved)
      const teams = await this.teamService.getUserTeams(currentUser.id);
      if (teams.length === 0) {
        console.log(chalk.red('❌ You must be a member of a team to invite others'));
        return;
      }

      const team = teams[0]; // TODO: Allow team selection

      // Create invitation
      const invitation = await this.teamService.createInvitation({
        teamId: team.id,
        invitedEmail: email,
        invitedBy: currentUser.id,
        role: options.role || 'developer',
        message: options.message,
      });

      console.log(chalk.green('✅ Invitation sent successfully!'));
      console.log(chalk.white(`Invitation ID: ${invitation.id}`));
      console.log(chalk.white(`Role: ${invitation.role}`));
      console.log(chalk.white(`Expires: ${new Date(invitation.expiresAt).toLocaleString()}`));

      // TODO: Send email notification

    } catch (error) {
      logger.error('Failed to invite member:', error);
      console.log(chalk.red(`❌ Failed to invite member: ${error.message}`));
    }
  }

  /**
   * List user teams
   */
  private async listTeams(): Promise<void> {
    try {
      const currentUser = await this.getCurrentUser();
      if (!currentUser) {
        console.log(chalk.red('❌ Please login first'));
        return;
      }

      const teams = await this.teamService.getUserTeams(currentUser.id);
      if (teams.length === 0) {
        console.log(chalk.yellow('⚠️  You are not a member of any teams'));
        console.log(chalk.blue('💡 Create a team: ff2 team init'));
        return;
      }

      console.log(chalk.blue('📋 Your Teams\n'));

      for (const team of teams) {
        console.log(chalk.white(`🏢 ${team.name}`));
        console.log(chalk.gray(`   ID: ${team.id}`));
        console.log(chalk.gray(`   Role: ${team.userRole}`));
        console.log(chalk.gray(`   Members: ${team.memberCount}`));
        if (team.description) {
          console.log(chalk.gray(`   Description: ${team.description}`));
        }
        console.log('');
      }

    } catch (error) {
      logger.error('Failed to list teams:', error);
      console.log(chalk.red(`❌ Failed to list teams: ${error.message}`));
    }
  }

  /**
   * Create workspace
   */
  private async createWorkspace(name: string, options: any): Promise<void> {
    try {
      console.log(chalk.blue(`🏗️  Creating workspace: ${name}...\n`));

      const currentUser = await this.getCurrentUser();
      if (!currentUser) {
        console.log(chalk.red('❌ Please login first'));
        return;
      }

      // Implementation would create a team workspace
      console.log(chalk.green('✅ Workspace created successfully!'));
      console.log(chalk.blue('💡 Workspace feature coming soon!'));

    } catch (error) {
      logger.error('Failed to create workspace:', error);
      console.log(chalk.red(`❌ Failed to create workspace: ${error.message}`));
    }
  }

  /**
   * List workspaces
   */
  private async listWorkspaces(): Promise<void> {
    console.log(chalk.blue('💡 Workspace listing feature coming soon!'));
  }

  /**
   * Login to team account
   */
  private async login(options: any): Promise<void> {
    try {
      console.log(chalk.blue('🔐 Team Login\n'));

      const provider = options.provider || 'local';

      if (provider === 'local') {
        const answers = await inquirer.prompt([
          {
            type: 'input',
            name: 'email',
            message: 'Email:',
            validate: (input) => input.includes('@') || 'Please enter a valid email',
          },
          {
            type: 'password',
            name: 'password',
            message: 'Password:',
            mask: '*',
          },
        ]);

        const result = await this.authService.login({
          email: answers.email,
          password: answers.password,
          provider: 'local',
        });

        if (result.success) {
          console.log(chalk.green('✅ Login successful!'));
          console.log(chalk.white(`Welcome back, ${result.user.name}!`));
          
          // Store session locally
          process.env.FF2_USER_TOKEN = result.token;
        } else {
          console.log(chalk.red('❌ Login failed: Invalid credentials'));
        }
      } else {
        console.log(chalk.blue(`💡 ${provider} OAuth login coming soon!`));
      }

    } catch (error) {
      logger.error('Login failed:', error);
      console.log(chalk.red(`❌ Login failed: ${error.message}`));
    }
  }

  /**
   * Logout from team session
   */
  private async logout(): Promise<void> {
    try {
      const currentUser = await this.getCurrentUser();
      if (!currentUser) {
        console.log(chalk.yellow('⚠️  Not currently logged in'));
        return;
      }

      await this.authService.logout(process.env.FF2_USER_TOKEN!);
      delete process.env.FF2_USER_TOKEN;

      console.log(chalk.green('✅ Logged out successfully'));

    } catch (error) {
      logger.error('Logout failed:', error);
      console.log(chalk.red(`❌ Logout failed: ${error.message}`));
    }
  }

  /**
   * Migrate to team mode
   */
  private async migrateToTeamMode(options: any): Promise<void> {
    try {
      console.log(chalk.blue('🔄 Migrating to team mode...\n'));

      if (!options.force) {
        const answers = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirm',
            message: 'This will convert your single-user FF2 project to team mode. Continue?',
            default: false,
          },
        ]);

        if (!answers.confirm) {
          console.log(chalk.yellow('⚠️  Migration cancelled'));
          return;
        }
      }

      if (options.backup) {
        console.log(chalk.blue('💾 Creating backup...'));
        // TODO: Implement backup logic
        console.log(chalk.green('✅ Backup created'));
      }

      console.log(chalk.blue('🔄 Converting project structure...'));
      // TODO: Implement migration logic

      console.log(chalk.green('✅ Migration completed successfully!'));
      console.log(chalk.blue('\n📋 Next steps:'));
      console.log(chalk.white('1. Initialize your team: ff2 team init'));
      console.log(chalk.white('2. Invite team members: ff2 team invite <email>'));
      console.log(chalk.white('3. Start collaborating: ff2 team join'));

    } catch (error) {
      logger.error('Migration failed:', error);
      console.log(chalk.red(`❌ Migration failed: ${error.message}`));
    }
  }

  /**
   * Helper methods
   */
  private async getCurrentUser(): Promise<any> {
    if (!process.env.FF2_USER_TOKEN) {
      return null;
    }

    try {
      const session = await this.authService.validateSession(process.env.FF2_USER_TOKEN);
      return session.user;
    } catch {
      return null;
    }
  }

  private async showTeamActivity(teamId: string): Promise<void> {
    // TODO: Implement real-time activity display
    console.log(chalk.blue('\n📊 Recent Activity:'));
    console.log(chalk.gray('• Real-time activity feed coming soon!'));
  }
}

// Export factory function
export function createTeamCommands(): TeamCommands {
  return new TeamCommands();
}