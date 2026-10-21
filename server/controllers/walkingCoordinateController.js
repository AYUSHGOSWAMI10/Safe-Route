const { loadGraph } = require("./walkingRouteController");
const { findRoute, validModes } = require("../data/ingest/routingEngine");

const MAX_SNAP_M = 150;

function validCoordinate(value) {
  return value && typeof value === "object" && !Array.isArray(value) &&
    typeof value.lat === "number" && Number.isFinite(value.lat) &&
    typeof value.lng === "number" && Number.isFinite(value.lng) &&
    value.lat >= -90 && value.lat <= 90 && value.lng >= -180 && value.lng <= 180;
}

function haversineM(a, b) {
  const radians = degrees => degrees * Math.PI / 180;
  const dLat = radians(b.lat - a.lat);
  const dLng = radians(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function nearestNode(nodes, coordinate) {
  let best = null;
  for (const [id, point] of Object.entries(nodes)) {
    const distanceM = haversineM(coordinate, point);
    if (!best || distanceM < best.distanceM) best = { id, distanceM };
  }
  return best;
}

function findWalkingRouteByCoordinates(req, res) {
  const { source, destination, preference = "faster" } = req.body || {};
  if (!validCoordinate(source) || !validCoordinate(destination)) {
    return res.status(400).json({ error: "source and destination must contain valid numeric lat and lng coordinates." });
  }
  if (!validModes.has(preference)) {
    return res.status(400).json({ error: "preference must be faster, balanced, or safer." });
  }

  try {
    const { graph, adjacency } = loadGraph();
    const start = nearestNode(graph.nodes, source);
    const end = nearestNode(graph.nodes, destination);
    if (!start || !end || start.distanceM > MAX_SNAP_M || end.distanceM > MAX_SNAP_M) {
      return res.status(422).json({
        error: "One or both coordinates are too far from the mapped walking network.",
        maxSnapDistanceM: MAX_SNAP_M,
        snapDistancesM: { source: start ? Math.round(start.distanceM) : null, destination: end ? Math.round(end.distanceM) : null }
      });
    }
    if (start.id === end.id) {
      return res.status(422).json({ error: "Both coordinates snap to the same graph node; choose points farther apart." });
    }
    const result = findRoute(adjacency, start.id, end.id, preference);
    if (!result) return res.status(404).json({ error: "No connected walking route found between the snapped nodes." });

    let distanceM = 0;
    const trafficExposureDistanceM = {};
    for (let i = 0; i < result.nodes.length - 1; i++) {
      const connection = adjacency.get(result.nodes[i]).find(item => item.to === result.nodes[i + 1]);
      if (!connection) throw new Error("Missing edge along calculated route");
      const edge = connection.edge;
      distanceM += edge.lengthM;
      const exposure = edge.safety?.trafficExposure ?? "unknown";
      trafficExposureDistanceM[exposure] = (trafficExposureDistanceM[exposure] || 0) + edge.lengthM;
    }
    return res.json({
      source, destination, preference,
      snapped: {
        source: { nodeId: start.id, coordinate: graph.nodes[start.id], distanceM: Number(start.distanceM.toFixed(2)) },
        destination: { nodeId: end.id, coordinate: graph.nodes[end.id], distanceM: Number(end.distanceM.toFixed(2)) }
      },
      route: {
        nodeIds: result.nodes,
        coordinates: result.nodes.map(id => graph.nodes[id]),
        distanceM: Number(distanceM.toFixed(2)),
        weightedCost: Number(result.weightedCost.toFixed(2)),
        trafficExposureDistanceM
      },
      note: "Route follows snapped OSM nodes. Snapping legs are not included in distance; safety data is partial and unverified."
    });
  } catch (error) {
    console.error("Coordinate walking route error:", error);
    return res.status(500).json({ error: "Could not calculate coordinate walking route." });
  }
}

module.exports = { findWalkingRouteByCoordinates };
