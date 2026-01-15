@echo off
chcp 65001 > nul
title Trade Management v3 One-Click Setup
echo ==================================================
echo    Trade Management v3 통합 자동 설치기
echo ==================================================
echo.
echo 이 스크립트는 시스템에 필요한 모든 환경을 자동으로 설정합니다.
echo Node.js와 MySQL이 설치되어 있어야 합니다.
echo.
pause

node master_setup.js

echo.
echo 모든 과정이 끝났습니다. 창을 닫아주세요.
pause
