# 🚀 ForgeFlow v2

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)](https://www.typescriptlang.org/)
[![Docker](https://img.shields.io/badge/Docker-Ready-blue)](https://www.docker.com/)

> **True Parallel AI Orchestration System with Enterprise Protocols**

ForgeFlow v2 is a revolutionary AI orchestration system that achieves **true parallel execution** with **zero-tolerance quality enforcement** through GitHub Issues as a distributed task queue and Git worktrees for isolated execution environments.

## ✨ Key Features

- **🚀 True Parallel Execution** - Multiple agents working simultaneously in isolated worktrees
- **🛡️ Enterprise Protocols** - NLNH (No Lies, No Hallucination), AntiHall, and RYR compliance
- **📊 Real-time Monitoring** - Web dashboard with live metrics and Prometheus/Grafana integration
- **🤖 11 Specialized Agents** - From strategic planning to deployment automation
- **✅ Zero-Tolerance Quality** - Enforced TypeScript, ESLint, >95% test coverage
- **🔄 GitHub Native** - Issues as tasks, PRs for code review, webhooks for automation
- **📦 Docker Ready** - Full containerization with docker-compose
- **📈 10x Faster** - Parallel execution vs sequential processing

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Master Orchestrator                      │
│                    (Coordination & Control)                   │
└────────────────────┬────────────────────────────────────────┘
                     │
        ┌────────────┴────────────┬────────────────┐
        │                         │                │
┌───────▼────────┐     ┌─────────▼──────┐ ┌──────▼───────┐
│ GitHub Issues  │     │   Worktree     │ │    Agent     │
│   (Task Queue) │     │    Manager     │ │     Pool     │
└────────────────┘     └────────────────┘ └──────────────┘
        │                         │                │
        └────────────┬────────────┴────────────────┘
                     │
    ┌────────────────┴─────────────────────────┐
    │            Parallel Execution            │
    ├───────────┬───────────┬─────────────────┤
    │ Worktree 1│ Worktree 2│   Worktree N    │
    │  Agent A  │  Agent B  │    Agent X      │
    └───────────┴───────────┴─────────────────┘
```

## 🚀 Quick Start

### Prerequisites

- Node.js >= 18.0.0
- Git
- Docker & Docker Compose (optional)
- GitHub Personal Access Token

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/forgeflow-v2.git
cd forgeflow-v2

# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Edit .env with your GitHub credentials
# GITHUB_TOKEN=your_token
# GITHUB_OWNER=your_username
# GITHUB_REPO=your_repo

# Build the project
npm run build

# Start ForgeFlow
npm start
```

### Docker Installation

```bash
# Build and start all services
docker-compose up -d

# View logs
docker-compose logs -f forgeflow

# Access dashboard at http://localhost:3000
# Access Grafana at http://localhost:3001 (admin/admin)
```

## 📋 CLI Commands

```bash
# Initialize ForgeFlow in current repository
forgeflow init

# Start parallel execution for an epic
forgeflow start-parallel epic-123

# Check execution status
forgeflow status

# Run quality gates validation
forgeflow validate

# Activate protocols
forgeflow protocol nlnh    # No Lies, No Hallucination
forgeflow protocol antihall # Anti-Hallucination
forgeflow protocol ryr      # Remember Your Rules

# Emergency mode (bypass prompts)
forgeflow ! urgent-fix-456

# List available patterns
forgeflow patterns
```

## 🤖 Available Agents

| Agent | Purpose | Capabilities |
|-------|---------|--------------|
| **Strategic Planner** | High-level planning | Task breakdown, roadmaps, risk assessment |
| **System Architect** | Technical design | Architecture, APIs, data models |
| **Code Implementer** | Code generation | Production code, error handling, docs |
| **Test Coverage Validator** | Testing | Unit/integration/E2E tests, >95% coverage |
| **Security Auditor** | Security | OWASP scanning, vulnerability detection |
| **Performance Optimizer** | Performance | Profiling, optimization, caching |
| **UI/UX Optimizer** | Interface | Responsive design, accessibility, themes |
| **Database Architect** | Database | Schema design, migrations, optimization |
| **Deployment Automation** | CI/CD | Pipeline setup, monitoring, rollbacks |
| **Code Quality Reviewer** | Quality | Style, patterns, complexity analysis |
| **AntiHallucination Validator** | Validation | Prevents AI from suggesting non-existent code |

## 🛡️ Enterprise Protocols

### NLNH Protocol (No Lies, No Hallucination)
- Absolute truthfulness enforcement
- Admits uncertainty when unsure
- Reports real errors transparently
- Zero tolerance for hallucinations

### AntiHall Protocol
- Validates all code references exist
- Checks methods, components, imports
- Blocks suggestions of non-existent code
- 100% accuracy requirement

### RYR Protocol (Remember Your Rules)
- Loads and enforces all rules
- Checks RULES.md compliance
- Validates quality standards
- Ensures protocol adherence

## 📊 Web Dashboard

Access the real-time dashboard at `http://localhost:3000`

Features:
- Live execution monitoring
- Agent activity tracking
- Performance metrics
- Progress visualization
- Pattern management
- Quality gate results

## 🔧 Configuration

### forgeflow.yaml

```yaml
github:
  token: ${GITHUB_TOKEN}
  owner: ${GITHUB_OWNER}
  repo: ${GITHUB_REPO}

worktree:
  basePath: .worktrees
  maxWorktrees: 10
  cleanupOnError: true

agents:
  maxConcurrent: 5
  timeout: 300000
  retryAttempts: 3

quality:
  linting: true
  testing: true
  coverage: 95
  security: true
  performance: true

protocols:
  nlnh: true
  antihall: true
  ryr: true
  rulesPath: .
```

## 📈 Metrics & Monitoring

### Prometheus Metrics
- `forgeflow_executions_total` - Total executions by pattern and status
- `forgeflow_agent_executions_total` - Agent execution counts
- `forgeflow_execution_duration_seconds` - Execution timing
- `forgeflow_active_executions` - Currently running executions
- `forgeflow_protocol_violations_total` - Protocol violation tracking

### Grafana Dashboards
Pre-configured dashboards for:
- System overview
- Agent performance
- Quality metrics
- Protocol compliance
- Resource utilization

## 🧪 Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test file
npm test orchestrator.test.ts

# Run in watch mode
npm run test:watch
```

## 🚢 Deployment

### Production Deployment

```bash
# Build for production
npm run build

# Start with PM2
pm2 start dist/index.js --name forgeflow

# Or use Docker
docker build -t forgeflow:latest .
docker run -d --name forgeflow forgeflow:latest
```

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `GITHUB_TOKEN` | GitHub Personal Access Token | ✅ |
| `GITHUB_OWNER` | GitHub username or org | ✅ |
| `GITHUB_REPO` | Repository name | ✅ |
| `NODE_ENV` | Environment (development/production) | ❌ |
| `PORT` | Server port (default: 3000) | ❌ |
| `LOG_LEVEL` | Logging level (info/debug/error) | ❌ |

## 📚 Documentation

- [Architecture Guide](./docs/ARCHITECTURE.md)
- [Agent Development](./docs/AGENTS.md)
- [Protocol Reference](./docs/PROTOCOLS.md)
- [API Documentation](./docs/API.md)
- [Deployment Guide](./docs/DEPLOYMENT.md)

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with TypeScript, Node.js, and love
- Powered by GitHub API and Git worktrees
- Inspired by the need for true parallel AI orchestration
- Special thanks to all contributors

## 📞 Support

- 📧 Email: support@forgeflow.dev
- 💬 Discord: [Join our server](https://discord.gg/forgeflow)
- 🐛 Issues: [GitHub Issues](https://github.com/your-org/forgeflow-v2/issues)
- 📖 Docs: [Documentation](https://docs.forgeflow.dev)

---

**ForgeFlow v2** - *Orchestrating the future of AI development, one parallel execution at a time* 🚀