@echo off
chcp 65001 > nul
cd /d "%~dp0"
set PORT=9191

if "%1"=="stop" goto :stop
if "%1"=="status" goto :status
if "%1"=="killport" goto :killport
goto :start

:status
echo.
echo === 1974 서버 상태 ===
netstat -ano | findstr LISTENING | findstr "9191 9292 9891 9901"
echo.
echo  위에 표시된 포트가 현재 사용 중입니다. (9191 = 메인 서버, 나머지는 예전 잔여)
echo  잔여 포트 정리 : dev.bat killport ^<포트번호^>
goto :eof

:stop
echo 포트 %PORT% 서버를 종료합니다...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%PORT% " ^| findstr LISTENING') do (
    taskkill /PID %%a /F > nul 2>&1
    echo PID %%a 종료됨
)
goto :eof

:killport
if "%2"=="" goto :eof
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%2 " ^| findstr LISTENING') do (
    taskkill /PID %%a /F > nul 2>&1
    echo 포트 %2 (PID %%a) 종료됨
)
goto :eof

:start
set FOUND=
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%PORT% " ^| findstr LISTENING') do set FOUND=%%a

if defined FOUND (
    echo [안내] 서버가 이미 http://localhost:%PORT% 에서 실행 중입니다. ^(PID %FOUND%^) 새로 띄우지 않습니다.
) else (
    echo [시작] http://localhost:%PORT% 에서 서버를 시작합니다...
    start "1974 Dev Server (port %PORT%)" python dev_server.py %PORT%
    timeout /t 1 > nul
)

echo.
echo  모래엔진(에디터) : http://localhost:%PORT%/sand_engine/sand_engine.html
echo  골목길           : http://localhost:%PORT%/games/golmok/index.html
echo  펌프             : http://localhost:%PORT%/games/pump/index.html
echo.
echo  상태 확인 : dev.bat status
echo  서버 종료 : dev.bat stop
echo.

if "%1"=="engine" start "" http://localhost:%PORT%/sand_engine/sand_engine.html
if "%1"=="golmok" start "" http://localhost:%PORT%/games/golmok/index.html
if "%1"=="pump"   start "" http://localhost:%PORT%/games/pump/index.html

goto :eof
