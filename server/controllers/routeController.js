const fs = require("fs");
const path = require("path");
const Road = require("../models/Road");
const sampleRoads = require("../data/sampleRoads");
const { buildAdjacency, findRoute, validModes } = require("../data/ingest/routingEngine");

let cachedWalkingGraph = null;
let cachedWalkingAdjacency = null;

function clearCache() {
  cachedWalkingGraph = null;
  cachedWalkingAdjacency = null;
}

async function getRoads() {
  if (Road.db && Road.db.readyState === 1) {
    const savedRoads = await Road.find().lean();
    if (savedRoads.length) return savedRoads;
  }
  return sampleRoads;
}

function buildPlaceGraph(roads) {
  const nodes = {};
  for (const road of roads) {
    nodes[road.source] = { name: road.source };
    nodes[road.destination] = { name: road.destination };
  }

  const edges = roads.map((road, idx) => ({
    id: `edge_${idx}`,
    from: road.source,
    to: road.destination,
    lengthM: (road.distance || 0) * 1000,
    road: { name: `${road.source} - ${road.destination}` },
    safety: {
      trafficExposure: Number(
        Math.max(0, Math.min(5, (1 - (road.safetyScore ?? 50) / 100) * 5)).toFixed(2)
      ),
    },
    distance: road.distance,
    estimatedTime: road.estimatedTime,
    safetyScore: road.safetyScore,
  }));

  return { nodes, edges };
}

function loadWalkingGraph(customPath) {
  if (cachedWalkingGraph && cachedWalkingAdjacency && !customPath) {
    return { graph: cachedWalkingGraph, adjacency: cachedWalkingAdjacency };
  }

  const graphPath = customPath || path.join(__dirname, "../data/processed/walkingGraph.json");
  if (!fs.existsSync(graphPath)) {
    throw new Error("Graph data file not found.");
  }

  const raw = fs.readFileSync(graphPath, "utf8");
  const graph = JSON.parse(raw);

  if (!graph || typeof graph !== "object" || !graph.nodes || !Array.isArray(graph.edges)) {
    throw new Error("Graph data is malformed.");
  }

  const adjacency = buildAdjacency(graph);

  if (!customPath) {
    cachedWalkingGraph = graph;
    cachedWalkingAdjacency = adjacency;
  }

  return { graph, adjacency };
}

function calculateRouteStats(nodeIds, adjacency, isPlaceGraph = true) {
  let totalDistance = 0;
  let totalTime = 0;
  let weightedSafetySum = 0;
  let totalLengthM = 0;
  let exposureWeightedDistanceM = 0;

  for (let i = 0; i < nodeIds.length - 1; i++) {
    const from = nodeIds[i];
    const to = nodeIds[i + 1];
    const neighbors = adjacency.get(from) || [];
    const connection = neighbors.find((c) => c.to === to);

    if (!connection || !connection.edge) {
      throw new Error(`Missing graph edge between ${from} and ${to}`);
    }

    const edge = connection.edge;

    if (isPlaceGraph) {
      const dist = edge.distance ?? (edge.lengthM ? edge.lengthM / 1000 : 0);
      const time = edge.estimatedTime ?? Math.max(1, Math.round((dist * 1000) / 83.33));
      const safety = edge.safetyScore ?? 50;

      totalDistance += dist;
      totalTime += time;
      weightedSafetySum += safety * dist;
    } else {
      const lengthM = edge.lengthM || 0;
      totalLengthM += lengthM;

      const exposure = edge.safety?.trafficExposure;
      if (typeof exposure === "number" && exposure >= 0 && exposure <= 5) {
        exposureWeightedDistanceM += (exposure / 5) * lengthM;
      }
    }
  }

  if (isPlaceGraph) {
    const distanceKm = Number(totalDistance.toFixed(1));
    const estimatedTimeMin = totalTime;
    const safetyScore = totalDistance > 0 ? Math.round(weightedSafetySum / totalDistance) : 50;

    return {
      distanceKm,
      estimatedTimeMin,
      safetyScore,
    };
  }

  const distanceKm = Number((totalLengthM / 1000).toFixed(1));
  const estimatedTimeMin = Math.max(1, Math.round(totalLengthM / 83.33));
  let safetyScore = 100;
  if (totalLengthM > 0) {
    const avgExposure = exposureWeightedDistanceM / totalLengthM;
    safetyScore = Math.max(0, Math.min(100, Math.round((1 - avgExposure) * 100)));
  }

  return {
    distanceKm,
    estimatedTimeMin,
    safetyScore,
  };
}

async function getLocations(req, res) {
  try {
    const roads = await getRoads();
    if (!roads || roads.length === 0) {
      return res.status(503).json({ error: "Graph data is unavailable." });
    }
    const locations = [...new Set(roads.flatMap((road) => [road.source, road.destination]))].sort();
    return res.json({ locations });
  } catch (error) {
    return res.status(500).json({ error: "Could not load locations." });
  }
}

async function findRoutes(req, res) {
  const { source, destination, preference = "balanced" } = req.body || {};

  const src =
    typeof source === "number"
      ? String(source)
      : typeof source === "string"
      ? source.trim()
      : null;
  const dst =
    typeof destination === "number"
      ? String(destination)
      : typeof destination === "string"
      ? destination.trim()
      : null;

  if (!src || !dst) {
    return res.status(400).json({ error: "Choose a starting point and destination." });
  }

  if (src === dst) {
    return res.status(400).json({ error: "Choose two different locations." });
  }

  const mode = typeof preference === "string" ? preference.trim().toLowerCase() : "";
  if (!validModes.has(mode)) {
    return res.status(400).json({ error: "Choose Faster, Balanced, or Safer." });
  }

  let adjacency;
  let isPlaceGraph = true;

  try {
    const roads = await getRoads();
    const placeGraph = buildPlaceGraph(roads);
    const placeAdjacency = buildAdjacency(placeGraph);

    if (placeAdjacency.has(src) && placeAdjacency.has(dst)) {
      adjacency = placeAdjacency;
      isPlaceGraph = true;
    } else {
      // Fallback check against OSM walking graph if node IDs were passed
      try {
        const walkingData = loadWalkingGraph();
        if (walkingData.adjacency.has(src) && walkingData.adjacency.has(dst)) {
          adjacency = walkingData.adjacency;
          isPlaceGraph = false;
        }
      } catch (err) {
        // walkingGraph not loaded or not matching
      }
    }
  } catch (error) {
    return res.status(503).json({
      error: "Graph data is unavailable.",
    });
  }

  if (!adjacency || !adjacency.has(src) || !adjacency.has(dst)) {
    return res.status(404).json({ error: "One or both locations are outside the walking graph." });
  }

  const selectedResult = findRoute(adjacency, src, dst, mode);
  if (!selectedResult) {
    return res.status(404).json({ error: "No connected walking route found." });
  }

  const modes = [
    { mode: "faster", label: "Route A (Faster)" },
    { mode: "balanced", label: "Route B (Balanced)" },
    { mode: "safer", label: "Route C (Safer)" },
  ];

  const routes = [];
  let recommendedName = null;

  for (const { mode: m, label } of modes) {
    const result = m === mode ? selectedResult : findRoute(adjacency, src, dst, m);
    if (!result) continue;

    const stats = calculateRouteStats(result.nodes, adjacency, isPlaceGraph);
    const routeObj = {
      name: label,
      path: result.nodes,
      distance: stats.distanceKm,
      estimatedTime: stats.estimatedTimeMin,
      safetyScore: stats.safetyScore,
      cost: Number(result.weightedCost.toFixed(2)),
      preference: m,
    };

    routes.push(routeObj);
    if (m === mode) {
      recommendedName = label;
    }
  }

  if (!recommendedName && routes.length > 0) {
    recommendedName = routes[0].name;
  }

  return res.json({
    source: src,
    destination: dst,
    routes,
    recommended: recommendedName,
  });
}

module.exports = {
  getLocations,
  findRoutes,
  calculateRouteStats,
  buildPlaceGraph,
  loadWalkingGraph,
  clearCache,
};
