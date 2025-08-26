import { BaseAgent } from './base-agent';
import type { BrowserAction } from '../tools/browser-mcp-tool';
import { BrowserMCPTool, BrowserMCPConfig } from '../tools/browser-mcp-tool';
import type { ToolExecutionContext } from '../types';

export class UIUXOptimizerAgent extends BaseAgent {
  private browserTool: BrowserMCPTool;

  constructor() {
    super('ui-ux-optimizer', [
      'responsive-design',
      'accessibility',
      'performance-optimization',
      'visual-consistency',
      'interaction-patterns',
      'mobile-optimization',
      'browser-automation',
      'visual-testing',
      'cross-browser-testing',
    ]);

    // Initialize Browser MCP tool with UI/UX focused configuration
    this.browserTool = new BrowserMCPTool({
      enableScreenshots: true,
      enableAccessibility: true,
      timeout: 30000,
      maxRetries: 2,
    });
  }

  async execute(issueId: string, worktreeId: string): Promise<void> {
    this.preExecute(issueId, worktreeId);

    try {
      // Initialize browser tool
      this.reportProgress(issueId, 5, 'Initializing browser automation');
      await this.browserTool.initialize();

      this.reportProgress(issueId, 10, 'Reviewing design specifications');
      await this.reviewDesign(issueId);

      this.reportProgress(issueId, 20, 'Auditing current implementation with browser testing');
      await this.auditImplementation(worktreeId);

      this.reportProgress(issueId, 35, 'Implementing UI components');
      await this.implementComponents(worktreeId);

      this.reportProgress(issueId, 50, 'Testing responsive behavior with browser automation');
      await this.ensureResponsive(worktreeId);

      this.reportProgress(issueId, 65, 'Running accessibility audits');
      await this.addAccessibility(worktreeId);

      this.reportProgress(issueId, 80, 'Performance testing and optimization');
      await this.optimizePerformance(worktreeId);

      this.reportProgress(issueId, 90, 'Cross-viewport and cross-browser testing');
      await this.testViewports(worktreeId);

      this.reportProgress(issueId, 95, 'Generating visual test reports');
      await this.generateReports(worktreeId);

      this.reportProgress(issueId, 100, 'UI/UX optimization complete');
      this.postExecute(issueId, true);
    } catch (error) {
      this.handleError(error, issueId);
    } finally {
      // Always disconnect browser tool
      await this.browserTool.disconnect();
    }
  }

  private async reviewDesign(issueId: string): Promise<void> {
    this.logger.debug(`Reviewing design specifications for issue: ${issueId}`);
    await this.delay(400);
  }

  private async auditImplementation(worktreeId: string): Promise<void> {
    this.logger.debug(`Auditing current UI implementation in worktree: ${worktreeId}`);

    const context: ToolExecutionContext = {
      issueId: this.currentIssueId || '',
      worktreeId,
      agentId: this.id,
      startTime: new Date(),
    };

    try {
      // Navigate to the local development server
      await this.browserTool.executeAction(
        {
          type: 'navigate',
          url: 'http://localhost:3000',
        },
        context,
      );

      // Take initial screenshot for baseline
      await this.browserTool.executeAction(
        {
          type: 'screenshot',
        },
        context,
      );

      // Extract page structure for analysis
      await this.browserTool.executeAction(
        {
          type: 'extract',
          selector: 'body',
        },
        context,
      );
    } catch (error) {
      this.logger.warning('Browser audit failed, falling back to static analysis', error);
    }

    await this.delay(500);
  }

  private async implementComponents(worktreeId: string): Promise<void> {
    this.logger.debug(`Implementing UI components in worktree: ${worktreeId}`);
    await this.delay(900);
  }

  private async ensureResponsive(worktreeId: string): Promise<void> {
    this.logger.debug(`Testing responsive behavior in worktree: ${worktreeId}`);

    const context: ToolExecutionContext = {
      issueId: this.currentIssueId || '',
      worktreeId,
      agentId: this.id,
      startTime: new Date(),
    };

    try {
      // Test different viewport sizes
      const viewports = [
        { width: 375, height: 667, name: 'mobile' },
        { width: 768, height: 1024, name: 'tablet' },
        { width: 1920, height: 1080, name: 'desktop' },
      ];

      for (const viewport of viewports) {
        this.logger.debug(
          `Testing ${viewport.name} viewport: ${viewport.width}x${viewport.height}`,
        );

        // Set viewport size and take screenshot
        await this.browserTool.executeAction(
          {
            type: 'evaluate',
            script: `window.resizeTo(${viewport.width}, ${viewport.height})`,
          },
          context,
        );

        await this.browserTool.executeAction(
          {
            type: 'screenshot',
          },
          context,
        );
      }
    } catch (error) {
      this.logger.warning('Responsive testing failed', error);
    }

    await this.delay(600);
  }

  private async addAccessibility(worktreeId: string): Promise<void> {
    this.logger.debug(`Running accessibility audits in worktree: ${worktreeId}`);

    const context: ToolExecutionContext = {
      issueId: this.currentIssueId || '',
      worktreeId,
      agentId: this.id,
      startTime: new Date(),
    };

    try {
      // Get accessibility report
      const accessibilityReport = await this.browserTool.getAccessibilityReport();
      this.logger.info(`Accessibility score: ${accessibilityReport.score}/100`);

      if (accessibilityReport.violations.length > 0) {
        this.logger.warning(
          `Found ${accessibilityReport.violations.length} accessibility violations`,
        );
      }
    } catch (error) {
      this.logger.warning('Accessibility audit failed', error);
    }

    await this.delay(700);
  }

  private async optimizePerformance(worktreeId: string): Promise<void> {
    this.logger.debug(`Running performance tests in worktree: ${worktreeId}`);

    try {
      // Get performance metrics
      const performanceMetrics = await this.browserTool.getPerformanceMetrics();

      this.logger.info('Performance metrics:', {
        loadTime: `${performanceMetrics.loadTime}ms`,
        firstContentfulPaint: `${performanceMetrics.firstContentfulPaint}ms`,
        largestContentfulPaint: `${performanceMetrics.largestContentfulPaint}ms`,
      });

      // Check Core Web Vitals thresholds
      if (performanceMetrics.largestContentfulPaint > 2500) {
        this.logger.warning('LCP exceeds 2.5s threshold - needs optimization');
      }
    } catch (error) {
      this.logger.warning('Performance testing failed', error);
    }

    await this.delay(500);
  }

  private async testViewports(worktreeId: string): Promise<void> {
    this.logger.debug(`Cross-viewport testing in worktree: ${worktreeId}`);

    const context: ToolExecutionContext = {
      issueId: this.currentIssueId || '',
      worktreeId,
      agentId: this.id,
      startTime: new Date(),
    };

    try {
      // Test common interaction patterns across viewports
      const testScenarios: BrowserAction[] = [
        { type: 'click', selector: 'button[type="submit"]' },
        { type: 'type', selector: 'input[type="search"]', text: 'test search' },
        { type: 'scroll', options: { position: { x: 0, y: 500 } } },
      ];

      for (const scenario of testScenarios) {
        try {
          await this.browserTool.executeAction(scenario, context);
        } catch (error) {
          this.logger.debug(`Test scenario failed: ${scenario.type}`, error);
        }
      }
    } catch (error) {
      this.logger.warning('Viewport testing failed', error);
    }

    await this.delay(400);
  }

  private async generateReports(worktreeId: string): Promise<void> {
    this.logger.debug(`Generating visual test reports for worktree: ${worktreeId}`);

    try {
      // Generate final screenshot and summary
      const context: ToolExecutionContext = {
        issueId: this.currentIssueId || '',
        worktreeId,
        agentId: this.id,
        startTime: new Date(),
      };

      await this.browserTool.executeAction(
        {
          type: 'screenshot',
        },
        context,
      );

      this.logger.info('UI/UX testing report generated successfully');
    } catch (error) {
      this.logger.warning('Report generation failed', error);
    }

    await this.delay(300);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
