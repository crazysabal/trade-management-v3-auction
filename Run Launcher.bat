@echo off
taskkill /F /IM node.exe /T 2>nul

cd launcher
npm start
pause
