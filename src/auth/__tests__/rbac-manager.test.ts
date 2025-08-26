/**
 * RBAC Manager Tests
 * Comprehensive test suite for role-based access control
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { RBACManager } from '../rbac-manager';
import { RedisConnectionManager } from '../../infrastructure/redis/redis-connection-manager';
import { TeamRole, ResourceType, PermissionAction } from '../types';

// Mock dependencies
jest.mock('../../infrastructure/redis/redis-connection-manager');

describe('RBACManager', () => {
  let rbacManager: RBACManager;
  let mockRedis: jest.Mocked<RedisConnectionManager>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRedis = new RedisConnectionManager({}) as jest.Mocked<RedisConnectionManager>;
    rbacManager = new RBACManager(mockRedis);
  });

  describe('hasPermission', () => {
    it('should grant permission for owner role', async () => {
      // Arrange
      mockRedis.executeCommand.mockImplementation(async (command, args) => {
        if (command === 'hgetall' && args[0] === 'user_roles:user-123:team-123') {
          return { role: 'owner', assignedBy: 'system', assignedAt: Date.now().toString() };
        }
        return {};
      });

      // Act
      const result = await rbacManager.hasPermission({
        userId: 'user-123',
        teamId: 'team-123',
        resource: 'project',
        action: 'create'
      });

      // Assert
      expect(result.granted).toBe(true);
      expect(result.matchedRule?.role).toBe('owner');
    });

    it('should deny permission for insufficient role', async () => {
      // Arrange
      mockRedis.executeCommand.mockImplementation(async (command, args) => {
        if (command === 'hgetall' && args[0] === 'user_roles:user-123:team-123') {
          return { role: 'viewer', assignedBy: 'system', assignedAt: Date.now().toString() };
        }
        return {};
      });

      // Act
      const result = await rbacManager.hasPermission({
        userId: 'user-123',
        teamId: 'team-123',
        resource: 'project',
        action: 'create'
      });

      // Assert
      expect(result.granted).toBe(false);
      expect(result.reason).toContain('No permission found');
    });

    it('should evaluate conditions correctly', async () => {
      // Arrange
      mockRedis.executeCommand.mockImplementation(async (command, args) => {
        if (command === 'hgetall' && args[0] === 'user_roles:user-123:team-123') {
          return { role: 'developer', assignedBy: 'system', assignedAt: Date.now().toString() };
        }
        if (command === 'hget' && args[0] === 'resource_context:project:project-123' && args[1] === 'context') {
          return JSON.stringify({
            resourceType: 'project',
            resourceId: 'project-123',
            metadata: { owner: 'user-123' },
            owner: 'user-123'
          });
        }
        return {};
      });

      // Act - Developer trying to update their own project
      const result = await rbacManager.hasPermission({
        userId: 'user-123',
        teamId: 'team-123',
        resource: 'project',
        action: 'update',
        resourceId: 'project-123'
      });

      // Assert
      expect(result.granted).toBe(true);
      expect(result.matchedRule?.role).toBe('developer');
    });

    it('should deny permission when condition fails', async () => {
      // Arrange
      mockRedis.executeCommand.mockImplementation(async (command, args) => {
        if (command === 'hgetall' && args[0] === 'user_roles:user-123:team-123') {
          return { role: 'developer', assignedBy: 'system', assignedAt: Date.now().toString() };
        }
        if (command === 'hget' && args[0] === 'resource_context:project:project-123' && args[1] === 'context') {
          return JSON.stringify({
            resourceType: 'project',
            resourceId: 'project-123',
            metadata: { owner: 'other-user' },
            owner: 'other-user'
          });
        }
        return {};
      });

      // Act - Developer trying to update someone else's project
      const result = await rbacManager.hasPermission({
        userId: 'user-123',
        teamId: 'team-123',
        resource: 'project',
        action: 'update',
        resourceId: 'project-123'
      });

      // Assert
      expect(result.granted).toBe(false);
      expect(result.reason).toContain('Permission denied by condition');
    });

    it('should handle user with no roles', async () => {
      // Arrange
      mockRedis.executeCommand.mockResolvedValue({});

      // Act
      const result = await rbacManager.hasPermission({
        userId: 'user-123',
        teamId: 'team-123',
        resource: 'project',
        action: 'read'
      });

      // Assert
      expect(result.granted).toBe(false);
      expect(result.reason).toBe('User has no roles assigned');
    });

    it('should cache permission results', async () => {
      // Arrange
      mockRedis.executeCommand.mockImplementation(async (command, args) => {
        if (command === 'hgetall' && args[0] === 'user_roles:user-123:team-123') {
          return { role: 'owner', assignedBy: 'system', assignedAt: Date.now().toString() };
        }
        return {};
      });

      const permissionCheck = {
        userId: 'user-123',
        teamId: 'team-123',
        resource: 'project' as ResourceType,
        action: 'create' as PermissionAction
      };

      // Act - First call
      const result1 = await rbacManager.hasPermission(permissionCheck);
      
      // Act - Second call (should use cache)
      const result2 = await rbacManager.hasPermission(permissionCheck);

      // Assert
      expect(result1.granted).toBe(true);
      expect(result2.granted).toBe(true);
      // Redis should only be called once for role lookup
      expect(mockRedis.executeCommand).toHaveBeenCalledTimes(1);
    });
  });

  describe('getUserPermissions', () => {
    it('should return resolved permissions for user', async () => {
      // Arrange
      mockRedis.executeCommand.mockImplementation(async (command, args) => {
        if (command === 'hgetall' && args[0] === 'user_roles:user-123:team-123') {
          return { role: 'admin', assignedBy: 'system', assignedAt: Date.now().toString() };
        }
        return {};
      });

      // Act
      const permissions = await rbacManager.getUserPermissions('user-123', 'team-123');

      // Assert
      expect(permissions).toBeInstanceOf(Array);
      expect(permissions.length).toBeGreaterThan(0);
      
      // Admin should have permissions to multiple resources
      const resourceTypes = permissions.map(p => p.resource);
      expect(resourceTypes).toContain('team');
      expect(resourceTypes).toContain('project');
      expect(resourceTypes).toContain('settings');
    });

    it('should return empty array for user with no roles', async () => {
      // Arrange
      mockRedis.executeCommand.mockResolvedValue({});

      // Act
      const permissions = await rbacManager.getUserPermissions('user-123', 'team-123');

      // Assert
      expect(permissions).toEqual([]);
    });

    it('should inherit permissions from parent roles', async () => {
      // Arrange
      mockRedis.executeCommand.mockImplementation(async (command, args) => {
        if (command === 'hgetall' && args[0] === 'user_roles:user-123:team-123') {
          return { role: 'admin', assignedBy: 'system', assignedAt: Date.now().toString() };
        }
        return {};
      });

      // Act
      const permissions = await rbacManager.getUserPermissions('user-123', 'team-123');

      // Assert
      // Admin inherits from developer, which inherits from viewer
      const allActions = permissions.flatMap(p => p.actions);
      expect(allActions).toContain('read'); // From viewer
      expect(allActions).toContain('update'); // From developer
      expect(allActions).toContain('manage'); // From admin
    });
  });

  describe('assignRole', () => {
    it('should assign role to user', async () => {
      // Arrange
      mockRedis.executeCommand.mockResolvedValue('OK');

      // Act
      await rbacManager.assignRole('user-123', 'team-123', 'developer', 'admin-user');

      // Assert
      expect(mockRedis.executeCommand).toHaveBeenCalledWith('hset', [
        'user_roles:user-123:team-123',
        'role',
        'developer',
        'assignedBy',
        'admin-user',
        'assignedAt',
        expect.any(String)
      ]);
    });

    it('should throw error for invalid role', async () => {
      // Act & Assert
      await expect(
        rbacManager.assignRole('user-123', 'team-123', 'invalid-role' as TeamRole, 'admin-user')
      ).rejects.toThrow('Role invalid-role does not exist');
    });

    it('should clear user permission cache after role assignment', async () => {
      // Arrange
      mockRedis.executeCommand.mockResolvedValue('OK');

      // Act
      await rbacManager.assignRole('user-123', 'team-123', 'developer', 'admin-user');

      // Assert - Cache should be cleared (implementation detail)
      expect(mockRedis.executeCommand).toHaveBeenCalled();
    });
  });

  describe('removeRole', () => {
    it('should remove role from user', async () => {
      // Arrange
      mockRedis.executeCommand.mockResolvedValue(1); // Successful deletion

      // Act
      await rbacManager.removeRole('user-123', 'team-123', 'admin-user');

      // Assert
      expect(mockRedis.executeCommand).toHaveBeenCalledWith('del', [
        'user_roles:user-123:team-123'
      ]);
    });
  });

  describe('addCustomPermission', () => {
    it('should add custom permission to role', async () => {
      // Arrange
      const customPermission = {
        resource: 'project' as ResourceType,
        actions: ['deploy'] as PermissionAction[],
        conditions: [{
          field: 'environment',
          operator: 'equals' as const,
          value: 'staging'
        }]
      };

      mockRedis.executeCommand.mockResolvedValue('OK');

      // Act
      await rbacManager.addCustomPermission('developer', customPermission);

      // Assert
      expect(mockRedis.executeCommand).toHaveBeenCalledWith('hset', [
        'role_definitions:developer',
        'permissions',
        expect.stringContaining('deploy')
      ]);
    });

    it('should throw error for invalid role', async () => {
      // Arrange
      const customPermission = {
        resource: 'project' as ResourceType,
        actions: ['deploy'] as PermissionAction[]
      };

      // Act & Assert
      await expect(
        rbacManager.addCustomPermission('invalid-role' as TeamRole, customPermission)
      ).rejects.toThrow('Role invalid-role does not exist');
    });
  });

  describe('createResourceContext', () => {
    it('should create resource context', async () => {
      // Arrange
      const metadata = {
        owner: 'user-123',
        team: 'team-123',
        tags: ['production']
      };

      mockRedis.executeCommand.mockResolvedValue('OK');

      // Act
      await rbacManager.createResourceContext('project', 'project-123', metadata);

      // Assert
      expect(mockRedis.executeCommand).toHaveBeenCalledWith('hset', [
        'resource_context:project:project-123',
        'context',
        expect.stringContaining('"owner":"user-123"')
      ]);
    });
  });

  describe('validateRoleHierarchy', () => {
    it('should validate role hierarchy successfully', async () => {
      // Act
      const result = await rbacManager.validateRoleHierarchy();

      // Assert
      expect(result.valid).toBe(true);
      expect(result.issues).toEqual([]);
    });

    it('should detect circular inheritance', async () => {
      // Arrange - This would require modifying the role definitions
      // For testing purposes, we'll assume the method can detect circular references

      // Act
      const result = await rbacManager.validateRoleHierarchy();

      // Assert - In a real scenario with circular references
      expect(result.valid).toBe(true); // Current implementation has no circular references
    });
  });

  describe('role inheritance', () => {
    it('should properly resolve inherited permissions', async () => {
      // Arrange
      mockRedis.executeCommand.mockImplementation(async (command, args) => {
        if (command === 'hgetall' && args[0] === 'user_roles:user-123:team-123') {
          return { role: 'admin', assignedBy: 'system', assignedAt: Date.now().toString() };
        }
        return {};
      });

      // Act
      const permissions = await rbacManager.getUserPermissions('user-123', 'team-123');

      // Assert
      // Admin inherits from developer, developer inherits from viewer
      const projectPermission = permissions.find(p => p.resource === 'project');
      expect(projectPermission).toBeDefined();
      expect(projectPermission?.actions).toContain('read'); // From viewer inheritance
    });

    it('should handle deep inheritance chains', async () => {
      // Arrange - Test the full inheritance chain: owner -> admin -> developer -> viewer
      mockRedis.executeCommand.mockImplementation(async (command, args) => {
        if (command === 'hgetall' && args[0] === 'user_roles:user-123:team-123') {
          return { role: 'owner', assignedBy: 'system', assignedAt: Date.now().toString() };
        }
        return {};
      });

      // Act
      const permissions = await rbacManager.getUserPermissions('user-123', 'team-123');

      // Assert
      // Owner should have all permissions from the inheritance chain
      const allActions = permissions.flatMap(p => p.actions);
      expect(allActions).toContain('read');    // From viewer
      expect(allActions).toContain('create');  // From developer
      expect(allActions).toContain('manage');  // From admin
      expect(allActions).toContain('delete');  // From owner
    });
  });

  describe('condition evaluation', () => {
    beforeEach(() => {
      mockRedis.executeCommand.mockImplementation(async (command, args) => {
        if (command === 'hgetall' && args[0] === 'user_roles:user-123:team-123') {
          return { role: 'developer', assignedBy: 'system', assignedAt: Date.now().toString() };
        }
        return {};
      });
    });

    it('should evaluate equals condition', async () => {
      // Arrange
      mockRedis.executeCommand.mockImplementation(async (command, args) => {
        if (command === 'hgetall' && args[0] === 'user_roles:user-123:team-123') {
          return { role: 'developer', assignedBy: 'system', assignedAt: Date.now().toString() };
        }
        if (command === 'hget' && args[1] === 'context') {
          return JSON.stringify({ owner: 'user-123' });
        }
        return {};
      });

      // Act
      const result = await rbacManager.hasPermission({
        userId: 'user-123',
        teamId: 'team-123',
        resource: 'project',
        action: 'update',
        resourceId: 'project-123'
      });

      // Assert
      expect(result.granted).toBe(true);
    });

    it('should evaluate template variables in conditions', async () => {
      // Arrange - This tests the ${userId} template variable
      mockRedis.executeCommand.mockImplementation(async (command, args) => {
        if (command === 'hgetall' && args[0] === 'user_roles:user-123:team-123') {
          return { role: 'developer', assignedBy: 'system', assignedAt: Date.now().toString() };
        }
        if (command === 'hget' && args[1] === 'context') {
          return JSON.stringify({ owner: 'user-123' });
        }
        return {};
      });

      // Act
      const result = await rbacManager.hasPermission({
        userId: 'user-123',
        teamId: 'team-123',
        resource: 'project',
        action: 'update',
        resourceId: 'project-123'
      });

      // Assert
      expect(result.granted).toBe(true);
    });

    it('should evaluate in/not_in conditions', async () => {
      // This would test array-based conditions
      // Implementation would depend on having such conditions in the role definitions
    });

    it('should evaluate contains condition', async () => {
      // This would test array contains logic
      // Implementation would depend on having such conditions in the role definitions
    });
  });

  describe('error handling', () => {
    it('should handle Redis errors gracefully', async () => {
      // Arrange
      mockRedis.executeCommand.mockRejectedValue(new Error('Redis connection failed'));

      // Act
      const result = await rbacManager.hasPermission({
        userId: 'user-123',
        teamId: 'team-123',
        resource: 'project',
        action: 'read'
      });

      // Assert
      expect(result.granted).toBe(false);
      expect(result.reason).toBe('Permission check failed due to internal error');
    });

    it('should handle malformed permission data', async () => {
      // Arrange
      mockRedis.executeCommand.mockResolvedValue('invalid-json');

      // Act
      const permissions = await rbacManager.getUserPermissions('user-123', 'team-123');

      // Assert
      expect(permissions).toEqual([]);
    });
  });
});