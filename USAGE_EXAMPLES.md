# ForgeFlow v2 - Usage Examples

## Table of Contents
- [Quick Start](#quick-start)
- [Basic Commands](#basic-commands)
- [Parallel Execution](#parallel-execution)
- [GitHub Integration](#github-integration)
- [Webhook Setup](#webhook-setup)
- [Dashboard Usage](#dashboard-usage)
- [Emergency Mode](#emergency-mode)
- [Docker Deployment](#docker-deployment)
- [Advanced Patterns](#advanced-patterns)

## Quick Start

### 1. Initial Setup

```bash
# Clone the repository
git clone https://github.com/VeloF2025/ForgeFlow-v2-FF2.git
cd ForgeFlow-v2-FF2

# Install dependencies
npm install

# Build the project
npm run build

# Create configuration
cp .env.example .env
# Edit .env and add your GitHub token
```

### 2. Initialize ForgeFlow in Your Repository

```bash
# Navigate to your project repository
cd /path/to/your/project

# Initialize ForgeFlow
forgeflow init

# Follow the prompts:
# - Enter GitHub owner (username or org)
# - Enter GitHub repository name
# - Enter GitHub Personal Access Token
```

### 3. Start the System

```bash
# Windows
start-forgeflow.bat

# Linux/Mac
./start-forgeflow.sh

# Or directly with Node
node dist/index.js
```

## Basic Commands

### Check Status

```bash
# View all active executions
forgeflow status

# Check specific execution
forgeflow status -e execution-abc123

# List available patterns
forgeflow patterns
```

### Run Quality Gates

```bash
# Validate code quality
forgeflow validate

# This runs:
# - ESLint (zero errors/warnings)
# - TypeScript type checking
# - Test coverage (>95%)
# - Security scanning
```

### Activate Protocols

```bash
# Activate No Lies, No Hallucination protocol
forgeflow protocol nlnh

# Activate Anti-Hallucination validator
forgeflow protocol antihall

# Activate Remember Your Rules protocol
forgeflow protocol ryr
```

## Parallel Execution

### Start Parallel Execution for an Epic

```bash
# Auto-select pattern based on epic labels
forgeflow start-parallel epic-123

# Use specific pattern
forgeflow start-parallel epic-123 --pattern feature-development

# Available patterns:
# - feature-development: Full feature implementation
# - bug-fix-sprint: Rapid bug fixing
# - security-audit: Security-focused execution
```

### Example: Feature Development

1. **Create an Epic Issue in GitHub:**
```markdown
Title: Implement User Authentication System
Labels: epic, feature
Body:
## Tasks
- [ ] Design authentication architecture
- [ ] Implement login/logout endpoints
- [ ] Add JWT token management
- [ ] Create user registration flow
- [ ] Add password reset functionality
- [ ] Write comprehensive tests
- [ ] Update documentation
```

2. **Start Parallel Execution:**
```bash
forgeflow start-parallel issue-456
```

3. **ForgeFlow will:**
- Parse the epic into individual tasks
- Create GitHub issues for each task
- Assign appropriate agents to each issue
- Execute tasks in parallel using worktrees
- Monitor progress in real-time
- Create pull requests for review

### Stop an Execution

```bash
forgeflow stop execution-abc123
```

## GitHub Integration

### Setting Up GitHub Issues as Tasks

ForgeFlow uses specific labels to assign tasks to agents:

```yaml
# Agent Labels:
- strategic-planner      # High-level planning tasks
- system-architect       # Architecture and design
- code-implementer       # Code generation
- test-coverage-validator # Testing tasks
- security-auditor       # Security reviews
- performance-optimizer  # Performance improvements
- ui-ux-optimizer       # UI/UX enhancements
- database-architect    # Database design
- deployment-automation # CI/CD setup
- code-quality-reviewer # Code reviews
- antihallucination-validator # Validation tasks

# Priority Labels:
- emergency  # Triggers immediate execution
- critical   # High priority
- bug        # Bug fixes
- feature    # New features
- enhancement # Improvements
```

### Example Issue for Agent Execution

```markdown
Title: Create User Authentication API
Labels: code-implementer, test-coverage-validator
Assignee: @forgeflow-bot
Body:

## Requirements
- REST API endpoints for login/logout
- JWT token generation and validation
- Rate limiting on authentication endpoints
- Comprehensive error handling

## Acceptance Criteria
- [ ] POST /api/auth/login endpoint
- [ ] POST /api/auth/logout endpoint
- [ ] GET /api/auth/verify endpoint
- [ ] 100% test coverage
- [ ] API documentation updated
```

## Webhook Setup

### Configure GitHub Webhooks

```bash
# Interactive webhook setup
forgeflow webhook-setup

# Enter your server URL and webhook secret
# Follow the instructions to configure in GitHub
```

### Start Webhook Handler

```bash
# Start webhook handler on default port (3002)
forgeflow webhook-start

# Use custom port
forgeflow webhook-start --port 4000
```

### Webhook Events Handled

- **Issues**: opened, closed, labeled, assigned
- **Pull Requests**: opened, closed, merged, reviewed
- **Push**: commits to branches
- **Workflow Runs**: CI/CD status updates
- **Deployments**: deployment status changes

## Dashboard Usage

### Access the Dashboard

```
http://localhost:3000
```

### Dashboard Features

1. **Real-time Metrics**
   - Active executions count
   - Completed tasks
   - Active agents
   - System uptime

2. **Execution Monitoring**
   - Live progress bars
   - Phase completion status
   - Agent activity tracking

3. **Performance Charts**
   - Execution timeline
   - Agent utilization
   - Success/failure rates

4. **Control Panel**
   - Start new executions
   - Stop running tasks
   - View logs

### API Endpoints

```bash
# Health check
curl http://localhost:3000/health

# Metrics (Prometheus format)
curl http://localhost:3000/metrics

# Start execution via API
curl -X POST http://localhost:3000/api/executions \
  -H "Content-Type: application/json" \
  -d '{"epicId": "epic-123", "pattern": "feature-development"}'

# Get execution status
curl http://localhost:3000/api/executions/execution-abc123
```

## Emergency Mode

### Bypass All Prompts and Quality Gates

```bash
# Emergency execution (use with caution!)
forgeflow ! urgent-fix-789

# This will:
# - Skip all confirmation prompts
# - Bypass quality gates
# - Execute immediately
# - Use maximum resources
```

**⚠️ Warning**: Only use in production emergencies!

## Docker Deployment

### Build and Run with Docker

```bash
# Build the image
docker build -t forgeflow:latest .

# Run with docker-compose (includes all services)
docker-compose up -d

# Services included:
# - ForgeFlow orchestrator
# - Redis (caching)
# - PostgreSQL (persistence)
# - Prometheus (metrics)
# - Grafana (visualization)
# - Nginx (reverse proxy)
```

### Access Services

- **ForgeFlow Dashboard**: http://localhost:3000
- **Grafana**: http://localhost:3001 (admin/admin)
- **Prometheus**: http://localhost:9090
- **API**: http://localhost:3000/api

### Docker Environment Variables

```bash
# Create .env file for Docker
cat > .env <<EOF
GITHUB_TOKEN=your_token
GITHUB_OWNER=VeloF2025
GITHUB_REPO=ForgeFlow-v2-FF2
DATABASE_URL=postgresql://forgeflow:password@postgres:5432/forgeflow
REDIS_URL=redis://redis:6379
EOF

# Run with env file
docker-compose --env-file .env up
```

## Advanced Patterns

### Custom Execution Pattern

Create a custom pattern in `forgeflow.yaml`:

```yaml
patterns:
  custom-pattern:
    name: "Custom Pattern"
    description: "My custom execution pattern"
    phases:
      - name: "Analysis"
        agents: ["strategic-planner", "system-architect"]
        parallel: true
      - name: "Implementation"
        agents: ["code-implementer", "database-architect"]
        parallel: true
      - name: "Validation"
        agents: ["test-coverage-validator", "security-auditor"]
        parallel: true
```

### Parallel Worktree Execution

```bash
# Configure max worktrees
export MAX_WORKTREES=10

# Start execution with custom concurrency
forgeflow start-parallel epic-123 --max-concurrent 8
```

### Quality Gate Customization

```yaml
# In forgeflow.yaml
quality:
  linting:
    enabled: true
    rules: ".eslintrc.json"
  testing:
    enabled: true
    coverage: 95
    frameworks: ["jest", "vitest"]
  security:
    enabled: true
    scanners: ["owasp", "snyk"]
  performance:
    enabled: true
    thresholds:
      pageLoad: 1500  # ms
      apiResponse: 200 # ms
```

### Agent Pipeline Configuration

```bash
# Run specific agents in sequence
forgeflow execute \
  --agents "strategic-planner,system-architect,code-implementer" \
  --sequential

# Run agents in parallel groups
forgeflow execute \
  --phase1 "strategic-planner,system-architect" \
  --phase2 "code-implementer,test-coverage-validator" \
  --phase3 "security-auditor,deployment-automation"
```

## Troubleshooting

### Common Issues

1. **GitHub Authentication Failed**
```bash
# Check token permissions
# Required scopes: repo, workflow, admin:org

# Test connection
curl -H "Authorization: token YOUR_TOKEN" https://api.github.com/user
```

2. **Worktree Creation Failed**
```bash
# Clean up worktrees
git worktree prune
rm -rf .worktrees/*

# Restart execution
forgeflow start-parallel epic-123
```

3. **Port Already in Use**
```bash
# Change port in .env
PORT=3001
DASHBOARD_PORT=3001

# Or kill existing process
# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# Linux/Mac
lsof -i :3000
kill -9 <PID>
```

4. **Quality Gates Failing**
```bash
# Run individual checks
npm run lint
npm run typecheck
npm test

# Fix automatically where possible
npm run lint:fix
npm run format
```

## Best Practices

1. **Epic Structure**
   - Keep epics focused (5-10 tasks)
   - Use clear, actionable task descriptions
   - Apply appropriate labels

2. **Agent Selection**
   - Match agents to task types
   - Use parallel execution for independent tasks
   - Sequential for dependent tasks

3. **Quality Standards**
   - Never bypass quality gates in production
   - Maintain >95% test coverage
   - Zero TypeScript/ESLint errors

4. **Monitoring**
   - Keep dashboard open during executions
   - Monitor Grafana for performance metrics
   - Check logs for detailed debugging

5. **Security**
   - Rotate GitHub tokens regularly
   - Use webhook secrets
   - Enable all security protocols

## Support

- **Documentation**: [README.md](README.md)
- **Issues**: [GitHub Issues](https://github.com/VeloF2025/ForgeFlow-v2-FF2/issues)
- **PRD**: [FORGEFLOW_V2_PRD_COMPLETE.md](FORGEFLOW_V2_PRD_COMPLETE.md)

---

*ForgeFlow v2 - True Parallel AI Orchestration with Zero-Tolerance Quality*