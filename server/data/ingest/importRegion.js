#!/usr/bin/env node
/**
 * importRegion.js
 *
 * Imports a regional .osm XML file into a processed walking graph JSON.
 * Reuses the existing parseOSM pipeline (walkingRules, graphBuilder, safetyScoring).
 *
 * Usage:
 *   node server/data/ingest/importRegion.js <regionCode> <osmFilePath> [outputDir]
 *
 * Example:
 *   node server/data/ingest/importRegion.js uttar-pradesh server/data/raw/uttar-pradesh.osm server/data/processed
 */

const fs = require("fs");
const path = require("path");
const { XMLParser } = require("fast-xml-parser");
const { isWalkable } = require("./walkingRules");
const { buildGraph } = require("./graphBuilder");
const { getEdgeSafetyMetadata } = require("./safetyScoring");

const regionCode = process.argv[2];
const osmFilePath = process.argv[3];
const outputDir = process.argv[4] || path.join(__dirname, "../processed");

if (!regionCode) {
  console.error("Usage: node importRegion.js <regionCode> <osmFilePath> [outputDir]");
  process.exit(1);
}

if (!osmFilePath) {
  console.error("OSM file path is required.");
  process.exit(1);
}

if (!fs.existsSync(osmFilePath)) {
  console.error(`OSM file not found: ${osmFilePath}`);
  process.exit(1);
}

fs.mkdirSync(outputDir, { recursive: true });

console.log(`Parsing OSM file: ${osmFilePath}`);
const xml = fs.readFileSync(osmFilePath, "utf8");

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  parseAttributeValue: false,
});

let data;
try {
  data = parser.parse(xml);
} catch (err) {
  console.error("Failed to parse OSM XML:", err.message);
  process.exit(1);
}

if (!data.osm) {
  console.error("Invalid OSM file: missing osm root element");
  process.exit(1);
}

const nodes = Array.isArray(data.osm.node)
  ? data.osm.node
  : data.osm.node
    ? [data.osm.node]
    : [];

const ways = Array.isArray(data.osm.way)
  ? data.osm.way
  : data.osm.way
    ? [data.osm.way]
    : [];

console.log("Total OSM nodes:", nodes.length);
console.log("Total OSM ways:", ways.length);

const walkingWays = ways.filter(isWalkable);
console.log("Walking-compatible ways:", walkingWays.length);

const { nodeMap, walkingNodeIds, edges, missingNodes } = buildGraph(nodes, walkingWays);

if (missingNodes > 0) {
  console.warn("Missing node references:", missingNodes);
}

const graphNodes = Object.fromEntries(
  [...walkingNodeIds]
    .filter(id => nodeMap.has(id))
    .map(id => [id, nodeMap.get(id)])
);

const nodeCount = Object.keys(graphNodes).length;
const edgeCount = edges.length;
console.log("Walking graph nodes:", nodeCount);
console.log("Walking graph edges:", edgeCount);

if (nodeCount === 0 || edgeCount === 0) {
  console.error("Walking graph is empty");
  process.exit(1);
}

const totalDistanceM = edges.reduce((sum, edge) => sum + edge.lengthM, 0);
console.log("Total edge length (km):", (totalDistanceM / 1000).toFixed(2));

const enrichedEdges = edges.map(edge => ({
  ...edge,
  safety: getEdgeSafetyMetadata(edge),
}));

// Compute bounds from nodes
const lats = Object.values(graphNodes).map(n => n.lat);
const lngs = Object.values(graphNodes).map(n => n.lng);
const bounds = {
  minLat: Math.min(...lats),
  maxLat: Math.max(...lats),
  minLng: Math.min(...lngs),
  maxLng: Math.max(...lngs),
};

const graphData = {
  metadata: {
    source: "OpenStreetMap",
    mode: "walking",
    regionCode,
    bounds,
    version: new Date().toISOString().split("T")[0],
    nodeCount,
    edgeCount,
    missingNodeReferences: missingNodes,
    generatedAt: new Date().toISOString(),
  },
  nodes: graphNodes,
  edges: enrichedEdges,
};

const graphPath = path.join(outputDir, `${regionCode}.json`);
fs.writeFileSync(graphPath, JSON.stringify(graphData), "utf8");

console.log("Walking graph exported:", graphPath);
console.log("OSM import completed successfully");