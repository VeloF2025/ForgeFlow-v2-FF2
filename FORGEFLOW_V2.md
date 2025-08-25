# ForgeFlow v2: True Parallel AI Orchestration

## Core Philosophy

> **"Real parallelism through isolation, not sequential handoffs"**

ForgeFlow v2 combines CCPM's GitHub-based orchestration with ForgeFlow v1's specialized agents to achieve true parallel execution.

## System Architecture

```
forgeflow-v2/
├── .claude/
│   ├── agents/           # Specialized agent definitions
│   ├── commands/         # FF command system
│   └── worktrees/        # Active worktree tracking
├── .github/
│   ├── ISSUE_TEMPLATE/   # Agent-specific issue templates
│   └── workflows/        # CI/CD integration
├── orchestrator/
│   ├── queue.py          # GitHub issue queue manager
│   ├── worktree.py       # Worktree lifecycle manager
│   ├── agents.py         # Agent pool coordinator
│   └── quality.py        # Quality gate enforcer
└── config/
    ├── agents.yaml       # Agent capabilities matrix
    ├── patterns.yaml     # Execution patterns
    └── rules.yaml        # Quality rules

```

## Key Innovations

### 1. GitHub-Powered Task Queue
- Each issue = one parallel work stream
- Labels determine agent assignment
- Milestones group related work
- Projects provide overview

### 2. Worktree-Based Isolation
```bash
# Create isolated environment for each agent
git worktree add -b feature-101 worktree-101 main
cd worktree-101
# Agent works here without affecting others
```

### 3. Agent Assignment Matrix
```yaml
issue_labels:
  - architecture: system-architect
  - implementation: code-implementer
  - testing: test-coverage-validator
  - ui: ui-ux-optimizer
  - database: database-architect
  - security: security-auditor
  - performance: performance-optimizer
```

### 4. Parallel Execution Protocol
```python
# Orchestrator spawns multiple agents simultaneously
agents = [
    spawn_agent("system-architect", issue=101, worktree="arch-101"),
    spawn_agent("code-implementer", issue=102, worktree="impl-102"),
    spawn_agent("test-validator", issue=103, worktree="test-103"),
]
# All work in parallel, no blocking
await asyncio.gather(*agents)
```

## Command System

### Core Commands

#### Start Parallel Work
```bash
@FF start-parallel <epic-name>
# Analyzes epic, creates issues, spawns agents
```

#### Single Agent Execution
```bash
@FF agent <agent-type> <issue-number>
# Assigns specific agent to issue
```

#### Status Overview
```bash
@FF status
# Shows all active worktrees and agent progress
```

#### Quality Check
```bash
@FF validate
# Runs quality gates across all worktrees
```

## Agent Types (Enhanced)

### Coordinator Agents
- **orchestrator**: Manages parallel execution
- **issue-analyzer**: Determines work streams
- **conflict-resolver**: Handles merge conflicts

### Specialist Agents (from ForgeFlow v1)
- **strategic-planner**: High-level planning
- **system-architect**: Architecture design
- **code-implementer**: Zero-error implementation
- **test-coverage-validator**: 95% coverage enforcement
- **security-auditor**: Vulnerability scanning
- **performance-optimizer**: Performance tuning
- **ui-ux-optimizer**: Interface optimization
- **database-architect**: Schema design
- **deployment-automation**: CI/CD management

### Support Agents
- **documentation-generator**: Maintains docs
- **code-reviewer**: Reviews before merge
- **dependency-updater**: Manages packages

## Execution Patterns

### Pattern 1: Feature Development
```yaml
pattern: feature-development
steps:
  - create-epic: strategic-planner
  - parallel:
    - architecture: system-architect
    - database: database-architect
  - parallel:
    - backend: code-implementer
    - frontend: ui-ux-optimizer
    - tests: test-coverage-validator
  - sequential:
    - review: code-reviewer
    - security: security-auditor
    - deploy: deployment-automation
```

### Pattern 2: Bug Fix Sprint
```yaml
pattern: bug-fix-sprint
steps:
  - analyze: issue-analyzer
  - parallel: # Each bug in separate worktree
    - bug-1: code-implementer
    - bug-2: code-implementer
    - bug-3: code-implementer
  - validate: test-coverage-validator
  - deploy: deployment-automation
```

### Pattern 3: Performance Optimization
```yaml
pattern: performance-optimization
steps:
  - profile: performance-optimizer
  - parallel:
    - backend-opt: code-implementer
    - database-opt: database-architect
    - frontend-opt: ui-ux-optimizer
  - benchmark: performance-optimizer
```

## Quality Gates (Zero Tolerance)

### Pre-Merge Requirements
- ✅ Zero TypeScript/ESLint errors
- ✅ Zero build warnings
- ✅ >95% test coverage
- ✅ All tests passing
- ✅ Security scan clean
- ✅ Performance benchmarks met

### Automatic Enforcement
```python
def quality_gate(worktree):
    checks = [
        run_linter(worktree),      # Must pass
        run_tests(worktree),        # >95% coverage
        run_security(worktree),     # No vulnerabilities
        run_build(worktree),        # Zero errors
    ]
    return all(checks)  # All must pass
```

## GitHub Integration

### Issue Templates
```markdown
<!-- .github/ISSUE_TEMPLATE/implementation.md -->
---
name: Implementation Task
labels: implementation, needs-agent
assignees: forgeflow-bot
---

## Task
[Describe the implementation needed]

## Agent Assignment
- [ ] code-implementer

## Acceptance Criteria
- [ ] Zero errors
- [ ] >95% test coverage
- [ ] Passes security scan

## Worktree
`worktree-impl-{{number}}`
```

### Label System
```yaml
# Agent assignment labels
agent:architect
agent:implementer
agent:tester
agent:optimizer

# Status labels
status:in-progress
status:blocked
status:ready-for-review
status:completed

# Priority labels
priority:critical
priority:high
priority:medium
priority:low
```

## Migration Path

### From ForgeFlow v1
1. Keep agent definitions
2. Add GitHub integration
3. Implement worktree manager
4. Migrate quality gates

### From CCPM
1. Keep GitHub workflow
2. Add specialized agents
3. Implement quality gates
4. Add @FF command system

## Benefits Over Previous Systems

### vs ForgeFlow v1
- ✅ True parallel execution (not sequential)
- ✅ Persistent context (GitHub issues)
- ✅ No context pollution (worktree isolation)
- ✅ Team visibility (GitHub UI)

### vs CCPM
- ✅ Specialized agents (not generic)
- ✅ Quality enforcement (zero tolerance)
- ✅ Execution patterns (predefined workflows)
- ✅ Richer agent ecosystem

## Getting Started

```bash
# 1. Initialize ForgeFlow v2
@FF init

# 2. Configure GitHub integration
@FF configure github <repo>

# 3. Install agent definitions
@FF install agents

# 4. Start your first parallel execution
@FF start-parallel my-feature

# 5. Monitor progress
@FF status
```

## Next Steps

1. **Implement Orchestrator Core**
   - GitHub API integration
   - Worktree manager
   - Agent pool coordinator

2. **Port Agents**
   - Migrate ForgeFlow v1 agents
   - Add CCPM context patterns
   - Create new coordinator agents

3. **Quality Framework**
   - Zero-tolerance validator
   - Automated gate enforcement
   - Performance benchmarks

4. **Command System**
   - @FF trigger handling
   - Status reporting
   - Progress tracking

---

*ForgeFlow v2: Where CCPM's orchestration meets ForgeFlow's quality*