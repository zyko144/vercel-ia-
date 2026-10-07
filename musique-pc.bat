@echo off
rem Musique du bot : installe le serveur audio en arriere-plan, lance a chaque demarrage du PC.
chcp 65001 >nul
title Musique History (serveur audio)
cd /d "%~dp0"
if not exist node_modules call npm install
node tools\serveur-audio-pc.mjs --installer
pause
