import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { LogContext } from '@utils/logger';

export interface MCPClientConfig {
  serverCommand?: string;
  serverArgs?: string[];
  timeout?: number;
  reconnectAttempts?: number;
  reconnectDelay?: number;
}

export interface BrowserMCPResponse {
  success: boolean;
  data?: any;
  error?: string;
  screenshot?: string;
}

export class BrowserMCPClient {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private config: MCPClientConfig;
  private logger: LogContext;
  private isConnected: boolean = false;
  private reconnectAttempts: number = 0;

  constructor(config: MCPClientConfig = {}) {
    this.config = {
      serverCommand: 'npx',
      serverArgs: ['@browsermcp/mcp'],
      timeout: 30000,
      reconnectAttempts: 3,
      reconnectDelay: 1000,
      ...config,
    };
    this.logger = new LogContext('BrowserMCPClient');
  }

  async connect(): Promise<void> {
    try {
      this.logger.info('Connecting to Browser MCP server...');

      // Create transport and client for Browser MCP server
      this.transport = new StdioClientTransport({
        command: this.config.serverCommand,
        args: this.config.serverArgs,
        env: { ...process.env },
      });

      this.client = new Client(
        {
          name: 'forgeflow-browser-client',
          version: '1.0.0',
        },
        {
          capabilities: {},
        },
      );

      // Connect to the server
      await this.client.connect(this.transport);

      this.logger.info('Browser MCP client connected successfully');

      this.isConnected = true;
      this.reconnectAttempts = 0;
    } catch (error) {
      this.logger.error('Failed to connect to Browser MCP server:', error);
      await this.cleanup();
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    this.logger.info('Disconnecting Browser MCP client...');
    await this.cleanup();
    this.logger.info('Browser MCP client disconnected');
  }

  private async cleanup(): Promise<void> {
    this.isConnected = false;

    if (this.client) {
      try {
        await this.client.close();
      } catch (error) {
        this.logger.debug('Error closing client:', error);
      }
      this.client = null;
    }

    if (this.transport) {
      try {
        await this.transport.close();
      } catch (error) {
        this.logger.debug('Error closing transport:', error);
      }
      this.transport = null;
    }
  }

  private async attemptReconnect(): Promise<void> {
    if (this.reconnectAttempts >= this.config.reconnectAttempts) {
      this.logger.error('Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    this.logger.info(
      `Attempting to reconnect (${this.reconnectAttempts}/${this.config.reconnectAttempts})...`,
    );

    await this.delay(this.config.reconnectDelay);

    try {
      await this.connect();
    } catch (error) {
      this.logger.error('Reconnection attempt failed:', error);
      await this.attemptReconnect();
    }
  }

  async callTool(toolName: string, args: Record<string, any> = {}): Promise<BrowserMCPResponse> {
    if (!this.client || !this.isConnected) {
      throw new Error('Browser MCP client not connected');
    }

    try {
      this.logger.debug(`Calling tool: ${toolName}`, args);

      const result = await this.client.callTool({
        name: toolName,
        arguments: args,
      });

      this.logger.debug(`Tool result for ${toolName}:`, result);

      if (result.isError) {
        const errorContent = Array.isArray(result.content)
          ? result.content.map((c: any) => c.text || c).join('\n')
          : (result.content as string) || 'Unknown error';

        return {
          success: false,
          error: errorContent,
        };
      }

      // Extract data from MCP response
      const data = this.extractDataFromMCPResponse(result);

      return {
        success: true,
        data,
        screenshot: this.extractScreenshotFromResponse(result),
      };
    } catch (error) {
      this.logger.error(`Error calling tool ${toolName}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private extractDataFromMCPResponse(result: any): any {
    if (!result.content || !Array.isArray(result.content)) {
      return null;
    }

    // Extract text content
    const textContent = result.content
      .filter((c) => c.type === 'text')
      .map((c) => c.text)
      .join('\n');

    // Try to parse as JSON if it looks like JSON
    if (textContent.trim().startsWith('{') || textContent.trim().startsWith('[')) {
      try {
        return JSON.parse(textContent);
      } catch {
        return textContent;
      }
    }

    return textContent || result.content;
  }

  private extractScreenshotFromResponse(result: any): string | undefined {
    if (!result.content || !Array.isArray(result.content)) {
      return undefined;
    }

    // Look for image content
    const imageContent = result.content.find((c) => c.type === 'image');
    if (imageContent?.data) {
      return imageContent.data;
    }

    // Look for base64 image in text content
    const textContent = result.content
      .filter((c) => c.type === 'text')
      .map((c) => c.text)
      .join('\n');

    const base64Match = textContent.match(/data:image\/[^;]+;base64,([^"'\s]+)/);
    if (base64Match) {
      return base64Match[1];
    }

    return undefined;
  }

  // Browser automation methods
  async navigate(url: string): Promise<BrowserMCPResponse> {
    return this.callTool('browser_navigate', { url });
  }

  async takeScreenshot(): Promise<BrowserMCPResponse> {
    return this.callTool('browser_screenshot');
  }

  async takeSnapshot(): Promise<BrowserMCPResponse> {
    return this.callTool('browser_snapshot');
  }

  async click(element: string, ref: string): Promise<BrowserMCPResponse> {
    return this.callTool('browser_click', { element, ref });
  }

  async type(element: string, ref: string, text: string): Promise<BrowserMCPResponse> {
    return this.callTool('browser_type', { element, ref, text });
  }

  async hover(element: string, ref: string): Promise<BrowserMCPResponse> {
    return this.callTool('browser_hover', { element, ref });
  }

  async wait(time: number): Promise<BrowserMCPResponse> {
    return this.callTool('browser_wait', { time });
  }

  async pressKey(key: string): Promise<BrowserMCPResponse> {
    return this.callTool('browser_press_key', { key });
  }

  async goBack(): Promise<BrowserMCPResponse> {
    return this.callTool('browser_go_back');
  }

  async goForward(): Promise<BrowserMCPResponse> {
    return this.callTool('browser_go_forward');
  }

  async getConsoleLogs(): Promise<BrowserMCPResponse> {
    return this.callTool('browser_get_console_logs');
  }

  async selectOption(element: string, ref: string, option: string): Promise<BrowserMCPResponse> {
    return this.callTool('browser_select_option', { element, ref, option });
  }

  async drag(
    fromElement: string,
    fromRef: string,
    toElement: string,
    toRef: string,
  ): Promise<BrowserMCPResponse> {
    return this.callTool('browser_drag', {
      from_element: fromElement,
      from_ref: fromRef,
      to_element: toElement,
      to_ref: toRef,
    });
  }

  isHealthy(): boolean {
    return this.isConnected && this.client !== null;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export default BrowserMCPClient;
