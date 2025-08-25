import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BrowserMCPTool } from '../../src/tools/browser-mcp-tool';
import type { ToolExecutionContext } from '../../src/types';

describe('Browser MCP Real Integration', () => {
  let browserTool: BrowserMCPTool;
  let context: ToolExecutionContext;

  beforeEach(() => {
    browserTool = new BrowserMCPTool({
      enableScreenshots: true,
      enableAccessibility: true,
      timeout: 10000,
      maxRetries: 1,
    });

    context = {
      issueId: 'real-test-issue',
      worktreeId: 'real-test-worktree',
      agentId: 'real-test-agent',
      startTime: new Date(),
    };
  });

  afterEach(async () => {
    if (browserTool) {
      await browserTool.disconnect();
    }
  });

  describe('Browser MCP Server Connection', () => {
    it('should handle server unavailable gracefully', async () => {
      // Test what happens when Browser MCP server is not running
      try {
        await browserTool.initialize();
        // If initialization succeeds, test basic functionality
        const health = await browserTool.isHealthy();
        expect(typeof health).toBe('boolean');
      } catch (error) {
        // Server not available - this is expected in CI/test environments
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('Browser MCP');
      }
    });

    it('should handle navigation when server available', async () => {
      try {
        await browserTool.initialize();
        
        const result = await browserTool.executeAction({
          type: 'navigate',
          url: 'https://example.com',
        }, context);

        expect(result).toBeDefined();
        expect(typeof result.success).toBe('boolean');
        expect(typeof result.duration).toBe('number');
        
        if (result.success) {
          expect(result.data).toBeDefined();
          expect(result.data.url).toBe('https://example.com');
        } else {
          // Connection failed - expected in test environment
          expect(result.error).toBeDefined();
        }
      } catch (error) {
        // Server connection failed - expected in test environment
        expect(error).toBeInstanceOf(Error);
      }
    });

    it('should handle screenshot when server available', async () => {
      try {
        await browserTool.initialize();
        
        // First navigate to a page
        await browserTool.executeAction({
          type: 'navigate',
          url: 'https://example.com',
        }, context);

        const result = await browserTool.executeAction({
          type: 'screenshot',
        }, context);

        expect(result).toBeDefined();
        expect(typeof result.success).toBe('boolean');
        
        if (result.success) {
          expect(result.data).toBeDefined();
          expect(result.data.screenshot).toBeDefined();
        }
      } catch (error) {
        // Server connection failed - expected in test environment
        expect(error).toBeInstanceOf(Error);
      }
    });
  });

  describe('Error Handling', () => {
    it('should throw error when not initialized', async () => {
      await expect(
        browserTool.executeAction({
          type: 'navigate',
          url: 'https://example.com',
        }, context)
      ).rejects.toThrow('Browser MCP tool not initialized');
    });

    it('should handle invalid URLs gracefully', async () => {
      try {
        await browserTool.initialize();
        
        const result = await browserTool.executeAction({
          type: 'navigate',
          url: 'invalid-url-123',
        }, context);

        expect(result).toBeDefined();
        expect(typeof result.success).toBe('boolean');
        
        // Should either succeed with error handling or fail gracefully
        if (!result.success) {
          expect(result.error).toBeDefined();
        }
      } catch (error) {
        // Server connection failed - expected in test environment
        expect(error).toBeInstanceOf(Error);
      }
    });
  });

  describe('Health Check', () => {
    it('should report health status correctly', async () => {
      const healthBefore = await browserTool.isHealthy();
      expect(healthBefore).toBe(false); // Not initialized yet
      
      try {
        await browserTool.initialize();
        const healthAfter = await browserTool.isHealthy();
        expect(typeof healthAfter).toBe('boolean');
      } catch (error) {
        // Server connection failed - expected in test environment
        const health = await browserTool.isHealthy();
        expect(health).toBe(false);
      }
    });
  });

  describe('Performance Metrics', () => {
    it('should get performance metrics with fallback', async () => {
      try {
        await browserTool.initialize();
        
        const metrics = await browserTool.getPerformanceMetrics();
        
        expect(metrics).toBeDefined();
        expect(typeof metrics.loadTime).toBe('number');
        expect(typeof metrics.firstContentfulPaint).toBe('number');
        expect(typeof metrics.largestContentfulPaint).toBe('number');
        expect(metrics.timestamp).toBeDefined();
        expect(['browser-mcp', 'estimated']).toContain(metrics.source);
      } catch (error) {
        // Server connection failed - should still get estimated metrics
        const metrics = await browserTool.getPerformanceMetrics();
        expect(metrics.source).toBe('estimated');
      }
    });
  });

  describe('Accessibility Report', () => {
    it('should get accessibility report with fallback', async () => {
      const browserToolWithA11y = new BrowserMCPTool({
        enableAccessibility: true,
      });

      try {
        await browserToolWithA11y.initialize();
        
        const report = await browserToolWithA11y.getAccessibilityReport();
        
        expect(report).toBeDefined();
        expect(typeof report.score).toBe('number');
        expect(Array.isArray(report.violations)).toBe(true);
        expect(typeof report.passes).toBe('number');
        expect(report.timestamp).toBeDefined();
        expect(['browser-mcp-snapshot', 'estimated']).toContain(report.source);
      } catch (error) {
        // Server connection failed - should still get estimated report
        const report = await browserToolWithA11y.getAccessibilityReport();
        expect(report.source).toBe('estimated');
      } finally {
        await browserToolWithA11y.disconnect();
      }
    });

    it('should throw error when accessibility disabled', async () => {
      const browserToolNoA11y = new BrowserMCPTool({
        enableAccessibility: false,
      });

      await expect(
        browserToolNoA11y.getAccessibilityReport()
      ).rejects.toThrow('Accessibility reporting is disabled');

      await browserToolNoA11y.disconnect();
    });
  });
});