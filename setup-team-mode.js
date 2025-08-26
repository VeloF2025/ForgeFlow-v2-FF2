#!/usr/bin/env node

/**
 * FF2 Team Mode Setup Script
 * Sets up Redis backend and team authentication for ForgeFlow v2
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const inquirer = require('inquirer');

console.log('🚀 ForgeFlow v2 Team Mode Setup\n');

// Redis setup options
async function chooseRedisSetup() {
    const answers = await inquirer.prompt([
        {
            type: 'list',
            name: 'redisOption',
            message: '🔍 Choose your Redis setup for team collaboration:',
            choices: [
                {
                    name: '☁️  Redis Cloud (Recommended for remote teams)',
                    value: 'cloud',
                    short: 'Redis Cloud'
                },
                {
                    name: '🐳 Local Docker (Development only)',
                    value: 'docker',
                    short: 'Local Docker'
                },
                {
                    name: '⚙️  Existing Redis (I already have Redis running)',
                    value: 'existing',
                    short: 'Existing Redis'
                }
            ],
            default: 'cloud'
        }
    ]);
    
    return answers.redisOption;
}

// Check if local Redis is available
function checkLocalRedis() {
    try {
        execSync('redis-cli ping', { stdio: 'ignore' });
        console.log('✅ Local Redis is already running');
        return true;
    } catch (error) {
        return false;
    }
}

// Install required dependencies
function installDependencies() {
    console.log('📦 Installing team collaboration dependencies...');
    
    const teamDeps = [
        'redis',
        'ioredis',
        'jsonwebtoken',
        'bcryptjs',
        'express-rate-limit',
        'helmet',
        'cors',
        'socket.io',
        'passport',
        'passport-github2',
        'passport-google-oauth20',
        'speakeasy',
        'qrcode',
        'uuid',
        'joi'
    ];

    const devDeps = [
        '@types/bcryptjs',
        '@types/jsonwebtoken',
        '@types/passport',
        '@types/speakeasy',
        '@types/qrcode',
        '@types/uuid',
        'redis-memory-server'
    ];

    try {
        execSync(`npm install ${teamDeps.join(' ')}`, { stdio: 'inherit' });
        execSync(`npm install -D ${devDeps.join(' ')}`, { stdio: 'inherit' });
        console.log('✅ Dependencies installed successfully');
    } catch (error) {
        console.error('❌ Failed to install dependencies:', error.message);
        process.exit(1);
    }
}

// Create package.json scripts for team mode
function updatePackageJson() {
    console.log('📝 Updating package.json scripts...');
    
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
        console.error('❌ package.json not found');
        return;
    }

    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    
    packageJson.scripts = {
        ...packageJson.scripts,
        'team:setup': 'node setup-team-mode.js',
        'team:redis': 'docker-compose -f infrastructure/docker/docker-compose.redis.yml up -d',
        'team:redis:stop': 'docker-compose -f infrastructure/docker/docker-compose.redis.yml down',
        'team:dev': 'NODE_ENV=development npm run team:redis && npm run dev',
        'team:test': 'npm run team:redis && npm test -- src/auth src/collaboration',
        'team:migrate': 'node scripts/migrate-to-team-mode.js'
    };

    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
    console.log('✅ Package.json updated with team mode scripts');
}

// Setup Redis Cloud
async function setupRedisCloud() {
    console.log('☁️  Setting up Redis Cloud for remote team collaboration...\n');
    
    console.log('🔗 Please follow these steps to set up Redis Cloud:');
    console.log('');
    console.log('1. Go to https://redis.com/try-free/');
    console.log('2. Create a free account (30MB free tier)');
    console.log('3. Create a new database');
    console.log('4. Copy your connection details');
    console.log('');
    
    const cloudAnswers = await inquirer.prompt([
        {
            type: 'input',
            name: 'host',
            message: 'Enter your Redis Cloud host (e.g., redis-12345.c1.region.cache.amazonaws.com):',
            validate: (input) => input.length > 0 || 'Redis host is required'
        },
        {
            type: 'number',
            name: 'port',
            message: 'Enter your Redis Cloud port:',
            default: 6379,
            validate: (input) => (input > 0 && input < 65536) || 'Port must be between 1-65535'
        },
        {
            type: 'password',
            name: 'password',
            message: 'Enter your Redis Cloud password:',
            mask: '*',
            validate: (input) => input.length > 0 || 'Redis password is required'
        },
        {
            type: 'number',
            name: 'db',
            message: 'Enter Redis database number:',
            default: 0,
            validate: (input) => (input >= 0) || 'Database number must be 0 or higher'
        }
    ]);
    
    // Test Redis Cloud connection
    console.log('\n🧪 Testing Redis Cloud connection...');
    try {
        const Redis = require('ioredis');
        const redis = new Redis({
            host: cloudAnswers.host,
            port: cloudAnswers.port,
            password: cloudAnswers.password,
            db: cloudAnswers.db,
            connectTimeout: 10000,
            retryDelayOnFailover: 100,
            maxRetriesPerRequest: 3,
            tls: cloudAnswers.port === 6380 ? {} : undefined // Enable TLS for port 6380
        });
        
        await redis.ping();
        console.log('✅ Redis Cloud connection successful!');
        redis.disconnect();
        
        return {
            type: 'cloud',
            config: cloudAnswers
        };
    } catch (error) {
        console.error('❌ Redis Cloud connection failed:', error.message);
        console.log('💡 Please check your connection details and try again');
        process.exit(1);
    }
}

// Setup local Docker Redis
function setupDockerRedis() {
    console.log('🐳 Setting up local Redis with Docker...');
    
    try {
        // Make sure Docker is running
        execSync('docker --version', { stdio: 'ignore' });
        
        // Create Redis setup script executable
        const setupScript = path.join(process.cwd(), 'setup-redis-dev.sh');
        if (fs.existsSync(setupScript)) {
            execSync('chmod +x setup-redis-dev.sh');
            execSync('./setup-redis-dev.sh', { stdio: 'inherit' });
        }
        
        console.log('✅ Local Docker Redis setup complete');
        console.log('⚠️  Note: This is for development only. Remote team members cannot access this Redis.');
        
        return {
            type: 'docker',
            config: {
                host: 'localhost',
                port: 6379,
                password: 'ff2_team_redis_2024',
                db: 0
            }
        };
    } catch (error) {
        console.error('❌ Docker setup failed:', error.message);
        console.log('💡 Please install Docker and try again');
        process.exit(1);
    }
}

// Setup existing Redis
async function setupExistingRedis() {
    console.log('⚙️  Configuring existing Redis connection...\n');
    
    const existingAnswers = await inquirer.prompt([
        {
            type: 'input',
            name: 'host',
            message: 'Enter Redis host:',
            default: 'localhost',
            validate: (input) => input.length > 0 || 'Redis host is required'
        },
        {
            type: 'number',
            name: 'port',
            message: 'Enter Redis port:',
            default: 6379,
            validate: (input) => (input > 0 && input < 65536) || 'Port must be between 1-65535'
        },
        {
            type: 'password',
            name: 'password',
            message: 'Enter Redis password (leave empty if no password):',
            mask: '*'
        },
        {
            type: 'number',
            name: 'db',
            message: 'Enter Redis database number:',
            default: 0,
            validate: (input) => (input >= 0) || 'Database number must be 0 or higher'
        }
    ]);
    
    // Test existing Redis connection
    console.log('\n🧪 Testing existing Redis connection...');
    try {
        const Redis = require('ioredis');
        const redis = new Redis({
            host: existingAnswers.host,
            port: existingAnswers.port,
            password: existingAnswers.password || undefined,
            db: existingAnswers.db,
            connectTimeout: 10000,
            retryDelayOnFailover: 100,
            maxRetriesPerRequest: 3
        });
        
        await redis.ping();
        console.log('✅ Existing Redis connection successful!');
        redis.disconnect();
        
        return {
            type: 'existing',
            config: existingAnswers
        };
    } catch (error) {
        console.error('❌ Redis connection failed:', error.message);
        console.log('💡 Please check your Redis configuration and try again');
        process.exit(1);
    }
}

// Create initial team configuration
function createTeamConfig(redisSetup) {
    console.log('⚙️  Creating team configuration...');
    
    const configDir = path.join(process.cwd(), '.ff2');
    if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
    }

    const teamConfig = {
        teamMode: {
            enabled: true,
            initialized: new Date().toISOString(),
            version: '1.0.0',
            redisType: redisSetup.type
        },
        redis: {
            host: redisSetup.config.host,
            port: redisSetup.config.port,
            password: redisSetup.config.password,
            db: redisSetup.config.db,
            ...(redisSetup.config.host !== 'localhost' && { 
                tls: redisSetup.config.port === 6380 ? {} : undefined 
            })
        },
        auth: {
            providers: ['local'],
            jwtSecret: process.env.JWT_SECRET || 'ff2_jwt_secret_change_in_production_2024',
            sessionTTL: parseInt(process.env.REDIS_SESSION_TTL) || 86400
        },
        team: {
            maxMembers: parseInt(process.env.MAX_TEAM_MEMBERS) || 50,
            defaultRole: process.env.DEFAULT_TEAM_ROLE || 'developer'
        }
    };

    fs.writeFileSync(
        path.join(configDir, 'team-config.json'), 
        JSON.stringify(teamConfig, null, 2)
    );
    
    // Create/update .env.team file with Redis configuration
    const envTeamPath = path.join(process.cwd(), '.env.team');
    let envContent = '';
    
    if (fs.existsSync(envTeamPath)) {
        envContent = fs.readFileSync(envTeamPath, 'utf8');
    }
    
    // Update Redis configuration in .env.team
    const redisEnvConfig = `
# Redis Configuration (Updated by setup)
REDIS_HOST=${redisSetup.config.host}
REDIS_PORT=${redisSetup.config.port}
REDIS_PASSWORD=${redisSetup.config.password}
REDIS_DB=${redisSetup.config.db}
REDIS_TYPE=${redisSetup.type}
${redisSetup.config.host !== 'localhost' ? 'REDIS_TLS=true' : ''}
`;
    
    // Replace or add Redis configuration
    const redisConfigRegex = /# Redis Configuration[\s\S]*?(?=\n# |$)/;
    if (redisConfigRegex.test(envContent)) {
        envContent = envContent.replace(redisConfigRegex, redisEnvConfig.trim());
    } else {
        envContent = redisEnvConfig + envContent;
    }
    
    fs.writeFileSync(envTeamPath, envContent);
    
    console.log('✅ Team configuration created');
    console.log(`✅ Environment file updated with ${redisSetup.type} Redis configuration`);
}

// Main setup function
async function main() {
    try {
        console.log('🚀 Welcome to ForgeFlow v2 Team Collaboration Setup!');
        console.log('This wizard will help you set up distributed team collaboration.\n');
        
        // Step 1: Install dependencies
        installDependencies();
        
        // Step 2: Update package.json
        updatePackageJson();
        
        // Step 3: Choose and setup Redis
        const redisOption = await chooseRedisSetup();
        let redisSetup;
        
        console.log('');
        
        switch (redisOption) {
            case 'cloud':
                redisSetup = await setupRedisCloud();
                break;
            case 'docker':
                redisSetup = setupDockerRedis();
                break;
            case 'existing':
                redisSetup = await setupExistingRedis();
                break;
            default:
                throw new Error('Invalid Redis option selected');
        }
        
        // Step 4: Create team configuration with Redis setup
        createTeamConfig(redisSetup);
        
        console.log('\n🎉 FF2 Team Mode Setup Complete!\n');
        
        // Show setup-specific next steps
        if (redisSetup.type === 'cloud') {
            console.log('☁️  Redis Cloud Setup Complete!');
            console.log('✅ Your team is ready for remote collaboration');
            console.log('✅ Team members can connect from anywhere');
            console.log('');
            console.log('📋 Next Steps:');
            console.log('1. Share team invitation with: ./ff2.bat team invite <email>');
            console.log('2. Create your first team: ./ff2.bat team init');
            console.log('3. Team members can join from any location');
            console.log('4. Monitor Redis Cloud usage in your dashboard');
        } else if (redisSetup.type === 'docker') {
            console.log('🐳 Local Docker Redis Setup Complete!');
            console.log('⚠️  This setup is for development only');
            console.log('⚠️  Remote team members cannot access local Docker Redis');
            console.log('');
            console.log('📋 Next Steps:');
            console.log('1. Access Redis Commander at http://localhost:8081');
            console.log('2. Create your first team: ./ff2.bat team init');
            console.log('3. For remote teams, re-run setup and choose Redis Cloud');
        } else {
            console.log('⚙️  Existing Redis Configuration Complete!');
            console.log('');
            console.log('📋 Next Steps:');
            console.log('1. Create your first team: ./ff2.bat team init');
            console.log('2. Invite team members: ./ff2.bat team invite <email>');
            console.log('3. Ensure all team members can access your Redis instance');
        }
        
        console.log('');
        console.log('🔧 Available Commands:');
        console.log('  ./ff2.bat team init        - Create your first team');
        console.log('  ./ff2.bat team status      - Check team collaboration status');
        console.log('  ./ff2.bat team invite      - Invite team members');
        console.log('  ./ff2.bat team join        - Join team session');
        console.log('  node setup-team-mode.js    - Run this setup again');
        console.log('');
        console.log('📚 Documentation: docs/TEAM_MANUAL.md');
        console.log('🆘 Need help? Create an issue on GitHub');
        console.log('');
        
    } catch (error) {
        console.error('❌ Setup failed:', error.message);
        console.log('');
        console.log('💡 Troubleshooting tips:');
        console.log('1. Ensure you have internet connectivity for Redis Cloud');
        console.log('2. Check Docker is running for local Redis');
        console.log('3. Verify Redis credentials are correct');
        console.log('4. See docs/TEAM_MANUAL.md for detailed troubleshooting');
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}