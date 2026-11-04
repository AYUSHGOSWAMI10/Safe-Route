#!/usr/bin/env node
/**
 * importWorkflow.js
 *
 * Reliable regional OSM graph import workflow.
 *
 * Run via CLI (not from HTTP endpoint directly):
 *   node server/data/ingest/importWorkflow.js <regionCode> <regionName> <url>
 *
 * Checks performed in order:
 *   1. Download Geofabrik .osm.pbf extract (curl)
 *   2. Convert to OSM XML (osmconvert / osmosis)
 *   3. Parse and build walking graph (fast-xml-parser + graphBuilder)
 *   4. Validate graph (node count, edge count, bounds, safety metadata)
 *   5. Write graph file (atomic: to temp file, then rename)
 *   6. Register region in MongoDB (Region model)
 *   7. Register region in memory registry (RegionRegistry)
 *
 * Safety:
 *   - Never overwrites an existing active region
 *   - Never marks import completed until step 6+7 succeed
 *   - Failed step 6 rolls back step 5 (deletes temp graph file)
 *   - Exit code 0 = success, non-zero = failure
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const { XMLParser } = require("fast-xml-parser");
const { isWalkable } = require("./walkingRules");
const { buildGraph } = require("./graphBuilder");
const { getEdgeSafetyMetadata } = require("./safetyScoring");
const { RegionRegistry } = require("./regionRegistry");
const { buildAdjacency } = require("./routingEngine");

const GEOFABRIK_BASE = "https://download.geofabrik.de/asia/india";
const MAX_FILE_SIZE_M = 2000;
const MAX_MISSING_NODES_RATIO = 0.1;

function printUsage() {
  console.log(
    `Usage: node importWorkflow.js <regionCode> <regionName> <geofabrikUrl> [downloadDir] [processedDir]
Examples:
  node importWorkflow.js uttar-pradesh "Uttar Pradesh" "https://download.geofabrik.de/asia/india/uttar-pradesh-latest.osm.pbf"
  node importWorkflow.js delhi "Delhi" "https://download.geofabrik.de/asia/india/delhi-latest.osm.pbf"
`
  );
  process.exit(1);
}

function validateInputs(regionCode, regionName, url) {
  if (!regionCode || typeof regionCode !== "string") {
    console.error("ERROR: regionCode is required.");
    printUsage();
  }
  if (!regionName || typeof regionName !== "string") {
    console.error("ERROR: regionName is required.");
    printUsage();
  }
  if (!url || typeof url !== "string") {
    console.error("ERROR: geofabrikUrl is required.");
    printUsage();
  }
  const cleanCode = regionCode.trim().toLowerCase();
  if (!/^[a-z0-9-]+$/.test(cleanCode)) {
    console.error("ERROR: regionCode must contain only lowercase letters, numbers, and hyphens.");
    printUsage();
  }
  try {
    new URL(url);
  } catch {
    console.error("ERROR: sourceUrl is not a valid URL.");
    printUsage();
  }
  return cleanCode;


function downloadExtract(url, downloadDir) {
  if (!url) {
    console.error("ERROR: sourceUrl is required for download.");
    printUsage();
  }

  const filename = path.basename(new URL(url).pathname);
  if (!filename) {
    console.error("ERROR: Could not determine source filename from URL.");
    printUsage();
  }

  const pbfPath = path.resolve(downloadDir, filename);
  fs.mkdirSync(downloadDir, { recursive: true });

  console.log(`Downloading ${filename} from ${url}...`);
  try {
    execSync(`curl -L --fail --silent --show-error -o "${pbfPath}" "${url}"`, {
      stdio: ["ignore", "ignore", "inherit"],
    });
  } catch (err) {
    console.error(`ERROR: Download failed: ${err.message}`);
    process.exit(1);
  }

  if (!fs.existsSync(pbfPath)) {
    console.error(`ERROR: Download completed but file was not created: ${pbfPath}`);
    process.exit(1);
  }

  return pbfPath;
}

function convertPbfToXml(pbfPath, outputDir) {
  if (!fs.existsSync(pbfPath)) {
    console.error(`ERROR: PBF file not found: ${pbfPath}`);
    process.exit(1);
  }

  const filename = path.basename(pbfPath, ".osm.pbf");
  const osmPath = path.resolve(outputDir, `${filename}.osm`);
  fs.mkdirSync(outputDir, { recursive: true });

  console.log(`Converting ${path.basename(pbfPath)} to OSM XML...`);

  // Try osmconvert first, fall back to osmosis (matching existing pipeline).
  try {
    execSync(`osmconvert "${pbfPath}" -o="${osmPath}"`, { stdio: "inherit" });
  } catch (osmconvertErr) {
    try {
      execSync(
        `osmosis --read-pbf file="${pbfPath}" --write-xml file="${osmPath}"`,
        { stdio: "inherit" }
      );
    } catch (osmosisErr) {
      console.error(
        `ERROR: PBF to OSM XML conversion failed: ${osmconvertErr.message}; ${osmosisErr.message}`
      );
      console.error("Install osmconvert or osmosis to convert PBF to OSM XML.");
      process.exit(1);
    }
  }

  if (!fs.existsSync(osmPath)) {
    console.error(`ERROR: Conversion completed but output file was not created: ${osmPath}`);
    process.exit(1);
  }

  return osmPath;
}

}



function buildWalkingGraph(osmPath, regionCode) {
  if (!fs.existsSync(osmPath)) {
    console.error("ERROR: OSM file not found.");
    process.exit(1);
  }
  const fileSizeM = fs.statSync(osmPath).size / (1024 * 1024);
  if (fileSizeM > MAX_FILE_SIZE_M) {

function buildWalkingGraph(osmPath, regionCode) {
  if (!fs.existsSync(osmPath)) {
    console.error("ERROR: OSM file not found.");
    process.exit(1);
  }
  const fileSizeM = fs.statSync(osmPath).size / (1024 * 1024);
  if (fileSizeM > MAX_FILE_SIZE_M) {
    console.error(
      `ERROR: OSM file too large for in-memory processing: ${fileSizeM.toFixed(1)} MB (limit: ${MAX_FILE_SIZE_M} MB)`
    );
    process.exit(1);
  }

  console.log(`Parsing ${path.basename(osmPath)}...`);
  let xml;
  try {
    xml = fs.readFileSync(osmPath, "utf8");
  } catch (err) {
    console.error(`ERROR: Cannot read OSM file: ${err.message}`);
    process.exit(1);
  }

  let data;
  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "",
      parseAttributeValue: false,
    });
    data = parser.parse(xml);
  } catch (err) {
    console.error(`ERROR: Failed to parse OSM XML: ${err.message}`);
    process.exit(1);
  }

  if (!data.osm) {
    console.error("ERROR: Invalid OSM file: missing osm root element");
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

  console.log(`Total OSM nodes: ${nodes.length}`);
  console.log(`Total OSM ways: ${ways.length}`);

  const walkingWays = ways.filter(isWalkable);
  console.log(`Walking-compatible ways: ${walkingWays.length}`);

  const { nodeMap, walkingNodeIds, edges, missingNodes } = buildGraph(nodes, walkingWays);

  if (missingNodes > 0 && missingNodes > nodes.length * MAX_MISSING_NODES_RATIO) {
    console.warn(
      `WARNING: ${missingNodes}/${nodes.length} node references missing from ways`
    );
  }

  const graphNodes = Object.fromEntries(
    [...walkingNodeIds]
      .filter((id) => nodeMap.has(id))
      .map((id) => [id, nodeMap.get(id)])
  );

  const nodeCount = Object.keys(graphNodes).length;
  const edgeCount = edges.length;

  if (nodeCount === 0 || edgeCount === 0) {
    console.error("ERROR: Walking graph is empty (no nodes or edges).");
    process.exit(1);
  }

  console.log(`Walking graph nodes: ${nodeCount}`);
  console.log(`Walking graph edges: ${edgeCount}`);

  const enrichedEdges = edges.map((edge) => ({
    ...edge,
    safety: getEdgeSafetyMetadata(edge),
  }));

  const lats = Object.values(graphNodes).map((n) => n.lat);
  const lngs = Object.values(graphNodes).map((n) => n.lng);
  const bounds = {
    minLat: Math.min(...lats),
    maxLat: Math.max(...lats),
    minLng: Math.min(...lngs),
    maxLng: Math.max(...lngs),
  };

  return {
    nodes: graphNodes,
    edges: enrichedEdges,
    metadata: {
      source: "OpenStreetMap",
      mode: "walking",
      regionCode,
      bounds,
      nodeCount,
      edgeCount,
      missingNodeReferences: missingNodes,
      sourceUrl: null,
      generatedAt: new Date().toISOString(),
    },
    nodeMap,
  };
}

    console.error(
      `ERROR: OSM file too large for in-memory processing: ${fileSizeM.toFixed(1)} MB (limit: ${MAX_FILE_SIZE_M} MB)`
    );
    process.exit(1);
  }

  console.log(`Parsing ${path.basename(osmPath)}...`);
  let xml;
  try {
    xml = fs.readFileSync(osmPath, "utf8");
  } catch (err) {
    console.error(`ERROR: Cannot read OSM file: ${err.message}`);
    process.exit(1);
  }

  let data;
  try {
    const { XMLParser } = require("fast-xml-parser");
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "",
      parseAttributeValue: false,
    });
    data = parser.parse(xml);
  } catch (err) {
    console.error(`ERROR: Failed to parse OSM XML: ${err.message}`);
    process.exit(1);
  }

  if (!data.osm) {
    console.error("ERROR: Invalid OSM file: missing osm root element");
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

  console.log(`Total OSM nodes: ${nodes.length}`);
  console.log(`Total OSM ways: ${ways.length}`);

  const walkingWays = ways.filter(isWalkable);
  console.log(`Walking-compatible ways: ${walkingWays.length}`);

  const { nodeMap, walkingNodeIds, edges, missingNodes } = buildGraph(nodes, walkingWays);

  if (missingNodes > 0 && missingNodes > nodes.length * MAX_MISSING_NODES_RATIO) {
    console.warn(`WARNING: ${missingNodes}/${nodes.length} node references missing from ways`);
  }

  const graphNodes = Object.fromEntries(
    [...walkingNodeIds]
      .filter((id) => nodeMap.has(id))
      .map((id) => [id, nodeMap.get(id)])
  );

  const nodeCount = Object.keys(graphNodes).length;
  const edgeCount = edges.length;

  if (nodeCount === 0 || edgeCount === 0) {
    console.error("ERROR: Walking graph is empty (no nodes or edges).");
    process.exit(1);
  }

  console.log(`Walking graph nodes: ${nodeCount}`);
  console.log(`Walking graph edges: ${edgeCount}`);

  const enrichedEdges = edges.map((edge) => ({
    ...edge,
    safety: getEdgeSafetyMetadata(edge),
  }));

  const lats = Object.values(graphNodes).map((n) => n.lat);
  const lngs = Object.values(graphNodes).map((n) => n.lng);
  const bounds = {
    minLat: Math.min(...lats),
    maxLat: Math.max(...lats),
    minLng: Math.min(...lngs),
    maxLng: Math.max(...lngs),
  };

  return {
    nodes: graphNodes,
    edges: enrichedEdges,
    metadata: {
      source: "OpenStreetMap",
      mode: "walking",
      regionCode,
      bounds,
      nodeCount,
      edgeCount,
      missingNodeReferences: missingNodes,
      generatedAt: new Date().toISOString(),
    },
    nodeMap,
  };
}

function validateGraph(graph) {
  const { nodes, edges, metadata } = graph;
  const { bounds, nodeCount, edgeCount, missingNodeReferences } = metadata;

  if (!bounds || !bounds.minLat || !bounds.maxLat || !bounds.minLng || !bounds.maxLng) {
    console.error("ERROR: Graph bounds are missing.");
    process.exit(1);
  }
  if (nodeCount === 0) {
    console.error("ERROR: Graph has zero nodes.");
    process.exit(1);
  }
  if (edgeCount === 0) {
    console.error("ERROR: Graph has zero edges.");
    process.exit(1);
  }
  if (bounds.minLat > bounds.maxLat || bounds.minLng > bounds.maxLng) {
    console.error("ERROR: Invalid bounds.");
    process.exit(1);
  }

function writeGraph(graph, outputDir, regionCode) {
  const fileName = `${regionCode}.json`;
  const finalPath = path.join(outputDir, fileName);

  fs.mkdirSync(outputDir, { recursive: true });

  const tempPath = path.join(outputDir, `.${fileName}.tmp`);
  const json = JSON.stringify(graph, null, 2);

  try {
    fs.writeFileSync(tempPath, json, "utf8");
    fs.renameSync(tempPath, finalPath);
    console.log(`Graph written: ${finalPath}`);
  } catch (err) {
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
    console.error(`ERROR: Failed to write graph file: ${err.message}`);
    process.exit(1);
  }

  return finalPath;
}

async function registerRegionInMongo(regionCode, regionName, url, graphPath, regionData) {
  try {
    const mongoose = require("mongoose");
    if (!process.env.MONGODB_URI) {

  const Region = require("../models/Region");
    const existing = await Region.findOne({ regionCode }).lean();
    if (existing) {
      console.log(`Region '${regionCode}' already exists in database. Skipping DB registration.`);
      return existing;
    }
    const region = new Region({
      regionCode,
      name: regionName,
      bounds: regionData.metadata.bounds,
      version: new Date().toISOString().split("T")[0],
      sourceUrl: url || null,
      generatedAt: new Date(),
      nodeCount: regionData.metadata.nodeCount,
      edgeCount: regionData.metadata.edgeCount,
      filePath: graphPath,
      isActive: true,
