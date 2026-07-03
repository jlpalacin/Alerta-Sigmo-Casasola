@echo off
setlocal

cd /d "%~dp0"

echo Iniciando servidor local de Casasola...
start "Servidor Casasola" powershell.exe -NoExit -ExecutionPolicy Bypass -File "%~dp0serve.ps1"

echo Buscando direccion correcta...
for /L %%i in (1,1,20) do (
  for %%p in (8787 8788 8789 8790 8791 8792 8793 8794 8795 8796 8797 8798 8799) do (
    powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "try { $r = Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:%%p/' -TimeoutSec 1; if ($r.Content -match 'Conservador v3\.3') { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>nul
    if not errorlevel 1 (
      echo Abriendo http://127.0.0.1:%%p/
      start "" "http://127.0.0.1:%%p/"
      exit /b 0
    )
  )
  timeout /t 1 /nobreak >nul
)

echo No se ha podido localizar el servidor de Casasola.
echo Cierra ventanas antiguas de "Servidor Casasola" y vuelve a ejecutar este archivo.
pause
