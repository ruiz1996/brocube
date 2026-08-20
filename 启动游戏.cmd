@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-game.ps1"
if errorlevel 1 (
  echo.
  echo Game launch failed. Check game-server-error.log for details.
  pause
)
