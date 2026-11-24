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
const { getRiskBand, periodOf } = require("../data/ingest/riskConfig");
const {
  assembleRoute,
  SAMPLE_PLACE_COORDINATES,
} = require("../data/ingest/routeAssembly");

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

const PLACE_ROAD_PROPERTIES = {
  "Central Park - Market Square": {
    highway: "living_street",
    lit: "yes",
    sidewalk: "both",
    surface: "paved",
    incidentRisk: 0.04,
    trafficExposure: 1,
    biases: { litBias: 0.8, actBias: 0.7, pedBias: 0.8, isoBias: 0.9, rcBias: 0.8, incBias: 0.6 },
  },
  "Central Park - City Library": {
    highway: "residential",
    lit: "yes",
    sidewalk: "both",
    surface: "asphalt",
    incidentRisk: 0.08,
    trafficExposure: 2,
    biases: { litBias: 1.0, actBias: 1.1, pedBias: 0.9, isoBias: 1.1, rcBias: 0.9, incBias: 0.9 },
  },
  "City Library - Market Square": {
    highway: "tertiary",
    lit: "yes",
    sidewalk: "both",
    surface: "paved",
    incidentRisk: 0.06,
    trafficExposure: 2,
    biases: { litBias: 0.9, actBias: 1.0, pedBias: 0.9, isoBias: 0.9, rcBias: 0.9, incBias: 0.8 },
  },
  "City Library - Riverside": {
    highway: "footway",
    lit: "disused",
    sidewalk: "both",
    surface: "cobblestone",
    incidentRisk: 0.04,
    trafficExposure: 0,
    biases: { litBias: 1.3, actBias: 1.1, pedBias: 0.7, isoBias: 1.2, rcBias: 1.2, incBias: 0.7 },
  },
  "Market Square - Riverside": {
    highway: "pedestrian",
    lit: "yes",
    sidewalk: "both",
    surface: "paving_stones",
    incidentRisk: 0.04,
    trafficExposure: 1,
    biases: { litBias: 0.8, actBias: 0.8, pedBias: 0.8, isoBias: 0.9, rcBias: 0.8, incBias: 0.7 },
  },
  "Market Square - University": {
    highway: "secondary",
    lit: "yes",
    sidewalk: "both",
    surface: "asphalt",
    incidentRisk: 0.12,
    trafficExposure: 3,
    biases: { litBias: 0.9, actBias: 1.2, pedBias: 1.3, isoBias: 0.9, rcBias: 0.9, incBias: 1.1 },
  },
  "Riverside - University": {
    highway: "footway",
    lit: "yes",
    sidewalk: "both",
    surface: "concrete",
    incidentRisk: 0.02,
    trafficExposure: 0,
    biases: { litBias: 0.7, actBias: 0.9, pedBias: 0.6, isoBias: 0.8, rcBias: 0.7, incBias: 0.6 },
  },
  "Riverside - Bus Station": {
    highway: "tertiary",
    lit: "yes",
    sidewalk: "right",
    surface: "asphalt",
    incidentRisk: 0.14,
    trafficExposure: 3,
    biases: { litBias: 1.0, actBias: 1.1, pedBias: 1.1, isoBias: 1.0, rcBias: 0.9, incBias: 1.1 },
  },
  "University - Bus Station": {
    highway: "secondary",
    lit: "yes",
    sidewalk: "both",
    surface: "asphalt",
    incidentRisk: 0.09,
    trafficExposure: 3,
    biases: { litBias: 0.9, actBias: 1.0, pedBias: 1.0, isoBias: 0.9, rcBias: 0.9, incBias: 1.0 },
  },
  "City Library - Bus Station": {
    highway: "tertiary",
    lit: "no",
    sidewalk: "none",
    surface: "unpaved",
    incidentRisk: 0.28,
    trafficExposure: 4,
    biases: { litBias: 1.5, actBias: 1.2, pedBias: 1.4, isoBias: 1.3, rcBias: 1.4, incBias: 1.3 },
  },
};

function getPlaceRoadProps(source, destination) {
  const directKey = `${source} - ${destination}`;
  const reverseKey = `${destination} - ${source}`;
  return (
    PLACE_ROAD_PROPERTIES[directKey] ||
    PLACE_ROAD_PROPERTIES[reverseKey] || {
      highway: "residential",
      lit: "yes",
      sidewalk: "both",
      surface: "asphalt",
      incidentRisk: 0.05,
      trafficExposure: 2,
      biases: { litBias: 1.0, actBias: 1.0, pedBias: 1.0, isoBias: 1.0, rcBias: 1.0, incBias: 1.0 },
    }
  );
}

function buildPlaceGraph(roads) {
  const nodes = {};
  for (const road of roads) {
    const srcCoord = SAMPLE_PLACE_COORDINATES[road.source] || { lat: 27.5700, lng: 77.6750 };
    const dstCoord = SAMPLE_PLACE_COORDINATES[road.destination] || { lat: 27.5850, lng: 77.6950 };
    nodes[road.source] = { name: road.source, ...srcCoord };
    nodes[road.destination] = { name: road.destination, ...dstCoord };
  }

  const edges = roads.map((road, idx) => {
    const srcCoord = SAMPLE_PLACE_COORDINATES[road.source] || { lat: 27.5700, lng: 77.6750 };
    const dstCoord = SAMPLE_PLACE_COORDINATES[road.destination] || { lat: 27.5850, lng: 77.6950 };
    const props = getPlaceRoadProps(road.source, road.destination);
    const lengthM = (road.distance || 0) * 1000;

    return {
      id: `edge_${idx}`,
      from: road.source,
      to: road.destination,
      geometry: [
        [srcCoord.lng, srcCoord.lat],
        [dstCoord.lng, dstCoord.lat],
      ],
      lengthM,
      road: {
        name: `${road.source} - ${road.destination}`,
        highway: props.highway,
        lit: props.lit,
        surface: props.surface,
        sidewalk: props.sidewalk,
      },
      safety: {
        trafficExposure: props.trafficExposure,
        incidentRisk: props.incidentRisk,
        lighting: props.lit,
        surface: props.surface,
        sidewalk: props.sidewalk,
      },
      biases: props.biases,
      distance: road.distance,
      estimatedTime: road.estimatedTime,
      safetyScore: road.safetyScore,
    };
  });

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

function calculateRouteStats(nodeIds, adjacency, isPlaceGraph = true, options = {}) {
  return assembleRoute(nodeIds, adjacency, { isPlaceGraph, ...options });
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

function findNearestPlaceName(lat, lng) {
  let nearest = "Central Park";
  let minD = Infinity;
  for (const [name, coord] of Object.entries(SAMPLE_PLACE_COORDINATES)) {
    const dLat = coord.lat - lat;
    const dLng = coord.lng - lng;
    const d = dLat * dLat + dLng * dLng;
    if (d < minD) {
      minD = d;
      nearest = name;
    }
  }
  return nearest;
}

function resolveLocation(loc) {
  if (!loc) return null;
  if (typeof loc === "object" && typeof loc.lat === "number" && typeof loc.lng === "number") {
    return findNearestPlaceName(loc.lat, loc.lng);
  }
  if (typeof loc === "number") return String(loc);
  if (typeof loc === "string") {
    const trimmed = loc.trim();
    if (!trimmed) return null;
    const match = trimmed.match(/Map location \(\s*([-+]?\d*\.?\d+)\s*,\s*([-+]?\d*\.?\d+)\s*\)/i);
    if (match) {
      return findNearestPlaceName(parseFloat(match[1]), parseFloat(match[2]));
    }
    if (SAMPLE_PLACE_COORDINATES[trimmed]) {
      return trimmed;
    }
    const lower = trimmed.toLowerCase();
    for (const name of Object.keys(SAMPLE_PLACE_COORDINATES)) {
      if (lower.includes(name.toLowerCase()) || name.toLowerCase().includes(lower)) {
        return name;
      }
    }
    return trimmed;
  }
  return null;
}

function resolveDestination(loc, resolvedSrc, rawSrc) {
  let resolvedDst = resolveLocation(loc);
  if (resolvedDst && resolvedDst === resolvedSrc) {
    // If raw coordinates were provided and snapped to same place, pick second closest
    if (typeof loc === "object" && typeof loc.lat === "number" && typeof loc.lng === "number") {
      let secondNearest = null;
      let minD = Infinity;
      for (const [name, coord] of Object.entries(SAMPLE_PLACE_COORDINATES)) {
        if (name === resolvedSrc) continue;
        const dLat = coord.lat - loc.lat;
        const dLng = coord.lng - loc.lng;
        const d = dLat * dLat + dLng * dLng;
        if (d < minD) {
          minD = d;
          secondNearest = name;
        }
      }
      if (secondNearest) return secondNearest;
    }
  }
  return resolvedDst;
}

async function findRoutes(req, res) {
  const { source, destination, preference = "balanced", slider, departAt } = req.body || {};

  const isIdenticalRaw =
    source === destination ||
    (typeof source === "object" &&
      typeof destination === "object" &&
      source !== null &&
      destination !== null &&
      source.lat === destination.lat &&
      source.lng === destination.lng);

  if (isIdenticalRaw) {
    return res.status(400).json({ error: "Choose two different locations." });
  }

  const src = resolveLocation(source);
  const dst = resolveDestination(destination, src, source);

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

  const period = periodOf(departAt);

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

  const queryForMode =
    mode === "custom" && customSlider !== null
      ? { slider: customSlider, period }
      : { mode, period };
  const selectedResult = findRoute(adjacency, src, dst, queryForMode);
  if (!isRouteFound(selectedResult)) {
    return res.status(404).json({
      error: "No connected walking route found.",
      code: "NO_ROUTE",
    });
  }

  const candidateProfiles = [
    { mode: "faster", label: "Route A (Faster)", slider: 0, queryMode: { mode: "faster", slider: 0, period } },
    { mode: "balanced", label: "Route B (Balanced)", slider: 0.5, queryMode: { mode: "balanced", slider: 0.5, period } },
    { mode: "safer", label: "Route C (Safer)", slider: 1.0, queryMode: { mode: "safer", slider: 1.0, period } },
  ];

  if (customSlider !== null) {
    candidateProfiles.push({
      mode: "custom",
      queryMode: { slider: customSlider, period },
      label: `Route Custom (${customSlider})`,
      slider: customSlider,
    });
  }

  const evaluatedProfiles = [];
  const pathOccurrences = new Map();

  for (const prof of candidateProfiles) {
    const qMode = prof.queryMode || prof.mode;
    const result = prof.mode === mode ? selectedResult : findRoute(adjacency, src, dst, qMode);
    if (!isRouteFound(result)) continue;

    const pathKey = result.nodes.join("->");
    if (!pathOccurrences.has(pathKey)) {
      pathOccurrences.set(pathKey, []);
    }
    pathOccurrences.get(pathKey).push(prof.mode);

    evaluatedProfiles.push({ prof, result, pathKey });
  }

  const routes = evaluatedProfiles.map(({ prof, result, pathKey }) => {
    const stats = calculateRouteStats(result.nodes, adjacency, isPlaceGraph, { period });
    const sharedProfiles = pathOccurrences.get(pathKey) || [prof.mode];
    const isShared = sharedProfiles.length > 1;

    return {
      name: prof.label,
      path: result.nodes,
      distance: stats.distanceKm,
      distanceKm: stats.distanceKm,
      distanceM: stats.distanceM,
      estimatedTime: stats.estimatedTimeMin,
      estimatedTimeMin: stats.estimatedTimeMin,
      estimatedTimeSec: stats.estimatedTimeSec,
      safetyScore: stats.safetyScore,
      riskScore: stats.riskScore,
      riskBand: stats.riskBand,
      geometry: stats.geometry,
      segments: stats.segments,
      highRiskPercentage: stats.highRiskPercentage,
      highRiskLengthM: stats.highRiskLengthM,
      worstSegment: stats.worstSegment,
      riskBreakdown: stats.riskBreakdown,
      dataConfidence: stats.dataConfidence,
      explanations: stats.explanations,
      warnings: stats.warnings,
      cost: Number(result.weightedCost.toFixed(2)),
      preference: prof.mode,
      slider: prof.slider,
      period,
      nodesExpanded: result.nodesExpanded ?? 0,
      computeTimeMs: result.computeTimeMs ?? 0,
      metadata: {
        nodesExpanded: result.nodesExpanded ?? 0,
        computeTimeMs: result.computeTimeMs ?? 0,
        period,
      },
      profiles: [prof.mode],
      mergedProfiles: sharedProfiles,
      merged: isShared,
    };
  });

  let recommendedRoute = routes.find((r) => r.preference === mode);
  if (!recommendedRoute) {
    recommendedRoute = routes.find((r) => r.profiles.includes(mode));
  }
  const recommendedName = recommendedRoute ? recommendedRoute.name : (routes[0]?.name || null);

  const totalNodesExpanded = routes.reduce((acc, r) => acc + (r.nodesExpanded || 0), 0);
  const totalComputeTimeMs = Number(
    routes.reduce((acc, r) => acc + (r.computeTimeMs || 0), 0).toFixed(3)
  );

  return res.json({
    source: src,
    destination: dst,
    routes,
    recommended: recommendedName,
    metadata: {
      period,
      departAt: departAt ? (departAt instanceof Date ? departAt.toISOString() : new Date(departAt).toISOString()) : null,
      nodesExpanded: totalNodesExpanded,
      computeTimeMs: totalComputeTimeMs,
      totalNodesExpanded,
      totalComputeTimeMs,
    },
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
