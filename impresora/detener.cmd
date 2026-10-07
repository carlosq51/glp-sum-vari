@echo off
rem Para el agente de impresion: primero el bucle que lo reinicia, luego el agente.
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne $PID } | Where-Object { $_.CommandLine -like '*impresora\iniciar.cmd*' -or $_.CommandLine -like '*agente.mjs*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
echo Agente de impresion detenido.
timeout /t 3 >nul
