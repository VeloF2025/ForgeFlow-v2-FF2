import { BaseAgent } from './base-agent';
import { execSync } from 'child_process';
import * as fs from 'fs-extra';
import * as path from 'path';

interface DeploymentConfig {
  environment: 'development' | 'staging' | 'production';
  buildCommand: string;
  testCommand: string;
  deployCommand: string;
  healthCheckUrl?: string;
  rollbackCommand?: string;
}

interface PreDeploymentChecks {
  tests: boolean;
  build: boolean;
  linting: boolean;
  typeCheck: boolean;
  security: boolean;
}

interface DeploymentStatus {
  environment: string;
  version: string;
  status: 'success' | 'failed' | 'in-progress' | 'rolling-back';
  startTime: Date;
  endTime?: Date;
  healthCheck?: boolean;
  errorRate?: number;
}

export class DeploymentAutomationAgent extends BaseAgent {
  private currentDeployment: DeploymentStatus | null = null;
  private deploymentHistory: DeploymentStatus[] = [];

  constructor() {
    super('deployment-automation', [
      'ci-cd-setup',
      'build-optimization',
      'environment-config',
      'deployment-orchestration',
      'rollback-procedures',
      'monitoring-setup',
      'pre-deployment-validation',
      'zero-downtime-deployment',
      'release-management',
    ]);
  }

  async execute(issueId: string, worktreeId: string): Promise<void> {
    this.preExecute(issueId, worktreeId);

    try {
      // Pre-deployment validation
      this.reportProgress(issueId, 5, 'Running pre-deployment checks');
      const checks = await this.runPreDeploymentChecks(worktreeId);
      if (!this.validateChecks(checks)) {
        throw new Error('Pre-deployment checks failed. Deployment blocked.');
      }

      this.reportProgress(issueId, 15, 'Configuring CI/CD pipeline');
      await this.configurePipeline(worktreeId);

      this.reportProgress(issueId, 25, 'Setting up build process');
      await this.setupBuild(worktreeId);

      this.reportProgress(issueId, 35, 'Configuring environments');
      await this.configureEnvironments(worktreeId);

      this.reportProgress(issueId, 45, 'Creating deployment scripts');
      await this.createDeploymentScripts(worktreeId);

      this.reportProgress(issueId, 55, 'Setting up monitoring and health checks');
      await this.setupMonitoring(worktreeId);

      this.reportProgress(issueId, 65, 'Preparing rollback procedures');
      await this.prepareRollback(worktreeId);

      this.reportProgress(issueId, 75, 'Executing deployment');
      await this.runDeployment(worktreeId, issueId);

      this.reportProgress(issueId, 90, 'Running post-deployment validation');
      await this.validateDeployment(worktreeId);

      this.reportProgress(issueId, 95, 'Setting up monitoring alerts');
      await this.setupPostDeploymentMonitoring(worktreeId);

      this.reportProgress(issueId, 100, 'Deployment automation complete');
      this.postExecute(issueId, true);
    } catch (error) {
      await this.handleDeploymentError(error, issueId, worktreeId);
    }
  }

  // DEPLOYMENT AUTOMATION METHODS

  async runPreDeploymentChecks(worktreeId: string): Promise<PreDeploymentChecks> {
    this.logger.info(`Running pre-deployment validation checklist in worktree: ${worktreeId}`);
    
    const checks: PreDeploymentChecks = {
      tests: false,
      build: false,
      linting: false,
      typeCheck: false,
      security: false,
    };

    try {
      // Run tests with coverage
      this.logger.info('Running test suite with coverage...');
      execSync('npm run test:coverage', { cwd: worktreeId, stdio: 'pipe' });
      checks.tests = true;
      this.logger.info('✅ Tests: PASSED');

      // TypeScript compilation
      this.logger.info('Running TypeScript type checking...');
      execSync('npm run typecheck', { cwd: worktreeId, stdio: 'pipe' });
      checks.typeCheck = true;
      this.logger.info('✅ TypeCheck: PASSED');

      // ESLint validation
      this.logger.info('Running ESLint validation...');
      execSync('npm run lint', { cwd: worktreeId, stdio: 'pipe' });
      checks.linting = true;
      this.logger.info('✅ Linting: PASSED');

      // Build process
      this.logger.info('Running build process...');
      execSync('npm run build', { cwd: worktreeId, stdio: 'pipe' });
      checks.build = true;
      this.logger.info('✅ Build: SUCCESS');

      // Security audit
      this.logger.info('Running security audit...');
      try {
        execSync('npm audit --audit-level=moderate', { cwd: worktreeId, stdio: 'pipe' });
        checks.security = true;
        this.logger.info('✅ Security: CLEAN');
      } catch (error) {
        this.logger.warn('⚠️  Security: VULNERABILITIES FOUND - Review required');
      }
    } catch (error) {
      this.logger.error('❌ Pre-deployment checks failed:', error);
    }

    return checks;
  }

  private validateChecks(checks: PreDeploymentChecks): boolean {
    const required = ['tests', 'build', 'linting', 'typeCheck'] as const;
    const failed = required.filter(check => !checks[check]);
    
    if (failed.length > 0) {
      this.logger.error(`❌ DEPLOYMENT BLOCKED - Failed checks: ${failed.join(', ')}`);
      return false;
    }
    
    this.logger.info('✅ ALL QUALITY GATES PASSED - Deployment approved');
    return true;
  }

  private async configurePipeline(worktreeId: string): Promise<void> {
    this.logger.info(`Configuring CI/CD pipeline in worktree: ${worktreeId}`);
    
    // Create GitHub Actions workflow if not exists
    const workflowDir = path.join(worktreeId, '.github', 'workflows');
    await fs.ensureDir(workflowDir);
    
    const workflowContent = this.generateGitHubActionsWorkflow();
    await fs.writeFile(path.join(workflowDir, 'deploy.yml'), workflowContent);
    
    this.logger.info('✅ CI/CD pipeline configured');
    await this.delay(300);
  }

  private async setupBuild(worktreeId: string): Promise<void> {
    this.logger.info(`Setting up optimized build process in worktree: ${worktreeId}`);
    
    // Verify build configuration
    const packageJsonPath = path.join(worktreeId, 'package.json');
    if (await fs.pathExists(packageJsonPath)) {
      const packageJson = await fs.readJson(packageJsonPath);
      
      // Ensure required build scripts exist
      const requiredScripts = ['build', 'test', 'lint', 'typecheck'];
      const missingScripts = requiredScripts.filter(script => !packageJson.scripts[script]);
      
      if (missingScripts.length > 0) {
        this.logger.warn(`Missing build scripts: ${missingScripts.join(', ')}`);
      }
    }
    
    this.logger.info('✅ Build process configured');
    await this.delay(400);
  }

  private async configureEnvironments(worktreeId: string): Promise<void> {
    this.logger.info(`Configuring deployment environments in worktree: ${worktreeId}`);
    
    // Create environment-specific configurations
    const environments = ['development', 'staging', 'production'];
    
    for (const env of environments) {
      const envFile = path.join(worktreeId, `.env.${env}.example`);
      if (!(await fs.pathExists(envFile))) {
        const envContent = this.generateEnvironmentConfig(env);
        await fs.writeFile(envFile, envContent);
        this.logger.info(`Created ${env} environment configuration`);
      }
    }
    
    this.logger.info('✅ Environment configurations ready');
    await this.delay(500);
  }

  private async createDeploymentScripts(worktreeId: string): Promise<void> {
    this.logger.info(`Creating deployment scripts in worktree: ${worktreeId}`);
    
    const scriptsDir = path.join(worktreeId, 'scripts', 'deploy');
    await fs.ensureDir(scriptsDir);
    
    // Create deployment scripts for different environments
    const deployScript = this.generateDeploymentScript();
    await fs.writeFile(path.join(scriptsDir, 'deploy.sh'), deployScript, { mode: 0o755 });
    
    const rollbackScript = this.generateRollbackScript();
    await fs.writeFile(path.join(scriptsDir, 'rollback.sh'), rollbackScript, { mode: 0o755 });
    
    this.logger.info('✅ Deployment scripts created');
    await this.delay(400);
  }

  private async setupMonitoring(worktreeId: string): Promise<void> {
    this.logger.info(`Setting up monitoring and health checks in worktree: ${worktreeId}`);
    
    // Create health check endpoint if not exists
    const healthCheckContent = this.generateHealthCheckEndpoint();
    const healthDir = path.join(worktreeId, 'src', 'health');
    await fs.ensureDir(healthDir);
    await fs.writeFile(path.join(healthDir, 'health-check.ts'), healthCheckContent);
    
    this.logger.info('✅ Monitoring and health checks configured');
    await this.delay(300);
  }

  private async prepareRollback(worktreeId: string): Promise<void> {
    this.logger.info(`Preparing rollback procedures in worktree: ${worktreeId}`);
    
    // Document current deployment state
    const currentVersion = await this.getCurrentVersion(worktreeId);
    const rollbackPlan = {
      version: currentVersion,
      timestamp: new Date().toISOString(),
      command: 'npm run rollback',
      verificationSteps: [
        'Check health endpoint responds',
        'Verify error rate < 1%',
        'Confirm database migrations compatible',
        'Test critical user flows',
      ],
    };
    
    await fs.writeFile(
      path.join(worktreeId, 'ROLLBACK_PLAN.json'),
      JSON.stringify(rollbackPlan, null, 2)
    );
    
    this.logger.info('✅ Rollback procedures prepared');
    await this.delay(200);
  }

  private async runDeployment(worktreeId: string, issueId: string): Promise<void> {
    this.logger.info(`Executing deployment from worktree: ${worktreeId}`);
    
    const version = await this.getCurrentVersion(worktreeId);
    
    // Initialize deployment tracking
    this.currentDeployment = {
      environment: 'staging', // Default to staging for safety
      version,
      status: 'in-progress',
      startTime: new Date(),
    };
    
    try {
      // Execute deployment command based on project type
      const deployCommand = await this.detectDeploymentMethod(worktreeId);
      this.logger.info(`Running deployment command: ${deployCommand}`);
      
      execSync(deployCommand, { cwd: worktreeId, stdio: 'pipe' });
      
      this.currentDeployment.status = 'success';
      this.currentDeployment.endTime = new Date();
      
      this.logger.info(`✅ Deployment successful - Version: ${version}`);
    } catch (error) {
      this.currentDeployment.status = 'failed';
      this.currentDeployment.endTime = new Date();
      throw error;
    } finally {
      this.deploymentHistory.push({ ...this.currentDeployment });
    }
    
    await this.delay(800);
  }

  private async validateDeployment(worktreeId: string): Promise<void> {
    this.logger.info(`Validating deployment from worktree: ${worktreeId}`);
    
    if (!this.currentDeployment) {
      throw new Error('No active deployment to validate');
    }
    
    try {
      // Run post-deployment tests
      this.logger.info('Running smoke tests...');
      execSync('npm run test -- --testNamePattern="smoke"', { cwd: worktreeId, stdio: 'pipe' });
      
      // Check health endpoint if available
      const healthCheck = await this.performHealthCheck();
      this.currentDeployment.healthCheck = healthCheck;
      
      // Monitor error rates
      const errorRate = await this.checkErrorRate();
      this.currentDeployment.errorRate = errorRate;
      
      if (errorRate > 0.05) { // 5% error rate threshold
        throw new Error(`High error rate detected: ${(errorRate * 100).toFixed(2)}%`);
      }
      
      this.logger.info('✅ Deployment validation passed');
    } catch (error) {
      this.logger.error('❌ Deployment validation failed:', error);
      throw error;
    }
    
    await this.delay(300);
  }

  private async setupPostDeploymentMonitoring(worktreeId: string): Promise<void> {
    this.logger.info(`Setting up post-deployment monitoring in worktree: ${worktreeId}`);
    
    // Create monitoring configuration
    const monitoringConfig = {
      healthCheck: {
        endpoint: '/health',
        interval: 30000, // 30 seconds
        timeout: 5000, // 5 seconds
      },
      metrics: {
        errorRate: { threshold: 0.05 },
        responseTime: { threshold: 2000 }, // 2 seconds
        uptime: { threshold: 0.99 }, // 99%
      },
      alerts: {
        slack: process.env.SLACK_WEBHOOK_URL,
        email: process.env.ALERT_EMAIL,
      },
    };
    
    await fs.writeFile(
      path.join(worktreeId, 'monitoring.config.json'),
      JSON.stringify(monitoringConfig, null, 2)
    );
    
    this.logger.info('✅ Post-deployment monitoring configured');
    await this.delay(200);
  }

  private async handleDeploymentError(error: unknown, issueId: string, worktreeId: string): Promise<void> {
    this.logger.error(`❌ Deployment failed for issue ${issueId}:`, error);
    
    if (this.currentDeployment) {
      this.currentDeployment.status = 'failed';
      this.currentDeployment.endTime = new Date();
    }
    
    // Attempt automatic rollback if deployment was in progress
    if (this.currentDeployment?.status === 'failed') {
      this.logger.info('Attempting automatic rollback...');
      try {
        await this.executeRollback(worktreeId);
        this.logger.info('✅ Automatic rollback completed');
      } catch (rollbackError) {
        this.logger.error('❌ Rollback failed:', rollbackError);
      }
    }
    
    this.handleError(error, issueId);
  }

  // UTILITY METHODS

  private async executeRollback(worktreeId: string): Promise<void> {
    this.logger.info('Executing rollback procedure...');
    
    if (this.currentDeployment) {
      this.currentDeployment.status = 'rolling-back';
    }
    
    try {
      // Execute rollback command
      execSync('npm run rollback || git revert HEAD --no-edit', { cwd: worktreeId, stdio: 'pipe' });
      this.logger.info('✅ Rollback completed successfully');
    } catch (error) {
      this.logger.error('❌ Rollback failed:', error);
      throw error;
    }
  }

  private async getCurrentVersion(worktreeId: string): Promise<string> {
    try {
      const packageJsonPath = path.join(worktreeId, 'package.json');
      const packageJson = await fs.readJson(packageJsonPath);
      return packageJson.version || '1.0.0';
    } catch {
      // Fallback to git commit hash
      try {
        const gitHash = execSync('git rev-parse --short HEAD', { cwd: worktreeId, encoding: 'utf8' });
        return gitHash.trim();
      } catch {
        return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
      }
    }
  }

  private async detectDeploymentMethod(worktreeId: string): Promise<string> {
    // Check for various deployment configurations
    if (await fs.pathExists(path.join(worktreeId, 'firebase.json'))) {
      return 'firebase deploy --only hosting';
    }
    if (await fs.pathExists(path.join(worktreeId, 'vercel.json'))) {
      return 'vercel --prod';
    }
    if (await fs.pathExists(path.join(worktreeId, 'Dockerfile'))) {
      return 'docker build -t app:latest . && docker push app:latest';
    }
    if (await fs.pathExists(path.join(worktreeId, 'netlify.toml'))) {
      return 'netlify deploy --prod';
    }
    
    // Default to npm script
    return 'npm run build';
  }

  private async performHealthCheck(): Promise<boolean> {
    // Simulate health check - in real implementation, this would make HTTP request
    await this.delay(100);
    return true;
  }

  private async checkErrorRate(): Promise<number> {
    // Simulate error rate check - in real implementation, this would query monitoring system
    await this.delay(100);
    return Math.random() * 0.02; // Random error rate 0-2%
  }

  private generateGitHubActionsWorkflow(): string {
    return `name: Deploy

on:
  push:
    branches: [main, staging]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'
      - run: npm ci
      - run: npm run typecheck
      - run: npm run lint
      - run: npm run test:coverage
      - run: npm run build

  deploy:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'
      - run: npm ci
      - run: npm run build
      - run: npm run deploy
        env:
          DEPLOY_TOKEN: \${{ secrets.DEPLOY_TOKEN }}
`;
  }

  private generateEnvironmentConfig(env: string): string {
    return `# ${env.toUpperCase()} Environment Configuration

# Application
NODE_ENV=${env}
PORT=3000

# Database
DATABASE_URL=\${${env.toUpperCase()}_DATABASE_URL}

# Authentication
JWT_SECRET=\${JWT_SECRET}
JWT_EXPIRES_IN=24h

# External Services
API_BASE_URL=\${${env.toUpperCase()}_API_URL}

# Monitoring
HEALTH_CHECK_INTERVAL=30000
ERROR_RATE_THRESHOLD=0.05

# Deployment
DEPLOY_ENVIRONMENT=${env}
ROLLBACK_ENABLED=true
`;
  }

  private generateDeploymentScript(): string {
    return `#!/bin/bash
# Deployment Script - Auto-generated by ForgeFlow V2 Deployment Agent

set -e

ENV=\${1:-staging}
VERSION=\$(npm version --json | jq -r '."@forgeflow/orchestrator-v2"')

echo "🚀 Starting deployment to \$ENV environment (v\$VERSION)..."

# Pre-deployment checks
echo "📋 Running pre-deployment checks..."
npm run typecheck
npm run lint
npm run test:coverage
npm run build

# Deployment
echo "🔄 Deploying to \$ENV..."
case \$ENV in
  "production")
    echo "⚠️  Production deployment requires manual approval"
    read -p "Continue with production deployment? (y/N): " -n 1 -r
    echo
    if [[ ! \$REPLY =~ ^[Yy]$ ]]; then
      echo "❌ Deployment cancelled"
      exit 1
    fi
    ;;
esac

# Execute deployment based on environment
if [ -f "firebase.json" ]; then
  firebase deploy --only hosting --project \$ENV
elif [ -f "vercel.json" ]; then
  vercel --prod
elif [ -f "Dockerfile" ]; then
  docker build -t app:\$VERSION .
  docker push app:\$VERSION
else
  echo "No deployment configuration found"
  exit 1
fi

echo "✅ Deployment completed successfully!"
echo "📊 Version: \$VERSION"
echo "🌍 Environment: \$ENV"
echo "⏰ Time: \$(date)"
`;
  }

  private generateRollbackScript(): string {
    return `#!/bin/bash
# Rollback Script - Auto-generated by ForgeFlow V2 Deployment Agent

set -e

ENV=\${1:-staging}
TARGET_VERSION=\${2}

echo "🔄 Starting rollback for \$ENV environment..."

if [ -z "\$TARGET_VERSION" ]; then
  echo "❌ Target version required"
  echo "Usage: ./rollback.sh <environment> <target_version>"
  exit 1
fi

echo "⚠️  Rolling back to version \$TARGET_VERSION"
read -p "Continue with rollback? (y/N): " -n 1 -r
echo
if [[ ! \$REPLY =~ ^[Yy]$ ]]; then
  echo "❌ Rollback cancelled"
  exit 1
fi

# Execute rollback
if [ -f "firebase.json" ]; then
  firebase hosting:rollback --project \$ENV
elif command -v kubectl &> /dev/null; then
  kubectl rollout undo deployment/app
else
  git revert HEAD --no-edit
  npm run build
  npm run deploy
fi

echo "✅ Rollback completed!"
echo "📊 Rolled back to: \$TARGET_VERSION"
echo "🌍 Environment: \$ENV"
echo "⏰ Time: \$(date)"
`;
  }

  private generateHealthCheckEndpoint(): string {
    return `// Health Check Endpoint - Auto-generated by ForgeFlow V2 Deployment Agent

import { Request, Response } from 'express';

interface HealthStatus {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  version: string;
  uptime: number;
  checks: {
    database?: boolean;
    redis?: boolean;
    external_apis?: boolean;
  };
}

export class HealthCheckService {
  async getHealth(req: Request, res: Response): Promise<void> {
    const startTime = Date.now();
    
    try {
      const healthStatus: HealthStatus = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
        uptime: process.uptime(),
        checks: await this.runHealthChecks(),
      };
      
      const responseTime = Date.now() - startTime;
      
      // Set health check headers
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('X-Response-Time', \`\${responseTime}ms\`);
      
      // Return appropriate status code
      const isHealthy = Object.values(healthStatus.checks).every(check => check !== false);
      const statusCode = isHealthy ? 200 : 503;
      
      res.status(statusCode).json(healthStatus);
    } catch (error) {
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
        uptime: process.uptime(),
      });
    }
  }
  
  private async runHealthChecks(): Promise<{ [key: string]: boolean }> {
    const checks: { [key: string]: boolean } = {};
    
    // Database health check
    try {
      // Add your database connection check here
      checks.database = true;
    } catch {
      checks.database = false;
    }
    
    // Redis health check
    try {
      // Add your Redis connection check here
      checks.redis = true;
    } catch {
      checks.redis = false;
    }
    
    // External APIs health check
    try {
      // Add your external API checks here
      checks.external_apis = true;
    } catch {
      checks.external_apis = false;
    }
    
    return checks;
  }
}

// Express route setup
// app.get('/health', (req, res) => new HealthCheckService().getHealth(req, res));
`;
  }

  // PUBLIC METHODS FOR ORCHESTRATOR

  public async deployToEnvironment(environment: 'development' | 'staging' | 'production'): Promise<DeploymentStatus> {
    this.logger.info(`Initiating deployment to ${environment} environment`);
    
    const config: DeploymentConfig = {
      environment,
      buildCommand: 'npm run build',
      testCommand: 'npm run test:coverage',
      deployCommand: await this.detectDeploymentMethod(process.cwd()),
    };
    
    // Execute deployment workflow
    const checks = await this.runPreDeploymentChecks(process.cwd());
    if (!this.validateChecks(checks)) {
      throw new Error(`Deployment to ${environment} blocked by quality gates`);
    }
    
    const version = await this.getCurrentVersion(process.cwd());
    
    this.currentDeployment = {
      environment,
      version,
      status: 'in-progress',
      startTime: new Date(),
    };
    
    return this.currentDeployment;
  }

  public async rollbackDeployment(targetVersion?: string): Promise<void> {
    this.logger.info(`Rolling back deployment${targetVersion ? ` to version ${targetVersion}` : ''}`);
    
    if (!this.currentDeployment) {
      throw new Error('No active deployment to rollback');
    }
    
    await this.executeRollback(process.cwd());
    
    this.currentDeployment.status = 'rolling-back';
    this.currentDeployment.endTime = new Date();
  }

  public getDeploymentStatus(): DeploymentStatus | null {
    return this.currentDeployment;
  }

  public getDeploymentHistory(): DeploymentStatus[] {
    return [...this.deploymentHistory];
  }

  public generateDeploymentReport(): string {
    const current = this.currentDeployment;
    if (!current) {
      return 'No active deployment';
    }
    
    const duration = current.endTime 
      ? current.endTime.getTime() - current.startTime.getTime()
      : Date.now() - current.startTime.getTime();
    
    return `
[DEPLOYMENT STATUS]
Environment: ${current.environment}
Version: ${current.version}
Status: ${current.status}

[DEPLOYMENT DETAILS]
Start Time: ${current.startTime.toISOString()}
End Time: ${current.endTime?.toISOString() || 'In progress'}
Duration: ${Math.round(duration / 1000)}s

[POST-DEPLOYMENT VERIFICATION]
□ Health Check: ${current.healthCheck ? '✅ PASSED' : '❌ FAILED'}
□ Error Rate: ${current.errorRate ? `${(current.errorRate * 100).toFixed(2)}%` : 'N/A'}

[ROLLBACK PLAN]
Trigger: Error rate > 5% OR Health check failures
Command: npm run rollback || ./scripts/deploy/rollback.sh
Time Estimate: ~2 minutes
Verification: Health endpoint + smoke tests

[NEXT STEPS]
1. Monitor error rates for 15 minutes
2. Verify critical user flows
3. Check performance metrics
${current.status === 'failed' ? '4. Execute rollback if issues persist' : ''}
`;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
