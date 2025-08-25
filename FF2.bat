@echo off
setlocal enabledelayedexpansion

REM ========================================
REM ForgeFlow v2 (FF2) Global Launcher
REM ========================================

echo.
echo  ███████╗███████╗██████╗ 
echo  ██╔════╝██╔════╝╚════██╗
echo  █████╗  █████╗   █████╔╝
echo  ██╔══╝  ██╔══╝  ██╔═══╝ 
echo  ██║     ██║     ███████╗
echo  ╚═╝     ╚═╝     ╚══════╝
echo.
echo  ForgeFlow v2 - Intelligent Project Orchestration
echo  ================================================
echo.

REM Check if we're in a git repository
git rev-parse --is-inside-work-tree >nul 2>&1
if %errorlevel% neq 0 (
    echo [FF2] Not in a git repository!
    echo.
    choice /C YN /M "Would you like to initialize a new git repository here"
    if !errorlevel! equ 1 (
        git init
        echo [FF2] Git repository initialized.
    ) else (
        echo [FF2] Please navigate to a git repository first.
        pause
        exit /b 1
    )
)

REM Get current directory and project name
set "PROJECT_DIR=%CD%"
for %%I in (.) do set "PROJECT_NAME=%%~nxI"

echo [FF2] Project: %PROJECT_NAME%
echo [FF2] Location: %PROJECT_DIR%
echo.

REM Check if ForgeFlow is already initialized
if exist "forgeflow.yaml" (
    echo [FF2] ✓ ForgeFlow already initialized in this project!
    echo.
    echo What would you like to do?
    echo.
    echo   1. Continue work (Status/Monitor)
    echo   2. Start new parallel execution
    echo   3. Run quality validation
    echo   4. Open dashboard
    echo   5. Activate protocols
    echo   6. Emergency mode
    echo   7. Re-initialize configuration
    echo   8. Setup GitHub webhooks
    echo   9. Exit
    echo.
    choice /C 123456789 /M "Select an option"
    set ACTION=!errorlevel!
) else (
    echo [FF2] ForgeFlow not initialized in this project.
    echo.
    echo What would you like to do?
    echo.
    echo   1. Initialize ForgeFlow in this project
    echo   2. Exit
    echo.
    choice /C 12 /M "Select an option"
    if !errorlevel! equ 1 (
        set ACTION=0
    ) else (
        exit /b 0
    )
)

REM ForgeFlow v2 base directory
set "FF2_DIR=C:\Jarvis\AI Workspace\ForgeFlow v2"
set "FF2_CLI=node "%FF2_DIR%\dist\index.js""

REM Execute based on selection
if %ACTION% equ 0 (
    REM Initialize new project
    echo.
    echo [FF2] Initializing ForgeFlow v2...
    echo.
    
    REM Check for GitHub remote
    git remote -v | findstr "origin" >nul 2>&1
    if %errorlevel% neq 0 (
        echo [FF2] No GitHub remote detected.
        set /p "GITHUB_URL=Enter your GitHub repository URL (or press Enter to skip): "
        if not "!GITHUB_URL!"=="" (
            git remote add origin !GITHUB_URL!
            echo [FF2] GitHub remote added.
        )
    )
    
    REM Run initialization
    %FF2_CLI% init
    
    echo.
    echo [FF2] ✓ Initialization complete!
    echo.
    echo Next steps:
    echo   1. Edit .env file and add your GitHub token
    echo   2. Create an epic issue in GitHub
    echo   3. Run "FF2" again to start execution
    echo.
    pause
    exit /b 0
)

if %ACTION% equ 1 (
    REM Continue work - Show status
    echo.
    echo [FF2] Checking execution status...
    echo ================================
    echo.
    %FF2_CLI% status
    echo.
    
    REM Check for active executions
    echo Would you like to:
    echo   1. Start new execution
    echo   2. Open dashboard
    echo   3. Exit
    echo.
    choice /C 123 /M "Select"
    if !errorlevel! equ 1 goto :start_execution
    if !errorlevel! equ 2 goto :open_dashboard
    exit /b 0
)

if %ACTION% equ 2 (
    :start_execution
    echo.
    echo [FF2] Starting new parallel execution...
    echo.
    
    REM List recent issues
    echo Fetching recent GitHub issues...
    %FF2_CLI% list-epics 2>nul
    
    echo.
    set /p "EPIC_ID=Enter Epic/Issue ID (e.g., 123 or epic-123): "
    
    REM Clean up epic ID
    set "EPIC_ID=!EPIC_ID:epic-=!"
    set "EPIC_ID=!EPIC_ID:#=!"
    set "EPIC_ID=!EPIC_ID:issue-=!"
    
    echo.
    echo Select execution pattern:
    echo   1. Auto-detect (based on labels)
    echo   2. Feature Development
    echo   3. Bug Fix Sprint
    echo   4. Security Audit
    echo.
    choice /C 1234 /M "Pattern"
    
    if !errorlevel! equ 1 set "PATTERN="
    if !errorlevel! equ 2 set "PATTERN=--pattern feature-development"
    if !errorlevel! equ 3 set "PATTERN=--pattern bug-fix-sprint"
    if !errorlevel! equ 4 set "PATTERN=--pattern security-audit"
    
    echo.
    echo [FF2] Starting execution for issue-%EPIC_ID%...
    %FF2_CLI% start-parallel issue-%EPIC_ID% %PATTERN%
    
    echo.
    echo [FF2] ✓ Execution started!
    echo.
    echo Monitor at: http://localhost:3000
    pause
    exit /b 0
)

if %ACTION% equ 3 (
    REM Run validation
    echo.
    echo [FF2] Running quality gates validation...
    echo ========================================
    echo.
    %FF2_CLI% validate
    echo.
    pause
    exit /b 0
)

if %ACTION% equ 4 (
    :open_dashboard
    echo.
    echo [FF2] Starting ForgeFlow dashboard...
    echo.
    
    REM Start the dashboard server
    start "ForgeFlow Dashboard" /MIN cmd /c "%FF2_DIR%\start-forgeflow.bat"
    
    REM Wait a moment for server to start
    timeout /t 3 /nobreak >nul
    
    REM Open browser
    start http://localhost:3000
    
    echo [FF2] ✓ Dashboard opened at http://localhost:3000
    echo.
    echo Press any key to return to menu...
    pause >nul
    exit /b 0
)

if %ACTION% equ 5 (
    REM Activate protocols
    echo.
    echo Select protocol to activate:
    echo   1. NLNH (No Lies, No Hallucination)
    echo   2. AntiHall (Anti-Hallucination Validator)
    echo   3. RYR (Remember Your Rules)
    echo   4. All protocols
    echo.
    choice /C 1234 /M "Protocol"
    
    echo.
    if !errorlevel! equ 1 %FF2_CLI% protocol nlnh
    if !errorlevel! equ 2 %FF2_CLI% protocol antihall
    if !errorlevel! equ 3 %FF2_CLI% protocol ryr
    if !errorlevel! equ 4 (
        %FF2_CLI% protocol nlnh
        %FF2_CLI% protocol antihall
        %FF2_CLI% protocol ryr
    )
    
    echo.
    echo [FF2] ✓ Protocol(s) activated!
    pause
    exit /b 0
)

if %ACTION% equ 6 (
    REM Emergency mode
    echo.
    echo [FF2] ⚠️  EMERGENCY MODE - This bypasses all quality gates!
    echo.
    set /p "CONFIRM=Type 'EMERGENCY' to confirm: "
    if /i not "!CONFIRM!"=="EMERGENCY" (
        echo [FF2] Emergency mode cancelled.
        pause
        exit /b 0
    )
    
    set /p "TASK_ID=Enter task/issue ID for emergency execution: "
    echo.
    echo [FF2] Executing emergency mode...
    %FF2_CLI% ! %TASK_ID%
    echo.
    pause
    exit /b 0
)

if %ACTION% equ 7 (
    REM Re-initialize
    echo.
    echo [FF2] Re-initializing ForgeFlow configuration...
    echo.
    
    REM Backup existing config
    if exist "forgeflow.yaml" (
        copy forgeflow.yaml forgeflow.yaml.backup >nul
        echo [FF2] Existing config backed up to forgeflow.yaml.backup
    )
    if exist ".env" (
        copy .env .env.backup >nul
        echo [FF2] Existing .env backed up to .env.backup
    )
    
    %FF2_CLI% init
    echo.
    echo [FF2] ✓ Re-initialization complete!
    pause
    exit /b 0
)

if %ACTION% equ 8 (
    REM Setup webhooks
    echo.
    echo [FF2] Setting up GitHub webhooks...
    echo ==================================
    echo.
    %FF2_CLI% webhook-setup
    echo.
    echo [FF2] ✓ Webhook setup complete!
    pause
    exit /b 0
)

if %ACTION% equ 9 (
    exit /b 0
)

endlocal