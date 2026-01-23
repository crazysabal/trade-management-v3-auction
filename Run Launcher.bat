@echo off
setlocal
chcp 65001 > nul
title Hongda Biz Management System Launcher
color 0b

echo ==========================================================
echo    Starting Hongda Biz System...
echo ==========================================================

:: Process Cleanup (Hygiene)
:: Targeted killing of ports 3000 (Frontend) and 5000 (Backend)
echo Cleaning up existing processes (Port 3000, 5000)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000') do taskkill /f /pid %%a 2>nul
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5000') do taskkill /f /pid %%a 2>nul

echo.
echo Starting Electron Launcher...
cd hongda-biz-launcher
npm start
if errorlevel 1 (
    echo.
    echo Error: Failed to start the launcher.
    pause
)
