@echo off
setlocal
title Bob and Dan - Game Server
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 goto :no_node

if not exist "node_modules\vite\bin\vite.js" (
  echo.
  echo Preparing the game for the first launch...
  echo.
  call npm install
  if errorlevel 1 goto :install_error
)

echo.
echo Starting Bob and Dan...
echo The browser will open automatically.
echo If one port is busy, another free port will be selected.
echo Keep this window open while playing.
echo Press Ctrl+C here to stop the game.
echo.

node ".\node_modules\vite\bin\vite.js" --host 127.0.0.1 --open
if errorlevel 1 goto :server_error
goto :end

:no_node
echo.
echo Node.js is not installed.
echo Install Node.js from https://nodejs.org and run this file again.
pause
exit /b 1

:install_error
echo.
echo Installation failed. Check the messages above.
pause
exit /b 1

:server_error
echo.
echo The game server stopped with an error.
pause
exit /b 1

:end
endlocal
