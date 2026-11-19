const fs = require("fs");
const path = require("path");
const { buildAdjacency, findRoute, findRouteAStar } = require("../data/ingest/routingEngine");
const { assembleRoute } = require("../data/ingest/routeAssembly");
const { buildComponents } = require("../controllers/connectedComponents");
const sampleRoads = require("../data/sampleRoads");
const { buildPlaceGraph } = require("../controllers/routeController");

/**
 * Deterministic pseudo-random number generator (Mulberry32)
 * Ensures reproducible pair sampling across runs.
 *
 * @param {number} seed
 * @returns {() => number} Returns float in [0, 1)
 */
function createPrng(seed = 42) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Samples random pairs of nodes guaranteed to be connected.
 *
 * @param {object} graph - Graph object { nodes, edges }
 * @param {Map} adjacency - Graph adjacency
 * @param {number} [numPairs=100] - Number of pairs to sample
 * @param {number} [seed=42] - PRNG seed
 * @returns {Array<[string, string]>} Array of [source, destination] pairs
 */
function sampleConnectedPairs(graph, adjacency, numPairs = 100, seed = 42) {
  const components = buildComponents(adjacency);
  const random = createPrng(seed);

  // Group node IDs by component ID
  const nodesByComponent = new Map();
  for (const [nodeId, compId] of components.entries()) {
    if (!nodesByComponent.has(compId)) {
      nodesByComponent.set(compId, []);
    }
    nodesByComponent.get(compId).push(nodeId);
  }

  // Find the largest connected component
  let largestComponent = [];
  for (const nodeList of nodesByComponent.values()) {
    if (nodeList.length > largestComponent.length) {
      largestComponent = nodeList;
    }
  }

  if (largestComponent.length < 2) {
    throw new Error("Graph does not contain any connected components with 2 or more nodes.");
  }

  const pairs = [];
  const n = largestComponent.length;
  const attemptsLimit = numPairs * 10;
  let attempts = 0;
  const seen = new Set();

  while (pairs.length < numPairs && attempts < attemptsLimit) {
    attempts++;
    const idxA = Math.floor(random() * n);
    let idxB = Math.floor(random() * n);
    if (idxA === idxB) continue;

    const src = largestComponent[idxA];
    const dst = largestComponent[idxB];
    const key = `${src}->${dst}`;

    if (!seen.has(key)) {
      seen.add(key);
      pairs.push([src, dst]);
    }
  }

  return pairs;
}

/**
 * Calculates percentiles and basic stats for an array of numbers.
 *
 * @param {number[]} numbers
 * @returns {object} { p50, p90, p95, p99, mean, min, max }
 */
function calculateDistribution(numbers) {
  if (!numbers || numbers.length === 0) {
    return { p50: 0, p90: 0, p95: 0, p99: 0, mean: 0, min: 0, max: 0 };
  }

  const sorted = [...numbers].sort((a, b) => a - b);
  const len = sorted.length;
  const sum = sorted.reduce((acc, val) => acc + val, 0);

  const getPercentile = (p) => {
    const idx = Math.min(len - 1, Math.floor(len * p));
    return Number(sorted[idx].toFixed(2));
  };

  return {
    min: Number(sorted[0].toFixed(2)),
    max: Number(sorted[len - 1].toFixed(2)),
    mean: Number((sum / len).toFixed(2)),
    p50: getPercentile(0.50),
    p90: getPercentile(0.90),
    p95: getPercentile(0.95),
    p99: getPercentile(0.99),
  };
}

/**
 * Runs the evaluation study across random pairs on a given graph.
 *
 * @param {object} options
 * @param {object} [options.graph] - Graph object { nodes, edges }
 * @param {Map} [options.adjacency] - Precomputed adjacency map
 * @param {number} [options.numPairs=100] - Number of random pairs to evaluate
 * @param {number} [options.seed=42] - Seed for random sampling
 * @param {boolean} [options.isPlaceGraph=false] - Whether this is the synthetic demo graph
 * @returns {object} Comprehensive evaluation report metrics
 */
function runEvaluation(options = {}) {
  let { graph, adjacency, numPairs = 100, seed = 42, isPlaceGraph = false } = options;

  if (!graph) {
    if (isPlaceGraph) {
      graph = buildPlaceGraph(sampleRoads);
    } else {
      const graphPath = path.join(__dirname, "../data/processed/walkingGraph.json");
      graph = JSON.parse(fs.readFileSync(graphPath, "utf8"));
    }
  }

  if (!adjacency) {
    adjacency = buildAdjacency(graph);
  }

  // Adjust pair count if graph has fewer total possible pairs
  const totalNodes = Object.keys(graph.nodes).length;
  const maxPossible = totalNodes * (totalNodes - 1);
  const targetPairs = Math.min(numPairs, maxPossible);

  const pairs = sampleConnectedPairs(graph, adjacency, targetPairs, seed);
  const computeTimes = [];
  const extraTimesPercent = [];
  const extraTimesSec = [];
  const riskReductionsPercent = [];
  const riskReductionsAbs = [];
  const dijkstraExpandedCounts = [];
  const astarExpandedCounts = [];
  const fastHighRiskPercents = [];
  const safeHighRiskPercents = [];

  let identicalRouteCount = 0;
  let successfulPairs = 0;

  for (const [src, dst] of pairs) {
    const startOverall = performance.now();

    // 1. Compute Fast route (s = 0)
    const fastResult = findRoute(adjacency, src, dst, "faster");
    // 2. Compute Safe route (s = 1.0)
    const safeResult = findRoute(adjacency, src, dst, "safer");
    // 3. Compute A* Fast route (for node expansion comparison)
    const astarResult = findRouteAStar(adjacency, graph.nodes, src, dst, "faster");

    const elapsedMs = performance.now() - startOverall;
    computeTimes.push(elapsedMs);

    if (
      !fastResult || !fastResult.found ||
      !safeResult || !safeResult.found ||
      !astarResult || !astarResult.found
    ) {
      continue;
    }

    successfulPairs++;

    // Assemble route metrics for both
    const fastStats = assembleRoute(fastResult.nodes, adjacency, {
      isPlaceGraph,
      nodes: graph.nodes,
    });
    const safeStats = assembleRoute(safeResult.nodes, adjacency, {
      isPlaceGraph,
      nodes: graph.nodes,
    });

    // A. Check if Safe and Fast routes are identical
    const isIdentical =
      fastResult.nodes.length === safeResult.nodes.length &&
      fastResult.nodes.every((node, i) => node === safeResult.nodes[i]);

    if (isIdentical) {
      identicalRouteCount++;
    }

    // B. Calculate extra travel time in Safe mode
    const extraSec = Math.max(0, safeStats.estimatedTimeSec - fastStats.estimatedTimeSec);
    const extraPct =
      fastStats.estimatedTimeSec > 0
        ? (extraSec / fastStats.estimatedTimeSec) * 100
        : 0;
    extraTimesSec.push(extraSec);
    extraTimesPercent.push(extraPct);

    // C. Calculate risk reduction in Safe mode
    const riskDiff = Math.max(0, fastStats.riskScore - safeStats.riskScore);
    const riskRedPct =
      fastStats.riskScore > 0 ? (riskDiff / fastStats.riskScore) * 100 : 0;
    riskReductionsAbs.push(riskDiff);
    riskReductionsPercent.push(riskRedPct);

    // D. Percentage of route length in High-risk segments
    fastHighRiskPercents.push(fastStats.highRiskPercentage);
    safeHighRiskPercents.push(safeStats.highRiskPercentage);

    // E. Compare Dijkstra and A* node expansions
    dijkstraExpandedCounts.push(fastResult.nodesExpanded);
    astarExpandedCounts.push(astarResult.nodesExpanded);
  }

  const avg = (arr) =>
    arr.length > 0 ? arr.reduce((sum, v) => sum + v, 0) / arr.length : 0;

  const avgExtraTimeSec = Number(avg(extraTimesSec).toFixed(1));
  const avgExtraTimePercent = Number(avg(extraTimesPercent).toFixed(1));

  const avgRiskReduction = Number(avg(riskReductionsAbs).toFixed(4));
  const avgRiskReductionPercent = Number(avg(riskReductionsPercent).toFixed(1));

  const safeEqualsFastPercent =
    successfulPairs > 0
      ? Number(((identicalRouteCount / successfulPairs) * 100).toFixed(1))
      : 0;

  const avgHighRiskPercentFast = Number(avg(fastHighRiskPercents).toFixed(1));
  const avgHighRiskPercentSafe = Number(avg(safeHighRiskPercents).toFixed(1));
  const highRiskReductionPercent =
    avgHighRiskPercentFast > 0
      ? Number(
          (
            ((avgHighRiskPercentFast - avgHighRiskPercentSafe) /
              avgHighRiskPercentFast) *
            100
          ).toFixed(1)
        )
      : 0;

  const avgNodesExpandedDijkstra = Math.round(avg(dijkstraExpandedCounts));
  const avgNodesExpandedAStar = Math.round(avg(astarExpandedCounts));
  const nodeExpansionReductionPercent =
    avgNodesExpandedDijkstra > 0
      ? Number(
          (
            ((avgNodesExpandedDijkstra - avgNodesExpandedAStar) /
              avgNodesExpandedDijkstra) *
            100
          ).toFixed(1)
        )
      : 0;

  const computeTimeDist = calculateDistribution(computeTimes);

  // Performance requirement: answers in well under one second (< 1000ms, typically < 100ms)
  const isWellUnderOneSecond = computeTimeDist.p95 < 1000 && computeTimeDist.max < 2000;

  return {
    graphType: isPlaceGraph ? "Demo Graph (Sample Roads)" : "Real OSM Graph (Walking)",
    totalNodes,
    pairCount: successfulPairs,
    requestedPairs: targetPairs,
    avgExtraTimeSec,
    avgExtraTimePercent,
    avgRiskReduction,
    avgRiskReductionPercent,
    safeEqualsFastPercent,
    avgHighRiskPercentFast,
    avgHighRiskPercentSafe,
    highRiskReductionPercent,
    avgNodesExpandedDijkstra,
    avgNodesExpandedAStar,
    nodeExpansionReductionPercent,
    computeTimeMs: computeTimeDist,
    isWellUnderOneSecond,
  };
}

/**
 * Formats evaluation metrics as a clean text table.
 *
 * @param {object} report
 * @returns {string} Formatted table
 */
function formatEvaluationTable(report) {
  return `
================================================================================
                    SAFEROUTE EVALUATION STUDY REPORT
================================================================================
Target Graph:             ${report.graphType}
Total Graph Nodes:        ${report.totalNodes}
Evaluated Random Pairs:   ${report.pairCount}

--- ROUTING & SAFETY METRICS ---
• Average Extra Time in Safe Mode:     +${report.avgExtraTimeSec}s (+${report.avgExtraTimePercent}%)
• Average Risk Reduction in Safe Mode: -${report.avgRiskReduction} (-${report.avgRiskReductionPercent}%)
• How Often Safe Equals Fast:         ${report.safeEqualsFastPercent}% of journeys
• High-Risk Segment Exposure (Fast):   ${report.avgHighRiskPercentFast}%
• High-Risk Segment Exposure (Safe):   ${report.avgHighRiskPercentSafe}% (Reduction: ${report.highRiskReductionPercent}%)

--- ALGORITHM EFFICIENCY (DIJKSTRA vs A*) ---
• Avg Nodes Expanded (Dijkstra):      ${report.avgNodesExpandedDijkstra}
• Avg Nodes Expanded (A*):            ${report.avgNodesExpandedAStar}
• A* Node Expansion Reduction:        -${report.nodeExpansionReductionPercent}% fewer expansions

--- BENCHMARK LATENCY (COMPUTE TIME) ---
• Median Latency (p50):               ${report.computeTimeMs.p50} ms
• 90th Percentile (p90):              ${report.computeTimeMs.p90} ms
• 95th Percentile (p95):              ${report.computeTimeMs.p95} ms
• 99th Percentile (p99):              ${report.computeTimeMs.p99} ms
• Maximum Latency:                    ${report.computeTimeMs.max} ms
• Responds Well Under 1 Second:       ${report.isWellUnderOneSecond ? "YES (PASSED)" : "NO (FAILED)"}
================================================================================
`;
}

// CLI entry point
if (require.main === module) {
  const args = process.argv.slice(2);
  const isDemo = args.includes("--demo");
  const pairsArgIdx = args.indexOf("--pairs");
  const numPairs = pairsArgIdx !== -1 ? parseInt(args[pairsArgIdx + 1], 10) || 100 : 100;

  console.log(`Starting SafeRoute evaluation study (${numPairs} random pairs)...`);
  const report = runEvaluation({ numPairs, isPlaceGraph: isDemo });
  console.log(formatEvaluationTable(report));
}

module.exports = {
  createPrng,
  sampleConnectedPairs,
  calculateDistribution,
  runEvaluation,
  formatEvaluationTable,
};
