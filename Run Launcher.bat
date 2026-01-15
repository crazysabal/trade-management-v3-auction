@echo off
taskkill /F /IM node.exe /T 2>nul

cd hongda-biz-launcher
npm start
pause
