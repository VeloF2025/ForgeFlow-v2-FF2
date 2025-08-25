# FF2 - ForgeFlow v2 Quick Start Guide

## 🚀 One-Time Global Installation

Run as Administrator:
```batch
cd "C:\Jarvis\AI Workspace\ForgeFlow v2"
install-ff2-global.bat
```

This will:
- Add FF2 to your system PATH
- Create desktop shortcut
- Setup PowerShell integration
- Enable global `FF2` command

## 🎯 Using FF2 Command

### Start FF2 in Any Project

```batch
# Navigate to your project
cd C:\path\to\your\project

# Launch FF2
FF2
```

### FF2 Intelligent Mode

FF2 automatically detects your project state:

#### New Project (No ForgeFlow)
```
FF2
> Detected: New project
> Options:
  1. Initialize ForgeFlow → Sets up configuration
  2. Exit
```

#### Existing Project (ForgeFlow Initialized)
```
FF2
> Detected: Existing ForgeFlow project
> Options:
  1. Continue work (Status/Monitor)
  2. Start new parallel execution
  3. Run quality validation
  4. Open dashboard
  5. Activate protocols
  6. Emergency mode
  7. Re-initialize configuration
  8. Setup GitHub webhooks
  9. Exit
```

## 📋 Common Workflows

### 1. Initialize New Project
```batch
cd "C:\my-new-project"
FF2
> Select: 1 (Initialize ForgeFlow)
> Enter GitHub details
> Done! Edit .env with your GitHub token
```

### 2. Start Execution
```batch
cd "C:\my-project"
FF2
> Select: 2 (Start new parallel execution)
> Enter Epic ID: 123
> Select Pattern: 1 (Auto-detect)
> Execution started!
```

### 3. Quick Commands (PowerShell)
```powershell
# Direct execution
FF2 -Epic 123
FF2 -Epic 123 -Pattern feature-development

# Status check
FF2 -Status

# Open dashboard
FF2 -Dashboard

# Help
FF2 -Help
```

## 🔥 Emergency Mode

For critical production issues:
```batch
FF2
> Select: 6 (Emergency mode)
> Type: EMERGENCY (to confirm)
> Enter task ID: urgent-fix-456
> Bypasses all quality gates!
```

## 📊 Dashboard Access

```batch
FF2
> Select: 4 (Open dashboard)
> Opens: http://localhost:3000
```

## 🛡️ Protocol Activation

```batch
FF2
> Select: 5 (Activate protocols)
> Choose:
  1. NLNH (No Lies, No Hallucination)
  2. AntiHall (Anti-Hallucination Validator)
  3. RYR (Remember Your Rules)
  4. All protocols
```

## 🔄 Typical Daily Workflow

### Morning: Check Status
```batch
cd "C:\current-project"
FF2
> Select: 1 (Continue work)
> Shows all active executions
```

### Start New Task
```batch
FF2
> Select: 2 (Start new execution)
> Epic: 456
> Pattern: Auto
```

### Before Commit
```batch
FF2
> Select: 3 (Run quality validation)
> Checks: TypeScript, ESLint, Tests
```

### End of Day
```batch
FF2
> Select: 1 (Status)
> Review progress
> Exit
```

## 🎨 Advanced Features

### Clean Worktrees
```powershell
FF2
> Select: 9 (Advanced options)
> Select: 5 (Clean worktrees)
```

### Run Specific Agent
```powershell
FF2
> Select: 9 (Advanced options)
> Select: 6 (Run specific agent)
> Choose agent type
> Enter issue ID
```

### Update ForgeFlow
```powershell
FF2
> Select: 9 (Advanced options)
> Select: 7 (Update ForgeFlow)
```

## 💡 Pro Tips

1. **First Time Setup**:
   ```batch
   FF2
   # Initialize → Edit .env → Add GitHub token → Run FF2 again
   ```

2. **Quick Epic Execution**:
   ```powershell
   FF2 -Epic 123
   ```

3. **Monitor Everything**:
   ```powershell
   FF2 -Dashboard
   ```

4. **Batch Operations**:
   ```batch
   # In project root
   FF2 -Status > status.log
   FF2 -Epic 123 -Pattern bug-fix-sprint
   ```

5. **Emergency Override**:
   ```batch
   # Only for production emergencies!
   FF2
   > Emergency mode → Type EMERGENCY → Enter task
   ```

## 🔧 Troubleshooting

### FF2 Command Not Found
```batch
# Restart terminal or run:
refreshenv

# Or manually add to PATH:
set PATH=%PATH%;C:\ForgeFlow\bin
```

### GitHub Token Issues
```batch
# Edit .env in your project
notepad .env
# Add: GITHUB_TOKEN=ghp_your_token_here
```

### Port Already in Use
```batch
# Change port in .env
PORT=3001
DASHBOARD_PORT=3001
```

## 📖 Command Reference

| Command | Description |
|---------|-------------|
| `FF2` | Interactive mode |
| `FF2 -Status` | Show execution status |
| `FF2 -Dashboard` | Open web dashboard |
| `FF2 -Epic <id>` | Start execution |
| `FF2 -Epic <id> -Pattern <type>` | Start with pattern |
| `FF2 -Help` | Show help |
| `forgeflow <command>` | Direct CLI access |

## 🚨 Important Notes

- **Always** add GitHub token to `.env` before first use
- **Never** use Emergency mode unless absolutely necessary
- **Check** status before starting new executions
- **Monitor** dashboard during executions
- **Validate** quality gates before commits

## 🎯 Quick Success Path

1. Install globally: `install-ff2-global.bat` (as Admin)
2. Navigate to project: `cd C:\my-project`
3. Initialize: `FF2` → Select 1
4. Add token: Edit `.env`
5. Create GitHub epic
6. Execute: `FF2` → Select 2 → Enter epic ID
7. Monitor: `FF2 -Dashboard`

---

**FF2 - Making AI Orchestration Simple!** 🚀