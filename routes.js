/* Itineraries supplied by the project owner, in travel order.
 * No invented coordinates: street geometry comes from OpenStreetMap.
 * Laguna's stops are general references, not an ordered itinerary.
 */
window.UbiCarmenRoutes = Object.freeze({
  campus: {
    name: 'Campus III', category: 'RUTA 01', color: '#24775d',
    description: 'Calle 31 → Campus III. Calles en el orden indicado para este recorrido.',
    streets: ['Calle 31', 'Periférica Norte', 'Av. Concordia', 'Av. Corregidora', 'Calle 37', 'Boquerón del Palmar', 'Carretera Carmen - Puerto Real', 'Calle Escárcega', 'Av. Puerto de Campeche', 'Av. Abasolo', 'Av. Contadores', 'Av. Central', 'Campus III'],
    stops: [], places: ['Campus III'],
    aliases: {
      'Periférica Norte': ['Avenida Periférica Norte', 'Periférico Norte'],
      'Carretera Carmen - Puerto Real': ['Carmen - Puerto Real', 'Carretera Ciudad del Carmen - Puerto Real'],
      'Campus III': ['Campus III UNACAR', 'Campus III de la Universidad Autónoma del Carmen']
    }
  },
  laguna: {
    name: 'Laguna de Términos', category: 'RUTA 02', color: '#b56530',
    description: 'Vicente Guerrero → Calle 39. Itinerario completo y 11 referencias generales de paraderos.',
    streets: ['Vicente Guerrero', 'Balneario de la Manigua', 'Av. 16 de Septiembre', 'Calle Satélite', 'Miguel de la Madrid', 'Calle Albatros', 'Calle Tijerilla', 'Francisco Javier Mina', 'Capilla San Judas Tadeo', 'Calle 17-D', 'Av. 10 de Julio', 'Calle 16 de Septiembre', 'Av. Las Américas', 'C. José María Morelos y Pavón', 'Calle 19', 'Calle 42', 'Calle 31', 'Calle 22', 'Calle 39'],
    stops: ['Paradero Mercado AFA', 'Malecón del Centro', 'Calle 25', 'Calle 24', 'Monumento La Bandera', 'Calle 28 x 17', 'Parque del Pescador', 'Avenida 10 de Julio', 'Calle 40', 'Calle Independencia', 'Calle Constitución'],
    places: ['Balneario de la Manigua', 'Capilla San Judas Tadeo'],
    aliases: {
      'Balneario de la Manigua': ['Balneario La Manigua'],
      'Miguel de la Madrid': ['Miguel de la Madrid Hurtado'],
      'Capilla San Judas Tadeo': ['Capilla de San Judas Tadeo', 'San Judas Tadeo'],
      'Calle 17-D': ['Calle 17D'],
      'C. José María Morelos y Pavón': ['José María Morelos y Pavón']
    }
  },
  costera: {
    name: 'Ruta Costera', category: 'RUTA 03', color: '#7358a5',
    description: 'Calle 22 → Av. Constelación. Calles y referencias en el orden indicado.',
    streets: ['Calle 22', 'Calle 47', 'Calle 26', 'Playa Norte', 'Malecón Costero', 'Paseo del Mar', 'Av. Amado Nervo', 'Av. Nardos', 'Av. Constelación'],
    stops: [], places: ['Playa Norte'],
    aliases: { 'Malecón Costero': ['Malecón de la Costera'] }
  }
});
