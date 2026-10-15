# UbiCarmen

Página en **HTML, CSS y JavaScript** para consultar las rutas de Amor x Carmen en Ciudad del Carmen, simular camiones y estimar viajes sobre su recorrido.

## Ejecutar

Desde la carpeta del proyecto:

```sh
python3 -m http.server 8000 --bind 0.0.0.0
```

No requiere compilación, npm ni backend. Sin clave usa Leaflet/OpenStreetMap; la integración opcional de Google Maps necesita una clave de navegador con Maps JavaScript API y facturación habilitadas. Es compatible con GitHub Pages. Leaflet 1.9.4 se incluye localmente con su licencia.

## Publicación y caché

Sitio de GitHub Pages: <https://veltikox.github.io/UbiCarmen/>. La lista de archivos de `github.com/Veltikox/UbiCarmen` muestra el código; el sitio web se abre en el enlace de Pages.

Antes de subir cambios del frontend, ejecuta:

```sh
python3 scripts/version-assets.py
```

Esto añade una huella de contenido a las URLs locales de JavaScript, CSS y el favicon, actualiza `version.json` y muestra el identificador en el pie de página. Así una página actualizada solicita los recursos nuevos. El script es repetible y no necesita dependencias.

Si el navegador conserva el HTML anterior, abre el sitio con `?v=VERSION` (el identificador de `version.json`) o realiza una recarga completa. La versión visible permite comprobar qué publicación estás viendo. El despliegue se verifica en la pestaña Actions de GitHub; un push exitoso por sí solo no confirma una publicación.

## Itinerarios

`routes.js` contiene las listas suministradas por el responsable del proyecto, respetando su orden:

- **Campus III:** 13 entradas, desde Calle 31 hasta Campus III.
- **Laguna de Términos:** 19 entradas, desde Vicente Guerrero hasta Calle 39.
- **Ruta Costera:** 9 entradas, desde Calle 22 hasta Av. Constelación. «P. del Mar» fue confirmado como **Paseo del Mar**.

Los **11 paraderos de Laguna son referencias generales**, según confirmó el responsable; no indican un sentido u orden de viaje. Se muestran aparte y no se añaden como desvíos. No hay coordenadas precisas confirmadas de los paraderos ni datos de duración o frecuencia.

## Rutas visibles desde la primera visita

`route-snapshot.js` incluye geometría real de las calles de las tres opciones, preparada a partir de OpenStreetMap/Nominatim. Se sirve con la página y se dibuja automáticamente, con Campus III seleccionada al entrar. Cambiar de opción también utiliza los datos locales: **no espera a Overpass**, no necesita almacenamiento previo ni una clave de Google.

La preparación conserva 59 secciones de vías de Campus III, 39 de Laguna y 48 de Costera. Son calles del itinerario y no una ruta oficial completa: permanecen pendientes algunas referencias, extremos, paraderos, conexiones y sentidos del servicio. Las secciones distintas no se unen con líneas ficticias y el cálculo de viaje solo admite un tramo continuo disponible. La precarga no inventa coordenadas para las referencias faltantes.

Las respuestas fuente, identificadores OSM y atribución están en [data/](data/README.md). El recurso precargado está protegido por los mismos identificadores de versión que el resto del frontend.

«Verificar cruces en línea» permite consultar los nodos de calles mediante `street-geometry.js` y Overpass. Esa comprobación identifica cruces por nodos compartidos, respeta sentidos de circulación y no utiliza calles ajenas al itinerario. **Si el servicio falla, se conservan los dibujos precargados**. Esta consulta es opcional; ya no determina si el usuario ve líneas al abrir la página.

## Google Maps

`google-map.js` prepara la integración oficial de Maps JavaScript API para mostrar calles, camiones, origen y destino en un único mapa de Google. El usuario todavía no tiene clave: el mapa alternativo sigue disponible y no se finge una activación de Google. Si el SDK no se descarga, se usa Leaflet conservando las calles locales.

Consulta [docs/google-maps.md](docs/google-maps.md) para habilitar el servicio, configurar restricciones de la clave y conocer los límites pendientes. La clave de una cuenta de servicio no debe exponerse en el navegador.

## Camiones simulados y viajes

La página usa **un solo mapa**. Por petición del usuario, muestra tres camiones **simulados**, sin GPS real. Se mueven sobre un tramo conectado de la ruta; se pueden pausar y reanudar. La simulación usa desde el inicio una sección de las calles precargadas, sin esperar al servicio externo.

Se puede elegir el origen con permiso de geolocalización o marcándolo en el mapa, y el destino mediante clic, coordenadas o una búsqueda de dirección. El viaje se dibuja en azul sobre el recorrido del camión, siguiendo su sentido. Se rechazan huecos, sentido contrario y puntos alejados.

El tiempo incluye **solo el viaje en camión**. Se usa un promedio supuesto editable de **20 km/h**. No incluye caminata, espera, tráfico ni detenciones, y los accesos aproximados no representan paraderos confirmados. La hora de llegada supone abordar ahora.

## Tráfico e incidentes en el mismo mapa

Se retiró el iframe de Waze. Con Google activado, el flujo vial utiliza su **TrafficLayer** en el mapa existente. Con Leaflet está preparada la alternativa de **TomTom**. La lista de cierres, accidentes, obras y otros avisos cercanos sigue usando el servicio opcional de incidentes de TomTom; Google TrafficLayer no entrega ese listado a la aplicación. Waze permanece como enlace externo opcional.

**Faltan las claves de navegador de los proveedores** en `config.js`: Google para su mapa/tráfico, o TomTom para flujo en Leaflet y el listado de incidentes. No se inventan incidentes. Los avisos próximos no confirman por sí solos una afectación al servicio, no desvían la ruta y no modifican el tiempo supuesto. Un fallo se comunica como estado desconocido.

Consulta [docs/live-data.md](docs/live-data.md) para configurar el proveedor, conocer las limitaciones del cálculo o sustituir la simulación por una API GPS autorizada en el futuro. No introduzcas secretos privados en archivos públicos.

## Acceso a Internet

- `tile.openstreetmap.org`: mapa base alternativo, con atribución.
- `maps.googleapis.com`, `maps.gstatic.com`: SDK y recursos de Google cuando se configura su clave.
- `overpass-api.de`: verificación opcional de nodos y cruces. Ya no es un requisito de la carga inicial.
- `nominatim.openstreetmap.org`: búsqueda explícita de direcciones.
- `api.tomtom.com`: tráfico e incidentes cuando se configura una clave pública del proveedor.
- `www.waze.com`: enlace externo opcional.

Si Overpass falla, se conserva la lista de calles y el dibujo precargado, con la opción de verificar de nuevo. Si falla la cartografía base, se ofrece «Recargar mapa» de manera independiente. No se desactiva la verificación TLS.

El uso de teselas públicas debe respetar la [política de OpenStreetMap](https://operations.osmfoundation.org/policies/tiles/). Para una web con tráfico elevado, utiliza proveedores adecuados y una copia de geometrías previamente revisada.

## Verificación

```sh
node --test tests/geometry.cjs tests/trips.cjs
node tests/browser.cjs
node tests/journey-browser.cjs
node tests/startup-browser.cjs
```

Las pruebas de navegador necesitan el servidor arrancado y Playwright/Chromium disponibles. Se pueden configurar `TEST_BASE_URL` y `CHROMIUM_PATH`. Son herramientas de pruebas, no dependencias de la página.

Las pruebas comprueban el orden de las listas, cruces reales frente a cruces aparentes, rechazo de atajos y ramales, sentidos de circulación, separación de referencias, caché, cambios de ruta, respuestas tardías, colores, encuadre de Laguna en móvil y recuperación de errores. Los datos de `tests/fixtures/` son exclusivamente sintéticos; las respuestas externas se simulan en las pruebas de navegador. También se comprueban movimiento/pausa, permisos de ubicación, búsquedas, duración sobre el itinerario y avisos próximos en un único mapa. Las pruebas no certifican disponibilidad externa ni exactitud geográfica operativa.

Las pruebas de arranque usan el recurso de producción con calles reales, sin almacenamiento previo y bloqueando servicios externos. Comprueban las tres opciones, la conservación de líneas tras fallos y el adaptador de Google con un SDK simulado. Google no pudo comprobarse con una clave real porque el usuario aún no dispone de ella.
