const fs = require("fs");
const path = require("path");
const { buildAdjacency, findRoute, validModes } = require("../data/ingest/routingEngine");
const { buildComponents } = require("./connectedComponents");

let cachedGraph = null;
let cachedAdjacency = null;
let cachedLocations = null;

function clearCache() {
  cachedGraph = null;
  cachedAdjacency = null;
  cachedLocations = null;
}

function loadGraphData(customPath) {
  if (cachedGraph && cachedAdjacency && !customPath) {
    return { graph: cachedGraph, adjacency: cachedAdjacency };
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
    cachedGraph = graph;
    cachedAdjacency = adjacency;
  }

  return { graph, adjacency };
}

function getManageableLocations(graph, adjacency, sampleCount = 25) {
  if (cachedLocations) return cachedLocations;

  const components = buildComponents(adjacency);
  const componentCounts = new Map();

  for (const compId of components.values()) {
    componentCounts.set(compId, (componentCounts.get(compId) || 0) + 1);
  }

  let largestCompId = 0;
  let maxCount = -1;
  for (const [compId, count] of componentCounts.entries()) {
    if (count > maxCount) {
      maxCount = count;
      largestCompId = compId;
    }
  }

  const mainNodes = Object.keys(graph.nodes).filter(
    (id) => components.get(id) === largestCompId
  );

  if (mainNodes.length <= sampleCount) {
    cachedLocations = mainNodes;
    return cachedLocations;
  }

  const step = Math.floor(mainNodes.length / sampleCount);
  const sampled = [];
  for (let i = 0; i < sampleCount; i++) {
    sampled.push(mainNodes[i * step]);
  }

  cachedLocations = sampled;
  return cachedLocations;
}

function calculateRouteStats(nodeIds, adjacency) {
  let totalDistanceM = 0;
  let exposureWeightedDistanceM = 0;
  let evaluatedDistanceM = 0;

  for (let i = 0; i < nodeIds.length - 1; i++) {
    const from = nodeIds[i];
    const to = nodeIds[i + 1];
    const neighbors = adjacency.get(from) || [];
    const connection = neighbors.find((c) => c.to === to);

    if (!connection || !connection.edge) {
      throw new Error(`Missing graph edge between ${from} and ${to}`);
    }

    const edge = connection.edge;
    const lengthM = edge.lengthM || 0;
    totalDistanceM += lengthM;

    const exposure = edge.safety?.trafficExposure;
    if (typeof exposure === "number" && exposure >= 0 && exposure <= 5) {
      exposureWeightedDistanceM += (exposure / 5) * lengthM;
      evaluatedDistanceM += lengthM;
    }
  }

  const distanceKm = Number((totalDistanceM / 1000).toFixed(1));
  // Walking pace ~5 km/h ≈ 83.33 meters/min
  const estimatedTimeMin = Math.max(1, Math.round(totalDistanceM / 83.33));

  let safetyScore = 100;
  if (evaluatedDistanceM > 0) {
    const avgExposure = exposureWeightedDistanceM / evaluatedDistanceM;
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
    const { graph, adjacency } = loadGraphData();
    const locations = getManageableLocations(graph, adjacency);
    return res.json({ locations });
  } catch (error) {
    return res.status(503).json({
      error: "Graph data is unavailable. Please run OSM data ingestion first.",
    });
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

  let graph;
  let adjacency;
  try {
    const data = loadGraphData();
    graph = data.graph;
    adjacency = data.adjacency;
  } catch (error) {
    return res.status(503).json({
      error: "Graph data is unavailable. Please run OSM data ingestion first.",
    });
  }

  if (!adjacency.has(src) || !adjacency.has(dst)) {
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

    const stats = calculateRouteStats(result.nodes, adjacency);
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
  loadGraphData,
  getManageableLocations,
  clearCache,
};
