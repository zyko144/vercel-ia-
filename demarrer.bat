@echo off
rem Lance le bot sur ton PC (Windows). Double-clique sur ce fichier.
rem 1re fois : installe les dependances et cree le fichier .env a remplir.
chcp 65001 >nul
title History IA
cd /d "%~dp0"

where node >nul 2>nul
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
echo Le bot et le tableau de bord tournent sur Render : https://vercel-ia.onrender.com/dashboard
echo Ce PC ouvre le site en local, et ne prend le relais du bot que si Render est arrete
echo (il faut SUPABASE_SERVICE_KEY dans .env, sinon le bot repondrait deux fois).
echo.
echo Site vitrine     : http://localhost:3000/  (s ouvre tout seul dans le navigateur)
echo Tableau de bord  : tape /admin dashboard dans Discord, le lien ouvre https://vercel-ia.onrender.com/dashboard
echo Pour arreter le bot : ferme cette fenetre.
echo.
rem Ouvre le site en local 5 s apres le demarrage du serveur
start "" /min cmd /c "timeout /t 5 /nobreak >nul & start "" http://localhost:3000/"
call npm start
pause
