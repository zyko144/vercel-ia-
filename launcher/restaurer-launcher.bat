@echo off
chcp 65001 >nul
title History Launcher - restaurer la version officielle
cd /d "%~dp0"

where git >nul 2>nul
if errorlevel 1 (
  echo Git n est pas installe : impossible de restaurer automatiquement.
  pause
  exit /b 1
)

echo Ce fichier remet le launcher exactement comme la derniere version officielle.
echo Les modifications faites a la main (ou par une autre IA) dans le dossier launcher
echo sont mises de cote (git stash) : rien n est perdu, et ton fichier .env n est pas touche.
echo.
choice /c ON /m "Restaurer maintenant (O = oui, N = non)"
if errorlevel 2 exit /b 0

echo.
echo Mise de cote des modifications...
git stash push -u -m "History Launcher : modifications avant restauration" -- . >nul 2>nul
echo Recuperation de la derniere version...
git pull --ff-only
if errorlevel 1 (
  echo.
  echo La mise a jour a echoue. Envoie une capture de cette fenetre.
  pause
  exit /b 1
)
echo.
echo Termine ! Le launcher est revenu a la version officielle.
echo Pour recuperer les modifications mises de cote : git stash pop
pause
