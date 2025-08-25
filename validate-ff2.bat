@echo off
echo.
echo =====================================
echo ForgeFlow v2 System Validation
echo =====================================
echo.

set "FF2_DIR=C:\Jarvis\AI Workspace\ForgeFlow v2"
set "ERRORS=0"

echo [1/7] Checking Node.js installation...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo    ❌ Node.js not found
    set /a ERRORS+=1
) else (
    echo    ✅ Node.js installed
)

echo [2/7] Checking build output...
if exist "%FF2_DIR%\dist\index.js" (
    echo    ✅ Build complete
) else (
    echo    ❌ Build not found - run: npm run build
    set /a ERRORS+=1
)

echo [3/7] Checking GitHub token...
if exist "%FF2_DIR%\.env" (
    findstr "GITHUB_TOKEN=github_pat" "%FF2_DIR%\.env" >nul
    if %errorlevel% equ 0 (
        echo    ✅ GitHub token configured
    ) else (
        echo    ⚠️  GitHub token not found in .env
        set /a ERRORS+=1
    )
) else (
    echo    ❌ .env file not found
    set /a ERRORS+=1
)

echo [4/7] Testing GitHub connection...
cd "%FF2_DIR%"
node dist/index.js status 2>&1 | findstr "GitHub Connection: OK" >nul
if %errorlevel% equ 0 (
    echo    ✅ GitHub connection successful
) else (
    echo    ❌ GitHub connection failed
    set /a ERRORS+=1
)

echo [5/7] Checking FF2 command availability...
where FF2 >nul 2>&1
if %errorlevel% equ 0 (
    echo    ✅ FF2 command globally available
) else (
    echo    ⚠️  FF2 not in PATH - run: install-ff2-global.bat
)

echo [6/7] Checking protocols...
if exist "%FF2_DIR%\src\protocols\nlnh-protocol.ts" (
    echo    ✅ Protocols implemented
) else (
    echo    ❌ Protocols missing
    set /a ERRORS+=1
)

echo [7/7] Checking agents...
dir "%FF2_DIR%\src\agents\implementations" >nul 2>&1
if %errorlevel% equ 0 (
    echo    ✅ Agent implementations ready
) else (
    echo    ❌ Agent implementations missing
    set /a ERRORS+=1
)

echo.
echo =====================================
if %ERRORS% equ 0 (
    echo ✅ VALIDATION PASSED - System Ready!
    echo =====================================
    echo.
    echo ForgeFlow v2 is fully operational.
    echo.
    echo Quick start:
    echo   1. Navigate to any project: cd C:\your\project
    echo   2. Run: FF2
    echo   3. Follow the interactive menu
    echo.
) else (
    echo ❌ VALIDATION FAILED - %ERRORS% issues found
    echo =====================================
    echo.
    echo Please fix the issues above before using FF2.
    echo.
)

pause