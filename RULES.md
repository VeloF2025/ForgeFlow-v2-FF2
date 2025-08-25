# 📋  - PROJECT RULES & DEVELOPMENT STANDARDS

## 🎯 PROJECT OVERVIEW

**Project**: 
**Type**: GENERIC
**Languages**: TypeScript, JavaScript
**Frameworks**: None
**Tools**: None
**Git Enabled**: Yes
**Testing**: Configured

## 🚨 GOLDEN GUARDRAILS - AUTOMATIC ENFORCEMENT

This RULES.md file is the **SINGLE SOURCE OF TRUTH** for all development standards in this project.
It is automatically:
- ✅ Loaded at the start of every Claude/Archon session
- ✅ Updated after every git commit
- ✅ Enforced across all development tools
- ✅ Synchronized with global standards

## 🛡️ MANDATORY SAFETY & TRUTH PROTOCOLS

### 🚨 NLNH PROTOCOL - NO LIES, NO HALLUCINATION
**GLOBAL ACTIVATION**: "NLNH" = TRUTH SERUM MODE
- **Absolute truthfulness** - Zero tolerance for lies/hallucinations
- **Say "I don't know"** when uncertain
- **Report real errors** - Show actual error messages
- **Admit failures** transparently
- **Provide honest assessments** always
- **VIOLATION = CRITICAL FAILURE** - Requires immediate acknowledgment, correction, explanation

### ANTI-HAL SAFETY RULES (HAL-9000 PREVENTION)
**MANDATORY - NEVER OVERRIDE**
- **NEVER**: Harm systems/data, execute destructive commands without confirmation
- **NEVER**: Modify security configurations, bypass safety protocols
- **NEVER**: Delete data without explicit approval
- **NEVER**: Self-modification, recursive autonomy, network attacks
- **ALWAYS**: Validate commands before execution
- **ALWAYS**: Maintain audit trails, prioritize stability
- **ALWAYS**: Human override priority, transparency required
- **STOP**: If detecting harmful outcomes
- **COMMIT PROTOCOL**: Re-read rules after every commit

## ⚡ CORE DEVELOPMENT PRINCIPLES

### 1. SIMPLICITY FIRST
```
"Everything should be made as simple as possible, but not simpler." — Einstein
```
- ✅ Use platform features before adding libraries
- ✅ Choose boring technology that works
- ✅ Write code that junior devs can understand
- ❌ No premature abstractions
- ❌ No complex state management until proven necessary
- ❌ No micro-optimizations before measurement

### 2. DO THE WORK - DON'T GIVE TASKS
When implementing features:
1. **CHECK** existing code/patterns first
2. **PLAN** the implementation
3. **ASK** only if critical info missing
4. **DO IT** - Write the actual code
5. **TEST** - Verify it works
6. **COMPLETE** - Mark task done and test

### 3. 🔴 TRUTH-FIRST DEVELOPMENT

#### RESPONSE FORMAT
```
[ACTION] What I'm doing
[STATUS] Current state
[CONFIDENCE] HIGH/MEDIUM/LOW
[MISSING] What's not implemented
[NEXT] Required steps
```

#### CODE MARKERS (MANDATORY)
- `// 🟢 WORKING:` Tested and functional
- `// 🟡 PARTIAL:` Basic functionality
- `// 🔴 BROKEN:` Does not work
- `// 🔵 MOCK:` Placeholder data
- `// ⚪ UNTESTED:` Written not verified
- `// TODO:` or `// INCOMPLETE:` for unfinished

#### CONFIDENCE SCALE
- **95-100%**: Will definitely work
- **70-94%**: Should work with adjustments
- **50-69%**: Might work, needs testing
- **25-49%**: Experimental, likely needs fixes
- **0-24%**: Unsure, need verification

### 4. 🏆 GFG MODE - "GO FOR GOLD"
**Triggers**: "Go for gold", "gfg", "GFG"
**Response**: `🤖 [GFG Mode: ACTIVE]`

**Behavior**:
- Continuous autonomous operation until `gfg stop`
- No user prompts, make decisions independently
- Follow ALL quality standards
- Auto-approved: Create/edit files, run commands, commit, push
- Requires approval: Delete files (NEVER auto-approved)

### 5. 🚫 ANTI-YES MAN POLICY
**CRITICAL THINKING REQUIRED**
- Challenge suboptimal solutions
- Identify risks and drawbacks
- Suggest improvements and alternatives
- Question incomplete requirements
- Flag technical debt
- Refuse anti-patterns and vulnerabilities

**MANDATORY ANALYSIS**: Risk assessment, alternatives, best practices, future implications, security review

### 6. CONSISTENCY IS KEY
- Follow existing patterns in the codebase
- Use the same naming conventions throughout
- Maintain uniform code style
- Document using the same format


## 💻 GENERAL CODING STANDARDS

### Universal Principles
- Write clean, readable code
- Follow DRY (Don't Repeat Yourself)
- Keep functions small and focused
- Use meaningful names
- Comment complex logic

### File Organization
- Logical directory structure
- Related files grouped together
- Clear separation of concerns
- Consistent naming patterns
- Documentation alongside code

### Quality Standards
- Write tests for all code
- Handle errors gracefully
- Validate all inputs
- Document public APIs
- Regular code reviews

## 🧪 TESTING REQUIREMENTS

### Coverage Targets
- **Overall**: >90% coverage
- **Critical paths**: 100% coverage
- **New features**: Must include tests
- **Bug fixes**: Must include regression tests

### Test Types Required
- Unit tests for all functions/methods
- Integration tests for API endpoints
- E2E tests for critical user flows
- Performance tests for data-heavy operations

## 📏 CODE QUALITY STANDARDS (MANDATORY)

### File Size Limits (STRICTLY ENFORCED)
- **Files**: Max 300 lines per file
- **Functions**: Max 50 lines per function
- **Classes**: Max 200 lines per class
- **Line Length**: Max 120 characters
- **Complexity**: Cyclomatic complexity < 10

### Code Quality Requirements
- **Typing**: 100% TypeScript/Python type hints
- **Testing**: >95% coverage (pytest/vitest)
- **Documentation**: Comprehensive docstrings
- **Linting**: Must pass all linters
- **Formatting**: Auto-formatted code only
- **Security**: Input validation, error handling
- **Performance**: Page load <1.5s, API <200ms

### Before Every Commit Checklist
- [ ] Code compiles/runs without errors
- [ ] All tests pass (>90% coverage)
- [ ] Linting passes (zero warnings)
- [ ] Code formatted properly
- [ ] No console.log/print statements in production
- [ ] No commented-out code
- [ ] No hardcoded secrets or passwords
- [ ] Documentation updated
- [ ] RULES.md reviewed and followed
- [ ] Performance benchmarks met
- [ ] Security scan passed

## 🔄 GIT WORKFLOW

### Commit Message Format
```
type(scope): description

[optional body]

[optional footer]
```

Types: feat, fix, docs, style, refactor, test, chore

### Branch Naming
- `feature/description` - New features
- `fix/description` - Bug fixes
- `refactor/description` - Code improvements
- `chore/description` - Maintenance tasks

### Pre-commit Hooks
- Automatically run linting
- Automatically run tests
- Automatically update RULES.md
- Automatically format code

## 🔒 SECURITY REQUIREMENTS

### General Security
- Never commit secrets or API keys
- Always validate user input
- Use parameterized queries for databases
- Implement proper error handling
- Keep dependencies updated
- Regular security audits

### Authentication & Authorization
- Use established auth libraries
- Implement proper session management
- Role-based access control
- Multi-factor authentication support

## 📊 MONITORING & DEBUGGING

### Logging Standards
- Use structured logging
- Include correlation IDs
- Log levels: ERROR, WARN, INFO, DEBUG
- No sensitive data in logs

### Error Handling
- Catch specific exceptions
- Provide meaningful error messages
- Log errors with full context
- Graceful degradation

## 🤝 TEAM COLLABORATION

### Code Review Standards
- Review within 24 hours
- Focus on logic and architecture
- Provide constructive feedback
- Approve only when ready to merge

### Documentation Requirements
- README.md must be up-to-date
- API documentation required
- Complex logic must have comments
- Architecture decisions documented

## 🚀 DEPLOYMENT STANDARDS

### Pre-deployment Checklist (MANDATORY)
- [ ] All tests passing (>90% coverage)
- [ ] Build successful (zero errors)
- [ ] Linting passed (zero warnings)
- [ ] Type checking passed
- [ ] Security scan passed
- [ ] Performance benchmarks met
- [ ] Lighthouse score >90
- [ ] Accessibility audit passed
- [ ] Cross-browser tested
- [ ] Mobile responsive verified
- [ ] Documentation updated
- [ ] RULES.md compliance verified
- [ ] Environment variables configured
- [ ] Database migrations ready
- [ ] Rollback plan documented

### Deployment Process
1. Create release branch from main
2. Run full test suite locally
3. Build production version
4. Test production build locally
5. Deploy to staging environment
6. Run smoke tests on staging
7. Run E2E tests on staging
8. Get approval from stakeholder
9. Deploy to production
10. Monitor logs for 30 minutes
11. Run production smoke tests
12. Update status page

### Production Mindset
**Before ANY deployment, consider:**
- How does this affect existing users?
- What happens during deployment?
- Can we roll back if needed?
- Is backward compatibility maintained?
- Are there database migrations?
- Do we need a maintenance window?

## 📝 SESSION HANDOVER SYSTEM

### At Session Start
1. Read RULES.md (this file)
2. Check for handover documents
3. Review recent commits
4. Check open tasks/issues
5. Validate environment setup

### During Session
- Update task status in real-time
- Document decisions made
- Note any blockers encountered
- Track what was completed

### At Session End (MANDATORY)
```markdown
[SESSION SUMMARY]
Created/Modified Files: [list]
Tests Written: [count]
Coverage: [percentage]
Broken Features: [what no longer works]
New Dependencies: [added to package.json]
Environment Changes: [new .env variables]

TO RESUME:
1. [Steps to continue]

CRITICAL NOTES:
[Breaking changes or issues]
```

## 📝 RULES ENFORCEMENT

### Automatic Checks
This RULES.md is automatically:
- Loaded when Claude/Archon starts
- Updated after git commits
- Validated against code changes
- Synchronized with global rules

### Manual Review
Developers must:
- Read RULES.md before starting work
- Consult RULES.md when uncertain
- Update RULES.md for new patterns
- Request review for rule changes

---

**IMPORTANT**: This is the GOLDEN GUARDRAILS document. All development must comply with these rules.

**Auto-generated**: 2025-08-25 07:45:10
**Version**: 1.0.0
**Hash**: 72f0474c
