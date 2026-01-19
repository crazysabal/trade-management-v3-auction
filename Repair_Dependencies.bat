@echo off
chcp 65001 > nul
echo ==================================================
echo    Hongda Biz Dependency Repair Tool
echo ==================================================
echo.
echo This script will verify and install missing system libraries.
echo Internet connection is required.
echo.
echo [1/2] Checking Frontend libraries...
cd frontend
call npm install
cd ..
echo.
echo [2/2] Checking Backend libraries...
cd backend
call npm install
cd ..
echo.
echo ==================================================
echo    Repair Complete!
echo ==================================================
echo.
pause
