@echo off
cd /d "%~dp0"
echo 모래엔진(pump) 로컬 서버를 시작합니다 (포트 5180)...
npx serve -l 5180 .
pause
