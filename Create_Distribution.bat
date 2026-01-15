@echo off
title Hongda Biz Distribution Builder
chcp 65001 > nul

echo.
echo ================================================
echo    홍다 비즈 (Hongda Biz) 배포 패키지 제작 시작
echo ================================================
echo.

node create_dist_package.js

echo.
echo 작업을 완료하려면 아무 키나 누르세요...
pause > nul
