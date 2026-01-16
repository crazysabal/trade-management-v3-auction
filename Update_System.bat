@echo off
setlocal enabledelayedexpansion
:: 인코딩 안정성을 위해 65001(UTF-8) 설정
chcp 65001 > nul

echo ================================================
echo    홍다 비즈 (Hongda Biz) 스마트 업데이트
echo ================================================
echo.

:: 1. 상충되는 프로세스 종료
echo [1/4] 실행 중인 프로그램을 종료합니다...
taskkill /f /im node.exe > nul 2>&1
taskkill /f /im HongdaBiz.exe > nul 2>&1
taskkill /f /im TradeManagement.exe > nul 2>&1
timeout /t 2 /nobreak > nul

:: 2. 업데이트 매니저 실행
echo [2/4] 최신 버전을 확인하고 파일을 교체합니다...
node scripts/update_manager.js
if errorlevel 1 goto :error

:: 3. 의존성 갱신
echo.
echo [3/4] 새로운 기능을 위한 패키지를 설치합니다...
echo [Backend...]
cd backend && npm install && cd ..
echo [Frontend...]
cd frontend && npm install && cd ..
echo [Launcher...]
cd hongda-biz-launcher && npm install && cd ..

:: 4. 환경 재구성
echo.
echo [4/4] 시스템 최적화 및 마무리 중...
:: 필요 시 추가적인 빌드나 정리를 수행할 수 있음

echo.
echo ================================================
echo    🎉 업데이트가 모두 완료되었습니다!
echo    프로그램을 다시 실행해 주세요.
echo ================================================
echo.
pause
exit /b 0

:error
echo.
echo ❌ 업데이트 도중 오류가 발생했습니다.
pause
exit /b 1
