# Lectura IGN con GitHub Actions

Esta opcion evita Cloudflare y `serve.ps1`.

GitHub Actions descarga periodicamente el listado de terremotos del IGN y lo guarda como:

```text
ign-terremotos.html
```

La app lo lee desde GitHub Pages como archivo estatico.

## Pasos

1. Copia la carpeta `.github/workflows` al repositorio de GitHub Pages, junto a `index.html`.
2. Sube tambien los archivos de la app actualizados.
3. En GitHub, entra en el repositorio.
4. Ve a `Settings` > `Actions` > `General`.
5. En `Workflow permissions`, selecciona `Read and write permissions`.
6. Guarda.
7. Ve a la pestana `Actions`.
8. Abre el workflow `Actualizar listado IGN`.
9. Pulsa `Run workflow`.
10. Espera a que termine en verde.

Cuando termine, el repositorio tendra:

```text
ign-terremotos.html
ign-terremotos-updated.txt
```

Entonces `Leer IGN` funcionara desde iPhone en GitHub Pages sin servidor local.

## Frecuencia

El workflow se ejecuta cada 15 minutos y tambien se puede lanzar manualmente con `Run workflow`.
