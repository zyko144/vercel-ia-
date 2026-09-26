@echo off
chcp 65001 >nul
title History Launcher
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js n est pas installe. Telecharge-le sur https://nodejs.org puis relance ce fichier.
  pause
  exit /b 1
)

rem A chaque lancement : installe ce qui manque (rapide si tout est deja la)
echo Verification des modules...
call npm install --no-audit --no-fund
if errorlevel 1 (
  echo.
  echo L installation a echoue. Envoie une capture de cette fenetre.
  pause
  exit /b 1
)

echo Lancement de History Launcher...
call npx electron .
if errorlevel 1 (
  echo.
  echo Le launcher s est arrete avec une erreur. Envoie une capture de cette fenetre.
  echo Journal : %APPDATA%\History Launcher\erreurs.log
  pause
)
