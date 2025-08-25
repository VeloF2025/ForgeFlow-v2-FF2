import { randomUUID } from 'crypto';
import type { Agent } from '../types';
import { LogContext } from '@utils/logger';

export abstract class BaseAgent implements Agent {
  public readonly id: string;
  public readonly type: string;
  public readonly capabilities: string[];
  public status: 'idle' | 'busy' | 'error';
  protected logger: LogContext;

  constructor(type: string, capabilities: string[]) {
    this.id = `${type}-${randomUUID().slice(0, 8)}`;
    this.type = type;
    this.capabilities = capabilities;
    this.status = 'idle';
    this.logger = new LogContext(`Agent:${type}`);
  }

  abstract execute(issueId: string, worktreeId: string): Promise<void>;

  protected preExecute(issueId: string, worktreeId: string): void {
    this.logger.info(`Starting execution for issue: ${issueId} in worktree: ${worktreeId}`);
    this.status = 'busy';
  }

  protected postExecute(issueId: string, success: boolean): void {
    this.status = 'idle';
    const statusMsg = success ? 'completed successfully' : 'failed';
    this.logger.info(`Execution ${statusMsg} for issue: ${issueId}`);
  }

  protected handleError(error: unknown, issueId: string): void {
    this.status = 'error';
    this.logger.error(`Error executing issue ${issueId}`, error);
    throw error;
  }

  protected reportProgress(issueId: string, progress: number, message: string): void {
    this.logger.debug(`[${issueId}] Progress: ${progress}% - ${message}`);
  }

  public getCapabilities(): string[] {
    return [...this.capabilities];
  }

  public canHandle(requirement: string): boolean {
    return this.capabilities.includes(requirement);
  }

  public getStatus(): 'idle' | 'busy' | 'error' {
    return this.status;
  }

  public reset(): void {
    this.status = 'idle';
    this.logger.debug('Agent reset to idle state');
  }
}
