# Casasola Movil

Aplicacion movil/PWA para evaluar la alerta sismica de la presa de Casasola con criterio conservador.

## Abrir en este ordenador

Ejecuta:

```powershell
powershell -ExecutionPolicy Bypass -File .\serve.ps1
```

Despues abre la direccion que indique la consola, por ejemplo:

```text
http://127.0.0.1:8790/
```

Tambien puedes usar `Abrir_Casasola.bat`.

## Abrir desde un movil

1. Conecta el ordenador y el movil a la misma Wi-Fi.
2. Ejecuta `serve.ps1` en este ordenador.
3. En el navegador del movil abre la URL LAN que aparece en la consola, por ejemplo:

```text
http://10.197.22.196:8790/
```

4. Si Windows pregunta por el firewall, permite el acceso a PowerShell en red privada.

## Instalar como app

En Android/Chrome usa `Anadir a pantalla de inicio`.
En iPhone/Safari usa `Compartir` y despues `Anadir a pantalla de inicio`.

La lectura automatica del IGN puede funcionar de tres formas:

- Con GitHub Actions, recomendado para iPhone y GitHub Pages. Ver `GITHUB_ACTIONS_IGN.md`.
- Con `serve.ps1`, si abres la app desde el ordenador o desde la misma Wi-Fi.
- Sin `serve.ps1`, usando un Cloudflare Worker HTTPS. Ver `CLOUDFLARE_WORKER.md`.
