# Simulación, GPS y tráfico

## Estado actual

Por petición del usuario, **los camiones son una simulación**, no un servicio de GPS real. El tiempo del viaje **solo incluye el tramo en camión**. No hay datos operativos verificados, horarios, coordenadas oficiales de paraderos ni tiempos reales de llegada.

`config.js` contiene únicamente configuración pública del navegador. Nunca introduzcas contraseñas, tokens privados ni claves que deban mantenerse secretas.

## Simulación

```js
simulation: { enabled: true, vehiclesPerRoute: 3 },
estimation: { defaultAverageSpeedKph: 20, maxAccessMeters: 800 }
```

Se muestran tres unidades identificadas como simuladas. Avanzan cada segundo sobre el tramo conectado más largo que se haya localizado para la ruta seleccionada. No atraviesan huecos ni pasan de una calle a otra mediante líneas ficticias. Al terminar el tramo, comienza otra vuelta de demostración con otro identificador; no se representa un regreso real. Se pueden pausar y reanudar.

La velocidad supuesta se puede editar de 5 a 60 km/h en «Ajustar estimación». Cambia tanto la velocidad de la simulación como el cálculo de duración. Es un supuesto visible, **no una velocidad medida**. Al cambiar de ruta se eliminan los camiones anteriores. Al ocultar la pestaña se pausa el avance; no se inventa un desplazamiento durante ese intervalo.

Sin geometría disponible no se dibujan camiones ni un viaje: se conserva la lista de calles y se pide reintentar la carga. Las pruebas tienen datos sintéticos propios que no se incluyen como geometría de las rutas reales.

## Origen, destino y duración

- La geolocalización se solicita únicamente al pulsar «Mi ubicación». Requiere HTTPS (o un servidor local) y permiso del navegador. El seguimiento se puede detener. También se puede elegir el origen en el mapa.
- Se puede indicar el destino mediante clic, un par `latitud, longitud`, o una búsqueda de dirección que requiere elegir un resultado. No hay autocompletado ni peticiones por cada tecla; las búsquedas explícitas se limitan a una por segundo y se acotan a Ciudad del Carmen.
- La búsqueda envía el texto escrito a Nominatim. La posición del visitante no se guarda en almacenamiento persistente ni se envía al servicio GPS de camiones. Los servicios de mapas reciben sus solicitudes habituales de teselas.
- El origen y destino se proyectan sobre un mismo tramo conectado del itinerario. El trayecto sigue sus vértices en el sentido indicado: **no se calcula una ruta de automóvil ni se toma un atajo**.
- Si falta una conexión, el destino queda en sentido contrario o un punto está a más de 800 m del trazado localizado, no se muestra una duración engañosa.
- Los puntos proyectados son accesos aproximados, no paraderos confirmados. Las distancias de acceso son en línea recta y no son rutas peatonales.
- La duración es distancia sobre el recorrido dividida entre la velocidad supuesta. La hora indicada supone que se aborda **ahora**. No incluye caminata, espera, tráfico, tiempos de abordaje, semáforos ni detenciones. No es una promesa de llegada.

## Un solo mapa y avisos de inconvenientes

Se retiró el iframe de Waze y las pestañas que alternaban entre dos mapas. Leaflet muestra en una misma superficie las calles, camiones, origen, destino, viaje, tráfico e incidentes.

El mapa incrustado público de Waze no ofrece una API de capas para añadir nuestros camiones y recorridos. Por eso la capa integrada compatible utiliza **TomTom**. Waze permanece como enlace externo opcional, no como un segundo mapa incrustado.

Para activar datos reales de tráfico, crea una clave para uso en navegador con el proveedor, restringida a los dominios de tu web y a las APIs necesarias, y configura:

```js
traffic: { tomtomBrowserKey: 'TU_CLAVE_PUBLICA_RESTRINGIDA' }
```

Las claves de navegador son visibles en las solicitudes. No uses credenciales privadas de un operador; si el proveedor exige un secreto, necesita un servicio de servidor que lo proteja. La aplicación no trae una clave ni genera incidentes falsos.

Al activar «Tráfico»:

1. Se superponen teselas de flujo de tráfico de TomTom sobre el mapa existente.
2. Se consultan incidentes presentes en Ciudad del Carmen: cierres, obras, accidentes, congestión y otras condiciones que comunique el proveedor.
3. Se destacan los avisos situados a menos de 100 m de los tramos localizados de la ruta seleccionada. La lista se recalcula al cambiar de recorrido. Se pueden pulsar los avisos para localizarlos en el mapa.
4. Los incidentes se actualizan cada dos minutos mientras la pestaña está visible. Un fallo se muestra como **estado desconocido**, nunca como ruta libre de problemas.

La cercanía de un incidente no confirma que afecte al servicio: puede estar en una vía paralela o un puente. Se debe comprobar la descripción y el lugar. Los avisos no cambian el recorrido del camión ni se suman automáticamente a la duración estimada. No se muestran tiempos de demora inventados.

Documentación de los proveedores:

- [Waze: mapa incrustado](https://developers.google.com/waze/iframe)
- [TomTom: teselas de flujo](https://developer.tomtom.com/traffic-api/documentation/traffic-flow/flow-tiles)
- [TomTom: detalles de incidentes](https://developer.tomtom.com/traffic-api/documentation/traffic-incidents/incident-details)
- [Nominatim: política de uso](https://operations.osmfoundation.org/policies/nominatim/)

## Conectar GPS real en el futuro

Para sustituir la simulación, utiliza un servicio autorizado que publique posiciones JSON, accesible por HTTPS y con CORS para tu web (o un adaptador del mismo origen). Configura:

```js
simulation: { enabled: false, vehiclesPerRoute: 3 },
vehicles: { url: '/api/vehicles', pollIntervalMs: 15000, maxAgeMs: 60000 }
```

El endpoint es un contrato de integración, **no un servidor implementado por esta página estática**. El operador debe proporcionar la fuente. Formato:

```json
{
  "vehicles": [
    {
      "id": "IDENTIFICADOR_DE_UNIDAD",
      "routeId": "campus",
      "lat": 18.64,
      "lon": -91.82,
      "timestamp": "2026-10-15T18:00:00Z",
      "direction": "forward"
    }
  ]
}
```

Este registro solo ilustra el formato; no es una posición de un camión real. Los identificadores internos de ruta son `campus`, `laguna` y `costera`. Las fechas deben ser ISO 8601 con zona horaria. Se rechazan posiciones de más de 60 segundos, fechas más de 15 segundos en el futuro, coordenadas fuera de la ciudad, datos no numéricos y rutas desconocidas. Se conserva la posición más reciente por unidad. Las posiciones caducan en el mapa aunque falle una actualización. Nunca se mezclan marcadores GPS reales con unidades de simulación.

Si el proveedor exige autenticación privada, un backend autorizado debe transformarla a este contrato y mantener los secretos en el servidor. No los pongas en `config.js`, en URLs ni en este documento.
