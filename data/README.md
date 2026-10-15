# Geometría precargada de calles

`street-searches.json` contiene respuestas de una preparación única con Nominatim para los nombres de calles y lugares suministrados por el usuario, acotadas a Ciudad del Carmen. Se descargaron por HTTPS con verificación de certificados, en un solo proceso, con más de un segundo entre consultas y caché persistente. No se incluye un geocodificador masivo en el arranque de la web.

Fuente: **© OpenStreetMap contributors**, a través de Nominatim, consultado el 15 de octubre de 2026. Licencia: [Open Database License (ODbL)](https://www.openstreetmap.org/copyright). Las geometrías y sus identificadores OSM se conservan para revisión. Este archivo no contiene posiciones de camiones ni datos personales del usuario.

Regenerar el recurso estático:

```sh
node scripts/build-route-snapshot.cjs data/street-searches.json
python3 scripts/version-assets.py
```

El generador filtra por nombres exactos normalizados y alias declarados. Descarta resultados ajenos que devuelva el buscador, como Calle 17 al buscar Calle 17-D. No convierte zonas como Playa Norte en una calle distinta con nombre parecido. Los nombres no localizados siguen pendientes.

Cada sección publicada conserva su propia geometría de vía OSM. **Las calles se muestran como referencias del itinerario; sus extremos, conexiones entre vías y el sentido del servicio de autobús no están verificados.** No se unen secciones distintas con líneas ficticias ni se asegura que el dibujo sea una ruta oficial completa. La atribución permanece junto al mapa, también cuando el mapa base sea Google.
