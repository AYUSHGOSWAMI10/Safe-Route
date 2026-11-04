const { getEdgeCost, haversineM } = require("./routeWeights");

const validModes = new Set(["faster", "balanced", "safer"]);

/**
 * Min-heap priority queue for efficient node extraction in shortest-path algorithms.
 * Items are { id, priority }. Lower priority is extracted first.
 */
class MinHeap {
  constructor() {
    this.heap = [];
  }

  size() {
    return this.heap.length;
  }

  isEmpty() {
    return this.heap.length === 0;
  }

  push(item) {
    this.heap.push(item);
    this._bubbleUp(this.heap.length - 1);
  }

  pop() {
    const size = this.heap.length;
    if (size === 0) return null;
    if (size === 1) return this.heap.pop();

    const min = this.heap[0];
    this.heap[0] = this.heap.pop();
    this._bubbleDown(0);
    return min;
  }

  _bubbleUp(index) {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      if (this.heap[parentIndex].priority <= this.heap[index].priority) break;
      [this.heap[parentIndex], this.heap[index]] = [
        this.heap[index],
        this.heap[parentIndex]
      ];
      index = parentIndex;
    }
  }

  _bubbleDown(index) {
    const n = this.heap.length;
    while (true) {
      let smallest = index;
      const left = 2 * index + 1;
      const right = 2 * index + 2;

      if (
        left < n &&
        this.heap[left].priority < this.heap[smallest].priority
      ) {
        smallest = left;
      }
      if (
        right < n &&
        this.heap[right].priority < this.heap[smallest].priority
      ) {
        smallest = right;
      }
      if (smallest === index) break;
      [this.heap[smallest], this.heap[index]] = [
        this.heap[index],
        this.heap[smallest]
      ];
      index = smallest;
    }
  }
}

function buildAdjacency(graph) {
  const adjacency = new Map();

  for (const id of Object.keys(graph.nodes)) {
    adjacency.set(id, []);
  }

  for (const edge of graph.edges) {
    // Always add the forward direction (from -> to)
    adjacency.get(edge.from).push({
      to: edge.to,
      edge
    });

    // Only add the reverse direction if the edge is not one-way
    if (!edge.oneway) {
      adjacency.get(edge.to).push({
        to: edge.from,
        edge
      });
    }
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
  const pq = new MinHeap();
  pq.push({ id: source, priority: 0 });

  while (!pq.isEmpty()) {
    const { id: current } = pq.pop();

    if (visited.has(current)) continue;
    if (current === destination) break;

    visited.add(current);
    const currentDist = dist.get(current);

    for (const connection of adjacency.get(current) || []) {
      if (visited.has(connection.to)) continue;

      const newDist =
        currentDist + getEdgeCost(connection.edge, mode);

      if (newDist < (dist.get(connection.to) ?? Infinity)) {
        dist.set(connection.to, newDist);
        prev.set(connection.to, current);
        pq.push({ id: connection.to, priority: newDist });
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

/**
 * A* search using Haversine heuristic from node coordinates to destination.
 *
 * @param {Map} adjacency - adjacency map from buildAdjacency()
 * @param {Object} coords - nodeId -> { lat, lng } map (e.g. graph.nodes)
 * @param {string} source - source node id
 * @param {string} destination - destination node id
 * @param {string} mode - "faster" | "balanced" | "safer"
 * @returns {object|null} { nodes, weightedCost } or null if no route
 */
function findRouteAStar(adjacency, coords, source, destination, mode = "faster") {
  if (!validModes.has(mode)) {
    throw new Error(`Invalid routing mode: ${mode}`);
  }

  if (!adjacency.has(source) || !adjacency.has(destination)) {
    return null;
  }

  const destCoord = coords[destination];
  const hasHeuristic =
    destCoord &&
    typeof destCoord.lat === "number" &&
    typeof destCoord.lng === "number";

  const dist = new Map([[source, 0]]);
  const prev = new Map();
  const visited = new Set();
  const pq = new MinHeap();

  const heuristic = hasHeuristic
    ? (nodeId) => {
        const c = coords[nodeId];
        if (!c || typeof c.lat !== "number" || typeof c.lng !== "number") {
          return 0;
        }
        return haversineM(c.lat, c.lng, destCoord.lat, destCoord.lng);
      }
    : () => 0;

  pq.push({ id: source, priority: heuristic(source) });

  while (!pq.isEmpty()) {
    const { id: current } = pq.pop();

    if (visited.has(current)) continue;
    if (current === destination) break;

    visited.add(current);
    const currentDist = dist.get(current);

    for (const connection of adjacency.get(current) || []) {
      if (visited.has(connection.to)) continue;

      const newDist =
        currentDist + getEdgeCost(connection.edge, mode);

      if (newDist < (dist.get(connection.to) ?? Infinity)) {
        dist.set(connection.to, newDist);
        prev.set(connection.to, current);
        const fScore = newDist + heuristic(connection.to);
        pq.push({ id: connection.to, priority: fScore });
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
  findRouteAStar,
  getEdgeCost,
  validModes,
  MinHeap
};