@echo off
chcp 65001 > nul
title 거래명세서 관리 시스템 - 서버 실행

echo.
echo ==========================================
echo   거래명세서 관리 시스템 - 서버 실행
echo ==========================================
echo.

:: 기존 프로세스 종료
echo [1/4] 기존 서버 프로세스 확인 및 종료...

:: 포트 5000 (백엔드) 사용 중인 프로세스 종료
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5000 ^| findstr LISTENING') do (
    echo      - 백엔드 서버 종료 (PID: %%a)
    taskkill /F /PID %%a > nul 2>&1
)

:: 포트 3000 (프론트엔드) 사용 중인 프로세스 종료
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do (
    echo      - 프론트엔드 서버 종료 (PID: %%a)
    taskkill /F /PID %%a > nul 2>&1
)

timeout /t 2 /nobreak > nul

:: 백엔드 서버 시작
echo.
echo [2/4] 백엔드 서버 시작 중...
cd /d "%~dp0backend"
start "Backend Server" cmd /k "npm start"

timeout /t 3 /nobreak > nul

:: 프론트엔드 서버 시작
echo.
echo [3/4] 프론트엔드 서버 시작 중...
cd /d "%~dp0frontend"
start "Frontend Server" cmd /k "npm start"

echo.
echo [4/4] 서버 시작 완료!
echo.
echo ==========================================
echo   백엔드:    http://localhost:5000
echo   프론트엔드: http://localhost:3000
echo ==========================================
echo.
echo 브라우저에서 http://localhost:3000 으로 접속하세요.
echo 이 창은 10초 후 자동으로 닫힙니다...
echo.

timeout /t 10





















