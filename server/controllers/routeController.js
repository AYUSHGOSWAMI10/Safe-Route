const fs = require("fs");
const path = require("path");
const Road = require("../models/Road");
const sampleRoads = require("../data/sampleRoads");
const {
  buildAdjacency,
  findRoute,
  validModes,
  isRouteFound,
  RouteResult,
  NoRouteResult,
} = require("../data/ingest/routingEngine");
const { getRiskBand } = require("../data/ingest/riskConfig");

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
      riskBand: getRiskBand(1 - safetyScore / 100),
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
    riskBand: getRiskBand(1 - safetyScore / 100),
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
  const { source, destination, preference = "balanced", slider } = req.body || {};

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

  // Parse optional custom slider value if provided
  let customSlider = null;
  if (slider !== undefined && slider !== null && slider !== "") {
    const s = Number(slider);
    if (!Number.isFinite(s) || s < 0 || s > 1) {
      return res.status(400).json({ error: "Slider value must be a number between 0 and 1." });
    }
    if (s !== 0 && s !== 0.5 && s !== 1) {
      customSlider = s;
    }
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

  const queryForMode = mode === "custom" && customSlider !== null ? { slider: customSlider } : mode;
  const selectedResult = findRoute(adjacency, src, dst, queryForMode);
  if (!isRouteFound(selectedResult)) {
    return res.status(404).json({
      error: "No connected walking route found.",
      code: "NO_ROUTE",
    });
  }

  const candidateProfiles = [
    { mode: "faster", label: "Route A (Faster)", slider: 0 },
    { mode: "balanced", label: "Route B (Balanced)", slider: 0.5 },
    { mode: "safer", label: "Route C (Safer)", slider: 1.0 },
  ];

  if (customSlider !== null) {
    candidateProfiles.push({
      mode: "custom",
      queryMode: { slider: customSlider },
      label: `Route Custom (${customSlider})`,
      slider: customSlider,
    });
  }

  const routesByPath = new Map();

  for (const prof of candidateProfiles) {
    const qMode = prof.queryMode || prof.mode;
    const result = prof.mode === mode ? selectedResult : findRoute(adjacency, src, dst, qMode);
    if (!isRouteFound(result)) continue;

    const pathKey = result.nodes.join("->");
    const stats = calculateRouteStats(result.nodes, adjacency, isPlaceGraph);

    if (routesByPath.has(pathKey)) {
      const existing = routesByPath.get(pathKey);
      existing.profiles.push(prof.mode);
      existing.mergedProfiles.push(prof.mode);
      existing.merged = true;
      if (prof.mode === mode) {
        existing.name = prof.label;
        existing.preference = prof.mode;
      }
    } else {
      routesByPath.set(pathKey, {
        name: prof.label,
        path: result.nodes,
        distance: stats.distanceKm,
        estimatedTime: stats.estimatedTimeMin,
        safetyScore: stats.safetyScore,
        riskBand: stats.riskBand,
        cost: Number(result.weightedCost.toFixed(2)),
        preference: prof.mode,
        slider: prof.slider,
        profiles: [prof.mode],
        mergedProfiles: [prof.mode],
        merged: false,
      });
    }
  }

  const routes = Array.from(routesByPath.values());
  let recommendedName = null;

  for (const r of routes) {
    if (r.profiles.includes(mode)) {
      recommendedName = r.name;
      break;
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
