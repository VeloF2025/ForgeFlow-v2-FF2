import type { BrowserMCPConfig } from '../tools/browser-mcp-tool';

export const BROWSER_MCP_CONFIGS = {
  // UI/UX Optimizer Agent Configuration
  'ui-ux-optimizer': {
    enableScreenshots: true,
    enableAccessibility: true,
    timeout: 30000,
    maxRetries: 2,
    sandbox: true,
  } as BrowserMCPConfig,

  // Test Coverage Validator Agent Configuration
  'test-coverage-validator': {
    enableScreenshots: true,
    enableAccessibility: false,
    timeout: 45000,
    maxRetries: 3,
    sandbox: true,
  } as BrowserMCPConfig,

  // Performance Optimizer Agent Configuration
  'performance-optimizer': {
    enableScreenshots: false,
    enableAccessibility: false,
    timeout: 60000,
    maxRetries: 1,
    sandbox: true,
  } as BrowserMCPConfig,

  // Security Auditor Agent Configuration
  'security-auditor': {
    enableScreenshots: true,
    enableAccessibility: false,
    timeout: 120000,
    maxRetries: 2,
    sandbox: true,
  } as BrowserMCPConfig,

  // Code Quality Reviewer Agent Configuration (for UI validation)
  'code-quality-reviewer': {
    enableScreenshots: true,
    enableAccessibility: true,
    timeout: 20000,
    maxRetries: 1,
    sandbox: true,
  } as BrowserMCPConfig,
};

export const DEFAULT_BROWSER_MCP_CONFIG: BrowserMCPConfig = {
  serverUrl: 'ws://localhost:3001',
  enableScreenshots: false,
  enableAccessibility: false,
  timeout: 30000,
  maxRetries: 2,
  sandbox: true,
};

/**
 * Get Browser MCP configuration for a specific agent type
 */
export function getBrowserMCPConfig(agentType: string): BrowserMCPConfig {
  return (
    BROWSER_MCP_CONFIGS[agentType as keyof typeof BROWSER_MCP_CONFIGS] || DEFAULT_BROWSER_MCP_CONFIG
  );
}

/**
 * Browser MCP integration settings
 */
export const BROWSER_MCP_INTEGRATION = {
  // Chrome extension setup
  chromeExtension: {
    id: 'bjfgambnhccakkhmkepdoekmckoijdlc',
    name: 'Browser MCP',
    required: true,
  },

  // Server configuration
  server: {
    port: 3001,
    host: 'localhost',
    protocol: 'ws',
    reconnectAttempts: 3,
    reconnectDelay: 1000,
  },

  // Agent capabilities mapping
  agentCapabilities: {
    'ui-ux-optimizer': [
      'screenshot',
      'accessibility-audit',
      'responsive-testing',
      'visual-regression',
      'user-interaction-testing',
    ],
    'test-coverage-validator': [
      'e2e-testing',
      'workflow-testing',
      'browser-automation',
      'screenshot',
    ],
    'performance-optimizer': [
      'performance-metrics',
      'core-web-vitals',
      'load-testing',
      'resource-analysis',
    ],
    'security-auditor': [
      'security-scanning',
      'xss-testing',
      'csrf-testing',
      'authentication-testing',
    ],
    'code-quality-reviewer': [
      'visual-validation',
      'ui-consistency-check',
      'accessibility-compliance',
    ],
  },

  // Test scenarios that require browser automation
  testScenarios: {
    responsive: [
      { width: 375, height: 667, name: 'mobile' },
      { width: 768, height: 1024, name: 'tablet' },
      { width: 1920, height: 1080, name: 'desktop' },
      { width: 2560, height: 1440, name: '2k-desktop' },
    ],
    accessibility: [
      'keyboard-navigation',
      'screen-reader-compatibility',
      'color-contrast',
      'focus-management',
      'aria-labels',
    ],
    performance: [
      'first-contentful-paint',
      'largest-contentful-paint',
      'cumulative-layout-shift',
      'time-to-interactive',
    ],
    security: [
      'input-validation',
      'xss-prevention',
      'csrf-protection',
      'authentication-flows',
      'session-management',
    ],
  },

  // Browser automation best practices
  automation: {
    waitForNetworkIdle: true,
    captureConsoleErrors: true,
    enableRequestInterception: false,
    headless: false, // Browser MCP uses real browser sessions
    preserveSession: true,
    recordVideo: false,
    recordTrace: true,
  },
};

export default {
  BROWSER_MCP_CONFIGS,
  DEFAULT_BROWSER_MCP_CONFIG,
  BROWSER_MCP_INTEGRATION,
  getBrowserMCPConfig,
};
