const fs = require("fs");
const path = require("path");
const { buildAdjacency, findRoute } = require("./routingEngine");

const graphPath = path.join(
  __dirname,
  "../processed/walkingGraph.json"
);

const graph = JSON.parse(fs.readFileSync(graphPath, "utf8"));

const source = "6314017249";
const destination = "172755844";

const mode = process.argv[2] || "faster";

const adjacency = buildAdjacency(graph);

const result = findRoute(adjacency, source, destination, mode);

console.log("Graph nodes:", Object.keys(graph.nodes).length);
console.log("Graph edges:", graph.edges.length);
console.log("Routing mode:", mode);

if (!result) {
  console.log("Route found:", false);
  process.exit(0);
}

let actualDistance = 0;
const exposureDistance = {};

for (let i = 0; i < result.nodes.length - 1; i++) {
  const from = result.nodes[i];
  const to = result.nodes[i + 1];

  const connection = adjacency.get(from).find(e => e.to === to);

  if (!connection) {
    throw new Error(`Missing edge: ${from} -> ${to}`);
  }

  const edge = connection.edge;
  actualDistance += edge.lengthM;

  const exposure = edge.safety?.trafficExposure ?? "unknown";

  exposureDistance[exposure] =
    (exposureDistance[exposure] || 0) + edge.lengthM;
}

console.log("Route found:", true);
console.log("Route nodes:", result.nodes.length);
console.log("Actual distance (km):", (actualDistance / 1000).toFixed(3));
console.log("Weighted cost:", result.weightedCost.toFixed(2));

console.log(
  "Exposure distance (km):",
  Object.fromEntries(
    Object.entries(exposureDistance).map(
      ([score, meters]) => [score, Number((meters / 1000).toFixed(3))]
    )
  )
);
