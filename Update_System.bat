@echo off
setlocal enabledelayedexpansion
chcp 65001 > nul
echo ================================================
echo    Hongda Biz Smart Update
echo ================================================
echo.
echo [1/4] Closing running processes...
taskkill /f /im node.exe > nul 2>&1
taskkill /f /im HongdaBiz.exe > nul 2>&1
taskkill /f /im TradeManagement.exe > nul 2>&1
timeout /t 2 /nobreak > nul
echo [2/4] Checking version and replacing files...
node scripts/update_manager.js
if errorlevel 1 goto :error
echo.
echo [3/4] Installing packages for new features...
echo [Backend...]
cd backend && call npm install && cd ..
echo [Frontend...]
cd frontend && call npm install && cd ..
echo [Launcher...]
cd hongda-biz-launcher && call npm install && cd ..
echo.
echo [4/4] Optimizing system and finishing...
echo.
echo ================================================
echo     Update successful!
echo    Starting program automatically...
echo ================================================
echo.
timeout /t 3 /nobreak > nul
start "" "Run Launcher.bat"
exit /b 0

:error
echo.
echo  An error occurred during the update.
pause
exit /b 1
