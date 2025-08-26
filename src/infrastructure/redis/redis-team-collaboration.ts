/**
 * Redis Team Collaboration Service for ForgeFlow v2
 * Handles real-time team communication, task coordination, and presence tracking
 */

import { EventEmitter } from 'events';
import { RedisConnectionManager } from './redis-connection-manager';
import { Logger } from '../../utils/enhanced-logger';

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  status: 'online' | 'away' | 'busy' | 'offline';
  lastSeen: number;
  currentTask?: string;
  capabilities: string[];
}

export interface TaskCoordinationData {
  taskId: string;
  assignedTo: string;
  status: 'pending' | 'in_progress' | 'completed' | 'blocked';
  priority: 'low' | 'medium' | 'high' | 'critical';
  estimatedTime: number;
  dependencies: string[];
  progress: number;
  lastUpdated: number;
}

export interface TeamMessage {
  id: string;
  from: string;
  to?: string; // If undefined, broadcast to all
  type: 'chat' | 'task_update' | 'status_change' | 'alert';
  content: string;
  metadata?: Record<string, any>;
  timestamp: number;
}

export interface PresenceData {
  memberId: string;
  status: TeamMember['status'];
  currentTask?: string;
  lastActivity: number;
  heartbeat: number;
}

export class RedisTeamCollaboration extends EventEmitter {
  private readonly connectionManager: RedisConnectionManager;
  private readonly logger = Logger.getInstance().child({ component: 'RedisTeamCollaboration' });
  private readonly teamId: string;
  private readonly memberId: string;
  private presenceUpdateInterval?: NodeJS.Timeout;
  private messageSubscription?: any;
  private readonly PRESENCE_TTL = 60000; // 1 minute
  private readonly PRESENCE_UPDATE_INTERVAL = 30000; // 30 seconds

  constructor(connectionManager: RedisConnectionManager, teamId: string, memberId: string) {
    super();
    this.connectionManager = connectionManager;
    this.teamId = teamId;
    this.memberId = memberId;
  }

  /**
   * Initialize team collaboration features
   */
  async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing team collaboration', { teamId: this.teamId, memberId: this.memberId });

      // Start presence tracking
      await this.startPresenceTracking();
      
      // Subscribe to team messages
      await this.subscribeToMessages();
      
      // Register team member
      await this.registerTeamMember();
      
      this.logger.info('Team collaboration initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize team collaboration', { error });
      throw error;
    }
  }

  /**
   * Register or update team member information
   */
  async registerTeamMember(memberData?: Partial<TeamMember>): Promise<void> {
    try {
      const member: TeamMember = {
        id: this.memberId,
        name: memberData?.name || this.memberId,
        role: memberData?.role || 'developer',
        status: 'online',
        lastSeen: Date.now(),
        currentTask: memberData?.currentTask,
        capabilities: memberData?.capabilities || []
      };

      const memberKey = `teams:${this.teamId}:members:${this.memberId}`;
      await this.connectionManager.executeCommand(
        'hmset',
        [memberKey, ...this.flattenObject(member)],
        'write'
      );

      // Add to team member list
      await this.connectionManager.executeCommand(
        'sadd',
        [`teams:${this.teamId}:member_list`, this.memberId],
        'write'
      );

      this.logger.info('Team member registered', { memberId: this.memberId, member });
    } catch (error) {
      this.logger.error('Failed to register team member', { error });
      throw error;
    }
  }

  /**
   * Update member presence and status
   */
  async updatePresence(status: TeamMember['status'], currentTask?: string): Promise<void> {
    try {
      const presenceData: PresenceData = {
        memberId: this.memberId,
        status,
        currentTask,
        lastActivity: Date.now(),
        heartbeat: Date.now()
      };

      const presenceKey = `teams:${this.teamId}:presence:${this.memberId}`;
      await this.connectionManager.executeCommand(
        'hmset',
        [presenceKey, ...this.flattenObject(presenceData)],
        'write'
      );

      // Set TTL for automatic cleanup
      await this.connectionManager.executeCommand(
        'pexpire',
        [presenceKey, this.PRESENCE_TTL],
        'write'
      );

      // Publish presence update to team
      await this.publishMessage({
        id: `presence-${Date.now()}`,
        from: this.memberId,
        type: 'status_change',
        content: JSON.stringify({ status, currentTask }),
        timestamp: Date.now()
      });

    } catch (error) {
      this.logger.error('Failed to update presence', { error });
    }
  }

  /**
   * Get all team members with their current status
   */
  async getTeamMembers(): Promise<TeamMember[]> {
    try {
      const memberIds = await this.connectionManager.executeCommand(
        'smembers',
        [`teams:${this.teamId}:member_list`],
        'read'
      );

      const members: TeamMember[] = [];
      for (const memberId of memberIds) {
        const memberKey = `teams:${this.teamId}:members:${memberId}`;
        const memberData = await this.connectionManager.executeCommand(
          'hgetall',
          [memberKey],
          'read'
        );

        if (Object.keys(memberData).length > 0) {
          members.push(this.unflattenObject(memberData) as TeamMember);
        }
      }

      return members;
    } catch (error) {
      this.logger.error('Failed to get team members', { error });
      return [];
    }
  }

  /**
   * Coordinate task assignment and updates
   */
  async coordinateTask(taskData: TaskCoordinationData): Promise<boolean> {
    try {
      const taskKey = `teams:${this.teamId}:tasks:${taskData.taskId}`;
      
      // Use distributed lock for task coordination
      const lockKey = `task_coord:${taskData.taskId}`;
      const lockValue = `${this.memberId}:${Date.now()}`;
      
      const lockAcquired = await this.connectionManager.executeCommand(
        'set',
        [lockKey, lockValue, 'PX', 5000, 'NX'],
        'lock'
      );

      if (lockAcquired !== 'OK') {
        this.logger.warn('Failed to acquire task coordination lock', { taskId: taskData.taskId });
        return false;
      }

      try {
        // Update task data
        await this.connectionManager.executeCommand(
          'hmset',
          [taskKey, ...this.flattenObject(taskData)],
          'write'
        );

        // Add to task index
        await this.connectionManager.executeCommand(
          'zadd',
          [`teams:${this.teamId}:task_index`, taskData.priority === 'critical' ? 4 : 
           taskData.priority === 'high' ? 3 : taskData.priority === 'medium' ? 2 : 1, 
           taskData.taskId],
          'write'
        );

        // Publish task update
        await this.publishMessage({
          id: `task-${taskData.taskId}-${Date.now()}`,
          from: this.memberId,
          type: 'task_update',
          content: JSON.stringify(taskData),
          timestamp: Date.now()
        });

        return true;
      } finally {
        // Release lock
        const unlockScript = `
          if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("del", KEYS[1])
          else
            return 0
          end
        `;
        await this.connectionManager.executeScript(unlockScript, [lockKey], [lockValue]);
      }
    } catch (error) {
      this.logger.error('Failed to coordinate task', { error, taskId: taskData.taskId });
      return false;
    }
  }

  /**
   * Get task coordination data
   */
  async getTaskCoordination(taskId: string): Promise<TaskCoordinationData | null> {
    try {
      const taskKey = `teams:${this.teamId}:tasks:${taskId}`;
      const taskData = await this.connectionManager.executeCommand(
        'hgetall',
        [taskKey],
        'read'
      );

      if (Object.keys(taskData).length === 0) {
        return null;
      }

      return this.unflattenObject(taskData) as TaskCoordinationData;
    } catch (error) {
      this.logger.error('Failed to get task coordination', { error, taskId });
      return null;
    }
  }

  /**
   * Get prioritized task list for the team
   */
  async getPrioritizedTasks(limit: number = 10): Promise<TaskCoordinationData[]> {
    try {
      const taskIds = await this.connectionManager.executeCommand(
        'zrevrange',
        [`teams:${this.teamId}:task_index`, 0, limit - 1],
        'read'
      );

      const tasks: TaskCoordinationData[] = [];
      for (const taskId of taskIds) {
        const task = await this.getTaskCoordination(taskId);
        if (task) {
          tasks.push(task);
        }
      }

      return tasks;
    } catch (error) {
      this.logger.error('Failed to get prioritized tasks', { error });
      return [];
    }
  }

  /**
   * Publish message to team
   */
  async publishMessage(message: TeamMessage): Promise<void> {
    try {
      const channelKey = `teams:${this.teamId}:messages`;
      await this.connectionManager.executeCommand(
        'publish',
        [channelKey, JSON.stringify(message)],
        'write'
      );

      // Store message for history (keep last 100 messages)
      const historyKey = `teams:${this.teamId}:message_history`;
      await this.connectionManager.executeCommand(
        'lpush',
        [historyKey, JSON.stringify(message)],
        'write'
      );
      await this.connectionManager.executeCommand(
        'ltrim',
        [historyKey, 0, 99],
        'write'
      );

    } catch (error) {
      this.logger.error('Failed to publish message', { error });
      throw error;
    }
  }

  /**
   * Get message history
   */
  async getMessageHistory(limit: number = 50): Promise<TeamMessage[]> {
    try {
      const historyKey = `teams:${this.teamId}:message_history`;
      const messages = await this.connectionManager.executeCommand(
        'lrange',
        [historyKey, 0, limit - 1],
        'read'
      );

      return messages.map((msg: string) => JSON.parse(msg)).reverse();
    } catch (error) {
      this.logger.error('Failed to get message history', { error });
      return [];
    }
  }

  /**
   * Subscribe to team messages
   */
  private async subscribeToMessages(): Promise<void> {
    try {
      const connection = await this.connectionManager.getConnection('read');
      const channelKey = `teams:${this.teamId}:messages`;
      
      await connection.subscribe(channelKey);
      connection.on('message', (channel: string, message: string) => {
        try {
          const parsedMessage: TeamMessage = JSON.parse(message);
          
          // Don't emit our own messages
          if (parsedMessage.from !== this.memberId) {
            this.emit('message', parsedMessage);
          }
        } catch (error) {
          this.logger.error('Failed to parse team message', { error, message });
        }
      });

      this.messageSubscription = connection;
    } catch (error) {
      this.logger.error('Failed to subscribe to messages', { error });
      throw error;
    }
  }

  /**
   * Start presence tracking with periodic updates
   */
  private async startPresenceTracking(): Promise<void> {
    // Initial presence update
    await this.updatePresence('online');

    // Schedule regular presence updates
    this.presenceUpdateInterval = setInterval(async () => {
      try {
        await this.updatePresence('online');
      } catch (error) {
        this.logger.error('Failed to update presence', { error });
      }
    }, this.PRESENCE_UPDATE_INTERVAL);
  }

  /**
   * Stop team collaboration and cleanup
   */
  async stop(): Promise<void> {
    try {
      this.logger.info('Stopping team collaboration');

      // Stop presence updates
      if (this.presenceUpdateInterval) {
        clearInterval(this.presenceUpdateInterval);
      }

      // Update status to offline
      await this.updatePresence('offline');

      // Unsubscribe from messages
      if (this.messageSubscription) {
        await this.messageSubscription.unsubscribe();
      }

      this.logger.info('Team collaboration stopped');
    } catch (error) {
      this.logger.error('Error stopping team collaboration', { error });
    }
  }

  /**
   * Utility to flatten object for Redis hash storage
   */
  private flattenObject(obj: Record<string, any>): string[] {
    const result: string[] = [];
    for (const [key, value] of Object.entries(obj)) {
      result.push(key);
      if (Array.isArray(value)) {
        result.push(JSON.stringify(value));
      } else if (typeof value === 'object' && value !== null) {
        result.push(JSON.stringify(value));
      } else {
        result.push(String(value));
      }
    }
    return result;
  }

  /**
   * Utility to unflatten object from Redis hash
   */
  private unflattenObject(hash: Record<string, string>): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(hash)) {
      try {
        // Try to parse as JSON first
        result[key] = JSON.parse(value);
      } catch {
        // If parsing fails, use as string or convert to number if applicable
        if (!isNaN(Number(value)) && value !== '') {
          result[key] = Number(value);
        } else {
          result[key] = value;
        }
      }
    }
    return result;
  }
}