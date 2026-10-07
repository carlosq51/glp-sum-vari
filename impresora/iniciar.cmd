@echo off
rem Saca por la impresora los informes que mandan los tecnicos.
rem Dejar esta ventana abierta. Para que arranque solo al prender la laptop:
rem   Win+R -> shell:startup -> pegar ahi un acceso directo a este archivo.
cd /d "%~dp0"
if not exist node_modules call npm install --no-audit --no-fund
:otra
node agente.mjs --email colonioc2@gmail.com --impresora "HP92BDEE (HP LaserJet Pro MFP 3101-3108)"
echo El agente se detuvo. Reinicia en 10 s...
timeout /t 10 /nobreak >nul
goto otra
