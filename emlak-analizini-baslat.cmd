@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
    echo Node.js bulunamadi. Once Node.js kurun, sonra tekrar deneyin.
    pause
    exit /b 1
)
node scripts\serve.cjs --port 8765
if errorlevel 1 pause
endlocal
