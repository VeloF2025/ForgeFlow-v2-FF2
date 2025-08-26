/**
 * RBAC (Role-Based Access Control) Manager for ForgeFlow v2
 * Fine-grained permissions system with resource-based authorization
 * Supports hierarchical roles, conditional permissions, and team-scoped access
 */

import { Logger } from '../utils/enhanced-logger';
import { RedisConnectionManager } from '../infrastructure/redis/redis-connection-manager';
import {
  TeamRole,
  TeamPermission,
  ResolvedPermission,
  ResourceType,
  PermissionAction,
  PermissionCondition,
  AuthorizationError
} from './types';

export interface RoleDefinition {
  role: TeamRole;
  inherits?: TeamRole[];
  permissions: TeamPermission[];
  description: string;
  isDefault?: boolean;
}

export interface PermissionCheck {
  userId: string;
  teamId?: string;
  resource: ResourceType;
  action: PermissionAction;
  resourceId?: string;
  context?: Record<string, any>;
}

export interface PermissionResult {
  granted: boolean;
  reason: string;
  matchedRule?: {
    role: TeamRole;
    permission: TeamPermission;
  };
  deniedBy?: {
    role: TeamRole;
    condition: PermissionCondition;
  };
}

export interface ResourceContext {
  resourceType: ResourceType;
  resourceId: string;
  metadata: Record<string, any>;
  owner?: string;
  team?: string;
  tags?: string[];
}

// 🟢 WORKING: Comprehensive RBAC system with fine-grained permissions
export class RBACManager {
  private readonly logger = Logger.getInstance().child({ component: 'RBACManager' });
  private readonly redis: RedisConnectionManager;
  private readonly roleDefinitions: Map<TeamRole, RoleDefinition> = new Map();
  private readonly permissionCache = new Map<string, PermissionResult>();
  private readonly cacheTimeout = 5 * 60 * 1000; // 5 minutes

  constructor(redis: RedisConnectionManager) {
    this.redis = redis;
    this.initializeDefaultRoles();
  }

  /**
   * Initialize default role definitions
   */
  private initializeDefaultRoles(): void {
    const defaultRoles: RoleDefinition[] = [
      {
        role: 'owner',
        permissions: [
          {
            resource: 'team',
            actions: ['create', 'read', 'update', 'delete', 'manage', 'invite']
          },
          {
            resource: 'project',
            actions: ['create', 'read', 'update', 'delete', 'execute', 'manage']
          },
          {
            resource: 'agent',
            actions: ['create', 'read', 'update', 'delete', 'execute', 'manage']
          },
          {
            resource: 'execution',
            actions: ['create', 'read', 'update', 'delete', 'execute', 'manage']
          },
          {
            resource: 'knowledge',
            actions: ['create', 'read', 'update', 'delete', 'manage']
          },
          {
            resource: 'worktree',
            actions: ['create', 'read', 'update', 'delete', 'execute', 'manage']
          },
          {
            resource: 'github',
            actions: ['create', 'read', 'update', 'delete', 'execute', 'manage']
          },
          {
            resource: 'settings',
            actions: ['create', 'read', 'update', 'delete', 'manage']
          },
          {
            resource: 'billing',
            actions: ['create', 'read', 'update', 'delete', 'manage']
          },
          {
            resource: 'audit',
            actions: ['read', 'manage']
          }
        ],
        description: 'Full administrative access to all team resources',
        isDefault: false
      },
      {
        role: 'admin',
        inherits: ['developer'],
        permissions: [
          {
            resource: 'team',
            actions: ['read', 'update', 'invite', 'manage']
          },
          {
            resource: 'settings',
            actions: ['read', 'update', 'manage']
          },
          {
            resource: 'audit',
            actions: ['read']
          },
          {
            resource: 'billing',
            actions: ['read']
          }
        ],
        description: 'Administrative access with user management capabilities',
        isDefault: false
      },
      {
        role: 'developer',
        inherits: ['viewer'],
        permissions: [
          {
            resource: 'project',
            actions: ['create', 'update', 'execute'],
            conditions: [
              {
                field: 'owner',
                operator: 'equals',
                value: '${userId}'
              }
            ]
          },
          {
            resource: 'agent',
            actions: ['create', 'read', 'update', 'execute']
          },
          {
            resource: 'execution',
            actions: ['create', 'read', 'execute']
          },
          {
            resource: 'knowledge',
            actions: ['create', 'read', 'update']
          },
          {
            resource: 'worktree',
            actions: ['create', 'read', 'update', 'execute']
          },
          {
            resource: 'github',
            actions: ['read', 'execute']
          }
        ],
        description: 'Development access with project creation and execution rights',
        isDefault: true
      },
      {
        role: 'viewer',
        permissions: [
          {
            resource: 'team',
            actions: ['read']
          },
          {
            resource: 'project',
            actions: ['read']
          },
          {
            resource: 'agent',
            actions: ['read']
          },
          {
            resource: 'execution',
            actions: ['read']
          },
          {
            resource: 'knowledge',
            actions: ['read']
          },
          {
            resource: 'worktree',
            actions: ['read']
          },
          {
            resource: 'github',
            actions: ['read']
          }
        ],
        description: 'Read-only access to team resources',
        isDefault: false
      },
      {
        role: 'guest',
        permissions: [
          {
            resource: 'project',
            actions: ['read'],
            conditions: [
              {
                field: 'visibility',
                operator: 'equals',
                value: 'public'
              }
            ]
          }
        ],
        description: 'Limited access to public resources only',
        isDefault: false
      }
    ];

    defaultRoles.forEach(role => {
      this.roleDefinitions.set(role.role, role);
    });

    this.logger.info('Default roles initialized', {
      roles: Array.from(this.roleDefinitions.keys())
    });
  }

  /**
   * Check if user has permission to perform action on resource
   */
  async hasPermission(
    check: PermissionCheck
  ): Promise<PermissionResult> {
    try {
      // Generate cache key
      const cacheKey = this.generateCacheKey(check);
      
      // Check cache first
      const cached = this.permissionCache.get(cacheKey);
      if (cached && this.isCacheValid(cacheKey)) {
        this.logger.debug('Permission check served from cache', {
          userId: check.userId,
          resource: check.resource,
          action: check.action,
          granted: cached.granted
        });
        return cached;
      }

      // Get user's roles and permissions
      const userRoles = await this.getUserRoles(check.userId, check.teamId);
      if (userRoles.length === 0) {
        const result: PermissionResult = {
          granted: false,
          reason: 'User has no roles assigned'
        };
        this.cachePermissionResult(cacheKey, result);
        return result;
      }

      // Resolve all permissions for user's roles
      const resolvedPermissions = await this.resolvePermissions(userRoles);

      // Check each permission
      for (const permission of resolvedPermissions) {
        const result = await this.checkPermission(check, permission, userRoles);
        if (result.granted) {
          this.cachePermissionResult(cacheKey, result);
          return result;
        }
      }

      // No matching permission found
      const result: PermissionResult = {
        granted: false,
        reason: `No permission found for ${check.action} on ${check.resource}`
      };
      this.cachePermissionResult(cacheKey, result);
      return result;

    } catch (error) {
      this.logger.error('Permission check failed', { error, check });
      return {
        granted: false,
        reason: 'Permission check failed due to internal error'
      };
    }
  }

  /**
   * Get all resolved permissions for a user
   */
  async getUserPermissions(
    userId: string,
    teamId?: string
  ): Promise<ResolvedPermission[]> {
    try {
      const userRoles = await this.getUserRoles(userId, teamId);
      if (userRoles.length === 0) {
        return [];
      }

      const resolvedPermissions = await this.resolvePermissions(userRoles);
      
      // Convert to ResolvedPermission format
      const permissions: ResolvedPermission[] = [];
      const permissionMap = new Map<string, Set<PermissionAction>>();

      for (const permission of resolvedPermissions) {
        for (const teamPermission of permission.permissions) {
          const key = teamPermission.resource;
          if (!permissionMap.has(key)) {
            permissionMap.set(key, new Set());
          }
          
          teamPermission.actions.forEach(action => {
            permissionMap.get(key)!.add(action);
          });
        }
      }

      for (const [resource, actions] of permissionMap) {
        permissions.push({
          resource: resource as ResourceType,
          actions: Array.from(actions)
        });
      }

      this.logger.debug('User permissions resolved', {
        userId,
        teamId,
        permissionCount: permissions.length
      });

      return permissions;
    } catch (error) {
      this.logger.error('Failed to get user permissions', { error, userId, teamId });
      return [];
    }
  }

  /**
   * Assign role to user in team
   */
  async assignRole(
    userId: string,
    teamId: string,
    role: TeamRole,
    assignedBy: string
  ): Promise<void> {
    try {
      if (!this.roleDefinitions.has(role)) {
        throw new AuthorizationError(
          `Role ${role} does not exist`,
          'INVALID_ROLE',
          400
        );
      }

      // Store role assignment in Redis
      await this.redis.executeCommand('hset', [
        `user_roles:${userId}:${teamId}`,
        'role',
        role,
        'assignedBy',
        assignedBy,
        'assignedAt',
        Date.now().toString()
      ]);

      // Clear permission cache for user
      await this.clearUserPermissionCache(userId, teamId);

      this.logger.info('Role assigned to user', {
        userId,
        teamId,
        role,
        assignedBy
      });
    } catch (error) {
      this.logger.error('Failed to assign role', { error, userId, teamId, role });
      throw error;
    }
  }

  /**
   * Remove role from user in team
   */
  async removeRole(
    userId: string,
    teamId: string,
    removedBy: string
  ): Promise<void> {
    try {
      await this.redis.executeCommand('del', [`user_roles:${userId}:${teamId}`]);
      await this.clearUserPermissionCache(userId, teamId);

      this.logger.info('Role removed from user', {
        userId,
        teamId,
        removedBy
      });
    } catch (error) {
      this.logger.error('Failed to remove role', { error, userId, teamId });
      throw error;
    }
  }

  /**
   * Add custom permission to role
   */
  async addCustomPermission(
    role: TeamRole,
    permission: TeamPermission
  ): Promise<void> {
    try {
      const roleDefinition = this.roleDefinitions.get(role);
      if (!roleDefinition) {
        throw new AuthorizationError(
          `Role ${role} does not exist`,
          'INVALID_ROLE',
          400
        );
      }

      roleDefinition.permissions.push(permission);
      
      // Store in Redis for persistence
      await this.redis.executeCommand('hset', [
        `role_definitions:${role}`,
        'permissions',
        JSON.stringify(roleDefinition.permissions)
      ]);

      // Clear all permission caches
      await this.clearAllPermissionCaches();

      this.logger.info('Custom permission added to role', {
        role,
        resource: permission.resource,
        actions: permission.actions
      });
    } catch (error) {
      this.logger.error('Failed to add custom permission', { error, role });
      throw error;
    }
  }

  /**
   * Create resource context for permission evaluation
   */
  async createResourceContext(
    resourceType: ResourceType,
    resourceId: string,
    metadata: Record<string, any>
  ): Promise<void> {
    try {
      const context: ResourceContext = {
        resourceType,
        resourceId,
        metadata,
        owner: metadata.owner,
        team: metadata.team,
        tags: metadata.tags || []
      };

      await this.redis.executeCommand('hset', [
        `resource_context:${resourceType}:${resourceId}`,
        'context',
        JSON.stringify(context)
      ]);

      this.logger.debug('Resource context created', {
        resourceType,
        resourceId,
        owner: context.owner,
        team: context.team
      });
    } catch (error) {
      this.logger.error('Failed to create resource context', {
        error,
        resourceType,
        resourceId
      });
      throw error;
    }
  }

  /**
   * Validate role hierarchy and permissions
   */
  async validateRoleHierarchy(): Promise<{
    valid: boolean;
    issues: string[];
  }> {
    const issues: string[] = [];

    try {
      // Check for circular inheritance
      for (const [roleName, roleDefinition] of this.roleDefinitions) {
        const visited = new Set<TeamRole>();
        const visiting = new Set<TeamRole>();

        if (this.hasCircularInheritance(roleName, visited, visiting)) {
          issues.push(`Circular inheritance detected for role: ${roleName}`);
        }
      }

      // Check for invalid inherited roles
      for (const [roleName, roleDefinition] of this.roleDefinitions) {
        if (roleDefinition.inherits) {
          for (const inheritedRole of roleDefinition.inherits) {
            if (!this.roleDefinitions.has(inheritedRole)) {
              issues.push(`Role ${roleName} inherits from non-existent role: ${inheritedRole}`);
            }
          }
        }
      }

      return {
        valid: issues.length === 0,
        issues
      };
    } catch (error) {
      this.logger.error('Role hierarchy validation failed', { error });
      return {
        valid: false,
        issues: ['Validation failed due to internal error']
      };
    }
  }

  // 🟡 PARTIAL: Private helper methods
  private async getUserRoles(userId: string, teamId?: string): Promise<TeamRole[]> {
    try {
      if (!teamId) {
        // Global user - no team-specific roles
        return [];
      }

      const roleData = await this.redis.executeCommand<Record<string, string>>(
        'hgetall',
        [`user_roles:${userId}:${teamId}`]
      );

      if (!roleData || !roleData.role) {
        return [];
      }

      return [roleData.role as TeamRole];
    } catch (error) {
      this.logger.error('Failed to get user roles', { error, userId, teamId });
      return [];
    }
  }

  private async resolvePermissions(roles: TeamRole[]): Promise<Array<{
    role: TeamRole;
    permissions: TeamPermission[];
  }>> {
    const resolved: Array<{ role: TeamRole; permissions: TeamPermission[] }> = [];
    const processedRoles = new Set<TeamRole>();

    for (const role of roles) {
      await this.resolveRolePermissions(role, resolved, processedRoles);
    }

    return resolved;
  }

  private async resolveRolePermissions(
    role: TeamRole,
    resolved: Array<{ role: TeamRole; permissions: TeamPermission[] }>,
    processed: Set<TeamRole>
  ): Promise<void> {
    if (processed.has(role)) return;
    processed.add(role);

    const roleDefinition = this.roleDefinitions.get(role);
    if (!roleDefinition) return;

    // First resolve inherited roles
    if (roleDefinition.inherits) {
      for (const inheritedRole of roleDefinition.inherits) {
        await this.resolveRolePermissions(inheritedRole, resolved, processed);
      }
    }

    // Then add current role's permissions
    resolved.push({
      role,
      permissions: roleDefinition.permissions
    });
  }

  private async checkPermission(
    check: PermissionCheck,
    resolvedPermission: { role: TeamRole; permissions: TeamPermission[] },
    userRoles: TeamRole[]
  ): Promise<PermissionResult> {
    for (const permission of resolvedPermission.permissions) {
      if (permission.resource !== check.resource) continue;
      if (!permission.actions.includes(check.action)) continue;

      // Check conditions if present
      if (permission.conditions) {
        const conditionResult = await this.evaluateConditions(
          permission.conditions,
          check
        );
        if (!conditionResult.passed) {
          return {
            granted: false,
            reason: `Permission denied by condition: ${conditionResult.reason}`,
            deniedBy: {
              role: resolvedPermission.role,
              condition: conditionResult.failedCondition!
            }
          };
        }
      }

      // Permission granted
      return {
        granted: true,
        reason: `Permission granted by role ${resolvedPermission.role}`,
        matchedRule: {
          role: resolvedPermission.role,
          permission
        }
      };
    }

    return {
      granted: false,
      reason: `No matching permission for ${check.action} on ${check.resource}`
    };
  }

  private async evaluateConditions(
    conditions: PermissionCondition[],
    check: PermissionCheck
  ): Promise<{
    passed: boolean;
    reason?: string;
    failedCondition?: PermissionCondition;
  }> {
    for (const condition of conditions) {
      const result = await this.evaluateCondition(condition, check);
      if (!result) {
        return {
          passed: false,
          reason: `Condition failed: ${condition.field} ${condition.operator} ${condition.value}`,
          failedCondition: condition
        };
      }
    }

    return { passed: true };
  }

  private async evaluateCondition(
    condition: PermissionCondition,
    check: PermissionCheck
  ): Promise<boolean> {
    let actualValue: any;

    // Get actual value based on field
    switch (condition.field) {
      case 'owner':
        actualValue = await this.getResourceOwner(check.resource, check.resourceId);
        break;
      case 'team':
        actualValue = check.teamId;
        break;
      case 'userId':
        actualValue = check.userId;
        break;
      default:
        // Get from resource context or check context
        actualValue = check.context?.[condition.field] || 
                     await this.getResourceProperty(check.resource, check.resourceId, condition.field);
        break;
    }

    // Resolve template variables
    let expectedValue = condition.value;
    if (typeof expectedValue === 'string' && expectedValue.includes('${')) {
      expectedValue = expectedValue.replace(/\$\{(\w+)\}/g, (match, key) => {
        switch (key) {
          case 'userId': return check.userId;
          case 'teamId': return check.teamId || '';
          default: return check.context?.[key] || match;
        }
      });
    }

    // Evaluate condition
    switch (condition.operator) {
      case 'equals':
        return actualValue === expectedValue;
      case 'not_equals':
        return actualValue !== expectedValue;
      case 'in':
        return Array.isArray(expectedValue) && expectedValue.includes(actualValue);
      case 'not_in':
        return Array.isArray(expectedValue) && !expectedValue.includes(actualValue);
      case 'contains':
        return Array.isArray(actualValue) && actualValue.includes(expectedValue);
      default:
        return false;
    }
  }

  private async getResourceOwner(resource: ResourceType, resourceId?: string): Promise<string | null> {
    if (!resourceId) return null;

    try {
      const contextStr = await this.redis.executeCommand<string>(
        'hget',
        [`resource_context:${resource}:${resourceId}`, 'context']
      );

      if (contextStr) {
        const context = JSON.parse(contextStr) as ResourceContext;
        return context.owner || null;
      }

      return null;
    } catch {
      return null;
    }
  }

  private async getResourceProperty(
    resource: ResourceType,
    resourceId: string | undefined,
    property: string
  ): Promise<any> {
    if (!resourceId) return null;

    try {
      const contextStr = await this.redis.executeCommand<string>(
        'hget',
        [`resource_context:${resource}:${resourceId}`, 'context']
      );

      if (contextStr) {
        const context = JSON.parse(contextStr) as ResourceContext;
        return context.metadata[property] || null;
      }

      return null;
    } catch {
      return null;
    }
  }

  private hasCircularInheritance(
    role: TeamRole,
    visited: Set<TeamRole>,
    visiting: Set<TeamRole>
  ): boolean {
    if (visiting.has(role)) return true;
    if (visited.has(role)) return false;

    visiting.add(role);

    const roleDefinition = this.roleDefinitions.get(role);
    if (roleDefinition?.inherits) {
      for (const inheritedRole of roleDefinition.inherits) {
        if (this.hasCircularInheritance(inheritedRole, visited, visiting)) {
          return true;
        }
      }
    }

    visiting.delete(role);
    visited.add(role);
    return false;
  }

  private generateCacheKey(check: PermissionCheck): string {
    const parts = [
      check.userId,
      check.teamId || 'global',
      check.resource,
      check.action,
      check.resourceId || 'any'
    ];
    
    if (check.context) {
      const contextKey = Object.keys(check.context)
        .sort()
        .map(key => `${key}:${check.context![key]}`)
        .join(',');
      parts.push(contextKey);
    }

    return `perm_check:${parts.join(':')}`;
  }

  private cachePermissionResult(key: string, result: PermissionResult): void {
    this.permissionCache.set(key, result);
    
    // Set timeout for cache entry
    setTimeout(() => {
      this.permissionCache.delete(key);
    }, this.cacheTimeout);
  }

  private isCacheValid(key: string): boolean {
    return this.permissionCache.has(key);
  }

  private async clearUserPermissionCache(userId: string, teamId?: string): Promise<void> {
    const prefix = `perm_check:${userId}:${teamId || 'global'}:`;
    
    for (const key of this.permissionCache.keys()) {
      if (key.startsWith(prefix)) {
        this.permissionCache.delete(key);
      }
    }
  }

  private async clearAllPermissionCaches(): Promise<void> {
    this.permissionCache.clear();
  }
}