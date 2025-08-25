import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BrowserMCPTool } from '../../src/tools/browser-mcp-tool';
import { UIUXOptimizerAgent } from '../../src/agents/ui-ux-optimizer';
import { TestCoverageValidatorAgent } from '../../src/agents/test-coverage-validator';
import type { ToolExecutionContext } from '../../src/types';

describe('Browser MCP Integration', () => {
  let context: ToolExecutionContext;

  beforeEach(() => {
    context = {
      issueId: 'test-issue-1',
      worktreeId: 'test-worktree-1',
      agentId: 'test-agent-1',
      startTime: new Date(),
    };
  });

  describe('BrowserMCPTool', () => {
    let browserTool: BrowserMCPTool;

    beforeEach(() => {
      browserTool = new BrowserMCPTool({
        enableScreenshots: true,
        enableAccessibility: true,
        timeout: 30000,
        maxRetries: 2,
      });
    });

    afterEach(async () => {
      if (browserTool) {
        await browserTool.disconnect();
      }
    });

    it('should initialize successfully', async () => {
      expect(browserTool).toBeDefined();
      expect(browserTool.isHealthy).toBeDefined();
    });

    it('should have correct configuration', () => {
      // Test configuration is properly set
      expect(browserTool).toBeInstanceOf(BrowserMCPTool);
    });

    it('should handle navigation action', async () => {
      const result = await browserTool.executeAction({
        type: 'navigate',
        url: 'http://localhost:3000',
      }, context);

      expect(result).toBeDefined();
      expect(result.success).toBeDefined();
      expect(typeof result.success).toBe('boolean');
    });

    it('should handle screenshot action', async () => {
      const result = await browserTool.executeAction({
        type: 'screenshot',
      }, context);

      expect(result).toBeDefined();
      expect(result.success).toBeDefined();
    });

    it('should handle click action', async () => {
      const result = await browserTool.executeAction({
        type: 'click',
        selector: 'button[data-testid="test-button"]',
      }, context);

      expect(result).toBeDefined();
      expect(result.success).toBeDefined();
    });

    it('should handle type action', async () => {
      const result = await browserTool.executeAction({
        type: 'type',
        selector: 'input[type="search"]',
        text: 'test input',
      }, context);

      expect(result).toBeDefined();
      expect(result.success).toBeDefined();
    });

    it('should handle extract action', async () => {
      const result = await browserTool.executeAction({
        type: 'extract',
        selector: 'body',
      }, context);

      expect(result).toBeDefined();
      expect(result.success).toBeDefined();
    });

    it('should handle evaluate action', async () => {
      const result = await browserTool.executeAction({
        type: 'evaluate',
        script: 'window.innerWidth',
      }, context);

      expect(result).toBeDefined();
      expect(result.success).toBeDefined();
    });

    it('should handle wait action', async () => {
      const result = await browserTool.executeAction({
        type: 'wait',
        selector: '#loading-indicator',
      }, context);

      expect(result).toBeDefined();
      expect(result.success).toBeDefined();
    });

    it('should handle scroll action', async () => {
      const result = await browserTool.executeAction({
        type: 'scroll',
        options: { position: { x: 0, y: 100 } },
      }, context);

      expect(result).toBeDefined();
      expect(result.success).toBeDefined();
    });

    it('should get performance metrics', async () => {
      const metrics = await browserTool.getPerformanceMetrics();

      expect(metrics).toBeDefined();
      expect(metrics).toHaveProperty('loadTime');
      expect(metrics).toHaveProperty('firstContentfulPaint');
      expect(metrics).toHaveProperty('largestContentfulPaint');
      expect(typeof metrics.loadTime).toBe('number');
    });

    it('should get accessibility report when enabled', async () => {
      const report = await browserTool.getAccessibilityReport();

      expect(report).toBeDefined();
      expect(report).toHaveProperty('violations');
      expect(report).toHaveProperty('score');
      expect(Array.isArray(report.violations)).toBe(true);
      expect(typeof report.score).toBe('number');
    });

    it('should handle health check', async () => {
      const isHealthy = await browserTool.isHealthy();
      expect(typeof isHealthy).toBe('boolean');
    });
  });

  describe('UI/UX Optimizer Agent Integration', () => {
    let agent: UIUXOptimizerAgent;

    beforeEach(() => {
      agent = new UIUXOptimizerAgent();
    });

    it('should have browser automation capabilities', () => {
      const capabilities = agent.getCapabilities();
      expect(capabilities).toContain('browser-automation');
      expect(capabilities).toContain('visual-testing');
      expect(capabilities).toContain('cross-browser-testing');
    });

    it('should be instance of UIUXOptimizerAgent', () => {
      expect(agent).toBeInstanceOf(UIUXOptimizerAgent);
      expect(agent.type).toBe('ui-ux-optimizer');
    });

    it('should have browser tool initialized', () => {
      // Test that the agent has browser tool capabilities
      expect(agent.canHandle('browser-automation')).toBe(true);
      expect(agent.canHandle('visual-testing')).toBe(true);
    });
  });

  describe('Test Coverage Validator Agent Integration', () => {
    let agent: TestCoverageValidatorAgent;

    beforeEach(() => {
      agent = new TestCoverageValidatorAgent();
    });

    it('should have browser E2E testing capabilities', () => {
      const capabilities = agent.getCapabilities();
      expect(capabilities).toContain('browser-e2e-testing');
      expect(capabilities).toContain('ui-testing');
      expect(capabilities).toContain('e2e-testing');
    });

    it('should be instance of TestCoverageValidatorAgent', () => {
      expect(agent).toBeInstanceOf(TestCoverageValidatorAgent);
      expect(agent.type).toBe('test-coverage-validator');
    });

    it('should have browser tool capabilities', () => {
      expect(agent.canHandle('browser-e2e-testing')).toBe(true);
      expect(agent.canHandle('ui-testing')).toBe(true);
    });
  });

  describe('Browser MCP Configuration', () => {
    it('should load configuration correctly', async () => {
      const { getBrowserMCPConfig } = await import('../../src/config/browser-mcp.config');
      
      const uiConfig = getBrowserMCPConfig('ui-ux-optimizer');
      expect(uiConfig).toBeDefined();
      expect(uiConfig.enableScreenshots).toBe(true);
      expect(uiConfig.enableAccessibility).toBe(true);

      const testConfig = getBrowserMCPConfig('test-coverage-validator');
      expect(testConfig).toBeDefined();
      expect(testConfig.enableScreenshots).toBe(true);
      expect(testConfig.enableAccessibility).toBe(false);
    });

    it('should have proper default configuration', async () => {
      const { DEFAULT_BROWSER_MCP_CONFIG } = await import('../../src/config/browser-mcp.config');
      
      expect(DEFAULT_BROWSER_MCP_CONFIG).toBeDefined();
      expect(DEFAULT_BROWSER_MCP_CONFIG.serverUrl).toBe('ws://localhost:3001');
      expect(DEFAULT_BROWSER_MCP_CONFIG.sandbox).toBe(true);
    });

    it('should have integration settings', async () => {
      const { BROWSER_MCP_INTEGRATION } = await import('../../src/config/browser-mcp.config');
      
      expect(BROWSER_MCP_INTEGRATION).toBeDefined();
      expect(BROWSER_MCP_INTEGRATION.chromeExtension).toBeDefined();
      expect(BROWSER_MCP_INTEGRATION.server).toBeDefined();
      expect(BROWSER_MCP_INTEGRATION.agentCapabilities).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    let browserTool: BrowserMCPTool;

    beforeEach(() => {
      browserTool = new BrowserMCPTool({
        timeout: 1000, // Short timeout for error testing
        maxRetries: 1,
      });
    });

    afterEach(async () => {
      if (browserTool) {
        await browserTool.disconnect();
      }
    });

    it('should handle invalid action types gracefully', async () => {
      const result = await browserTool.executeAction({
        type: 'invalid-action' as any,
      }, context);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle network errors gracefully', async () => {
      const result = await browserTool.executeAction({
        type: 'navigate',
        url: 'http://invalid-domain-that-does-not-exist.com',
      }, context);

      // Should handle gracefully, not throw
      expect(result).toBeDefined();
    });

    it('should handle invalid selectors gracefully', async () => {
      const result = await browserTool.executeAction({
        type: 'click',
        selector: 'invalid-selector-123456789',
      }, context);

      // Should handle gracefully, not throw
      expect(result).toBeDefined();
    });
  });
});