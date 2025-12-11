@echo off
chcp 65001 > nul
title 거래명세서 관리 시스템 - 서버 종료

echo.
echo ==========================================
echo   거래명세서 관리 시스템 - 서버 종료
echo ==========================================
echo.

set backend_stopped=0
set frontend_stopped=0

:: 포트 5000 (백엔드) 사용 중인 프로세스 종료
echo [1/2] 백엔드 서버 종료 중...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5000 ^| findstr LISTENING') do (
    echo      - PID %%a 종료
    taskkill /F /PID %%a > nul 2>&1
    set backend_stopped=1
)
if %backend_stopped%==0 (
    echo      - 실행 중인 백엔드 서버 없음
)

:: 포트 3000 (프론트엔드) 사용 중인 프로세스 종료  
echo.
echo [2/2] 프론트엔드 서버 종료 중...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do (
    echo      - PID %%a 종료
    taskkill /F /PID %%a > nul 2>&1
    set frontend_stopped=1
)
if %frontend_stopped%==0 (
    echo      - 실행 중인 프론트엔드 서버 없음
)

echo.
echo ==========================================
echo   모든 서버가 종료되었습니다.
echo ==========================================
echo.

timeout /t 3























