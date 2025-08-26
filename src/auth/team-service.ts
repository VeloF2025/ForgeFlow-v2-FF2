/**
 * Team Service for ForgeFlow v2
 * Comprehensive team management with invitations, member management, and RBAC integration
 */

import crypto from 'crypto';
import { Logger } from '../utils/enhanced-logger';
import { RedisConnectionManager } from '../infrastructure/redis/redis-connection-manager';
import { RBACManager } from './rbac-manager';
import {
  Team,
  TeamMember,
  TeamInvitation,
  TeamRole,
  TeamStatus,
  TeamPlan,
  InvitationStatus,
  InviteRequest,
  InviteResponse,
  ResolvedPermission,
  ResourceType,
  PermissionAction,
  AuthenticationError,
  AuthorizationError,
  ValidationError,
  ITeamService
} from './types';

export interface TeamServiceConfig {
  maxTeamSize: number;
  invitationTTL: number; // in seconds
  defaultRole: TeamRole;
  allowSelfRegistration: boolean;
  requireApproval: boolean;
  maxTeamsPerUser: number;
  slugMinLength: number;
  slugMaxLength: number;
}

// 🟢 WORKING: Comprehensive team management service
export class TeamService implements ITeamService {
  private readonly logger = Logger.getInstance().child({ component: 'TeamService' });
  private readonly redis: RedisConnectionManager;
  private readonly rbac: RBACManager;
  private readonly config: TeamServiceConfig;

  constructor(
    redis: RedisConnectionManager,
    rbac: RBACManager,
    config?: Partial<TeamServiceConfig>
  ) {
    this.redis = redis;
    this.rbac = rbac;
    this.config = {
      maxTeamSize: 50,
      invitationTTL: 7 * 24 * 60 * 60, // 7 days
      defaultRole: 'developer',
      allowSelfRegistration: false,
      requireApproval: true,
      maxTeamsPerUser: 10,
      slugMinLength: 3,
      slugMaxLength: 30,
      ...config
    };
  }

  /**
   * Create a new team
   */
  async createTeam(
    userId: string,
    name: string,
    plan: TeamPlan = 'free'
  ): Promise<Team> {
    try {
      // Validate team name
      this.validateTeamName(name);

      // Check if user has reached team limit
      await this.checkUserTeamLimit(userId);

      // Generate unique slug
      const slug = await this.generateUniqueSlug(name);

      const teamId = `team_${crypto.randomBytes(16).toString('hex')}`;
      const now = new Date();

      const team: Team = {
        id: teamId,
        name: name.trim(),
        slug,
        plan,
        status: 'active' as TeamStatus,
        settings: {
          visibility: 'private',
          joinApproval: this.config.requireApproval,
          twoFactorRequired: false,
          sessionTimeout: 24 * 60 * 60, // 24 hours
          allowedDomains: [],
          ssoOnly: false
        },
        limits: this.getTeamLimits(plan),
        createdAt: now,
        updatedAt: now
      };

      // Store team
      await this.storeTeam(team);

      // Add creator as owner
      await this.addTeamMember(teamId, userId, 'owner', userId, 'Team creator');

      this.logger.info('Team created successfully', {
        teamId,
        name,
        slug,
        plan,
        ownerId: userId
      });

      return team;
    } catch (error) {
      this.logger.error('Failed to create team', { error, userId, name });
      throw error;
    }
  }

  /**
   * Get team by ID
   */
  async getTeam(teamId: string): Promise<Team | null> {
    try {
      const teamData = await this.redis.executeCommand<Record<string, string>>(
        'hgetall',
        [`teams:${teamId}`]
      );

      if (!teamData || Object.keys(teamData).length === 0) {
        return null;
      }

      return this.parseTeamData(teamData);
    } catch (error) {
      this.logger.error('Failed to get team', { error, teamId });
      return null;
    }
  }

  /**
   * Get team by slug
   */
  async getTeamBySlug(slug: string): Promise<Team | null> {
    try {
      const teamId = await this.redis.executeCommand<string>(
        'get',
        [`team_slugs:${slug.toLowerCase()}`]
      );

      if (!teamId) {
        return null;
      }

      return await this.getTeam(teamId);
    } catch (error) {
      this.logger.error('Failed to get team by slug', { error, slug });
      return null;
    }
  }

  /**
   * Update team
   */
  async updateTeam(teamId: string, updates: Partial<Team>): Promise<Team> {
    try {
      const team = await this.getTeam(teamId);
      if (!team) {
        throw new AuthenticationError(
          'Team not found',
          'TEAM_NOT_FOUND',
          404
        );
      }

      // Validate updates
      if (updates.name) {
        this.validateTeamName(updates.name);
      }

      if (updates.slug) {
        await this.validateSlugAvailability(updates.slug, teamId);
      }

      // Apply updates
      const updatedTeam: Team = {
        ...team,
        ...updates,
        updatedAt: new Date()
      };

      // Handle slug change
      if (updates.slug && updates.slug !== team.slug) {
        await this.updateTeamSlug(teamId, team.slug, updates.slug);
      }

      await this.storeTeam(updatedTeam);

      this.logger.info('Team updated successfully', {
        teamId,
        updates: Object.keys(updates)
      });

      return updatedTeam;
    } catch (error) {
      this.logger.error('Failed to update team', { error, teamId });
      throw error;
    }
  }

  /**
   * Delete team
   */
  async deleteTeam(teamId: string): Promise<void> {
    try {
      const team = await this.getTeam(teamId);
      if (!team) {
        throw new AuthenticationError(
          'Team not found',
          'TEAM_NOT_FOUND',
          404
        );
      }

      // Get all team members
      const members = await this.getTeamMembers(teamId);

      // Remove all members
      for (const member of members) {
        await this.removeMember(teamId, member.id);
      }

      // Delete team data
      await Promise.all([
        this.redis.executeCommand('del', [`teams:${teamId}`]),
        this.redis.executeCommand('del', [`team_slugs:${team.slug}`]),
        this.redis.executeCommand('del', [`team_members:${teamId}`]),
        this.redis.executeCommand('del', [`team_invitations:${teamId}`])
      ]);

      this.logger.info('Team deleted successfully', {
        teamId,
        name: team.name,
        memberCount: members.length
      });
    } catch (error) {
      this.logger.error('Failed to delete team', { error, teamId });
      throw error;
    }
  }

  /**
   * Invite member to team
   */
  async inviteMember(
    teamId: string,
    invitedBy: string,
    request: InviteRequest
  ): Promise<InviteResponse> {
    try {
      // Validate team exists
      const team = await this.getTeam(teamId);
      if (!team) {
        throw new AuthenticationError(
          'Team not found',
          'TEAM_NOT_FOUND',
          404
        );
      }

      // Check team size limit
      await this.checkTeamSizeLimit(teamId);

      // Check if user is already a member or has pending invitation
      const existingMember = await this.getTeamMemberByEmail(teamId, request.email);
      if (existingMember) {
        throw new ValidationError([{
          field: 'email',
          message: 'User is already a team member'
        }]);
      }

      const existingInvitation = await this.getPendingInvitation(teamId, request.email);
      if (existingInvitation) {
        throw new ValidationError([{
          field: 'email',
          message: 'User already has a pending invitation'
        }]);
      }

      // Generate invitation
      const invitationId = `inv_${crypto.randomBytes(16).toString('hex')}`;
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(
        Date.now() + (request.expiresIn || this.config.invitationTTL) * 1000
      );

      const invitation: TeamInvitation = {
        id: invitationId,
        teamId,
        email: request.email.toLowerCase().trim(),
        role: request.role,
        permissions: request.permissions || [],
        status: 'pending',
        token,
        invitedBy,
        message: request.message,
        metadata: {},
        expiresAt,
        createdAt: new Date()
      };

      // Store invitation
      await this.storeInvitation(invitation);

      // Generate invite URL
      const inviteUrl = `${process.env.APP_URL || 'http://localhost:3000'}/invite/${token}`;

      this.logger.info('Team invitation created', {
        invitationId,
        teamId,
        email: request.email,
        role: request.role,
        invitedBy,
        expiresAt
      });

      return {
        invitation: {
          ...invitation,
          token: undefined as any // Don't return token in response
        },
        inviteUrl
      };
    } catch (error) {
      this.logger.error('Failed to invite member', { error, teamId, email: request.email });
      throw error;
    }
  }

  /**
   * Accept team invitation
   */
  async acceptInvitation(token: string, userId?: string): Promise<TeamMember> {
    try {
      // Get invitation by token
      const invitation = await this.getInvitationByToken(token);
      if (!invitation) {
        throw new AuthenticationError(
          'Invalid or expired invitation',
          'INVALID_INVITATION',
          400
        );
      }

      // Check if invitation is still valid
      if (invitation.status !== 'pending') {
        throw new AuthenticationError(
          `Invitation has already been ${invitation.status}`,
          'INVITATION_ALREADY_PROCESSED',
          400
        );
      }

      if (new Date() > invitation.expiresAt) {
        throw new AuthenticationError(
          'Invitation has expired',
          'INVITATION_EXPIRED',
          400
        );
      }

      // If userId not provided, this is a sign-up flow
      let finalUserId = userId;
      if (!finalUserId) {
        // User will need to complete registration
        // For now, we'll throw an error requiring user authentication
        throw new AuthenticationError(
          'User must be authenticated to accept invitation',
          'AUTHENTICATION_REQUIRED',
          401
        );
      }

      // Add user to team
      const member = await this.addTeamMember(
        invitation.teamId,
        finalUserId,
        invitation.role,
        invitation.invitedBy,
        'Invitation accepted'
      );

      // Update invitation status
      await this.updateInvitationStatus(invitation.id, 'accepted', finalUserId);

      this.logger.info('Team invitation accepted', {
        invitationId: invitation.id,
        teamId: invitation.teamId,
        userId: finalUserId,
        role: invitation.role
      });

      return member;
    } catch (error) {
      this.logger.error('Failed to accept invitation', { error, token });
      throw error;
    }
  }

  /**
   * Reject team invitation
   */
  async rejectInvitation(token: string): Promise<void> {
    try {
      const invitation = await this.getInvitationByToken(token);
      if (!invitation) {
        throw new AuthenticationError(
          'Invalid or expired invitation',
          'INVALID_INVITATION',
          400
        );
      }

      if (invitation.status !== 'pending') {
        throw new AuthenticationError(
          `Invitation has already been ${invitation.status}`,
          'INVITATION_ALREADY_PROCESSED',
          400
        );
      }

      await this.updateInvitationStatus(invitation.id, 'rejected');

      this.logger.info('Team invitation rejected', {
        invitationId: invitation.id,
        teamId: invitation.teamId,
        email: invitation.email
      });
    } catch (error) {
      this.logger.error('Failed to reject invitation', { error, token });
      throw error;
    }
  }

  /**
   * Remove team member
   */
  async removeMember(teamId: string, memberId: string): Promise<void> {
    try {
      const member = await this.getTeamMember(teamId, memberId);
      if (!member) {
        throw new AuthenticationError(
          'Team member not found',
          'MEMBER_NOT_FOUND',
          404
        );
      }

      // Check if this is the last owner
      if (member.role === 'owner') {
        const owners = await this.getTeamMembersByRole(teamId, 'owner');
        if (owners.length === 1) {
          throw new AuthorizationError(
            'Cannot remove the last team owner',
            'LAST_OWNER_REMOVAL',
            400
          );
        }
      }

      // Remove member
      await Promise.all([
        this.redis.executeCommand('hdel', [`team_members:${teamId}`, memberId]),
        this.redis.executeCommand('del', [`user_teams:${member.userId}:${teamId}`]),
        this.rbac.removeRole(member.userId, teamId, 'system')
      ]);

      this.logger.info('Team member removed', {
        teamId,
        memberId,
        userId: member.userId,
        role: member.role
      });
    } catch (error) {
      this.logger.error('Failed to remove team member', { error, teamId, memberId });
      throw error;
    }
  }

  /**
   * Update member role
   */
  async updateMemberRole(
    teamId: string,
    memberId: string,
    role: TeamRole
  ): Promise<TeamMember> {
    try {
      const member = await this.getTeamMember(teamId, memberId);
      if (!member) {
        throw new AuthenticationError(
          'Team member not found',
          'MEMBER_NOT_FOUND',
          404
        );
      }

      // Check if this is the last owner being changed
      if (member.role === 'owner' && role !== 'owner') {
        const owners = await this.getTeamMembersByRole(teamId, 'owner');
        if (owners.length === 1) {
          throw new AuthorizationError(
            'Cannot change role of the last team owner',
            'LAST_OWNER_ROLE_CHANGE',
            400
          );
        }
      }

      // Update member role
      const updatedMember: TeamMember = {
        ...member,
        role,
        metadata: {
          ...member.metadata,
          roleChangedAt: new Date().toISOString()
        }
      };

      await Promise.all([
        this.storeMember(teamId, updatedMember),
        this.rbac.assignRole(member.userId, teamId, role, 'system')
      ]);

      this.logger.info('Team member role updated', {
        teamId,
        memberId,
        userId: member.userId,
        oldRole: member.role,
        newRole: role
      });

      return updatedMember;
    } catch (error) {
      this.logger.error('Failed to update member role', {
        error,
        teamId,
        memberId,
        role
      });
      throw error;
    }
  }

  /**
   * Check if user has permission
   */
  async hasPermission(
    userId: string,
    teamId: string,
    resource: ResourceType,
    action: PermissionAction,
    resourceId?: string
  ): Promise<boolean> {
    const result = await this.rbac.hasPermission({
      userId,
      teamId,
      resource,
      action,
      resourceId
    });

    return result.granted;
  }

  /**
   * Get user permissions in team
   */
  async getUserPermissions(userId: string, teamId: string): Promise<ResolvedPermission[]> {
    return await this.rbac.getUserPermissions(userId, teamId);
  }

  /**
   * Get team members
   */
  async getTeamMembers(teamId: string): Promise<TeamMember[]> {
    try {
      const memberData = await this.redis.executeCommand<Record<string, string>>(
        'hgetall',
        [`team_members:${teamId}`]
      );

      if (!memberData || Object.keys(memberData).length === 0) {
        return [];
      }

      const members: TeamMember[] = [];
      for (const [memberId, memberStr] of Object.entries(memberData)) {
        try {
          const member = JSON.parse(memberStr) as TeamMember;
          members.push({
            ...member,
            joinedAt: member.joinedAt ? new Date(member.joinedAt) : undefined,
            invitedAt: member.invitedAt ? new Date(member.invitedAt) : undefined,
            lastActive: member.lastActive ? new Date(member.lastActive) : undefined
          });
        } catch (error) {
          this.logger.warn('Failed to parse member data', { error, memberId });
        }
      }

      return members.sort((a, b) => {
        // Sort by role importance, then by join date
        const roleOrder = { owner: 0, admin: 1, developer: 2, viewer: 3, guest: 4 };
        const roleComparison = (roleOrder[a.role] || 5) - (roleOrder[b.role] || 5);
        
        if (roleComparison !== 0) return roleComparison;
        
        const aDate = a.joinedAt || a.invitedAt || new Date(0);
        const bDate = b.joinedAt || b.invitedAt || new Date(0);
        return aDate.getTime() - bDate.getTime();
      });
    } catch (error) {
      this.logger.error('Failed to get team members', { error, teamId });
      return [];
    }
  }

  /**
   * Get team invitations
   */
  async getTeamInvitations(teamId: string): Promise<TeamInvitation[]> {
    try {
      const invitationData = await this.redis.executeCommand<Record<string, string>>(
        'hgetall',
        [`team_invitations:${teamId}`]
      );

      if (!invitationData || Object.keys(invitationData).length === 0) {
        return [];
      }

      const invitations: TeamInvitation[] = [];
      for (const [invitationId, invitationStr] of Object.entries(invitationData)) {
        try {
          const invitation = JSON.parse(invitationStr) as TeamInvitation;
          invitations.push({
            ...invitation,
            createdAt: new Date(invitation.createdAt),
            expiresAt: new Date(invitation.expiresAt),
            acceptedAt: invitation.acceptedAt ? new Date(invitation.acceptedAt) : undefined,
            rejectedAt: invitation.rejectedAt ? new Date(invitation.rejectedAt) : undefined
          });
        } catch (error) {
          this.logger.warn('Failed to parse invitation data', { error, invitationId });
        }
      }

      return invitations.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    } catch (error) {
      this.logger.error('Failed to get team invitations', { error, teamId });
      return [];
    }
  }

  // 🟡 PARTIAL: Private helper methods
  private validateTeamName(name: string): void {
    if (!name || name.trim().length === 0) {
      throw new ValidationError([{
        field: 'name',
        message: 'Team name is required'
      }]);
    }

    if (name.length > 100) {
      throw new ValidationError([{
        field: 'name',
        message: 'Team name must be less than 100 characters'
      }]);
    }
  }

  private async generateUniqueSlug(name: string): Promise<string> {
    let baseSlug = name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    // Ensure slug meets length requirements
    if (baseSlug.length < this.config.slugMinLength) {
      baseSlug = baseSlug.padEnd(this.config.slugMinLength, '0');
    }

    if (baseSlug.length > this.config.slugMaxLength) {
      baseSlug = baseSlug.substring(0, this.config.slugMaxLength);
    }

    // Check uniqueness
    let slug = baseSlug;
    let counter = 1;

    while (await this.isSlugTaken(slug)) {
      slug = `${baseSlug}-${counter}`;
      counter++;

      if (counter > 100) {
        // Fallback to random string
        slug = `${baseSlug}-${crypto.randomBytes(4).toString('hex')}`;
        break;
      }
    }

    return slug;
  }

  private async isSlugTaken(slug: string): Promise<boolean> {
    const teamId = await this.redis.executeCommand<string>(
      'get',
      [`team_slugs:${slug.toLowerCase()}`]
    );
    return !!teamId;
  }

  private async validateSlugAvailability(slug: string, excludeTeamId: string): Promise<void> {
    const existingTeamId = await this.redis.executeCommand<string>(
      'get',
      [`team_slugs:${slug.toLowerCase()}`]
    );

    if (existingTeamId && existingTeamId !== excludeTeamId) {
      throw new ValidationError([{
        field: 'slug',
        message: 'Team slug is already taken'
      }]);
    }
  }

  private async checkUserTeamLimit(userId: string): Promise<void> {
    const userTeams = await this.redis.executeCommand<string[]>(
      'keys',
      [`user_teams:${userId}:*`]
    );

    if (userTeams.length >= this.config.maxTeamsPerUser) {
      throw new AuthorizationError(
        `User has reached maximum team limit (${this.config.maxTeamsPerUser})`,
        'TEAM_LIMIT_EXCEEDED',
        400
      );
    }
  }

  private async checkTeamSizeLimit(teamId: string): Promise<void> {
    const members = await this.getTeamMembers(teamId);
    
    if (members.length >= this.config.maxTeamSize) {
      throw new AuthorizationError(
        `Team has reached maximum size limit (${this.config.maxTeamSize})`,
        'TEAM_SIZE_LIMIT_EXCEEDED',
        400
      );
    }
  }

  private getTeamLimits(plan: TeamPlan) {
    switch (plan) {
      case 'free':
        return {
          maxMembers: 5,
          maxProjects: 3,
          maxStorageGB: 1,
          maxApiCalls: 1000
        };
      case 'pro':
        return {
          maxMembers: 25,
          maxProjects: 25,
          maxStorageGB: 10,
          maxApiCalls: 10000
        };
      case 'enterprise':
        return {
          maxMembers: 500,
          maxProjects: 1000,
          maxStorageGB: 100,
          maxApiCalls: 100000
        };
      default:
        return {
          maxMembers: 5,
          maxProjects: 3,
          maxStorageGB: 1,
          maxApiCalls: 1000
        };
    }
  }

  private async storeTeam(team: Team): Promise<void> {
    await Promise.all([
      // Store team data
      this.redis.executeCommand('hmset', [
        `teams:${team.id}`,
        'id', team.id,
        'name', team.name,
        'slug', team.slug,
        'description', team.description || '',
        'avatar', team.avatar || '',
        'plan', team.plan,
        'status', team.status,
        'settings', JSON.stringify(team.settings),
        'limits', JSON.stringify(team.limits),
        'billing', JSON.stringify(team.billing || {}),
        'createdAt', team.createdAt.toISOString(),
        'updatedAt', team.updatedAt.toISOString()
      ]),
      // Map slug to team ID
      this.redis.executeCommand('set', [`team_slugs:${team.slug}`, team.id])
    ]);
  }

  private parseTeamData(data: Record<string, string>): Team {
    return {
      id: data.id,
      name: data.name,
      slug: data.slug,
      description: data.description || undefined,
      avatar: data.avatar || undefined,
      plan: data.plan as TeamPlan,
      status: data.status as TeamStatus,
      settings: JSON.parse(data.settings),
      limits: JSON.parse(data.limits),
      billing: data.billing ? JSON.parse(data.billing) : undefined,
      createdAt: new Date(data.createdAt),
      updatedAt: new Date(data.updatedAt)
    };
  }

  private async updateTeamSlug(teamId: string, oldSlug: string, newSlug: string): Promise<void> {
    await Promise.all([
      this.redis.executeCommand('del', [`team_slugs:${oldSlug}`]),
      this.redis.executeCommand('set', [`team_slugs:${newSlug}`, teamId])
    ]);
  }

  private async addTeamMember(
    teamId: string,
    userId: string,
    role: TeamRole,
    addedBy: string,
    reason: string
  ): Promise<TeamMember> {
    const memberId = `mbr_${crypto.randomBytes(16).toString('hex')}`;
    const now = new Date();

    const member: TeamMember = {
      id: memberId,
      userId,
      teamId,
      role,
      permissions: [],
      status: 'active',
      invitedBy: addedBy,
      joinedAt: now,
      metadata: {
        reason,
        addedBy,
        addedAt: now.toISOString()
      }
    };

    await Promise.all([
      this.storeMember(teamId, member),
      this.redis.executeCommand('set', [`user_teams:${userId}:${teamId}`, memberId]),
      this.rbac.assignRole(userId, teamId, role, addedBy)
    ]);

    return member;
  }

  private async storeMember(teamId: string, member: TeamMember): Promise<void> {
    await this.redis.executeCommand('hset', [
      `team_members:${teamId}`,
      member.id,
      JSON.stringify(member)
    ]);
  }

  private async getTeamMember(teamId: string, memberId: string): Promise<TeamMember | null> {
    try {
      const memberStr = await this.redis.executeCommand<string>(
        'hget',
        [`team_members:${teamId}`, memberId]
      );

      if (!memberStr) {
        return null;
      }

      const member = JSON.parse(memberStr) as TeamMember;
      return {
        ...member,
        joinedAt: member.joinedAt ? new Date(member.joinedAt) : undefined,
        invitedAt: member.invitedAt ? new Date(member.invitedAt) : undefined,
        lastActive: member.lastActive ? new Date(member.lastActive) : undefined
      };
    } catch {
      return null;
    }
  }

  private async getTeamMemberByEmail(teamId: string, email: string): Promise<TeamMember | null> {
    // This would require user service integration to map email to userId
    // For now, return null (assuming email-based lookups are handled elsewhere)
    return null;
  }

  private async getTeamMembersByRole(teamId: string, role: TeamRole): Promise<TeamMember[]> {
    const members = await this.getTeamMembers(teamId);
    return members.filter(member => member.role === role);
  }

  private async storeInvitation(invitation: TeamInvitation): Promise<void> {
    await Promise.all([
      // Store invitation data
      this.redis.executeCommand('hset', [
        `team_invitations:${invitation.teamId}`,
        invitation.id,
        JSON.stringify(invitation)
      ]),
      // Map token to invitation
      this.redis.executeCommand('setex', [
        `invitation_tokens:${invitation.token}`,
        this.config.invitationTTL,
        invitation.id
      ])
    ]);
  }

  private async getInvitationByToken(token: string): Promise<TeamInvitation | null> {
    try {
      const invitationId = await this.redis.executeCommand<string>(
        'get',
        [`invitation_tokens:${token}`]
      );

      if (!invitationId) {
        return null;
      }

      // Find the team that contains this invitation
      const teamKeys = await this.redis.executeCommand<string[]>(
        'keys',
        ['team_invitations:*']
      );

      for (const teamKey of teamKeys) {
        const invitationStr = await this.redis.executeCommand<string>(
          'hget',
          [teamKey, invitationId]
        );

        if (invitationStr) {
          const invitation = JSON.parse(invitationStr) as TeamInvitation;
          return {
            ...invitation,
            createdAt: new Date(invitation.createdAt),
            expiresAt: new Date(invitation.expiresAt),
            acceptedAt: invitation.acceptedAt ? new Date(invitation.acceptedAt) : undefined,
            rejectedAt: invitation.rejectedAt ? new Date(invitation.rejectedAt) : undefined
          };
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  private async getPendingInvitation(teamId: string, email: string): Promise<TeamInvitation | null> {
    const invitations = await this.getTeamInvitations(teamId);
    return invitations.find(
      inv => inv.email === email.toLowerCase().trim() && inv.status === 'pending'
    ) || null;
  }

  private async updateInvitationStatus(
    invitationId: string,
    status: InvitationStatus,
    userId?: string
  ): Promise<void> {
    // Find and update the invitation
    const teamKeys = await this.redis.executeCommand<string[]>(
      'keys',
      ['team_invitations:*']
    );

    for (const teamKey of teamKeys) {
      const invitationStr = await this.redis.executeCommand<string>(
        'hget',
        [teamKey, invitationId]
      );

      if (invitationStr) {
        const invitation = JSON.parse(invitationStr) as TeamInvitation;
        const updatedInvitation = {
          ...invitation,
          status,
          ...(status === 'accepted' && userId && { acceptedAt: new Date() }),
          ...(status === 'rejected' && { rejectedAt: new Date() })
        };

        await this.redis.executeCommand('hset', [
          teamKey,
          invitationId,
          JSON.stringify(updatedInvitation)
        ]);
        break;
      }
    }
  }
}