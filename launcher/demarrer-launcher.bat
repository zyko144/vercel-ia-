@echo off
chcp 65001 >nul
title History Launcher
cd /d "%~dp0"
if not exist node_modules (
  echo Installation (1re fois, environ 1 minute)...
  call npm install --no-audit --no-fund
)
start "" npx electron .
