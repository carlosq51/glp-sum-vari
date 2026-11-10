@echo off
rem Para el agente de WhatsApp: primero el bucle que lo reinicia, luego el agente.
rem Solo toca lo de la carpeta whatsapp (el de la impresora sigue corriendo).
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne $PID } | Where-Object { $_.CommandLine -like '*whatsapp\iniciar.cmd*' -or ($_.CommandLine -like '*agente.mjs*' -and $_.CommandLine -like '*--grupo*') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
echo Agente de WhatsApp detenido.
timeout /t 3 >nul
