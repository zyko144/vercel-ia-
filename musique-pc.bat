@echo off
rem Musique du bot : serveur audio sur ce PC. Laisse la fenetre ouverte tant que tu veux de la musique.
chcp 65001 >nul
title Musique History (serveur audio)
cd /d "%~dp0"
if not exist node_modules call npm install
node tools\serveur-audio-pc.mjs
pause
