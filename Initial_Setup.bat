@echo off
chcp 65001 > nul
title Hongda Biz One-Click Setup
echo ==================================================
echo    Hongda Biz Integrated Auto Setup
echo ==================================================
echo.
echo This script automatically configures the system environment.
echo Node.js and MySQL must be installed.
echo.
pause
node master_setup.js
echo.
echo Process finished. Please close this window.
pause
