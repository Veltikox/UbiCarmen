# UbiCarmen

Página estática en **HTML, CSS y JavaScript** para explorar las opciones Campus III, Laguna de Términos y Ruta Costera de Amor x Carmen, en Ciudad del Carmen.

## Ejecutar

Desde `/workspace/UbiCarmen` (o desde la carpeta donde descargues el proyecto):

```sh
python3 -m http.server 8000 --bind 0.0.0.0
```

Abre el servidor local en tu navegador. No requiere compilación, npm, backend ni claves de API. También puede publicarse en cualquier alojamiento estático, como GitHub Pages. No se ha publicado automáticamente.

## Funciones

- Selector accesible de tres rutas.
- Al cambiar de opción se elimina el grupo anterior completo (línea y referencias), cambia el color y se encuadra el recorrido nuevo.
- Mapa Leaflet con cartografía OpenStreetMap, zoom y botón para centrar.
- Vista integrada de Waze y enlace externo, centrados en el área seleccionada.
- Diseño adaptable a móviles y mensajes de fallo del mapa.

## Datos pendientes: los trazados son ejemplos

**Las coordenadas incluidas no son rutas oficiales, no siguen necesariamente las calles y sus referencias no son paradas oficiales. No deben usarse para planificar un viaje real.** No se recibieron las imágenes de Campus III. Se necesitan imágenes legibles o, preferiblemente, una lista ordenada de paradas y calles/coordenadas para los tres recorridos y cada sentido. No hay datos de horarios, frecuencia o duración disponibles.

Los datos se editan en `routes.js`. Cada ruta contiene `name`, `category`, `color`, `description`, `coordinates` (pares `[latitud, longitud]`) y `references` (nombre, descripción e índice del punto de su línea). Al incorporar datos verificados, actualiza también todos los avisos de demostración pertinentes en la página y este documento.

**Tráfico:** Waze es un servicio externo. Su mapa puede mostrar los reportes disponibles, pero no dibuja la ruta de camión de esta página ni devuelve su duración. No hay API de tráfico conectada, cálculos de retrasos ni ubicación en vivo de los camiones. El enlace abre el mapa vial, sin activar navegación de automóvil. Si el iframe no carga, usa el enlace externo.

## Archivos y acceso a Internet

- `index.html`: contenido y controles.
- `styles.css`: diseño adaptable.
- `routes.js`: datos de muestra reemplazables.
- `app.js`: selección, capas e integración de Waze.
- `assets/vendor/leaflet/`: Leaflet **1.9.4**, distribuido localmente con su licencia BSD-2-Clause. El paquete npm se comprobó contra su integridad SHA-512 al instalarlo.

La cartografía necesita `tile.openstreetmap.org` y conserva su atribución. Waze utiliza `embed.waze.com` y `www.waze.com`, además de los recursos propios que cargue ese servicio. Para tráfico elevado, utiliza un proveedor de mapas adecuado a la [política de teselas de OpenStreetMap](https://operations.osmfoundation.org/policies/tiles/).

## Verificación

Con Playwright y Chromium disponibles y el servidor arrancado:

```sh
node tests/browser.cjs
```

Son herramientas de prueba, no dependencias de la página. La suite valida las tres rutas, eliminación de capas anteriores, colores, vista/enlace de Waze, fallos de cartografía y vista móvil. Intercepta recursos externos para no depender de la red. No verifica datos oficiales ni la disponibilidad de Waze.
