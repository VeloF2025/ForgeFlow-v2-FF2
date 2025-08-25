#!/usr/bin/env pwsh
# ForgeFlow v2 (FF2) Global Launcher - PowerShell Version

param(
    [string]$Command = "",
    [string]$Epic = "",
    [string]$Pattern = "",
    [switch]$Dashboard,
    [switch]$Status,
    [switch]$Help
)

$FF2_DIR = "C:\Jarvis\AI Workspace\ForgeFlow v2"
$FF2_CLI = "node `"$FF2_DIR\dist\index.js`""

function Show-FF2Banner {
    Write-Host ""
    Write-Host " ███████╗███████╗██████╗ " -ForegroundColor Cyan
    Write-Host " ██╔════╝██╔════╝╚════██╗" -ForegroundColor Cyan
    Write-Host " █████╗  █████╗   █████╔╝" -ForegroundColor Magenta
    Write-Host " ██╔══╝  ██╔══╝  ██╔═══╝ " -ForegroundColor Magenta
    Write-Host " ██║     ██║     ███████╗" -ForegroundColor Blue
    Write-Host " ╚═╝     ╚═╝     ╚══════╝" -ForegroundColor Blue
    Write-Host ""
    Write-Host " ForgeFlow v2 - Intelligent Project Orchestration" -ForegroundColor Yellow
    Write-Host " ================================================" -ForegroundColor DarkGray
    Write-Host ""
}

function Test-GitRepository {
    try {
        git rev-parse --is-inside-work-tree 2>$null
        return $?
    } catch {
        return $false
    }
}

function Test-FF2Initialized {
    return (Test-Path "forgeflow.yaml")
}

function Get-GitHubInfo {
    $remoteUrl = git remote get-url origin 2>$null
    if ($remoteUrl) {
        if ($remoteUrl -match "github\.com[:/]([^/]+)/([^/.]+)") {
            return @{
                Owner = $Matches[1]
                Repo = $Matches[2] -replace '\.git$', ''
                Url = $remoteUrl
            }
        }
    }
    return $null
}

function Initialize-FF2Project {
    Write-Host "[FF2] Initializing ForgeFlow v2..." -ForegroundColor Green
    Write-Host ""
    
    # Check for GitHub remote
    $githubInfo = Get-GitHubInfo
    if ($githubInfo) {
        Write-Host "[FF2] Detected GitHub repository:" -ForegroundColor Cyan
        Write-Host "      Owner: $($githubInfo.Owner)" -ForegroundColor Gray
        Write-Host "      Repo: $($githubInfo.Repo)" -ForegroundColor Gray
        Write-Host ""
    } else {
        Write-Host "[FF2] No GitHub remote detected." -ForegroundColor Yellow
        $addRemote = Read-Host "Would you like to add a GitHub remote? (y/n)"
        if ($addRemote -eq 'y') {
            $githubUrl = Read-Host "Enter GitHub repository URL"
            git remote add origin $githubUrl
            Write-Host "[FF2] GitHub remote added." -ForegroundColor Green
        }
    }
    
    # Run initialization
    Invoke-Expression "$FF2_CLI init"
    
    Write-Host ""
    Write-Host "[FF2] ✓ Initialization complete!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Yellow
    Write-Host "  1. Edit .env file and add your GitHub token" -ForegroundColor Gray
    Write-Host "  2. Create an epic issue in GitHub" -ForegroundColor Gray
    Write-Host "  3. Run 'FF2' again to start execution" -ForegroundColor Gray
    Write-Host ""
}

function Show-MainMenu {
    Write-Host "What would you like to do?" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  1. " -NoNewline -ForegroundColor Cyan; Write-Host "Continue work (Status/Monitor)"
    Write-Host "  2. " -NoNewline -ForegroundColor Cyan; Write-Host "Start new parallel execution"
    Write-Host "  3. " -NoNewline -ForegroundColor Cyan; Write-Host "Run quality validation"
    Write-Host "  4. " -NoNewline -ForegroundColor Cyan; Write-Host "Open dashboard"
    Write-Host "  5. " -NoNewline -ForegroundColor Cyan; Write-Host "Activate protocols"
    Write-Host "  6. " -NoNewline -ForegroundColor Cyan; Write-Host "Emergency mode"
    Write-Host "  7. " -NoNewline -ForegroundColor Cyan; Write-Host "Re-initialize configuration"
    Write-Host "  8. " -NoNewline -ForegroundColor Cyan; Write-Host "Setup GitHub webhooks"
    Write-Host "  9. " -NoNewline -ForegroundColor Cyan; Write-Host "Advanced options"
    Write-Host "  0. " -NoNewline -ForegroundColor Cyan; Write-Host "Exit"
    Write-Host ""
    
    $choice = Read-Host "Select an option (0-9)"
    return $choice
}

function Start-FF2Execution {
    param([string]$EpicId = "", [string]$Pattern = "")
    
    Write-Host ""
    Write-Host "[FF2] Starting new parallel execution..." -ForegroundColor Green
    Write-Host ""
    
    if (-not $EpicId) {
        # Try to list recent issues
        Write-Host "Fetching recent GitHub issues..." -ForegroundColor Cyan
        try {
            $githubInfo = Get-GitHubInfo
            if ($githubInfo) {
                Write-Host "Recent issues from $($githubInfo.Owner)/$($githubInfo.Repo):" -ForegroundColor Gray
                # This would need actual GitHub API integration
            }
        } catch {
            Write-Host "Could not fetch issues automatically." -ForegroundColor Yellow
        }
        
        Write-Host ""
        $EpicId = Read-Host "Enter Epic/Issue ID (e.g., 123 or epic-123)"
    }
    
    # Clean up epic ID
    $EpicId = $EpicId -replace '^(epic-|#|issue-)', ''
    
    if (-not $Pattern) {
        Write-Host ""
        Write-Host "Select execution pattern:" -ForegroundColor Yellow
        Write-Host "  1. Auto-detect (based on labels)" -ForegroundColor Gray
        Write-Host "  2. Feature Development" -ForegroundColor Gray
        Write-Host "  3. Bug Fix Sprint" -ForegroundColor Gray
        Write-Host "  4. Security Audit" -ForegroundColor Gray
        Write-Host ""
        
        $patternChoice = Read-Host "Pattern (1-4)"
        switch ($patternChoice) {
            "2" { $Pattern = "--pattern feature-development" }
            "3" { $Pattern = "--pattern bug-fix-sprint" }
            "4" { $Pattern = "--pattern security-audit" }
            default { $Pattern = "" }
        }
    }
    
    Write-Host ""
    Write-Host "[FF2] Starting execution for issue-$EpicId..." -ForegroundColor Green
    Invoke-Expression "$FF2_CLI start-parallel issue-$EpicId $Pattern"
    
    Write-Host ""
    Write-Host "[FF2] ✓ Execution started!" -ForegroundColor Green
    Write-Host "Monitor at: http://localhost:3000" -ForegroundColor Cyan
}

function Show-AdvancedMenu {
    Write-Host ""
    Write-Host "Advanced Options:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  1. " -NoNewline -ForegroundColor Cyan; Write-Host "List all executions"
    Write-Host "  2. " -NoNewline -ForegroundColor Cyan; Write-Host "Stop specific execution"
    Write-Host "  3. " -NoNewline -ForegroundColor Cyan; Write-Host "View execution logs"
    Write-Host "  4. " -NoNewline -ForegroundColor Cyan; Write-Host "Export metrics"
    Write-Host "  5. " -NoNewline -ForegroundColor Cyan; Write-Host "Clean worktrees"
    Write-Host "  6. " -NoNewline -ForegroundColor Cyan; Write-Host "Run specific agent"
    Write-Host "  7. " -NoNewline -ForegroundColor Cyan; Write-Host "Update ForgeFlow"
    Write-Host "  8. " -NoNewline -ForegroundColor Cyan; Write-Host "View configuration"
    Write-Host "  0. " -NoNewline -ForegroundColor Cyan; Write-Host "Back to main menu"
    Write-Host ""
    
    $choice = Read-Host "Select an option (0-8)"
    
    switch ($choice) {
        "1" {
            Write-Host ""
            Invoke-Expression "$FF2_CLI status --all"
        }
        "2" {
            $execId = Read-Host "Enter execution ID to stop"
            Invoke-Expression "$FF2_CLI stop $execId"
        }
        "3" {
            $execId = Read-Host "Enter execution ID for logs"
            Invoke-Expression "$FF2_CLI logs $execId"
        }
        "4" {
            Write-Host "Exporting metrics..." -ForegroundColor Cyan
            Invoke-Expression "$FF2_CLI metrics --export"
        }
        "5" {
            Write-Host "Cleaning worktrees..." -ForegroundColor Yellow
            git worktree prune
            Remove-Item -Path ".worktrees/*" -Recurse -Force -ErrorAction SilentlyContinue
            Write-Host "✓ Worktrees cleaned" -ForegroundColor Green
        }
        "6" {
            $agents = @(
                "strategic-planner",
                "system-architect",
                "code-implementer",
                "test-coverage-validator",
                "security-auditor",
                "performance-optimizer",
                "ui-ux-optimizer",
                "database-architect",
                "deployment-automation",
                "code-quality-reviewer",
                "antihallucination-validator"
            )
            
            Write-Host ""
            Write-Host "Available agents:" -ForegroundColor Yellow
            for ($i = 0; $i -lt $agents.Length; $i++) {
                Write-Host "  $($i+1). $($agents[$i])" -ForegroundColor Gray
            }
            
            $agentChoice = Read-Host "Select agent (1-$($agents.Length))"
            $selectedAgent = $agents[[int]$agentChoice - 1]
            
            $issueId = Read-Host "Enter issue ID for agent execution"
            Invoke-Expression "$FF2_CLI execute-agent --type $selectedAgent --issue $issueId"
        }
        "7" {
            Write-Host "Updating ForgeFlow..." -ForegroundColor Cyan
            Push-Location $FF2_DIR
            git pull
            npm install
            npm run build
            Pop-Location
            Write-Host "✓ ForgeFlow updated" -ForegroundColor Green
        }
        "8" {
            Write-Host ""
            Write-Host "Current Configuration:" -ForegroundColor Yellow
            Write-Host "=====================" -ForegroundColor DarkGray
            if (Test-Path "forgeflow.yaml") {
                Get-Content "forgeflow.yaml" | Write-Host
            }
            if (Test-Path ".env") {
                Write-Host ""
                Write-Host "Environment Variables:" -ForegroundColor Yellow
                Write-Host "=====================" -ForegroundColor DarkGray
                Get-Content ".env" | ForEach-Object {
                    if ($_ -match "TOKEN|SECRET|PASSWORD") {
                        $parts = $_ -split "=", 2
                        Write-Host "$($parts[0])=***HIDDEN***" -ForegroundColor DarkGray
                    } else {
                        Write-Host $_ -ForegroundColor Gray
                    }
                }
            }
        }
    }
}

# Main execution
Show-FF2Banner

# Handle command line arguments
if ($Help) {
    Write-Host "FF2 - ForgeFlow v2 Global Launcher" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Usage:" -ForegroundColor Cyan
    Write-Host "  FF2                    - Interactive mode" -ForegroundColor Gray
    Write-Host "  FF2 -Status           - Show status" -ForegroundColor Gray
    Write-Host "  FF2 -Dashboard        - Open dashboard" -ForegroundColor Gray
    Write-Host "  FF2 -Epic <id>        - Start execution for epic" -ForegroundColor Gray
    Write-Host "  FF2 -Epic <id> -Pattern <pattern> - Start with specific pattern" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Examples:" -ForegroundColor Cyan
    Write-Host "  FF2" -ForegroundColor Gray
    Write-Host "  FF2 -Status" -ForegroundColor Gray
    Write-Host "  FF2 -Epic 123" -ForegroundColor Gray
    Write-Host "  FF2 -Epic 123 -Pattern feature-development" -ForegroundColor Gray
    Write-Host "  FF2 -Dashboard" -ForegroundColor Gray
    exit 0
}

# Check if in git repository
if (-not (Test-GitRepository)) {
    Write-Host "[FF2] Not in a git repository!" -ForegroundColor Red
    Write-Host ""
    $initGit = Read-Host "Would you like to initialize a new git repository here? (y/n)"
    if ($initGit -eq 'y') {
        git init
        Write-Host "[FF2] Git repository initialized." -ForegroundColor Green
    } else {
        Write-Host "[FF2] Please navigate to a git repository first." -ForegroundColor Yellow
        exit 1
    }
}

# Get project info
$projectDir = Get-Location
$projectName = Split-Path $projectDir -Leaf

Write-Host "[FF2] Project: " -NoNewline -ForegroundColor Cyan
Write-Host $projectName -ForegroundColor White
Write-Host "[FF2] Location: " -NoNewline -ForegroundColor Cyan
Write-Host $projectDir -ForegroundColor Gray
Write-Host ""

# Handle direct commands
if ($Status) {
    Invoke-Expression "$FF2_CLI status"
    exit 0
}

if ($Dashboard) {
    Write-Host "[FF2] Starting dashboard..." -ForegroundColor Green
    Start-Process -FilePath "cmd" -ArgumentList "/c", "`"$FF2_DIR\start-forgeflow.bat`"" -WindowStyle Minimized
    Start-Sleep -Seconds 3
    Start-Process "http://localhost:3000"
    Write-Host "[FF2] Dashboard opened at http://localhost:3000" -ForegroundColor Cyan
    exit 0
}

if ($Epic) {
    Start-FF2Execution -EpicId $Epic -Pattern $Pattern
    exit 0
}

# Interactive mode
if (-not (Test-FF2Initialized)) {
    Write-Host "[FF2] ForgeFlow not initialized in this project." -ForegroundColor Yellow
    Write-Host ""
    $init = Read-Host "Would you like to initialize ForgeFlow? (y/n)"
    if ($init -eq 'y') {
        Initialize-FF2Project
    } else {
        exit 0
    }
} else {
    Write-Host "[FF2] ✓ ForgeFlow already initialized!" -ForegroundColor Green
    Write-Host ""
    
    # Main menu loop
    do {
        $choice = Show-MainMenu
        
        switch ($choice) {
            "1" {
                Write-Host ""
                Write-Host "[FF2] Checking execution status..." -ForegroundColor Green
                Write-Host "================================" -ForegroundColor DarkGray
                Write-Host ""
                Invoke-Expression "$FF2_CLI status"
            }
            "2" {
                Start-FF2Execution
            }
            "3" {
                Write-Host ""
                Write-Host "[FF2] Running quality gates validation..." -ForegroundColor Green
                Write-Host "========================================" -ForegroundColor DarkGray
                Write-Host ""
                Invoke-Expression "$FF2_CLI validate"
            }
            "4" {
                Write-Host ""
                Write-Host "[FF2] Starting ForgeFlow dashboard..." -ForegroundColor Green
                Start-Process -FilePath "cmd" -ArgumentList "/c", "`"$FF2_DIR\start-forgeflow.bat`"" -WindowStyle Minimized
                Start-Sleep -Seconds 3
                Start-Process "http://localhost:3000"
                Write-Host "[FF2] Dashboard opened at http://localhost:3000" -ForegroundColor Cyan
            }
            "5" {
                Write-Host ""
                Write-Host "Select protocol to activate:" -ForegroundColor Yellow
                Write-Host "  1. NLNH (No Lies, No Hallucination)" -ForegroundColor Gray
                Write-Host "  2. AntiHall (Anti-Hallucination Validator)" -ForegroundColor Gray
                Write-Host "  3. RYR (Remember Your Rules)" -ForegroundColor Gray
                Write-Host "  4. All protocols" -ForegroundColor Gray
                Write-Host ""
                
                $protocol = Read-Host "Protocol (1-4)"
                switch ($protocol) {
                    "1" { Invoke-Expression "$FF2_CLI protocol nlnh" }
                    "2" { Invoke-Expression "$FF2_CLI protocol antihall" }
                    "3" { Invoke-Expression "$FF2_CLI protocol ryr" }
                    "4" {
                        Invoke-Expression "$FF2_CLI protocol nlnh"
                        Invoke-Expression "$FF2_CLI protocol antihall"
                        Invoke-Expression "$FF2_CLI protocol ryr"
                    }
                }
                Write-Host "[FF2] ✓ Protocol(s) activated!" -ForegroundColor Green
            }
            "6" {
                Write-Host ""
                Write-Host "[FF2] ⚠️  EMERGENCY MODE - This bypasses all quality gates!" -ForegroundColor Red
                Write-Host ""
                $confirm = Read-Host "Type 'EMERGENCY' to confirm"
                if ($confirm -eq "EMERGENCY") {
                    $taskId = Read-Host "Enter task/issue ID for emergency execution"
                    Write-Host ""
                    Write-Host "[FF2] Executing emergency mode..." -ForegroundColor Yellow
                    Invoke-Expression "$FF2_CLI ! $taskId"
                } else {
                    Write-Host "[FF2] Emergency mode cancelled." -ForegroundColor Green
                }
            }
            "7" {
                Write-Host ""
                Write-Host "[FF2] Re-initializing ForgeFlow configuration..." -ForegroundColor Yellow
                
                # Backup existing config
                if (Test-Path "forgeflow.yaml") {
                    Copy-Item "forgeflow.yaml" "forgeflow.yaml.backup"
                    Write-Host "[FF2] Existing config backed up to forgeflow.yaml.backup" -ForegroundColor Gray
                }
                if (Test-Path ".env") {
                    Copy-Item ".env" ".env.backup"
                    Write-Host "[FF2] Existing .env backed up to .env.backup" -ForegroundColor Gray
                }
                
                Invoke-Expression "$FF2_CLI init"
                Write-Host ""
                Write-Host "[FF2] ✓ Re-initialization complete!" -ForegroundColor Green
            }
            "8" {
                Write-Host ""
                Write-Host "[FF2] Setting up GitHub webhooks..." -ForegroundColor Green
                Write-Host "==================================" -ForegroundColor DarkGray
                Write-Host ""
                Invoke-Expression "$FF2_CLI webhook-setup"
                Write-Host ""
                Write-Host "[FF2] ✓ Webhook setup complete!" -ForegroundColor Green
            }
            "9" {
                Show-AdvancedMenu
            }
            "0" {
                Write-Host ""
                Write-Host "Goodbye!" -ForegroundColor Cyan
                exit 0
            }
        }
        
        if ($choice -ne "0") {
            Write-Host ""
            Write-Host "Press any key to continue..." -ForegroundColor DarkGray
            $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
            Clear-Host
            Show-FF2Banner
        }
    } while ($choice -ne "0")
}