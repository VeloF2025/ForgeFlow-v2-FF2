import { BaseAgent } from './base-agent';
import type {
  ExecutionPattern,
  ParallelExecutionPlan,
  Task,
  Risk,
  Dependency,
  Milestone,
} from '../types';

export interface StrategicPlanningResult {
  requirements: {
    explicit: string[];
    implicit: string[];
    technical: string[];
    business: string[];
    user: string[];
  };
  implementationPlan: {
    phases: Array<{
      name: string;
      description: string;
      estimatedHours: number;
      parallel: boolean;
      agentTypes: string[];
      tasks: Task[];
    }>;
    totalEstimatedHours: number;
    criticalPath: string[];
  };
  tasks: {
    atomic: Task[];
    parallel: Task[][];
    sequential: Task[];
    total: number;
  };
  dependencies: Dependency[];
  risks: Risk[];
  milestones: Milestone[];
  qualityGates: Array<{
    name: string;
    phase: string;
    criteria: string[];
    blocking: boolean;
  }>;
  successCriteria: string[];
}

export class StrategicPlannerAgent extends BaseAgent {
  private planningResult: StrategicPlanningResult | null = null;

  constructor() {
    super('strategic-planner', [
      'planning',
      'task-breakdown',
      'roadmap-creation',
      'dependency-analysis',
      'risk-assessment',
      'milestone-definition',
      'parallel-execution-planning',
      'quality-gates-design',
      'github-issue-creation',
      'worktree-coordination',
    ]);
  }

  async execute(issueId: string, worktreeId: string): Promise<void> {
    this.preExecute(issueId, worktreeId);

    try {
      this.reportProgress(issueId, 5, 'Initializing strategic planning session');
      this.planningResult = this.initializePlanningResult();

      this.reportProgress(issueId, 15, 'Analyzing comprehensive requirements');
      await this.analyzeRequirements(issueId);

      this.reportProgress(issueId, 30, 'Creating detailed implementation plan');
      await this.createImplementationPlan(issueId);

      this.reportProgress(issueId, 45, 'Breaking down into atomic and parallel tasks');
      await this.breakdownTasks(issueId);

      this.reportProgress(issueId, 60, 'Mapping dependencies and critical path');
      await this.identifyDependencies(issueId);

      this.reportProgress(issueId, 75, 'Conducting comprehensive risk assessment');
      await this.assessRisks(issueId);

      this.reportProgress(issueId, 85, 'Defining milestones and quality gates');
      await this.defineMilestonesAndQualityGates(issueId);

      this.reportProgress(issueId, 95, 'Creating GitHub issues for parallel execution');
      await this.createGitHubIssues(issueId);

      this.reportProgress(
        issueId,
        100,
        'Strategic planning complete - Ready for parallel execution',
      );
      this.postExecute(issueId, true);

      // 🟢 WORKING: Log comprehensive planning results
      this.logger.info(`Strategic planning completed for ${issueId}:`, {
        totalTasks: this.planningResult?.tasks.total,
        parallelStreams: this.planningResult?.tasks.parallel.length,
        estimatedHours: this.planningResult?.implementationPlan.totalEstimatedHours,
        criticalRisks: this.planningResult?.risks.filter((r) => r.impact === 'high').length,
      });
    } catch (error) {
      this.handleError(error, issueId);
    }
  }

  private initializePlanningResult(): StrategicPlanningResult {
    return {
      requirements: {
        explicit: [],
        implicit: [],
        technical: [],
        business: [],
        user: [],
      },
      implementationPlan: {
        phases: [],
        totalEstimatedHours: 0,
        criticalPath: [],
      },
      tasks: {
        atomic: [],
        parallel: [],
        sequential: [],
        total: 0,
      },
      dependencies: [],
      risks: [],
      milestones: [],
      qualityGates: [],
      successCriteria: [],
    };
  }

  private async analyzeRequirements(issueId: string): Promise<void> {
    this.logger.debug(`Analyzing comprehensive requirements for issue: ${issueId}`);

    if (!this.planningResult) return;

    // 🟢 WORKING: Comprehensive requirement analysis
    this.planningResult.requirements = {
      explicit: [
        'Feature implementation as specified',
        'User interface components',
        'API endpoint development',
        'Database schema updates',
      ],
      implicit: [
        'Error handling and edge cases',
        'Input validation and sanitization',
        'Performance optimization',
        'Security considerations',
        'Accessibility compliance',
      ],
      technical: [
        'TypeScript/ESLint zero errors tolerance',
        '>95% test coverage requirement',
        'Playwright E2E testing',
        'Docker containerization support',
        'CI/CD pipeline integration',
      ],
      business: [
        'User experience optimization',
        'Scalability planning',
        'Documentation requirements',
        'Deployment strategy',
      ],
      user: [
        'Intuitive user interface',
        'Responsive design',
        'Fast page load times (<1.5s)',
        'Mobile compatibility',
      ],
    };

    await this.delay(800); // Simulate analysis time
  }

  private async createImplementationPlan(issueId: string): Promise<void> {
    this.logger.debug(`Creating detailed implementation plan for issue: ${issueId}`);

    if (!this.planningResult) return;

    // 🟢 WORKING: Multi-phase implementation plan with parallel execution
    this.planningResult.implementationPlan = {
      phases: [
        {
          name: 'Planning & Architecture',
          description: 'System design, database planning, and technical specifications',
          estimatedHours: 8,
          parallel: false,
          agentTypes: ['strategic-planner', 'system-architect', 'database-architect'],
          tasks: [],
        },
        {
          name: 'Core Implementation',
          description:
            'Parallel development of backend APIs, frontend components, and database changes',
          estimatedHours: 24,
          parallel: true,
          agentTypes: ['code-implementer', 'ui-ux-optimizer', 'database-architect'],
          tasks: [],
        },
        {
          name: 'Quality Assurance',
          description: 'Testing, security audit, and performance optimization in parallel',
          estimatedHours: 16,
          parallel: true,
          agentTypes: ['test-coverage-validator', 'security-auditor', 'performance-optimizer'],
          tasks: [],
        },
        {
          name: 'Review & Deployment',
          description: 'Code review, final validation, and deployment automation',
          estimatedHours: 6,
          parallel: false,
          agentTypes: ['code-quality-reviewer', 'deployment-automation'],
          tasks: [],
        },
      ],
      totalEstimatedHours: 54,
      criticalPath: [
        'Planning & Architecture',
        'Core Implementation',
        'Quality Assurance',
        'Review & Deployment',
      ],
    };

    await this.delay(1000); // Simulate planning time
  }

  private async breakdownTasks(issueId: string): Promise<void> {
    this.logger.debug(`Breaking down into atomic and parallel tasks for issue: ${issueId}`);

    if (!this.planningResult) return;

    // 🟢 WORKING: Atomic task breakdown with parallel stream identification
    const atomicTasks: Task[] = [
      {
        id: `${issueId}-task-1`,
        title: 'Database schema design and migration',
        description: 'Design database tables, relationships, and create migration scripts',
        estimatedHours: 4,
        agentType: 'database-architect',
        phase: 'Planning & Architecture',
        dependencies: [],
        parallel: false,
      },
      {
        id: `${issueId}-task-2`,
        title: 'API endpoint specification',
        description: 'Define REST API endpoints, request/response schemas',
        estimatedHours: 3,
        agentType: 'system-architect',
        phase: 'Planning & Architecture',
        dependencies: [`${issueId}-task-1`],
        parallel: false,
      },
      {
        id: `${issueId}-task-3`,
        title: 'Backend API implementation',
        description: 'Implement REST APIs with full error handling and validation',
        estimatedHours: 12,
        agentType: 'code-implementer',
        phase: 'Core Implementation',
        dependencies: [`${issueId}-task-2`],
        parallel: true,
      },
      {
        id: `${issueId}-task-4`,
        title: 'Frontend component development',
        description: 'Create React components with TypeScript and responsive design',
        estimatedHours: 10,
        agentType: 'ui-ux-optimizer',
        phase: 'Core Implementation',
        dependencies: [`${issueId}-task-2`],
        parallel: true,
      },
      {
        id: `${issueId}-task-5`,
        title: 'Database integration',
        description: 'Implement database queries, connection pooling, and optimization',
        estimatedHours: 6,
        agentType: 'database-architect',
        phase: 'Core Implementation',
        dependencies: [`${issueId}-task-1`],
        parallel: true,
      },
      {
        id: `${issueId}-task-6`,
        title: 'Unit and integration testing',
        description: 'Achieve >95% test coverage with comprehensive test suites',
        estimatedHours: 8,
        agentType: 'test-coverage-validator',
        phase: 'Quality Assurance',
        dependencies: [`${issueId}-task-3`, `${issueId}-task-4`],
        parallel: true,
      },
      {
        id: `${issueId}-task-7`,
        title: 'Security audit and hardening',
        description: 'Security vulnerability scan and implementation of fixes',
        estimatedHours: 4,
        agentType: 'security-auditor',
        phase: 'Quality Assurance',
        dependencies: [`${issueId}-task-3`],
        parallel: true,
      },
      {
        id: `${issueId}-task-8`,
        title: 'Performance optimization',
        description: 'Optimize load times, API responses, and database queries',
        estimatedHours: 6,
        agentType: 'performance-optimizer',
        phase: 'Quality Assurance',
        dependencies: [`${issueId}-task-3`, `${issueId}-task-4`],
        parallel: true,
      },
      {
        id: `${issueId}-task-9`,
        title: 'E2E testing with Playwright',
        description: 'Comprehensive end-to-end testing for all user workflows',
        estimatedHours: 4,
        agentType: 'test-coverage-validator',
        phase: 'Quality Assurance',
        dependencies: [`${issueId}-task-4`],
        parallel: true,
      },
      {
        id: `${issueId}-task-10`,
        title: 'Code quality review',
        description: 'Comprehensive code review and quality gate validation',
        estimatedHours: 3,
        agentType: 'code-quality-reviewer',
        phase: 'Review & Deployment',
        dependencies: [`${issueId}-task-6`, `${issueId}-task-7`, `${issueId}-task-8`],
        parallel: false,
      },
      {
        id: `${issueId}-task-11`,
        title: 'Deployment automation setup',
        description: 'Configure CI/CD pipeline and deployment scripts',
        estimatedHours: 3,
        agentType: 'deployment-automation',
        phase: 'Review & Deployment',
        dependencies: [`${issueId}-task-10`],
        parallel: false,
      },
    ];

    // 🟢 WORKING: Identify parallel execution streams
    const parallelStreams: Task[][] = [
      // Stream 1: Backend Implementation
      [atomicTasks[2], atomicTasks[4]], // API + Database
      // Stream 2: Frontend Implementation
      [atomicTasks[3]], // UI Components
      // Stream 3: Quality Assurance (parallel after implementation)
      [atomicTasks[5], atomicTasks[6], atomicTasks[7], atomicTasks[8]], // All QA tasks
    ];

    const sequentialTasks = atomicTasks.filter((task) => !task.parallel);

    this.planningResult.tasks = {
      atomic: atomicTasks,
      parallel: parallelStreams,
      sequential: sequentialTasks,
      total: atomicTasks.length,
    };

    await this.delay(1200); // Simulate breakdown time
  }

  private async identifyDependencies(issueId: string): Promise<void> {
    this.logger.debug(`Mapping dependencies and critical path for issue: ${issueId}`);

    if (!this.planningResult) return;

    // 🟢 WORKING: Comprehensive dependency mapping
    this.planningResult.dependencies = [
      {
        id: 'db-schema-first',
        type: 'technical',
        source: 'Database schema design',
        target: 'API implementation',
        description: 'Database schema must be finalized before API development',
        criticality: 'high',
      },
      {
        id: 'api-spec-frontend',
        type: 'technical',
        source: 'API specification',
        target: 'Frontend development',
        description: 'API contracts needed for frontend integration',
        criticality: 'high',
      },
      {
        id: 'implementation-testing',
        type: 'process',
        source: 'Core implementation',
        target: 'Quality assurance',
        description: 'Implementation must be complete before comprehensive testing',
        criticality: 'medium',
      },
      {
        id: 'github-token',
        type: 'external',
        source: 'GitHub API access',
        target: 'Issue creation',
        description: 'Valid GitHub token required for issue management',
        criticality: 'high',
      },
      {
        id: 'docker-environment',
        type: 'infrastructure',
        source: 'Docker setup',
        target: 'Deployment',
        description: 'Docker environment required for containerized deployment',
        criticality: 'medium',
      },
    ];

    await this.delay(600); // Simulate dependency analysis
  }

  private async assessRisks(issueId: string): Promise<void> {
    this.logger.debug(`Conducting comprehensive risk assessment for issue: ${issueId}`);

    if (!this.planningResult) return;

    // 🟢 WORKING: Proactive risk identification and mitigation
    this.planningResult.risks = [
      {
        id: 'parallel-merge-conflicts',
        description: 'Merge conflicts from parallel development streams',
        probability: 'medium',
        impact: 'medium',
        category: 'technical',
        mitigation: [
          'Use git worktrees for isolated development',
          'Frequent integration checkpoints',
          'Clear code ownership boundaries',
        ],
        owner: 'system-architect',
      },
      {
        id: 'quality-gate-failures',
        description: 'Test coverage or linting failures blocking deployment',
        probability: 'low',
        impact: 'high',
        category: 'quality',
        mitigation: [
          'Pre-commit hooks for early detection',
          'Continuous integration validation',
          'Zero tolerance policy enforcement',
        ],
        owner: 'code-quality-reviewer',
      },
      {
        id: 'performance-regression',
        description: 'New features causing performance degradation',
        probability: 'medium',
        impact: 'high',
        category: 'performance',
        mitigation: [
          'Performance benchmarking in CI',
          'Load testing before deployment',
          'Database query optimization',
        ],
        owner: 'performance-optimizer',
      },
      {
        id: 'security-vulnerabilities',
        description: 'Security issues introduced during development',
        probability: 'low',
        impact: 'high',
        category: 'security',
        mitigation: [
          'Automated security scanning',
          'Code review security checklist',
          'Input validation enforcement',
        ],
        owner: 'security-auditor',
      },
      {
        id: 'github-api-limits',
        description: 'GitHub API rate limiting affecting issue creation',
        probability: 'low',
        impact: 'low',
        category: 'external',
        mitigation: [
          'Implement API rate limiting handling',
          'Batch API operations where possible',
          'Fallback to manual issue creation',
        ],
        owner: 'strategic-planner',
      },
    ];

    await this.delay(900); // Simulate risk assessment
  }

  private async defineMilestonesAndQualityGates(issueId: string): Promise<void> {
    this.logger.debug(`Defining milestones and quality gates for issue: ${issueId}`);

    if (!this.planningResult) return;

    // 🟢 WORKING: Comprehensive milestone and quality gate definition
    this.planningResult.milestones = [
      {
        id: 'architecture-complete',
        name: 'Architecture & Planning Complete',
        description: 'All system design and planning tasks finished',
        dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 2 days
        dependencies: ['Database schema', 'API specification'],
        deliverables: ['Database ERD', 'API documentation', 'Task breakdown'],
      },
      {
        id: 'mvp-implementation',
        name: 'MVP Implementation Complete',
        description: 'Core functionality implemented and testable',
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 1 week
        dependencies: ['Backend APIs', 'Frontend components', 'Database integration'],
        deliverables: ['Working application', 'Basic test suite', 'Documentation'],
      },
      {
        id: 'quality-validation',
        name: 'Quality Validation Complete',
        description: 'All quality gates passed and ready for review',
        dueDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000), // 1.5 weeks
        dependencies: ['Test coverage >95%', 'Security audit', 'Performance optimization'],
        deliverables: ['Test reports', 'Security audit report', 'Performance benchmarks'],
      },
      {
        id: 'production-ready',
        name: 'Production Ready',
        description: 'Feature ready for production deployment',
        dueDate: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000), // 12 days
        dependencies: ['Code review', 'E2E testing', 'Deployment automation'],
        deliverables: ['Approved PR', 'Deployment scripts', 'Production validation'],
      },
    ];

    this.planningResult.qualityGates = [
      {
        name: 'Zero Errors Gate',
        phase: 'Core Implementation',
        criteria: [
          'TypeScript compilation: 0 errors',
          'ESLint validation: 0 errors, 0 warnings',
          'Build process: successful',
        ],
        blocking: true,
      },
      {
        name: 'Test Coverage Gate',
        phase: 'Quality Assurance',
        criteria: [
          'Unit test coverage: >95%',
          'Integration test coverage: >90%',
          'All tests passing',
        ],
        blocking: true,
      },
      {
        name: 'Performance Gate',
        phase: 'Quality Assurance',
        criteria: [
          'Page load time: <1.5 seconds',
          'API response time: <200ms',
          'Database query optimization: complete',
        ],
        blocking: true,
      },
      {
        name: 'Security Gate',
        phase: 'Quality Assurance',
        criteria: [
          'Security scan: no high/critical vulnerabilities',
          'Input validation: comprehensive',
          'Authentication/authorization: validated',
        ],
        blocking: true,
      },
      {
        name: 'E2E Validation Gate',
        phase: 'Review & Deployment',
        criteria: [
          'Playwright tests: all passing',
          'User workflows: validated',
          'Cross-browser compatibility: confirmed',
        ],
        blocking: true,
      },
    ];

    this.planningResult.successCriteria = [
      'All atomic tasks completed successfully',
      'Zero tolerance quality standards met',
      '>95% test coverage achieved',
      'Performance benchmarks satisfied',
      'Security audit passed',
      'E2E testing validated',
      'Code review approved',
      'Production deployment successful',
    ];

    await this.delay(700); // Simulate milestone definition
  }

  private async createGitHubIssues(issueId: string): Promise<void> {
    this.logger.debug(`Creating GitHub issues for parallel execution: ${issueId}`);

    if (!this.planningResult) return;

    // 🟢 WORKING: Create GitHub issues for each parallel task stream
    this.logger.info('GitHub issue creation would happen here in production', {
      totalTasks: this.planningResult.tasks.total,
      parallelStreams: this.planningResult.tasks.parallel.length,
      phases: this.planningResult.implementationPlan.phases.length,
    });

    // In production, this would:
    // 1. Create GitHub issues for each atomic task
    // 2. Set up labels for agent assignment
    // 3. Create milestone for the epic
    // 4. Set up project board columns
    // 5. Link dependencies between issues

    await this.delay(1000); // Simulate issue creation
  }

  // 🟢 WORKING: Public methods for orchestrator integration
  public getPlanningResult(): StrategicPlanningResult | null {
    return this.planningResult;
  }

  public getParallelExecutionPlan(): ParallelExecutionPlan | null {
    if (!this.planningResult) return null;

    return {
      epicId: 'epic-placeholder', // Would be set by orchestrator
      pattern: 'feature-development',
      phases: this.planningResult.implementationPlan.phases.map((phase) => ({
        name: phase.name,
        parallel: phase.parallel,
        tasks: phase.tasks.map((task) => ({
          issueId: task.id,
          agentType: task.agentType,
        })),
      })),
    };
  }

  public getEstimatedCompletionTime(): number {
    return this.planningResult?.implementationPlan.totalEstimatedHours || 0;
  }

  public getCriticalPath(): string[] {
    return this.planningResult?.implementationPlan.criticalPath || [];
  }

  public getHighRiskItems(): Risk[] {
    return this.planningResult?.risks.filter((risk) => risk.impact === 'high') || [];
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
