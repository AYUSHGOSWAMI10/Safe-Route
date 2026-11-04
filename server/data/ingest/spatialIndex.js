const { haversineM } = require("./routeWeights");

/**
 * Lightweight grid-based spatial index for fast coordinate snapping.
 *
 * Nodes are bucketed into fixed-size lat/lng cells. A query checks the cell
 * containing the query point plus surrounding cells within the search radius,
 * avoiding an O(n) scan of all graph nodes.
 *
 * No external dependencies. Pure in-memory, rebuilt when the graph changes.
 */
class SpatialIndex {
  constructor(cellSizeDeg = 0.001) {
    this.cellSizeDeg = cellSizeDeg;
    this.cells = new Map(); // key: "col,row" -> Set of nodeIds
    this.nodeCoords = new Map(); // nodeId -> { lat, lng }
    this.built = false;
  }

  _cellKey(lat, lng) {
    const col = Math.floor(lat / this.cellSizeDeg);
    const row = Math.floor(lng / this.cellSizeDeg);
    return `${col},${row}`;
  }

  /**
   * Build (or rebuild) the index from a graph nodes map.
   * @param {Object} nodes - nodeId -> { lat, lng }
   */
  build(nodes) {
    this.cells.clear();
    this.nodeCoords.clear();

    for (const [id, point] of Object.entries(nodes)) {
      if (!point || typeof point.lat !== "number" || typeof point.lng !== "number") continue;
      const key = this._cellKey(point.lat, point.lng);
      if (!this.cells.has(key)) {
        this.cells.set(key, new Set());
      }
      this.cells.get(key).add(String(id));
      this.nodeCoords.set(String(id), { lat: point.lat, lng: point.lng });
    }

    this.built = true;
  }

  /**
   * Find candidate nodes within maxDistanceM of the given coordinate.
   *
   * @param {number} lat - query latitude
   * @param {number} lng - query longitude
   * @param {number} maxDistanceM - search radius in meters
   * @returns {{ candidates: Array<{id: string, distanceM: number}>, nearestDistanceM: number|null } | null}
   *   Returns null if the index has not been built (caller falls back to full scan).
   */
  query(lat, lng, maxDistanceM) {
    if (!this.built) return null;

    const centerCol = Math.floor(lat / this.cellSizeDeg);
    const centerRow = Math.floor(lng / this.cellSizeDeg);

    // Convert search radius to degrees (approximate, latitude-dependent for longitude)
    const latDegPerM = 1 / 111000;
    const lngDegPerM = 1 / (111000 * Math.cos((lat * Math.PI) / 180));
    const cellsLat = Math.ceil((maxDistanceM * latDegPerM) / this.cellSizeDeg) + 1;
    const cellsLng = Math.ceil((maxDistanceM * lngDegPerM) / this.cellSizeDeg) + 1;

    const candidates = [];
    let nearestDistanceM = Infinity;
    const visited = new Set();

    for (let dc = -cellsLat; dc <= cellsLat; dc++) {
      for (let dr = -cellsLng; dr <= cellsLng; dr++) {
        const key = `${centerCol + dc},${centerRow + dr}`;
        const cell = this.cells.get(key);
        if (!cell) continue;

        for (const id of cell) {
          if (visited.has(id)) continue;
          visited.add(id);

          const point = this.nodeCoords.get(id);
          if (!point) continue;

          const dist = haversineM(lat, lng, point.lat, point.lng);
          if (dist < nearestDistanceM) nearestDistanceM = dist;
          if (dist <= maxDistanceM) {
            candidates.push({ id, distanceM: dist });
          }
        }
      }
    }

    candidates.sort((a, b) => a.distanceM - b.distanceM);

    return {
      candidates,
      nearestDistanceM: nearestDistanceM === Infinity ? null : nearestDistanceM
    };
  }

  size() {
    return this.nodeCoords.size;
  }
}

module.exports = { SpatialIndex };