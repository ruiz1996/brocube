@echo off
chcp 65001 >nul
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-game.ps1"
if errorlevel 1 (
  echo.
  echo 游戏启动失败。请查看 game-server-error.log，或把窗口中的错误发给我。
  pause
)
