@echo off
rem Starts the WatitaAC sparring bot in its own window: type !pelea, !muevete, !para... here, in game
rem or in the web panel (the links are printed below when it starts).
cd /d "%~dp0"
title WatitaBot - bot de combate
if not exist "panel\dist\index.html" (
  echo Compilando el panel web por primera vez...
  pushd panel
  call npm install --ignore-scripts --no-audit --no-fund
  call npm run build
  popd
)
node bot.js
pause
