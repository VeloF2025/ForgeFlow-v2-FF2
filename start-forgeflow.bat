@echo off
echo.
echo ╔═══════════════════════════════════════════════════════════╗
echo ║     ForgeFlow v2 - True Parallel AI Orchestration        ║
echo ║     Repository: github.com/VeloF2025/ForgeFlow-v2-FF2    ║
echo ╚═══════════════════════════════════════════════════════════╝
echo.

REM Check if .env exists
if not exist .env (
    echo ERROR: .env file not found!
    echo Please copy .env.example to .env and configure your GitHub token
    echo.
    echo Creating .env from .env.example...
    copy .env.example .env
    echo.
    echo Please edit .env and add your GITHUB_TOKEN
    pause
    exit /b 1
)

REM Check if node_modules exists
if not exist node_modules (
    echo Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo ERROR: Failed to install dependencies
        pause
        exit /b 1
    )
)

REM Check if dist directory exists
if not exist dist (
    echo Building project...
    call npm run build
    if errorlevel 1 (
        echo ERROR: Failed to build project
        pause
        exit /b 1
    )
)

echo.
echo Starting ForgeFlow v2...
echo.
echo Dashboard will be available at: http://localhost:3000
echo Metrics endpoint: http://localhost:3000/metrics
echo API endpoint: http://localhost:3000/api
echo.
echo Press Ctrl+C to stop
echo.

REM Start the application
node dist/index.js %*