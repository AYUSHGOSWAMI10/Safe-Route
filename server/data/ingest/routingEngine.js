const { getEdgeCost } = require("./routeWeights");

const validModes = new Set(["faster", "balanced", "safer"]);

function buildAdjacency(graph) {
  const adjacency = new Map();

  for (const id of Object.keys(graph.nodes)) {
    adjacency.set(id, []);
  }

  for (const edge of graph.edges) {
    adjacency.get(edge.from).push({
      to: edge.to,
      edge
    });

    adjacency.get(edge.to).push({
      to: edge.from,
      edge
    });
  }

  return adjacency;
}

function findRoute(adjacency, source, destination, mode = "faster") {
  if (!validModes.has(mode)) {
    throw new Error(`Invalid routing mode: ${mode}`);
  }

  if (!adjacency.has(source) || !adjacency.has(destination)) {
    return null;
  }

  const dist = new Map([[source, 0]]);
  const prev = new Map();
  const visited = new Set();

  while (true) {
    let current = null;
    let best = Infinity;

    for (const [id, distance] of dist) {
      if (!visited.has(id) && distance < best) {
        best = distance;
        current = id;
      }
    }

    if (current === null || current === destination) break;

    visited.add(current);

    for (const connection of adjacency.get(current)) {
      const newDist =
        best + getEdgeCost(connection.edge, mode);

      if (newDist < (dist.get(connection.to) ?? Infinity)) {
        dist.set(connection.to, newDist);
        prev.set(connection.to, current);
      }
    }
  }

  if (!dist.has(destination)) return null;

  const route = [];

  for (let at = destination; at !== undefined; at = prev.get(at)) {
    route.push(at);
  }

  route.reverse();

  return {
    nodes: route,
    weightedCost: dist.get(destination)
  };
}
module.exports = {
  buildAdjacency,
  findRoute,
  getEdgeCost,
  validModes
};