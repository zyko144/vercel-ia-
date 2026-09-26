@echo off
chcp 65001 >nul
title History Launcher - installateur
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js n est pas installe. Telecharge-le sur https://nodejs.org puis relance ce fichier.
  pause
  exit /b 1
)

echo Preparation...
call npm install --no-audit --no-fund
if errorlevel 1 goto erreur

echo Creation de l installateur (quelques minutes)...
call npm run dist
if errorlevel 1 goto erreur

echo.
echo Termine ! L installateur est dans le dossier "dist" :
dir /b dist\*.exe
echo Tu peux l envoyer a tes potes : double-clic dessus pour installer History Launcher.
start "" "%~dp0dist"
pause
exit /b 0

:erreur
echo.
echo La creation a echoue. Envoie une capture de cette fenetre.
pause
exit /b 1
