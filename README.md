# UbiCarmen

Página en **HTML, CSS y JavaScript** para consultar las rutas de Amor x Carmen en Ciudad del Carmen.

## Ejecutar

Desde la carpeta del proyecto:

```sh
python3 -m http.server 8000 --bind 0.0.0.0
```

No requiere compilación, npm, backend ni claves de API. Es compatible con alojamiento estático como GitHub Pages. Leaflet 1.9.4 se incluye localmente con su licencia.

## Itinerarios

`routes.js` contiene las listas suministradas por el responsable del proyecto, respetando su orden:

- **Campus III:** 13 entradas, desde Calle 31 hasta Campus III.
- **Laguna de Términos:** 19 entradas, desde Vicente Guerrero hasta Calle 39.
- **Ruta Costera:** 9 entradas, desde Calle 22 hasta Av. Constelación. «P. del Mar» fue confirmado como **Paseo del Mar**.

Los **11 paraderos de Laguna son referencias generales**, según confirmó el responsable; no indican un sentido u orden de viaje. Se muestran aparte y no se añaden como desvíos. No hay coordenadas precisas confirmadas de los paraderos ni datos de duración o frecuencia.

## Geometría y cruces

Se eliminaron las antiguas coordenadas ficticias. `street-geometry.js` consulta la geometría y los nodos de las calles en OpenStreetMap mediante Overpass. Las tres rutas comparten una consulta en curso; hay caché local de 7 días cuando el navegador permite guardarla.

- Solo usa calles con nombres coincidentes con el itinerario o sus alias explícitos.
- Identifica cruces por **nodos compartidos**; dos líneas que se acercan o se cruzan sobre un puente no implican una conexión.
- Recorta los tramos entre cruces consecutivos, sin dibujar ramales ni atajos por calles ajenas.
- Respeta sentidos de circulación y excepciones explícitas de autobús en OSM. No equivale a una validación operativa de transporte público.
- Elige conexiones coherentes dentro de cada secuencia conectada. Los huecos quedan **sin unir** y se muestran en «Enlaces por confirmar».
- Distingue, cuando la cartografía lo permite, Avenida 16 de Septiembre de Calle 16 de Septiembre.
- El mapa encuadra todas las calles localizadas de la opción seleccionada, incluyendo las partes no dibujadas; las listas tienen desplazamiento independiente. Incluye un botón para recargar teselas si falla parte del mapa.
- Al elegir otra ruta elimina todas las capas anteriores. Las respuestas tardías no vuelven a dibujar una opción descartada.

**La lista de calles no fija los cruces exactos del inicio y final, y algunas entradas son lugares o zonas, como Playa Norte o Campus III.** Hasta contar con esos detalles, se muestran únicamente los tramos comprobables y se informa que el trazado es parcial. No se inventan coordenadas de paraderos, extremos ni enlaces para completar una línea continua. Que dos calles no compartan un nodo en OSM requiere revisión; no prueba que no exista un recorrido real entre ellas.

Los datos de las calles de esta ciudad aún no pudieron verificarse desde el entorno de desarrollo porque su política de red bloqueó Overpass. Las pruebas geométricas usan datos sintéticos señalados como tales; no certifican la exactitud de las rutas reales. El navegador del usuario necesita acceder al servicio para cargar el trazado.

## Tráfico

La pestaña de Waze y el enlace externo muestran el área de la ruta. **Waze no dibuja estas rutas de camión ni devuelve su duración.** No se calcula un retraso ni se conoce la ubicación de los vehículos. Si el iframe no carga, está disponible el enlace externo.

## Acceso a Internet

- `tile.openstreetmap.org`: cartografía base, con atribución.
- `overpass-api.de`: calles, nodos de cruce y lugares. Sin claves; sujeto a disponibilidad y límites del servicio público.
- `embed.waze.com`, `www.waze.com`: mapa externo de tráfico y sus recursos.

Si Overpass falla, se conserva el itinerario completo y se ofrece «Reintentar trazado». Si falla la cartografía base, se ofrece «Recargar mapa» de manera independiente. No se desactiva la verificación TLS.

El uso de teselas públicas debe respetar la [política de OpenStreetMap](https://operations.osmfoundation.org/policies/tiles/). Para una web con tráfico elevado, utiliza proveedores adecuados y una copia de geometrías previamente revisada.

## Verificación

```sh
node --test tests/geometry.cjs
node tests/browser.cjs
```

La segunda orden necesita el servidor arrancado y Playwright/Chromium disponibles. Se pueden configurar `TEST_BASE_URL` y `CHROMIUM_PATH`. Son herramientas de pruebas, no dependencias de la página.

Las pruebas comprueban el orden de las listas, cruces reales frente a cruces aparentes, rechazo de atajos y ramales, sentidos de circulación, separación de referencias, caché, cambios de ruta, respuestas tardías, colores, encuadre de Laguna en móvil y recuperación de errores. Los datos de `tests/fixtures/` son exclusivamente sintéticos; las respuestas externas se simulan en las pruebas de navegador.
