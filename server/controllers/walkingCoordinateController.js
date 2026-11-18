const path = require("path");
const { loadGraph } = require("./walkingRouteController");
const { findRoute, validModes } = require("../data/ingest/routingEngine");
const { buildComponents } = require("./connectedComponents");
const { SpatialIndex } = require("../data/ingest/spatialIndex");
const { regionRegistry } = require("../data/ingest/regionRegistry");

const MAX_SNAP_M = 150;
let cachedComponents;
let cachedAdjacency;
let cachedSpatialIndex;
let cachedGraphPath;

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

/**
 * Full-scan candidate search (original O(n) implementation).
 * Used as fallback when the spatial index is unavailable.
 */
function getCandidatesFullScan(nodes, coordinate) {
  const candidates = [];
  let nearestDistanceM = Infinity;
  for (const [id, point] of Object.entries(nodes)) {
    const distanceM = haversineM(coordinate, point);
    if (distanceM < nearestDistanceM) nearestDistanceM = distanceM;
    if (distanceM <= MAX_SNAP_M) candidates.push({ id, distanceM });
  }
  candidates.sort((a, b) => a.distanceM - b.distanceM);
  return { candidates, nearestDistanceM };
}

/**
 * Get candidates using the spatial index when available, falling back to
 * a full scan. The graph path is tracked so the index is rebuilt when a
 * different graph file is loaded.
 */
function getCandidates(nodes, coordinate, graphPath) {
  const index = getSpatialIndex(nodes, graphPath);
  if (index) {
    const result = index.query(coordinate.lat, coordinate.lng, MAX_SNAP_M);
    if (result) return result;
  }
  return getCandidatesFullScan(nodes, coordinate);
}

/**
 * Build or retrieve a cached spatial index for the given graph nodes.
 * Rebuilds when the graph path changes (e.g. different region).
 */
function getSpatialIndex(nodes, graphPath) {
  if (cachedSpatialIndex && cachedGraphPath === graphPath) {
    return cachedSpatialIndex;
  }

  const index = new SpatialIndex();
  index.build(nodes);
  cachedSpatialIndex = index;
  cachedGraphPath = graphPath;
  return index;
}

function selectConnectedPair(starts, ends, components) {
  const nearestEndByComponent = new Map();
  for (const end of ends) {
    const component = components.get(end.id);
    const current = nearestEndByComponent.get(component);
    if (!current || end.distanceM < current.distanceM) nearestEndByComponent.set(component, end);
  }
  let best = null;
  for (const start of starts) {
    const end = nearestEndByComponent.get(components.get(start.id));
    if (!end || start.id === end.id) continue;
    const snapCost = start.distanceM + end.distanceM;
    if (!best || snapCost < best.snapCost) best = { start, end, snapCost };
  }
  return best;
}

function findWalkingRouteByCoordinates(req, res) {
  const { source, destination, preference = "faster", regionCode } = req.body || {};
  if (!validCoordinate(source) || !validCoordinate(destination)) {
    return res.status(400).json({ error: "source and destination must contain valid numeric lat and lng coordinates." });
  }
  if (!validModes.has(preference)) {
    return res.status(400).json({ error: "preference must be faster, balanced, or safer." });
  }

  // Cross-region coverage check: source and destination must be within
  // the same supported region. Until cross-region routing is implemented,
  // return a clear unsupported-coverage response instead of silently
  // returning no route.
  if (regionCode) {
    const region = regionRegistry.get(regionCode);
    if (!region) {
      return res.status(422).json({
        error: `Region '${regionCode}' is not available.`,
      });
    }
    const { bounds } = region.metadata;
    const inBounds = (c) =>
      c.lat >= bounds.minLat && c.lat <= bounds.maxLat &&
      c.lng >= bounds.minLng && c.lng <= bounds.maxLng;
    if (!inBounds(source) || !inBounds(destination)) {
      return res.status(422).json({
        error: "One or both coordinates are outside the selected region's bounds.",
        region: regionCode,
      });
    }
  } else {
    const sourceRegion = regionRegistry.findRegionByCoords(source.lat, source.lng);
    const destRegion = regionRegistry.findRegionByCoords(destination.lat, destination.lng);
    if (!sourceRegion || !destRegion) {
      return res.status(422).json({
        error: "One or both coordinates are outside any supported walking region.",
      });
    }
    if (sourceRegion.regionCode !== destRegion.regionCode) {
      return res.status(422).json({
        error: "Source and destination are in different regions. Cross-region routing is not yet supported.",
        sourceRegion: sourceRegion.regionCode,
        destinationRegion: destRegion.regionCode,
      });
    }
  }

  try {
    const { graph, adjacency } = loadGraph(regionCode);
    if (cachedAdjacency !== adjacency) {
      cachedComponents = buildComponents(adjacency);
      cachedAdjacency = adjacency;
    }
    const graphPath = path.join(__dirname, "../data/processed/walkingGraph.json");
    const startCandidates = getCandidates(graph.nodes, source, graphPath);
    const endCandidates = getCandidates(graph.nodes, destination, graphPath);
    if (!startCandidates.candidates.length || !endCandidates.candidates.length) {
      return res.status(422).json({
        error: "One or both coordinates are too far from the mapped walking network.",
        maxSnapDistanceM: MAX_SNAP_M,
        snapDistancesM: {
          source: Number.isFinite(startCandidates.nearestDistanceM) ? Math.round(startCandidates.nearestDistanceM) : null,
          destination: Number.isFinite(endCandidates.nearestDistanceM) ? Math.round(endCandidates.nearestDistanceM) : null
        }
      });
    }
    const pair = selectConnectedPair(startCandidates.candidates, endCandidates.candidates, cachedComponents);
    if (!pair) {
      return res.status(422).json({ error: "No distinct connected walking nodes found within snapping range.", maxSnapDistanceM: MAX_SNAP_M });
    }
    const { start, end } = pair;
    const result = findRoute(adjacency, start.id, end.id, preference);
    if (!result || !result.found || result.status === "NO_ROUTE") {
      return res.status(404).json({ error: "No connected walking route found between the snapped nodes.", code: "NO_ROUTE" });
    }

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
      note: "Route follows connected snapped OSM nodes. Snapping legs are not included in distance; safety data is partial and unverified."
    });
  } catch (error) {
    console.error("Coordinate walking route error:", error);
    return res.status(500).json({ error: "Could not calculate coordinate walking route." });
  }
}

function clearCache() {
  cachedComponents = null;
  cachedAdjacency = null;
  cachedSpatialIndex = null;
  cachedGraphPath = null;
}

module.exports = { findWalkingRouteByCoordinates, clearCache };
