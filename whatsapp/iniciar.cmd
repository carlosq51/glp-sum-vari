@echo off
rem Manda al grupo de WhatsApp las fallas que registra Calidad.
rem Sin ventana: usar iniciar-oculto.vbs (es el que va en shell:startup).
rem Este .cmd es la version con ventana: la PRIMERA VEZ hay que abrir este
rem para escanear el QR con el WhatsApp del numero alternativo.
rem
rem --grupo: el nombre del grupo TAL CUAL sale en WhatsApp.
cd /d "%~dp0"
if not exist node_modules call npm install --no-audit --no-fund
:otra
node --no-warnings agente.mjs --email colonioc2@gmail.com --grupo "FALLAS CALIDAD GLP"
rem 3 = ya hay otro agente corriendo: no se reintenta.
if %errorlevel%==3 goto fin
echo El agente se detuvo. Reinicia en 10 s...
timeout /t 10 /nobreak >nul
goto otra
:fin
