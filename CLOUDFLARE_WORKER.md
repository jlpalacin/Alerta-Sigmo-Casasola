# Proxy IGN con Cloudflare Worker

Este Worker sustituye a `serve.ps1` para la lectura automatica del IGN desde iPhone y GitHub Pages.

## Crear el Worker

1. Entra en Cloudflare y crea una cuenta gratuita.
2. Ve a `Workers & Pages`.
3. Pulsa `Create` y elige `Worker`.
4. Pon un nombre, por ejemplo `casasola-ign-proxy`.
5. Pulsa `Edit code`.
6. Borra el contenido y pega el contenido de `cloudflare-worker.js`.
7. Pulsa `Deploy`.

Cloudflare te dara una URL parecida a:

```text
https://casasola-ign-proxy.tuusuario.workers.dev
```

## Configurar la app

1. Abre la app desde GitHub Pages en el iPhone.
2. En `Proxy IGN HTTPS`, pega la URL del Worker.
3. Puedes pegarla con o sin `/ign-terremotos`; la app lo anade si falta.
4. Pulsa `Guardar proxy`.
5. Pulsa `Leer IGN`.

Ejemplo valido:

```text
https://casasola-ign-proxy.tuusuario.workers.dev/ign-terremotos
```

## Probar el Worker

Abre en el navegador:

```text
https://casasola-ign-proxy.tuusuario.workers.dev/ign-terremotos
```

Debe mostrar una pagina HTML del IGN con filas de terremotos.
