const fs = require("fs");
const path = require("path");
const { buildAdjacency, findRoute, validModes } = require("../data/ingest/routingEngine");

let cachedGraph;
let cachedAdjacency;

function loadGraph() {
  if (!cachedGraph) {
    const graphPath = path.join(__dirname, "../data/processed/walkingGraph.json");
    cachedGraph = JSON.parse(fs.readFileSync(graphPath, "utf8"));
    cachedAdjacency = buildAdjacency(cachedGraph);
  }
  return { graph: cachedGraph, adjacency: cachedAdjacency };
}

function findWalkingRoute(req, res) {
  const { source, destination, preference = "faster" } = req.body || {};
  if (typeof source !== "string" || typeof destination !== "string" || !source.trim() || !destination.trim()) {
    return res.status(400).json({ error: "source and destination must be OSM node ID strings." });
  }
  if (source === destination) {
    return res.status(400).json({ error: "Choose two different OSM nodes." });
  }
  if (!validModes.has(preference)) {
    return res.status(400).json({ error: "preference must be faster, balanced, or safer." });
  }

  try {
    const { graph, adjacency } = loadGraph();
    if (!adjacency.has(source) || !adjacency.has(destination)) {
      return res.status(404).json({ error: "One or both OSM nodes are outside the walking graph." });
    }

    const result = findRoute(adjacency, source, destination, preference);
    if (!result) return res.status(404).json({ error: "No connected walking route found." });

    let distanceM = 0;
    const trafficExposureDistanceM = {};
    for (let i = 0; i < result.nodes.length - 1; i++) {
      const from = result.nodes[i];
      const to = result.nodes[i + 1];
      const connection = adjacency.get(from).find(item => item.to === to);
      if (!connection) throw new Error(`Missing graph edge ${from} -> ${to}`);
      const edge = connection.edge;
      distanceM += edge.lengthM;
      const exposure = edge.safety?.trafficExposure ?? "unknown";
      trafficExposureDistanceM[exposure] = (trafficExposureDistanceM[exposure] || 0) + edge.lengthM;
    }

    return res.json({
      source,
      destination,
      preference,
      route: {
        nodeIds: result.nodes,
        coordinates: result.nodes.map(id => graph.nodes[id]),
        distanceM: Number(distanceM.toFixed(2)),
        weightedCost: Number(result.weightedCost.toFixed(2)),
        trafficExposureDistanceM
      },
      note: "Safety data is partial; weighted cost is not a verified safety score."
    });
  } catch (error) {
    console.error("Walking route error:", error);
    return res.status(500).json({ error: "Could not calculate walking route." });
  }
}

module.exports = { findWalkingRoute, loadGraph };
