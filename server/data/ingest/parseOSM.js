
const fs = require("fs");
const path = require("path");
const { XMLParser } = require("fast-xml-parser");
const { isWalkable } = require("./walkingRules");
const { buildGraph } = require("./graphBuilder");
const { getEdgeSafetyMetadata } = require("./safetyScoring");

const filePath = path.join(__dirname, "../raw/map.osm");
const processedDir = path.join(__dirname, "../processed");
const graphPath = path.join(processedDir, "walkingGraph.json");

function main() {
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error(`OSM file not found: ${filePath}`);
    }

    // 1. Read and parse OpenStreetMap XML
    const xml = fs.readFileSync(filePath, "utf8");

    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "",
      parseAttributeValue: false,
    });

    const data = parser.parse(xml);

    if (!data.osm) {
      throw new Error("Invalid OSM file: missing osm root element");
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

    // 2. Filter walking-compatible roads
    const walkingWays = ways.filter(isWalkable);

    console.log("Walking-compatible ways:", walkingWays.length);

    // 3. Build walking graph
    const {
      nodeMap,
      walkingNodeIds,
      edges,
      missingNodes
    } = buildGraph(nodes, walkingWays);

    if (missingNodes > 0) {
      console.warn("Missing node references:", missingNodes);
    }

    // 4. Keep only valid graph nodes
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
      throw new Error("Walking graph is empty");
    }

    // 5. Calculate total edge length
    const totalDistanceM = edges.reduce(
      (sum, edge) => sum + edge.lengthM,
      0
    );

    console.log(
      "Total edge length (km):",
      (totalDistanceM / 1000).toFixed(2)
    );
    const enrichedEdges = edges.map(edge => ({
        ...edge,
        safety: getEdgeSafetyMetadata(edge)
        }));

    // 6. Prepare graph JSON
    const graphData = {
      metadata: {
        source: "OpenStreetMap",
        mode: "walking",
        nodeCount,
        edgeCount,
        missingNodeReferences: missingNodes,
        generatedAt: new Date().toISOString()
      },
      nodes: graphNodes,
      edges: enrichedEdges
    };

    // 7. Export processed graph
    fs.mkdirSync(processedDir, { recursive: true });

    fs.writeFileSync(
      graphPath,
      JSON.stringify(graphData),
      "utf8"
    );

    console.log("Walking graph exported:", graphPath);
    console.log("OSM processing completed successfully");
  } catch (error) {
    console.error("OSM processing failed:", error.message);
    process.exitCode = 1;
  }
}

main();
