/* DEMO ONLY: replace with verified Amor x Carmen route data.
 * Coordinates use [latitude, longitude]. References are not official stops.
 */
window.UbiCarmenRoutes = Object.freeze({
  campus: {
    name: 'Campus III', category: 'RUTA 01', color: '#24775d',
    description: 'Un primer vistazo al recorrido que quieres consultar hacia Campus III.',
    coordinates: [[18.6411,-91.8320],[18.6450,-91.8270],[18.6490,-91.8210],[18.6510,-91.8130],[18.6490,-91.8040],[18.6510,-91.7940],[18.6530,-91.7830],[18.6540,-91.7730],[18.6550,-91.7620]],
    references: [{name:'Inicio de ejemplo',detail:'Referencia A · pendiente de confirmar',index:0},{name:'Punto intermedio',detail:'Referencia B · pendiente de confirmar',index:4},{name:'Final de ejemplo',detail:'Referencia C · pendiente de confirmar',index:8}]
  },
  laguna: {
    name: 'Laguna de Términos', category: 'RUTA 02', color: '#b56530',
    description: 'Explora un trazado de muestra para la opción Laguna de Términos.',
    coordinates: [[18.6411,-91.8320],[18.6370,-91.8270],[18.6330,-91.8210],[18.6310,-91.8140],[18.6300,-91.8050],[18.6320,-91.7970],[18.6330,-91.7890]],
    references: [{name:'Inicio de ejemplo',detail:'Referencia A · pendiente de confirmar',index:0},{name:'Punto intermedio',detail:'Referencia B · pendiente de confirmar',index:3},{name:'Final de ejemplo',detail:'Referencia C · pendiente de confirmar',index:6}]
  },
  costera: {
    name: 'Ruta Costera', category: 'RUTA 03', color: '#7358a5',
    description: 'Visualiza un recorrido de muestra en la zona costera de la ciudad.',
    coordinates: [[18.6510,-91.8390],[18.6580,-91.8340],[18.6640,-91.8270],[18.6700,-91.8180],[18.6740,-91.8070],[18.6770,-91.7960],[18.6790,-91.7840]],
    references: [{name:'Inicio de ejemplo',detail:'Referencia A · pendiente de confirmar',index:0},{name:'Punto intermedio',detail:'Referencia B · pendiente de confirmar',index:3},{name:'Final de ejemplo',detail:'Referencia C · pendiente de confirmar',index:6}]
  }
});
