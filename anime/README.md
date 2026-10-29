# Yomori · extensiones de anime y películas

Fuentes de anime/películas para ZENTU (API de fuentes de anime portada de Aniyomi).
El código está en `../anime-extensions/`; aquí quedan los APK y el índice.

| Fuente | Paquete | Estado |
|---|---|---|
| AnimeAV1 (animeav1.com) | `eu.kanade.tachiyomi.animeextension.es.animeav1` | catálogo, filtros, ficha, episodios; video por MP4Upload (el HLS del sitio lo bloquea Cloudflare) |
| Mega1080 (mega1080.me) | pendiente | sin empezar |

## Compilar

```bash
cd ../anime-extensions
./gradlew :animeav1:assembleRelease
```

El APK queda en `animeav1/build/outputs/apk/release/`.

## Firma (importante)

Los APK de esta carpeta están firmados con la **clave de debug de Android**, solo para pruebas
(las compilaciones debug de ZENTU las aceptan). Antes de publicarlos, vuelve a firmarlos con
`yomori-extension.keystore` (la contraseña la pones tú):

```bash
apksigner sign --ks ../yomori-extension.keystore --out es-animeav1-release.apk animeav1-release.apk
```

## Índice

`index.json` / `index.min.json` listan las extensiones de anime, separadas del índice de manga.
