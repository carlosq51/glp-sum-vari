' Arranca el agente de impresion SIN ventana (el 0 de abajo).
' Para que arranque solo: Win+R -> shell:startup -> acceso directo a este archivo.
' Lo que hace queda en agente.log. Para pararlo: detener.cmd.
Set fso = CreateObject("Scripting.FileSystemObject")
carpeta = fso.GetParentFolderName(WScript.ScriptFullName)
CreateObject("WScript.Shell").Run "cmd /c """ & carpeta & "\iniciar.cmd""", 0, False
