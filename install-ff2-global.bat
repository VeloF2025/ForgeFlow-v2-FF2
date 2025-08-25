@echo off
setlocal enabledelayedexpansion

REM ========================================
REM FF2 Global Installation Script
REM ========================================

echo.
echo ========================================
echo ForgeFlow v2 (FF2) Global Installation
echo ========================================
echo.

REM Check for admin rights
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo This script requires administrator privileges.
    echo Please run as Administrator.
    echo.
    pause
    exit /b 1
)

set "FF2_DIR=C:\Jarvis\AI Workspace\ForgeFlow v2"
set "INSTALL_DIR=C:\ForgeFlow"
set "BIN_DIR=%INSTALL_DIR%\bin"

echo Installing ForgeFlow v2 globally...
echo.

REM Create installation directory
if not exist "%INSTALL_DIR%" (
    mkdir "%INSTALL_DIR%"
    echo Created: %INSTALL_DIR%
)

if not exist "%BIN_DIR%" (
    mkdir "%BIN_DIR%"
    echo Created: %BIN_DIR%
)

REM Copy FF2 batch file
echo Installing FF2 command...
copy /Y "%FF2_DIR%\FF2.bat" "%BIN_DIR%\FF2.bat" >nul
copy /Y "%FF2_DIR%\FF2.ps1" "%BIN_DIR%\FF2.ps1" >nul

REM Create FF2.cmd wrapper for global access
echo @echo off > "%BIN_DIR%\FF2.cmd"
echo call "%BIN_DIR%\FF2.bat" %%* >> "%BIN_DIR%\FF2.cmd"

REM Create forgeflow.cmd as alias
echo @echo off > "%BIN_DIR%\forgeflow.cmd"
echo node "C:\Jarvis\AI Workspace\ForgeFlow v2\dist\index.js" %%* >> "%BIN_DIR%\forgeflow.cmd"

REM Add to system PATH
echo.
echo Adding to system PATH...
setx /M PATH "%PATH%;%BIN_DIR%" >nul 2>&1

REM Also update current session PATH
set "PATH=%PATH%;%BIN_DIR%"

REM Create PowerShell profile addition
echo.
echo Setting up PowerShell integration...

REM Get PowerShell profile path
for /f "delims=" %%i in ('powershell -Command "$PROFILE"') do set "PS_PROFILE=%%i"

REM Create profile directory if it doesn't exist
for %%i in ("%PS_PROFILE%") do set "PS_PROFILE_DIR=%%~dpi"
if not exist "%PS_PROFILE_DIR%" mkdir "%PS_PROFILE_DIR%"

REM Add FF2 function to PowerShell profile
echo # ForgeFlow v2 (FF2) Integration >> "%PS_PROFILE%"
echo function FF2 { >> "%PS_PROFILE%"
echo     ^& "%BIN_DIR%\FF2.ps1" @args >> "%PS_PROFILE%"
echo } >> "%PS_PROFILE%"
echo Set-Alias -Name forgeflow -Value FF2 >> "%PS_PROFILE%"

REM Create desktop shortcut
echo.
echo Creating desktop shortcut...
powershell -Command "$WshShell = New-Object -ComObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut('$env:USERPROFILE\Desktop\ForgeFlow v2.lnk'); $Shortcut.TargetPath = '%BIN_DIR%\FF2.cmd'; $Shortcut.WorkingDirectory = '%USERPROFILE%'; $Shortcut.IconLocation = '%SystemRoot%\System32\cmd.exe'; $Shortcut.Description = 'ForgeFlow v2 - AI Orchestration'; $Shortcut.Save()"

REM Create Start Menu entry
echo Creating Start Menu entry...
set "START_MENU=%APPDATA%\Microsoft\Windows\Start Menu\Programs\ForgeFlow"
if not exist "%START_MENU%" mkdir "%START_MENU%"

powershell -Command "$WshShell = New-Object -ComObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut('%START_MENU%\ForgeFlow v2.lnk'); $Shortcut.TargetPath = '%BIN_DIR%\FF2.cmd'; $Shortcut.WorkingDirectory = '%USERPROFILE%'; $Shortcut.IconLocation = '%SystemRoot%\System32\cmd.exe'; $Shortcut.Description = 'ForgeFlow v2 - AI Orchestration'; $Shortcut.Save()"

REM Verify installation
echo.
echo Verifying installation...
where FF2 >nul 2>&1
if %errorlevel% equ 0 (
    echo ✓ FF2 command is available globally
) else (
    echo ⚠ FF2 command not found in PATH (restart may be required)
)

REM Create uninstaller
echo @echo off > "%INSTALL_DIR%\uninstall.bat"
echo echo Uninstalling ForgeFlow v2... >> "%INSTALL_DIR%\uninstall.bat"
echo rmdir /S /Q "%BIN_DIR%" >> "%INSTALL_DIR%\uninstall.bat"
echo del "%USERPROFILE%\Desktop\ForgeFlow v2.lnk" 2^>nul >> "%INSTALL_DIR%\uninstall.bat"
echo rmdir /S /Q "%START_MENU%" 2^>nul >> "%INSTALL_DIR%\uninstall.bat"
echo echo ForgeFlow v2 uninstalled. >> "%INSTALL_DIR%\uninstall.bat"
echo echo Please manually remove %BIN_DIR% from PATH environment variable. >> "%INSTALL_DIR%\uninstall.bat"
echo pause >> "%INSTALL_DIR%\uninstall.bat"

echo.
echo ========================================
echo ✓ ForgeFlow v2 Installation Complete!
echo ========================================
echo.
echo Available commands:
echo   FF2         - Launch ForgeFlow v2 interface
echo   forgeflow   - Direct CLI access
echo.
echo Desktop shortcut created: ForgeFlow v2.lnk
echo Start Menu entry created: ForgeFlow\ForgeFlow v2
echo.
echo To uninstall, run: %INSTALL_DIR%\uninstall.bat
echo.
echo IMPORTANT: You may need to restart your terminal or computer
echo           for the PATH changes to take effect.
echo.
echo Try it now:
echo   1. Open a new Command Prompt or PowerShell
echo   2. Navigate to any project directory
echo   3. Type: FF2
echo.
pause