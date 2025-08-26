#!/usr/bin/env node

/**
 * FF2 Team Mode Setup Script
 * Sets up Redis backend and team authentication for ForgeFlow v2
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🚀 ForgeFlow v2 Team Mode Setup\n');

// Check if Redis is available
function checkRedis() {
    try {
        execSync('redis-cli ping', { stdio: 'ignore' });
        console.log('✅ Redis is already running');
        return true;
    } catch (error) {
        console.log('⚠️  Redis not found, will start with Docker');
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

// Setup Redis with Docker
function setupRedis() {
    console.log('🐳 Setting up Redis with Docker...');
    
    try {
        // Make sure Docker is running
        execSync('docker --version', { stdio: 'ignore' });
        
        // Create Redis setup script executable
        const setupScript = path.join(process.cwd(), 'setup-redis-dev.sh');
        if (fs.existsSync(setupScript)) {
            execSync('chmod +x setup-redis-dev.sh');
            execSync('./setup-redis-dev.sh', { stdio: 'inherit' });
        }
        
        console.log('✅ Redis backend setup complete');
    } catch (error) {
        console.error('❌ Docker setup failed:', error.message);
        console.log('💡 Please install Docker and try again');
        process.exit(1);
    }
}

// Create initial team configuration
function createTeamConfig() {
    console.log('⚙️  Creating team configuration...');
    
    const configDir = path.join(process.cwd(), '.ff2');
    if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
    }

    const teamConfig = {
        teamMode: {
            enabled: true,
            initialized: new Date().toISOString(),
            version: '1.0.0'
        },
        redis: {
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT) || 6379,
            password: process.env.REDIS_PASSWORD || 'ff2_team_redis_2024',
            db: parseInt(process.env.REDIS_DB) || 0
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
    
    console.log('✅ Team configuration created');
}

// Main setup function
async function main() {
    try {
        // Step 1: Install dependencies
        installDependencies();
        
        // Step 2: Update package.json
        updatePackageJson();
        
        // Step 3: Setup Redis
        if (!checkRedis()) {
            setupRedis();
        }
        
        // Step 4: Create team configuration
        createTeamConfig();
        
        console.log('\n🎉 FF2 Team Mode Setup Complete!\n');
        console.log('📋 Next Steps:');
        console.log('1. Review and customize .env.team configuration');
        console.log('2. Run "npm run team:dev" to start development with team mode');
        console.log('3. Access Redis Commander at http://localhost:8081');
        console.log('4. Use "ff2 team init" to create your first team\n');
        
        console.log('🔧 Available Commands:');
        console.log('  npm run team:setup     - Run this setup again');
        console.log('  npm run team:redis     - Start Redis backend');
        console.log('  npm run team:dev       - Start development with team mode');
        console.log('  npm run team:test      - Run team collaboration tests');
        console.log('  npm run team:migrate   - Migrate existing projects to team mode\n');
        
    } catch (error) {
        console.error('❌ Setup failed:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}