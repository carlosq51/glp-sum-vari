@echo off
rem Saca por la impresora los informes que mandan los tecnicos.
rem Sin ventana: usar iniciar-oculto.vbs (es el que va en shell:startup).
rem Este .cmd es la version con ventana, para ver que hace.
cd /d "%~dp0"
if not exist node_modules call npm install --no-audit --no-fund
:otra
node agente.mjs --email colonioc2@gmail.com --impresora "HP92BDEE (HP LaserJet Pro MFP 3101-3108)"
rem 3 = ya hay otro agente corriendo: no se reintenta.
if %errorlevel%==3 goto fin
echo El agente se detuvo. Reinicia en 10 s...
timeout /t 10 /nobreak >nul
goto otra
:fin
