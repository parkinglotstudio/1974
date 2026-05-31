@echo off
chcp 65001 > nul
title 1974 Dev Server

echo.
echo  ██╗ █████╗ ███████╗ █████╗
echo  ╚═╝██╔══██╗╚════██║██╔══██╗
echo     ╚██████║    ██╔╝╚██████║
echo      ╚═══██║   ██╔╝  ╚═══██║
echo          ╚═╝   ╚═╝       ╚═╝
echo.
echo  Sand Engine Dev Server
echo  http://localhost:9891/
echo.

:: 이미 실행 중인 서버 종료
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":9292"') do (
    taskkill /PID %%a /F > nul 2>&1
)

:: 서버 실행
cd /d "%~dp0"
start "" http://localhost:9292/
python dev_server.py 9292
