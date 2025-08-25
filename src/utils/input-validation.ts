/**
 * Comprehensive Input Validation Middleware and Utilities
 * Provides validation for CLI commands, API endpoints, and user inputs
 */

import type { Request, Response, NextFunction } from 'express';
import { ValidationUtils, ValidationError, ForgeFlowError, ErrorCategory, ErrorSeverity } from './errors';
import { logger } from './logger';

// Validation schema types
export interface ValidationSchema {
  [key: string]: ValidationRule | ValidationRule[];
}

export interface ValidationRule {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'email' | 'url' | 'github-repo' | 'github-token' | 'path' | 'port' | 'timeout' | 'agent-type' | 'execution-pattern' | 'priority' | 'json';
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  enum?: any[];
  pattern?: RegExp;
  custom?: (value: any) => boolean | string;
  sanitize?: boolean;
  default?: any;
  description?: string;
}

// CLI Command validation schemas
export const CLI_COMMAND_SCHEMAS: Record<string, ValidationSchema> = {
  init: {
    repo: {
      type: 'url',
      required: false,
      description: 'GitHub repository URL'
    },
    config: {
      type: 'path',
      required: false,
      description: 'Configuration file path'
    }
  },
  
  'start-parallel': {
    epic: {
      type: 'string',
      required: true,
      minLength: 3,
      maxLength: 200,
      pattern: /^[a-zA-Z0-9\s\-_#]+$/,
      description: 'Epic name or issue reference'
    },
    pattern: {
      type: 'execution-pattern',
      required: false,
      description: 'Execution pattern to use'
    },
    agents: {
      type: 'array',
      required: false,
      custom: (value) => {
        if (Array.isArray(value)) {
          return value.every(agent => 
            typeof agent === 'string' && 
            ['strategic-planner', 'system-architect', 'code-implementer', 
             'test-coverage-validator', 'security-auditor', 'performance-optimizer',
             'ui-ux-optimizer', 'database-architect', 'deployment-automation',
             'code-quality-reviewer', 'antihallucination-validator'].includes(agent)
          );
        }
        return 'Must be array of valid agent types';
      },
      description: 'Specific agents to deploy'
    },
    priority: {
      type: 'priority',
      required: false,
      description: 'Execution priority level'
    }
  },

  status: {
    executionId: {
      type: 'string',
      required: false,
      pattern: /^[a-zA-Z0-9\-_]+$/,
      description: 'Execution ID to check status'
    }
  },

  agent: {
    type: {
      type: 'agent-type',
      required: true,
      description: 'Agent type to spawn'
    },
    issue: {
      type: 'string',
      required: true,
      pattern: /^#?\d+$|^[a-zA-Z0-9\-_\/]+#\d+$/,
      description: 'GitHub issue number or reference'
    }
  },

  protocol: {
    name: {
      type: 'string',
      required: true,
      enum: ['nlnh', 'antihall', 'ryr'],
      description: 'Protocol name to activate'
    }
  },

  emergency: {
    task: {
      type: 'string',
      required: true,
      minLength: 5,
      maxLength: 500,
      description: 'Emergency task description'
    }
  }
};

// API endpoint validation schemas
export const API_ENDPOINT_SCHEMAS: Record<string, ValidationSchema> = {
  // Agent endpoints
  'POST /api/agents/simulate': {
    agentId: {
      type: 'string',
      required: true,
      pattern: /^[a-zA-Z0-9\-_]+$/,
      description: 'Agent ID'
    },
    taskId: {
      type: 'string',
      required: true,
      pattern: /^[a-zA-Z0-9\-_]+$/,
      description: 'Task ID'
    },
    executionId: {
      type: 'string',
      required: true,
      pattern: /^[a-zA-Z0-9\-_]+$/,
      description: 'Execution ID'
    },
    duration: {
      type: 'number',
      required: false,
      min: 100,
      max: 300000,
      default: 5000,
      description: 'Task duration in milliseconds'
    },
    shouldFail: {
      type: 'boolean',
      required: false,
      default: false,
      description: 'Whether task should fail'
    }
  },

  'PUT /api/agents/:id/status': {
    status: {
      type: 'string',
      required: false,
      enum: ['idle', 'busy', 'active', 'error', 'offline'],
      description: 'Agent status'
    },
    currentTask: {
      type: 'string',
      required: false,
      pattern: /^[a-zA-Z0-9\-_]*$/,
      description: 'Current task ID'
    },
    errorMessage: {
      type: 'string',
      required: false,
      maxLength: 1000,
      sanitize: true,
      description: 'Error message if status is error'
    }
  },

  // Execution endpoints
  'POST /api/executions/start': {
    epic: {
      type: 'string',
      required: true,
      minLength: 3,
      maxLength: 200,
      sanitize: true,
      description: 'Epic name or description'
    },
    pattern: {
      type: 'execution-pattern',
      required: false,
      description: 'Execution pattern'
    },
    priority: {
      type: 'priority',
      required: false,
      default: 'normal',
      description: 'Execution priority'
    },
    agents: {
      type: 'array',
      required: false,
      description: 'Specific agents to use'
    }
  },

  // GitHub endpoints
  'POST /api/github/webhook': {
    action: {
      type: 'string',
      required: true,
      enum: ['opened', 'closed', 'synchronize', 'labeled', 'unlabeled'],
      description: 'Webhook action'
    },
    repository: {
      type: 'object',
      required: true,
      description: 'Repository information'
    },
    issue: {
      type: 'object',
      required: false,
      description: 'Issue information'
    },
    pull_request: {
      type: 'object',
      required: false,
      description: 'Pull request information'
    }
  }
};

// Configuration validation schemas
export const CONFIG_SCHEMAS: Record<string, ValidationSchema> = {
  orchestratorConfig: {
    github: {
      type: 'object',
      required: true,
      description: 'GitHub configuration'
    },
    worktree: {
      type: 'object',
      required: true,
      description: 'Worktree configuration'
    },
    agents: {
      type: 'object',
      required: true,
      description: 'Agent pool configuration'
    },
    quality: {
      type: 'object',
      required: true,
      description: 'Quality gates configuration'
    },
    protocols: {
      type: 'object',
      required: true,
      description: 'Protocol enforcement configuration'
    }
  },

  githubConfig: {
    token: {
      type: 'github-token',
      required: true,
      description: 'GitHub personal access token'
    },
    owner: {
      type: 'string',
      required: true,
      pattern: /^[a-zA-Z0-9\-_]+$/,
      description: 'Repository owner'
    },
    repo: {
      type: 'string',
      required: true,
      pattern: /^[a-zA-Z0-9\-_\.]+$/,
      description: 'Repository name'
    },
    apiUrl: {
      type: 'url',
      required: false,
      default: 'https://api.github.com',
      description: 'GitHub API base URL'
    }
  }
};

/**
 * Validates input against a schema
 */
export function validateInput<T>(
  input: any,
  schema: ValidationSchema,
  context: string = 'input'
): T {
  if (!input || typeof input !== 'object') {
    throw new ValidationError(context, input, 'object');
  }

  const validated: any = {};
  const errors: string[] = [];

  for (const [fieldName, rules] of Object.entries(schema)) {
    try {
      const ruleArray = Array.isArray(rules) ? rules : [rules];
      const value = input[fieldName];
      
      // Check if required
      if (ruleArray.some(rule => rule.required) && (value === undefined || value === null || value === '')) {
        errors.push(`Field '${fieldName}' is required`);
        continue;
      }

      // Skip validation if optional and not provided
      if (value === undefined || value === null) {
        // Apply default value if specified
        const defaultRule = ruleArray.find(rule => rule.default !== undefined);
        if (defaultRule) {
          validated[fieldName] = defaultRule.default;
        }
        continue;
      }

      // Validate against each rule
      let processedValue = value;
      
      for (const rule of ruleArray) {
        processedValue = validateFieldAgainstRule(processedValue, fieldName, rule);
      }

      validated[fieldName] = processedValue;

    } catch (error) {
      if (error instanceof ValidationError) {
        errors.push(error.userMessage || error.message);
      } else {
        errors.push(`Validation failed for field '${fieldName}': ${String(error)}`);
      }
    }
  }

  if (errors.length > 0) {
    throw new ForgeFlowError({
      code: 'VALIDATION_FAILED',
      message: `Input validation failed: ${errors.join(', ')}`,
      category: ErrorCategory.VALIDATION,
      severity: ErrorSeverity.MEDIUM,
      context: { context, errors, input: sanitizeForLogging(input) },
      recoverable: true,
      userMessage: `Invalid input: ${errors.join('; ')}`
    });
  }

  return validated as T;
}

/**
 * Validates a single field against a rule
 */
function validateFieldAgainstRule(value: any, fieldName: string, rule: ValidationRule): any {
  let processedValue = value;

  // Sanitize if requested
  if (rule.sanitize && typeof value === 'string') {
    processedValue = ValidationUtils.sanitizeString(value, rule.maxLength);
  }

  // Type validation
  switch (rule.type) {
    case 'string':
      ValidationUtils.validateString(processedValue, fieldName, rule.minLength, rule.maxLength);
      break;
    case 'number':
      ValidationUtils.validateNumber(processedValue, fieldName, rule.min, rule.max);
      break;
    case 'boolean':
      if (typeof processedValue !== 'boolean') {
        throw new ValidationError(fieldName, processedValue, 'boolean');
      }
      break;
    case 'array':
      ValidationUtils.validateArray(processedValue, fieldName, rule.minLength);
      break;
    case 'object':
      if (typeof processedValue !== 'object' || processedValue === null || Array.isArray(processedValue)) {
        throw new ValidationError(fieldName, processedValue, 'object');
      }
      break;
    case 'email':
      ValidationUtils.validateEmail(processedValue, fieldName);
      break;
    case 'url':
      ValidationUtils.validateUrl(processedValue, fieldName);
      break;
    case 'github-repo':
      ValidationUtils.validateGitHubRepo(processedValue, fieldName);
      break;
    case 'github-token':
      ValidationUtils.validateGitHubToken(processedValue, fieldName);
      break;
    case 'path':
      ValidationUtils.validatePath(processedValue, fieldName);
      break;
    case 'port':
      ValidationUtils.validatePort(processedValue, fieldName);
      break;
    case 'timeout':
      ValidationUtils.validateTimeout(processedValue, fieldName);
      break;
    case 'agent-type':
      ValidationUtils.validateAgentType(processedValue, fieldName);
      break;
    case 'execution-pattern':
      ValidationUtils.validateExecutionPattern(processedValue, fieldName);
      break;
    case 'priority':
      ValidationUtils.validatePriority(processedValue, fieldName);
      break;
    case 'json':
      ValidationUtils.validateJson(processedValue, fieldName);
      break;
  }

  // Enum validation
  if (rule.enum && !rule.enum.includes(processedValue)) {
    throw new ValidationError(fieldName, processedValue, `one of: ${rule.enum.join(', ')}`);
  }

  // Pattern validation
  if (rule.pattern && typeof processedValue === 'string' && !rule.pattern.test(processedValue)) {
    throw new ValidationError(fieldName, processedValue, `matching pattern ${rule.pattern}`);
  }

  // Custom validation
  if (rule.custom) {
    const result = rule.custom(processedValue);
    if (result !== true) {
      const errorMessage = typeof result === 'string' ? result : 'custom validation failed';
      throw new ValidationError(fieldName, processedValue, errorMessage);
    }
  }

  return processedValue;
}

/**
 * Express middleware for API endpoint validation
 */
export function validateApiInput(schema: ValidationSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      // Rate limiting check
      const clientId = req.ip || 'unknown';
      ValidationUtils.validateRateLimit(clientId, 1000, 60000); // 1000 requests per minute

      // Validate request body
      req.body = validateInput(req.body || {}, schema, `${req.method} ${req.path}`);
      
      // Log validated input (sanitized)
      logger.debug('API input validated', {
        endpoint: `${req.method} ${req.path}`,
        input: sanitizeForLogging(req.body)
      });

      next();
    } catch (error) {
      logger.warn('API input validation failed', {
        endpoint: `${req.method} ${req.path}`,
        error: error instanceof Error ? error.message : String(error),
        input: sanitizeForLogging(req.body || {})
      });

      if (error instanceof ForgeFlowError) {
        res.status(400).json({
          success: false,
          error: error.userMessage || error.message,
          code: error.code,
          details: error.context
        });
      } else {
        res.status(400).json({
          success: false,
          error: 'Invalid input provided',
          details: String(error)
        });
      }
    }
  };
}

/**
 * CLI command validation function
 */
export function validateCliCommand(command: string, options: any): any {
  const schema = CLI_COMMAND_SCHEMAS[command];
  if (!schema) {
    throw new ForgeFlowError({
      code: 'UNKNOWN_COMMAND',
      message: `Unknown command: ${command}`,
      category: ErrorCategory.VALIDATION,
      severity: ErrorSeverity.MEDIUM,
      context: { command, availableCommands: Object.keys(CLI_COMMAND_SCHEMAS) },
      recoverable: false,
      userMessage: `Command '${command}' is not recognized. Available commands: ${Object.keys(CLI_COMMAND_SCHEMAS).join(', ')}`
    });
  }

  return validateInput(options, schema, `command '${command}'`);
}

/**
 * Configuration validation function
 */
export function validateConfiguration<T>(config: any, configType: keyof typeof CONFIG_SCHEMAS): T {
  const schema = CONFIG_SCHEMAS[configType];
  if (!schema) {
    throw new ForgeFlowError({
      code: 'UNKNOWN_CONFIG_TYPE',
      message: `Unknown configuration type: ${configType}`,
      category: ErrorCategory.CONFIGURATION,
      severity: ErrorSeverity.HIGH,
      recoverable: false,
      userMessage: `Configuration type '${configType}' is not supported`
    });
  }

  return validateInput<T>(config, schema, `${configType} configuration`);
}

/**
 * Sanitizes data for logging (removes sensitive information)
 */
function sanitizeForLogging(data: any): any {
  if (!data || typeof data !== 'object') {
    return data;
  }

  const sensitiveFields = ['token', 'password', 'secret', 'key', 'auth'];
  const sanitized = { ...data };

  for (const field of sensitiveFields) {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  }

  // Recursively sanitize nested objects
  for (const [key, value] of Object.entries(sanitized)) {
    if (value && typeof value === 'object') {
      sanitized[key] = sanitizeForLogging(value);
    }
  }

  return sanitized;
}

/**
 * Input validation health check
 */
export function validateInputSystem(): {
  status: 'healthy' | 'degraded' | 'unhealthy';
  details: Record<string, any>;
} {
  const details: Record<string, any> = {
    schemasLoaded: {
      cli: Object.keys(CLI_COMMAND_SCHEMAS).length,
      api: Object.keys(API_ENDPOINT_SCHEMAS).length,
      config: Object.keys(CONFIG_SCHEMAS).length
    },
    validationTests: {}
  };

  try {
    // Test basic validation
    validateInput({ test: 'hello' }, { test: { type: 'string', required: true } });
    details.validationTests.basic = 'passed';

    // Test error handling
    try {
      validateInput({}, { required: { type: 'string', required: true } });
      details.validationTests.errorHandling = 'failed';
    } catch {
      details.validationTests.errorHandling = 'passed';
    }

    // Test rate limiting
    try {
      ValidationUtils.validateRateLimit('test', 1, 1000);
      ValidationUtils.validateRateLimit('test', 1, 1000); // Should fail
      details.validationTests.rateLimiting = 'failed';
    } catch {
      details.validationTests.rateLimiting = 'passed';
    }

    const failedTests = Object.values(details.validationTests).filter(result => result === 'failed');
    
    return {
      status: failedTests.length === 0 ? 'healthy' : failedTests.length < 2 ? 'degraded' : 'unhealthy',
      details
    };

  } catch (error) {
    details.error = String(error);
    return {
      status: 'unhealthy',
      details
    };
  }
}