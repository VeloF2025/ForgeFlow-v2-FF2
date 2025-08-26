# Contributing to ForgeFlow v2

Thank you for your interest in contributing to ForgeFlow v2! This guide will help you get started with contributing to our enterprise-grade AI orchestration platform.

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Contributing Process](#contributing-process)
- [Code Standards](#code-standards)
- [Testing Requirements](#testing-requirements)
- [Documentation Guidelines](#documentation-guidelines)
- [Security Guidelines](#security-guidelines)
- [Community Guidelines](#community-guidelines)

## Code of Conduct

This project adheres to the Contributor Covenant Code of Conduct. By participating, you are expected to uphold this code. Please report unacceptable behavior to the project maintainers.

### Our Standards

- **Be respectful**: Treat everyone with respect and kindness
- **Be collaborative**: Work together towards common goals
- **Be inclusive**: Welcome contributors from all backgrounds
- **Be constructive**: Provide helpful feedback and suggestions
- **Be professional**: Maintain professional standards in all interactions

## Getting Started

### Before You Start

1. **Read the documentation**: Familiarize yourself with the project
2. **Check existing issues**: Look for existing bugs or feature requests
3. **Join the discussion**: Participate in GitHub Discussions
4. **Understand the architecture**: Review the system design

### Ways to Contribute

- **Bug Reports**: Help us identify and fix issues
- **Feature Requests**: Suggest new features or improvements
- **Code Contributions**: Submit bug fixes or new features
- **Documentation**: Improve existing docs or create new ones
- **Testing**: Help improve test coverage and quality
- **Community Support**: Help other users in discussions

## Development Setup

### Prerequisites

- **Node.js**: 18.0.0 or higher
- **Docker**: 20.10 or higher with Docker Compose
- **Git**: 2.30 or higher
- **Redis**: 7.0 or higher (via Docker)

### Initial Setup

```bash
# 1. Fork and clone the repository
git clone https://github.com/YourUsername/forgeflow-v2.git
cd forgeflow-v2

# 2. Install dependencies
npm install

# 3. Set up environment
cp .env.example .env
cp .env.team.example .env.team

# 4. Start infrastructure
./setup-redis-dev.sh

# 5. Run tests to verify setup
npm test

# 6. Start development server
npm run dev
```

### Development Environment

```bash
# Build the project
npm run build

# Run in development mode with hot reload
npm run dev

# Run tests with coverage
npm run test:coverage

# Run linting and formatting
npm run lint
npm run format

# Validate code quality
npm run validate
```

## Contributing Process

### 1. Create an Issue

Before starting work, create or comment on an issue to:
- Describe the problem or feature
- Discuss the approach with maintainers
- Get feedback on your proposed solution
- Avoid duplicate work

### 2. Fork and Branch

```bash
# Create feature branch
git checkout -b feature/your-feature-name

# Or bug fix branch
git checkout -b fix/issue-description
```

### Branch Naming Conventions

- **Features**: `feature/short-description`
- **Bug fixes**: `fix/short-description`
- **Documentation**: `docs/short-description`
- **Refactoring**: `refactor/short-description`
- **Tests**: `test/short-description`

### 3. Develop and Test

```bash
# Make your changes
# Write tests for new functionality
# Update documentation as needed

# Run quality checks
npm run validate
npm run test:coverage
npm run lint

# Ensure all checks pass
npm run validate:production
```

### 4. Commit Changes

Use [Conventional Commits](https://conventionalcommits.org/) format:

```bash
# Examples
git commit -m "feat: add team collaboration Redis backend"
git commit -m "fix: resolve SQLite FTS5 graceful degradation"
git commit -m "docs: update team setup guide"
git commit -m "test: add integration tests for team commands"
```

#### Commit Types

- **feat**: New feature
- **fix**: Bug fix
- **docs**: Documentation changes
- **style**: Code style changes (formatting, etc.)
- **refactor**: Code refactoring
- **test**: Adding or updating tests
- **chore**: Maintenance tasks

### 5. Submit Pull Request

#### Pull Request Template

```markdown
## Description
Brief description of changes and why they're needed.

## Type of Change
- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to change)
- [ ] Documentation update

## Testing
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Manual testing completed
- [ ] Test coverage maintained/improved

## Checklist
- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Comments added to hard-to-understand areas
- [ ] Documentation updated
- [ ] No breaking changes without migration guide
```

#### PR Requirements

- **All tests pass**: Green CI/CD pipeline
- **Code review**: At least one maintainer approval
- **Documentation**: Updated for user-facing changes
- **Breaking changes**: Migration guide provided
- **Quality standards**: Meets all code standards

## Code Standards

### TypeScript Standards

```typescript
// Use strict TypeScript configuration
// No 'any' types allowed
// Prefer interfaces over types for objects
// Use explicit return types for functions

interface TeamConfig {
  readonly name: string;
  readonly description?: string;
  readonly maxMembers: number;
}

export async function createTeam(config: TeamConfig): Promise<Team> {
  // Implementation with proper error handling
  try {
    return await teamService.create(config);
  } catch (error) {
    throw new TeamCreationError(
      `Failed to create team: ${error.message}`,
      { cause: error }
    );
  }
}
```

### Code Quality Requirements

#### Zero Tolerance Standards
- **TypeScript Errors**: 0 compilation errors
- **ESLint Issues**: 0 errors, 0 warnings
- **Test Coverage**: >95% for new code
- **Security Vulnerabilities**: 0 high/critical issues
- **Performance**: <200ms API, <1.5s page load

#### File Organization
```
src/
├── core/           # Core orchestration logic
├── agents/         # AI agent implementations
├── memory/         # Memory and context management  
├── collaboration/  # Team collaboration features
├── utils/          # Shared utilities
├── types/          # TypeScript type definitions
└── __tests__/      # Test files
```

#### Naming Conventions
- **Files**: kebab-case (`team-manager.ts`)
- **Classes**: PascalCase (`TeamManager`)
- **Functions**: camelCase (`createTeam`)
- **Constants**: SCREAMING_SNAKE_CASE (`DEFAULT_TEAM_SIZE`)
- **Interfaces**: PascalCase with 'I' prefix optional (`TeamConfig`)

### Error Handling

```typescript
// Use custom error classes
export class TeamError extends Error {
  public readonly code: string;
  public readonly context?: Record<string, unknown>;

  constructor(message: string, code: string, context?: Record<string, unknown>) {
    super(message);
    this.name = 'TeamError';
    this.code = code;
    this.context = context;
  }
}

// Always provide meaningful error messages
throw new TeamError(
  'Failed to create team: invalid team name',
  'INVALID_TEAM_NAME',
  { teamName, validation: 'name must be 3-50 characters' }
);
```

### Security Standards

```typescript
// Input validation for all user inputs
import Joi from 'joi';

const teamSchema = Joi.object({
  name: Joi.string().min(3).max(50).required(),
  description: Joi.string().max(500).optional(),
  maxMembers: Joi.number().min(1).max(1000).required()
});

// Sanitize all database inputs
const sanitizedInput = validator.escape(userInput);

// Use parameterized queries
const result = await db.query(
  'SELECT * FROM teams WHERE name = ? AND owner_id = ?',
  [teamName, ownerId]
);
```

## Testing Requirements

### Test Coverage Standards

- **Unit Tests**: >95% coverage for new code
- **Integration Tests**: All API endpoints and workflows
- **End-to-End Tests**: Critical user journeys
- **Security Tests**: Authentication and authorization
- **Performance Tests**: Load and stress testing

### Test Categories

#### Unit Tests
```typescript
// src/team/__tests__/team-manager.test.ts
describe('TeamManager', () => {
  let teamManager: TeamManager;
  let mockRedis: jest.Mocked<Redis>;

  beforeEach(() => {
    mockRedis = createMockRedis();
    teamManager = new TeamManager(mockRedis);
  });

  describe('createTeam', () => {
    it('should create team with valid config', async () => {
      const config = { name: 'Test Team', maxMembers: 10 };
      const team = await teamManager.createTeam(config);
      
      expect(team.name).toBe('Test Team');
      expect(mockRedis.hset).toHaveBeenCalledWith(
        expect.stringMatching(/^ff2:team:/),
        expect.objectContaining(config)
      );
    });

    it('should throw error for invalid config', async () => {
      const config = { name: '', maxMembers: 0 };
      
      await expect(teamManager.createTeam(config))
        .rejects.toThrow('Invalid team configuration');
    });
  });
});
```

#### Integration Tests
```typescript
// tests/integration/team-collaboration.test.ts
describe('Team Collaboration Integration', () => {
  let app: Application;
  let redis: Redis;

  beforeAll(async () => {
    app = await createTestApp();
    redis = await createTestRedis();
  });

  afterAll(async () => {
    await cleanupTestData();
    await redis.quit();
  });

  it('should handle complete team workflow', async () => {
    // Create team
    const teamResponse = await request(app)
      .post('/api/teams')
      .send({ name: 'Integration Test Team' })
      .expect(201);

    // Invite member
    await request(app)
      .post(`/api/teams/${teamResponse.body.id}/invitations`)
      .send({ email: 'test@example.com', role: 'developer' })
      .expect(201);

    // Join team
    const joinResponse = await request(app)
      .post(`/api/teams/${teamResponse.body.id}/join`)
      .expect(200);

    expect(joinResponse.body.status).toBe('joined');
  });
});
```

### Test Commands

```bash
# Run all tests
npm test

# Run tests with coverage report
npm run test:coverage

# Run specific test suites
npm run test:unit
npm run test:integration
npm run test:e2e

# Run tests in watch mode
npm run test:watch

# Run performance tests
npm run test:performance
```

## Documentation Guidelines

### Documentation Requirements

- **README updates**: For user-facing changes
- **API documentation**: For all public APIs
- **Code comments**: For complex logic only
- **Migration guides**: For breaking changes
- **Examples**: For new features

### Documentation Standards

#### API Documentation
```typescript
/**
 * Creates a new team with the specified configuration.
 * 
 * @param config - Team configuration including name, description, and limits
 * @param options - Additional options for team creation
 * @returns Promise resolving to the created team object
 * 
 * @throws {TeamValidationError} When team configuration is invalid
 * @throws {TeamLimitError} When team limit exceeded for user
 * 
 * @example
 * ```typescript
 * const team = await createTeam({
 *   name: 'Development Team',
 *   description: 'Main development team',
 *   maxMembers: 25
 * });
 * ```
 */
export async function createTeam(
  config: TeamConfig,
  options?: TeamCreationOptions
): Promise<Team> {
  // Implementation
}
```

#### README Updates
- Update installation instructions for new dependencies
- Add new commands to command reference
- Update feature list for new capabilities
- Add troubleshooting for new known issues

## Security Guidelines

### Security Review Process

All contributions undergo security review for:

- **Input validation**: All user inputs properly validated
- **SQL injection**: Use parameterized queries
- **XSS prevention**: Sanitize all outputs
- **Authentication**: Proper auth checks in place
- **Authorization**: Role-based access controls
- **Data encryption**: Sensitive data encrypted
- **Secrets management**: No hardcoded secrets

### Security Best Practices

```typescript
// Input validation
const validateTeamName = (name: string): void => {
  if (!name || name.length < 3 || name.length > 50) {
    throw new ValidationError('Team name must be 3-50 characters');
  }
  
  if (!/^[a-zA-Z0-9\s-_]+$/.test(name)) {
    throw new ValidationError('Team name contains invalid characters');
  }
};

// Authentication checks
const requireAuth = (req: Request, res: Response, next: NextFunction): void => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Authorization checks  
const requireTeamAccess = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const { teamId } = req.params;
  const userId = req.user.id;
  
  const hasAccess = await teamService.checkAccess(userId, teamId);
  
  if (!hasAccess) {
    return res.status(403).json({ error: 'Access denied' });
  }
  
  next();
};
```

## Community Guidelines

### Communication Channels

- **GitHub Issues**: Bug reports and feature requests
- **GitHub Discussions**: Questions and community support
- **Pull Requests**: Code contributions and reviews
- **Discord/Slack**: Real-time community chat (if available)

### Issue Templates

#### Bug Report Template
```markdown
## Bug Description
Clear description of the bug

## Steps to Reproduce
1. Step one
2. Step two
3. Step three

## Expected Behavior
What should happen

## Actual Behavior
What actually happens

## Environment
- OS: [e.g. Windows 10, macOS 12, Ubuntu 22.04]
- Node.js: [e.g. 18.17.0]
- ForgeFlow v2: [e.g. 2.0.0]
- Docker: [e.g. 20.10.17]

## Additional Context
Screenshots, logs, or other relevant information
```

#### Feature Request Template
```markdown
## Feature Description
Clear description of the proposed feature

## Problem Statement
What problem does this solve?

## Proposed Solution
How should this feature work?

## Alternatives Considered
Other approaches you've considered

## Additional Context
Use cases, examples, or mockups
```

### Code Review Guidelines

#### For Contributors
- **Self-review first**: Review your own code before submitting
- **Small PRs**: Keep pull requests focused and manageable
- **Clear descriptions**: Explain what, why, and how
- **Respond promptly**: Address review feedback quickly
- **Be receptive**: Accept feedback gracefully

#### For Reviewers
- **Be constructive**: Provide helpful, specific feedback
- **Be timely**: Review PRs within 2-3 business days
- **Focus on code**: Review the code, not the person
- **Explain reasoning**: Help contributors understand suggestions
- **Approve when ready**: Don't hold up good contributions

### Recognition

Contributors are recognized through:
- **GitHub contributors page**: Automatic recognition
- **Release notes**: Major contributors mentioned
- **Community highlights**: Featured in project updates
- **Maintainer opportunities**: Outstanding contributors may be invited as maintainers

## Getting Help

### Where to Get Support

1. **Documentation**: Check existing docs first
2. **GitHub Issues**: Search existing issues
3. **GitHub Discussions**: Ask questions
4. **Code Comments**: Check inline documentation
5. **Community Chat**: Join real-time discussions

### Maintainer Contact

- **Project Lead**: Create GitHub issue for major questions
- **Security Issues**: Email security@forgeflow.dev
- **General Questions**: Use GitHub Discussions

---

## Thank You! 🚀

Thank you for contributing to ForgeFlow v2! Your contributions help make this project better for everyone in the AI development community.

**Happy coding!** 💙

---

*Last updated: August 2025 | Contributors: 100+ | Commits: 5000+*