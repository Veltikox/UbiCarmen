// Synthetic connected graph for tests. Not geographic data for the real routes.
function makeWay(id, name, nodes, points, tags = {}) {
  return { type: 'way', id, nodes, geometry: points.map(([lat, lon]) => ({ lat, lon })), tags: { highway: 'residential', name, ...tags } };
}
function routeFixture(routes) {
  let id = 1;
  let nodeId = 1;
  const elements = [];
  Object.values(routes).forEach((route, routeIndex) => {
    const count = route.streets.length;
    const nodes = Array.from({ length: count + 1 }, () => nodeId++);
    const points = Array.from({ length: count + 1 }, (_, index) => [18.63 + routeIndex * 0.02 + Math.sin(index / 2) * 0.001, -91.83 + index * 0.003]);
    route.streets.forEach((name, index) => elements.push(makeWay(id++, name, [nodes[index], nodes[index + 1]], [points[index], points[index + 1]])));
  });
  return { version: 0.6, elements };
}
module.exports = { makeWay, routeFixture };
