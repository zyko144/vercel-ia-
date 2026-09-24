@echo off
rem Lance le bot sur ton PC (Windows). Double-clique sur ce fichier.
rem 1re fois : installe les dependances et cree le fichier .env a remplir.
chcp 65001 >nul
title AI Vercel
cd /d "%~dp0"

where node >/dev/null 2>nul
if errorlevel 1 (
  echo Node.js n est pas installe. Installe la version LTS sur https://nodejs.org puis relance ce fichier.
  start "" https://nodejs.org/fr/download
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installation des dependances, une seule fois, ca prend quelques minutes...
  call npm install
  if errorlevel 1 (
    echo L installation a echoue. Verifie ta connexion internet et relance.
    pause
    exit /b 1
  )
)

if not exist .env (
  copy .env.example .env >nul
  echo.
  echo Le fichier .env vient d etre cree et va s ouvrir.
  echo Remplis au minimum DISCORD_TOKEN et GEMINI_API_KEY, enregistre, puis relance ce fichier.
  notepad .env
  pause
  exit /b 0
)

echo.
echo ATTENTION : si le bot tourne aussi sur Render, coupe-le la-bas, sinon il repondra deux fois.
echo.
echo Site vitrine     : http://localhost:3000/
echo Tableau de bord  : tape /admin dashboard dans Discord pour recevoir ton lien
echo Pour arreter le bot : ferme cette fenetre.
echo.
call npm start
pause
