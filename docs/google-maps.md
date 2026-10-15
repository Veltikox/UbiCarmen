# Google Maps y carga inicial

Las calles se sirven desde `route-snapshot.js`, un recurso local generado con geometría real de OpenStreetMap. La carga inicial y los cambios de ruta no esperan a Overpass ni requieren una clave de Google. Una verificación en línea es opcional: si falla, los dibujos locales permanecen visibles.

## Activar Google Maps

El usuario indicó que todavía no tiene clave. La integración queda preparada, **sin afirmar que Google esté activado o validado con una cuenta real**. Mientras tanto, se muestra OpenStreetMap con Leaflet en el mismo espacio y con los recorridos precargados.

1. Crea un proyecto en Google Cloud y configura la facturación requerida por Google Maps Platform.
2. Activa **Maps JavaScript API**.
3. Crea una clave para **sitios web**, restringida por referente HTTP a tu sitio (por ejemplo, `https://veltikox.github.io/*`) y a Maps JavaScript API. Añade el origen local únicamente si necesitas desarrollo local.
4. Configura la clave de navegador en `config.js`:

```js
map: {
  provider: 'google',
  googleBrowserKey: 'CLAVE_DE_NAVEGADOR_RESTRINGIDA',
  googleMapId: ''
}
```

Esta clave es visible en el navegador; no uses una clave de servicio ni credenciales privadas. La variable de entorno `GOOGLE_APPLICATION_CREDENTIALS`, cuando exista, no equivale a una clave del navegador y no debe copiarse a este archivo. El código no lee ese archivo de credenciales.

5. Ejecuta `python3 scripts/version-assets.py`, guarda los cambios y publica la nueva versión. Comprueba las restricciones y la cuota en Google Cloud si Google rechaza la carga.

Solo se crea un mapa. Al cargar Google, las líneas, camiones simulados, origen y destino se dibujan con su Maps JavaScript API; no se colocan teselas no autorizadas de Google dentro de Leaflet. Si el SDK no se descarga, se conserva la alternativa de Leaflet. La activación real sigue requiriendo tu clave, facturación, permiso de red y una comprobación con Google.

## Tráfico e incidentes

Con Google activado, el control Tráfico usa su **TrafficLayer**, sin requerir una segunda clave de TomTom para el flujo vial. Esta capa no proporciona un listado público de cierres/accidentes a nuestra aplicación. La lista de incidentes cercanos conserva la integración opcional de TomTom y requiere su clave correspondiente. No se inventan avisos y no se incluyen retrasos de tráfico en la estimación de tiempo del camión.

## Lo que sigue pendiente en los recorridos

La precarga muestra calles del itinerario con sus geometrías OSM. No convierte los nombres en una ruta oficial completa: todavía faltan algunas referencias, cruces exactos, paraderos y sentidos del servicio. El cálculo solo acepta un tramo continuo disponible y nunca atraviesa huecos para completar un viaje.

La atribución de OpenStreetMap de las líneas precargadas permanece visible junto a la atribución del mapa base de Google.
