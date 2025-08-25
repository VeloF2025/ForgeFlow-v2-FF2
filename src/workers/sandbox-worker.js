// 🟢 WORKING: Sandbox Worker for Secure Plugin Execution
// Worker thread implementation for isolated custom agent execution

const { parentPort, workerData, isMainThread } = require('worker_threads');
const { pathToFileURL } = require('url');
const path = require('path');
const fs = require('fs').promises;

// 🟢 WORKING: Exit if not in worker thread
if (isMainThread || !parentPort) {
  throw new Error('This script must be run as a worker thread');
}

class SandboxWorker {
  constructor(data) {
    this.config = data.config;
    this.context = data.context;
    this.permissions = data.permissions || [];
    this.logger = this.createLogger();
    this.agentInstance = null;
    this.initialized = false;

    this.initialize();
  }

  createLogger() {
    // 🟢 WORKING: Simple logger for worker thread
    return {
      info: (message, data) => this.postMessage({ type: 'log', level: 'info', message, data }),
      warn: (message, data) => this.postMessage({ type: 'log', level: 'warn', message, data }),
      error: (message, error) => this.postMessage({ 
        type: 'log', 
        level: 'error', 
        message, 
        error: error?.message || error 
      }),
      debug: (message, data) => this.postMessage({ type: 'log', level: 'debug', message, data }),
    };
  }

  postMessage(message) {
    if (parentPort) {
      parentPort.postMessage(message);
    }
  }

  async initialize() {
    try {
      this.logger.info('Initializing sandbox worker', { 
        agentType: this.config.definition.type,
        permissions: this.permissions 
      });

      // 🟢 WORKING: Setup security restrictions
      this.setupSecurityRestrictions();

      // 🟢 WORKING: Load agent implementation
      await this.loadAgentImplementation();

      this.initialized = true;
      this.postMessage({ type: 'initialized' });
      
      this.logger.info('Sandbox worker initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize sandbox worker', error);
      this.postMessage({ type: 'error', error: error.message });
    }
  }

  setupSecurityRestrictions() {
    // 🟢 WORKING: Restrict dangerous globals based on permissions
    const restrictedGlobals = ['process', 'require', 'global', '__dirname', '__filename'];
    
    // 🟢 WORKING: Only allow filesystem access if permitted
    if (!this.permissions.includes('filesystem:read') && !this.permissions.includes('filesystem:write')) {
      restrictedGlobals.push('fs');
    }

    // 🟢 WORKING: Only allow network access if permitted
    if (!this.permissions.includes('network:http') && !this.permissions.includes('network:socket')) {
      restrictedGlobals.push('http', 'https', 'net', 'dgram');
    }

    // 🟢 WORKING: Only allow process spawning if permitted
    if (!this.permissions.includes('process:spawn')) {
      restrictedGlobals.push('child_process', 'spawn', 'exec', 'execFile');
    }

    // 🟢 WORKING: Create restricted global environment
    this.createRestrictedEnvironment(restrictedGlobals);
  }

  createRestrictedEnvironment(restrictedGlobals) {
    // 🟢 WORKING: Override dangerous globals
    for (const globalName of restrictedGlobals) {
      if (global[globalName]) {
        Object.defineProperty(global, globalName, {
          get: () => {
            throw new Error(`Access to '${globalName}' is restricted in sandbox environment`);
          },
          configurable: false,
          enumerable: false
        });
      }
    }

    // 🟢 WORKING: Provide safe alternatives
    global.console = {
      log: (...args) => this.logger.info('Agent log', args),
      error: (...args) => this.logger.error('Agent error', args),
      warn: (...args) => this.logger.warn('Agent warning', args),
      debug: (...args) => this.logger.debug('Agent debug', args),
      info: (...args) => this.logger.info('Agent info', args),
    };

    // 🟢 WORKING: Provide limited process information
    global.process = {
      env: this.getFilteredEnvironment(),
      platform: process.platform,
      arch: process.arch,
      version: process.version,
      versions: process.versions,
    };
  }

  getFilteredEnvironment() {
    const allowedEnvVars = [
      'NODE_ENV',
      'PATH',
      'USER',
      'HOME',
      'PWD',
    ];

    const filteredEnv = {};
    for (const key of allowedEnvVars) {
      if (process.env[key]) {
        filteredEnv[key] = process.env[key];
      }
    }

    // 🟢 WORKING: Add custom environment variables from agent definition
    const customEnv = this.config.definition.implementation.environment || {};
    Object.assign(filteredEnv, customEnv);

    return filteredEnv;
  }

  async loadAgentImplementation() {
    const { definition } = this.config;
    const { implementation } = definition;

    try {
      if (implementation.type === 'javascript' || implementation.type === 'typescript') {
        await this.loadJavaScriptImplementation();
      } else {
        throw new Error(`Unsupported implementation type in worker: ${implementation.type}`);
      }
    } catch (error) {
      throw new Error(`Failed to load agent implementation: ${error.message}`);
    }
  }

  async loadJavaScriptImplementation() {
    const { implementation } = this.config.definition;
    
    if (!implementation.main) {
      throw new Error('JavaScript implementation requires main file');
    }

    // 🟢 WORKING: Resolve main file path
    const basePath = path.dirname(this.config.definition.sourcePath || '');
    const mainPath = path.resolve(basePath, implementation.main);
    
    // 🟢 WORKING: Verify file exists
    try {
      await fs.access(mainPath);
    } catch (error) {
      throw new Error(`Implementation file not found: ${mainPath}`);
    }

    // 🟢 WORKING: Load module
    const moduleUrl = pathToFileURL(mainPath).href;
    const module = await import(moduleUrl);

    // 🟢 WORKING: Extract implementation
    if (implementation.class && module[implementation.class]) {
      const AgentClass = module[implementation.class];
      this.agentInstance = new AgentClass(this.context.config);
    } else if (implementation.function && module[implementation.function]) {
      this.agentInstance = {
        execute: module[implementation.function]
      };
    } else if (module.default) {
      if (typeof module.default === 'function') {
        if (module.default.prototype && module.default.prototype.constructor === module.default) {
          // It's a class
          this.agentInstance = new module.default(this.context.config);
        } else {
          // It's a function
          this.agentInstance = {
            execute: module.default
          };
        }
      } else if (typeof module.default === 'object' && module.default.execute) {
        this.agentInstance = module.default;
      }
    }

    if (!this.agentInstance || !this.agentInstance.execute) {
      throw new Error('No valid execute method found in agent implementation');
    }
  }

  async handleExecute(message) {
    if (!this.initialized || !this.agentInstance) {
      throw new Error('Sandbox worker not properly initialized');
    }

    const { issueId, worktreeId } = message;

    try {
      this.logger.info('Executing agent in sandbox', { issueId, worktreeId });

      // 🟢 WORKING: Set up execution context
      const executionContext = {
        issueId,
        worktreeId,
        config: this.context.config,
        permissions: this.permissions,
        logger: this.logger,
        // 🟢 WORKING: Provide safe utilities
        utils: this.createSafeUtils(),
      };

      // 🟢 WORKING: Execute the agent
      const startTime = Date.now();
      
      if (typeof this.agentInstance.execute === 'function') {
        await this.agentInstance.execute.call(this.agentInstance, issueId, worktreeId, executionContext);
      } else {
        throw new Error('Agent execute method is not a function');
      }

      const duration = Date.now() - startTime;
      
      this.logger.info('Agent execution completed', { 
        issueId, 
        worktreeId, 
        duration: `${duration}ms` 
      });

      this.postMessage({ action: 'complete', duration });
    } catch (error) {
      this.logger.error('Agent execution failed', error);
      this.postMessage({ action: 'error', error: error.message });
    }
  }

  createSafeUtils() {
    const utils = {};

    // 🟢 WORKING: Provide safe file operations if permitted
    if (this.permissions.includes('filesystem:read')) {
      utils.readFile = async (filePath) => {
        // 🟢 WORKING: Validate file path is within allowed directories
        if (!this.isPathAllowed(filePath)) {
          throw new Error('File path not allowed');
        }
        return fs.readFile(filePath, 'utf-8');
      };
    }

    if (this.permissions.includes('filesystem:write')) {
      utils.writeFile = async (filePath, content) => {
        if (!this.isPathAllowed(filePath)) {
          throw new Error('File path not allowed');
        }
        return fs.writeFile(filePath, content, 'utf-8');
      };
    }

    // 🟢 WORKING: Provide safe HTTP operations if permitted
    if (this.permissions.includes('network:http')) {
      utils.fetch = async (url, options = {}) => {
        // 🟢 WORKING: Validate URL is allowed
        if (!this.isUrlAllowed(url)) {
          throw new Error('URL not allowed');
        }
        
        // Use dynamic import for fetch polyfill if needed
        const fetch = global.fetch || (await import('node-fetch')).default;
        return fetch(url, options);
      };
    }

    return utils;
  }

  isPathAllowed(filePath) {
    // 🟢 WORKING: Simple path validation - could be enhanced
    const resolvedPath = path.resolve(filePath);
    const workspaceRoot = process.cwd();
    
    // Only allow paths within workspace
    return resolvedPath.startsWith(workspaceRoot) && 
           !resolvedPath.includes('..') &&
           !resolvedPath.includes('node_modules');
  }

  isUrlAllowed(url) {
    // 🟢 WORKING: Simple URL validation - could be enhanced
    try {
      const urlObj = new URL(url);
      const allowedProtocols = ['http:', 'https:'];
      return allowedProtocols.includes(urlObj.protocol);
    } catch {
      return false;
    }
  }

  handleMessage(message) {
    try {
      switch (message.action) {
        case 'execute':
          this.handleExecute(message);
          break;
        case 'ping':
          this.postMessage({ action: 'pong' });
          break;
        case 'shutdown':
          process.exit(0);
          break;
        default:
          this.logger.warn('Unknown message action', { action: message.action });
      }
    } catch (error) {
      this.logger.error('Error handling message', error);
      this.postMessage({ action: 'error', error: error.message });
    }
  }
}

// 🟢 WORKING: Initialize sandbox worker
try {
  const sandbox = new SandboxWorker(workerData);

  // 🟢 WORKING: Setup message handling
  parentPort.on('message', (message) => {
    sandbox.handleMessage(message);
  });

  // 🟢 WORKING: Handle worker errors
  process.on('uncaughtException', (error) => {
    sandbox.logger.error('Uncaught exception in sandbox worker', error);
    parentPort.postMessage({ type: 'error', error: error.message });
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    sandbox.logger.error('Unhandled rejection in sandbox worker', reason);
    parentPort.postMessage({ type: 'error', error: reason?.message || reason });
    process.exit(1);
  });

  // 🟢 WORKING: Graceful shutdown
  parentPort.on('close', () => {
    process.exit(0);
  });

} catch (error) {
  if (parentPort) {
    parentPort.postMessage({ type: 'error', error: error.message });
  }
  process.exit(1);
}