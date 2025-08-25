# 🔧 Custom Agent System - Complete Guide

## Overview

ForgeFlow V2's Custom Agent System allows developers to create, deploy, and manage custom agents that extend the platform's capabilities. The system provides a comprehensive plugin architecture with security sandboxing, dependency management, hot reloading, and seamless integration with the existing agent pool.

## 🎯 Key Features

### ✅ Extensibility
- **Plugin Architecture**: Load custom agents from external sources
- **Multiple Implementation Types**: JavaScript, TypeScript, Python, Shell, Docker
- **JSON/YAML Configuration**: Flexible agent definition formats
- **Hot Reloading**: Dynamic loading/reloading without restart

### ✅ Security & Isolation  
- **Security Sandbox**: Isolated execution environment
- **Permission System**: Fine-grained security controls
- **Resource Limits**: Memory and CPU constraints
- **Worker Thread Isolation**: Safe parallel execution

### ✅ Quality Assurance
- **Schema Validation**: Comprehensive definition validation
- **Dependency Management**: Automatic resolution and installation
- **Quality Gates**: Built-in quality checks and metrics
- **Testing Framework**: Unit and integration test support

### ✅ Developer Experience
- **Rich Type Definitions**: Full TypeScript support
- **Comprehensive Documentation**: Built-in docs and examples
- **Event System**: Plugin lifecycle events
- **Error Handling**: Graceful failure management

## 🚀 Quick Start

### 1. Create Agent Definition

Create an `agent.json` or `agent.yaml` file:

```json
{
  "name": "my-custom-agent",
  "type": "my-custom-agent", 
  "version": "1.0.0",
  "displayName": "My Custom Agent",
  "description": "A custom agent that does amazing things",
  "capabilities": [
    "custom-capability",
    "data-processing"
  ],
  "implementation": {
    "type": "javascript",
    "main": "index.js",
    "class": "MyCustomAgent"
  }
}
```

### 2. Implement Agent Logic

Create `index.js` with your agent implementation:

```javascript
class MyCustomAgent {
  constructor(config = {}) {
    this.config = config;
  }

  async execute(issueId, worktreeId, context) {
    const { logger, utils } = context;
    
    logger.info('Starting custom agent execution', { issueId, worktreeId });
    
    try {
      // Your custom agent logic here
      await this.performCustomTask(issueId, worktreeId);
      
      logger.info('Custom agent completed successfully');
    } catch (error) {
      logger.error('Custom agent failed', error);
      throw error;
    }
  }

  async performCustomTask(issueId, worktreeId) {
    // Implement your custom functionality
    return { success: true };
  }
}

module.exports = MyCustomAgent;
```

### 3. Deploy and Use

1. Place your agent in the `custom-agents/` directory
2. ForgeFlow will auto-discover and load it
3. Use it in your orchestration patterns:

```javascript
// The agent is now available in the agent pool
const agent = await agentPool.acquireAgent('my-custom-agent');
```

## 📋 Agent Definition Schema

### Required Fields

```json
{
  "name": "agent-name",           // Kebab-case name
  "type": "agent-type",           // Unique type identifier  
  "version": "1.0.0",             // Semantic version
  "capabilities": ["cap1"],       // Agent capabilities
  "implementation": {             // Implementation details
    "type": "javascript",
    "main": "index.js"
  }
}
```

### Optional Fields

```json
{
  "displayName": "Human Readable Name",
  "description": "Detailed description",
  "author": {
    "name": "Author Name",
    "email": "author@example.com",
    "url": "https://author-website.com"
  },
  "dependencies": {
    "agents": ["other-agent-type"],
    "tools": [
      {
        "name": "git",
        "version": "2.0.0",
        "optional": false
      }
    ],
    "npm": {
      "lodash": "^4.17.21"
    }
  },
  "configuration": {
    "schema": { /* JSON Schema */ },
    "defaults": { /* Default values */ },
    "required": ["requiredField"]
  },
  "execution": {
    "timeout": 300000,
    "retries": 3,
    "parallel": true,
    "isolation": "process",
    "resources": {
      "maxMemory": "512MB",
      "maxCpu": 2.0
    }
  },
  "security": {
    "permissions": [
      "filesystem:read",
      "network:http"
    ],
    "sandbox": true,
    "trustedSources": [
      "https://api.github.com"
    ]
  }
}
```

## 🔧 Implementation Types

### JavaScript/TypeScript

```json
{
  "implementation": {
    "type": "javascript",
    "main": "src/agent.js",
    "class": "MyAgent"
  }
}
```

```javascript
// Class-based implementation
class MyAgent {
  constructor(config) {
    this.config = config;
  }
  
  async execute(issueId, worktreeId, context) {
    // Implementation
  }
}

// Function-based implementation
async function execute(issueId, worktreeId, context) {
  // Implementation
}

module.exports = { MyAgent, execute };
```

### Python (Future)

```json
{
  "implementation": {
    "type": "python",
    "main": "agent.py",
    "class": "MyAgent"
  }
}
```

### Shell Script (Future)

```json
{
  "implementation": {
    "type": "shell",
    "main": "agent.sh"
  }
}
```

### Docker Container (Future)

```json
{
  "implementation": {
    "type": "docker",
    "dockerImage": "my-agent:latest",
    "entrypoint": ["node", "index.js"]
  }
}
```

## 🛡️ Security System

### Permission Model

Control what your agent can access:

```json
{
  "security": {
    "permissions": [
      "filesystem:read",      // Read files
      "filesystem:write",     // Write files
      "network:http",         // HTTP requests
      "network:socket",       // Socket connections
      "process:spawn",        // Spawn processes
      "environment:read",     // Read env variables
      "environment:write"     // Write env variables
    ],
    "sandbox": true,          // Enable sandboxing
    "trustedSources": [       // Allowed URLs
      "https://api.github.com"
    ]
  }
}
```

### Sandbox Isolation

Agents run in isolated environments:

- **Worker Threads**: Separate JavaScript context
- **Resource Limits**: Memory and CPU constraints
- **Restricted Globals**: Limited access to system APIs
- **Safe Utilities**: Provided helper functions

```javascript
// Inside agent execution context
async execute(issueId, worktreeId, context) {
  const { utils, logger } = context;
  
  // Safe file operations (if permitted)
  const content = await utils.readFile('package.json');
  await utils.writeFile('output.txt', 'result');
  
  // Safe HTTP requests (if permitted)
  const response = await utils.fetch('https://api.github.com/user');
}
```

## ⚙️ Configuration System

### Schema Validation

Define configuration schema for your agent:

```json
{
  "configuration": {
    "schema": {
      "type": "object",
      "properties": {
        "apiKey": {
          "type": "string",
          "description": "API key for external service"
        },
        "timeout": {
          "type": "integer",
          "minimum": 1000,
          "maximum": 60000,
          "default": 30000
        },
        "features": {
          "type": "array",
          "items": {
            "type": "string",
            "enum": ["feature1", "feature2", "feature3"]
          }
        }
      }
    },
    "defaults": {
      "timeout": 30000,
      "features": ["feature1"]
    },
    "required": ["apiKey"]
  }
}
```

### Runtime Configuration

Access configuration in your agent:

```javascript
class MyAgent {
  constructor(config) {
    this.apiKey = config.apiKey;
    this.timeout = config.timeout || 30000;
    this.features = config.features || [];
  }
  
  async execute(issueId, worktreeId, context) {
    // Use configuration
    if (this.features.includes('feature1')) {
      // Feature-specific logic
    }
  }
}
```

## 📊 Quality Gates & Metrics

### Quality Gates

Define quality requirements:

```json
{
  "quality": {
    "gates": [
      {
        "name": "Output Validation",
        "criteria": [
          "Generated output is valid JSON",
          "All required fields are present",
          "No sensitive data exposed"
        ],
        "blocking": true
      }
    ]
  }
}
```

### Custom Metrics

Track agent performance:

```json
{
  "quality": {
    "metrics": [
      {
        "name": "processing_time",
        "type": "timer",
        "description": "Time taken to process request",
        "tags": ["operation", "size"]
      },
      {
        "name": "items_processed",
        "type": "counter", 
        "description": "Number of items processed",
        "tags": ["type"]
      }
    ]
  }
}
```

## 🧪 Testing Framework

### Unit Tests

Create comprehensive test suites:

```json
{
  "testing": {
    "unitTests": {
      "framework": "jest",
      "pattern": "**/*.test.js",
      "coverage": {
        "minimum": 90
      }
    }
  }
}
```

```javascript
// agent.test.js
const MyAgent = require('./index');

describe('MyAgent', () => {
  it('should process data correctly', async () => {
    const agent = new MyAgent({ timeout: 5000 });
    const result = await agent.performCustomTask('test-issue', 'test-worktree');
    
    expect(result.success).toBe(true);
  });
});
```

### Integration Tests

Test agent integration:

```json
{
  "testing": {
    "integrationTests": {
      "enabled": true,
      "pattern": "**/*.integration.test.js"
    }
  }
}
```

## 🔄 Dependency Management

### Agent Dependencies

Depend on other agents:

```json
{
  "dependencies": {
    "agents": [
      "strategic-planner",
      "code-implementer"
    ]
  }
}
```

### Tool Dependencies

Require external tools:

```json
{
  "dependencies": {
    "tools": [
      {
        "name": "git",
        "version": "2.0.0",
        "optional": false
      },
      {
        "name": "docker",
        "version": "20.0.0",
        "optional": true
      }
    ]
  }
}
```

### NPM Dependencies

Auto-install packages:

```json
{
  "dependencies": {
    "npm": {
      "axios": "^1.0.0",
      "lodash": "^4.17.21",
      "yaml": "^2.0.0"
    }
  }
}
```

## 🔧 Advanced Features

### Hot Reloading

Enable development-time hot reloading:

```javascript
// In orchestrator initialization
const pluginManagerConfig = {
  pluginPaths: ['./custom-agents'],
  hotReload: {
    enabled: true,
    watchPaths: ['./custom-agents'],
    debounceMs: 1000,
    reloadStrategy: 'graceful'
  }
};
```

### Event System

Listen to plugin lifecycle events:

```javascript
pluginManager.on('pluginRegistered', (plugin) => {
  console.log(`Loaded plugin: ${plugin.definition.name}`);
});

pluginManager.on('pluginError', (event) => {
  console.error(`Plugin error: ${event.error.message}`);
});

pluginManager.on('agentLoadEvent', (event) => {
  console.log(`Agent event: ${event.type} - ${event.agentType}`);
});
```

### Custom Registries

Load from external sources:

```json
{
  "marketplace": {
    "enabled": true,
    "allowedSources": [
      "https://registry.forgeflow.dev"
    ],
    "autoUpdate": true
  }
}
```

## 📁 Directory Structure

Organize your custom agents:

```
custom-agents/
├── my-agent/
│   ├── agent.json          # Agent definition
│   ├── index.js           # Main implementation
│   ├── README.md          # Documentation
│   ├── package.json       # NPM dependencies
│   ├── tests/             # Test files
│   └── examples/          # Usage examples
├── another-agent/
│   ├── agent.yaml         # YAML definition
│   ├── src/
│   │   └── agent.ts       # TypeScript implementation
│   └── dist/              # Compiled output
└── shared/                # Shared utilities
    └── utils.js
```

## 🛠️ Best Practices

### 1. Security First
- Always use sandbox mode for untrusted agents
- Request minimal required permissions
- Validate all inputs and outputs
- Never expose sensitive data

### 2. Error Handling
- Implement comprehensive error handling
- Provide meaningful error messages
- Use try-catch blocks for async operations
- Log errors with context

### 3. Performance
- Set appropriate resource limits
- Implement timeout handling
- Monitor execution metrics
- Optimize for parallel execution

### 4. Testing
- Write comprehensive test suites
- Test both success and failure scenarios
- Use integration tests for complex workflows
- Maintain high test coverage

### 5. Documentation
- Provide clear README files
- Include usage examples
- Document configuration options
- Maintain changelog

## 🐛 Troubleshooting

### Common Issues

**Agent Not Loading**
```bash
# Check agent definition validation
npm run validate-agent ./custom-agents/my-agent

# View detailed logs
DEBUG=forgeflow:agents npm start
```

**Permission Denied**
- Check security.permissions in agent definition
- Ensure sandbox permissions are configured
- Verify file/network access requirements

**Dependency Errors**
- Verify tool dependencies are installed
- Check NPM package versions
- Resolve agent dependency conflicts

**Memory/Resource Issues**
- Increase resource limits in agent definition
- Monitor agent resource usage
- Optimize agent implementation

### Debug Mode

Enable debug logging:

```bash
# Enable debug logging
DEBUG=forgeflow:agents:* npm start

# Verbose plugin manager logging  
DEBUG=forgeflow:plugins:* npm start

# All custom agent logging
DEBUG=forgeflow:custom:* npm start
```

## 📚 Examples

See the `examples/custom-agents/` directory for complete examples:

- **README Generator** (`readme-generator/`): Generates project documentation
- **API Tester** (`api-tester/`): Automated API testing agent

## 🤝 Contributing

Want to contribute to the custom agent system?

1. Fork the repository
2. Create a feature branch
3. Add comprehensive tests
4. Update documentation
5. Submit a pull request

## 📄 License

The Custom Agent System is part of ForgeFlow V2 and is licensed under the MIT License.

---

🎉 **Ready to build amazing custom agents!** Start with the examples and extend ForgeFlow's capabilities to meet your specific needs.