const test = require("node:test");
const assert = require("node:assert/strict");
const {
  runEvaluation,
  sampleConnectedPairs,
  formatEvaluationTable,
  createPrng,
} = require("../scripts/evaluate");

test("Evaluation: createPrng generates deterministic reproducible pseudo-random numbers", () => {
  const prng1 = createPrng(12345);
  const prng2 = createPrng(12345);

  const series1 = Array.from({ length: 10 }, () => prng1());
  const series2 = Array.from({ length: 10 }, () => prng2());

  assert.deepEqual(series1, series2, "Identical seeds must produce identical random sequences");
});

test("Evaluation: sampleConnectedPairs samples distinct connected pairs", () => {
  const { buildPlaceGraph } = require("../controllers/routeController");
  const sampleRoads = require("../data/sampleRoads");
  const { buildAdjacency } = require("../data/ingest/routingEngine");

  const graph = buildPlaceGraph(sampleRoads);
  const adjacency = buildAdjacency(graph);

  const pairs = sampleConnectedPairs(graph, adjacency, 10, 42);
  assert.equal(pairs.length, 10);
  for (const [src, dst] of pairs) {
    assert.notEqual(src, dst, "Source and destination must be distinct");
    assert.ok(adjacency.has(src));
    assert.ok(adjacency.has(dst));
  }
});

test("Evaluation: runs on demo graph and verifies well under 1-second response latency", () => {
  const report = runEvaluation({ numPairs: 20, isPlaceGraph: true, seed: 42 });

  // 1. Build evaluation script & 2. Run pairs
  assert.ok(report.pairCount > 0);
  assert.equal(report.graphType, "Demo Graph (Sample Roads)");

  // 3. Calculate average extra travel time in Safe mode
  assert.ok(Number.isFinite(report.avgExtraTimeSec));
  assert.ok(report.avgExtraTimeSec >= 0);
  assert.ok(Number.isFinite(report.avgExtraTimePercent));

  // 4. Calculate average risk reduction
  assert.ok(Number.isFinite(report.avgRiskReduction));
  assert.ok(report.avgRiskReduction >= 0);
  assert.ok(Number.isFinite(report.avgRiskReductionPercent));

  // 5. Measure how often Safe and Fast routes are identical
  assert.ok(report.safeEqualsFastPercent >= 0 && report.safeEqualsFastPercent <= 100);

  // 6. Measure percentage of route length in High-risk segments
  assert.ok(Number.isFinite(report.avgHighRiskPercentFast));
  assert.ok(Number.isFinite(report.avgHighRiskPercentSafe));

  // 7. Compare Dijkstra and A* node expansions
  assert.ok(report.avgNodesExpandedDijkstra >= report.avgNodesExpandedAStar);
  assert.ok(report.nodeExpansionReductionPercent >= 0);

  // 8 & 9. Benchmark & ensure responds in well under one second on demo graph
  assert.ok(report.computeTimeMs.p95 < 1000, "p95 compute time must be well under 1000ms");
  assert.ok(report.computeTimeMs.max < 2000, "max compute time must be well under 2000ms");
  assert.equal(report.isWellUnderOneSecond, true);

  // Formatter check
  const table = formatEvaluationTable(report);
  assert.ok(typeof table === "string" && table.includes("SAFEROUTE EVALUATION STUDY REPORT"));
});

test("Evaluation: runs hundreds of pairs on real OSM graph and validates all metrics", () => {
  // Run on real walking graph with 100 pairs
  const report = runEvaluation({ numPairs: 100, isPlaceGraph: false, seed: 99 });

  assert.equal(report.pairCount, 100);
  assert.equal(report.graphType, "Real OSM Graph (Walking)");
  assert.equal(report.totalNodes, 7822);

  // 3. Extra travel time
  assert.ok(Number.isFinite(report.avgExtraTimeSec));
  assert.ok(report.avgExtraTimeSec >= 0);

  // 4. Risk reduction
  assert.ok(Number.isFinite(report.avgRiskReduction));
  assert.ok(Number.isFinite(report.avgRiskReductionPercent));

  // 5. Safe == Fast percentage
  assert.ok(report.safeEqualsFastPercent >= 0 && report.safeEqualsFastPercent <= 100);

  // 6. High-risk segments
  assert.ok(Number.isFinite(report.avgHighRiskPercentFast));
  assert.ok(Number.isFinite(report.avgHighRiskPercentSafe));

  // 7. Dijkstra vs A* node expansions
  assert.ok(report.avgNodesExpandedDijkstra > 0);
  assert.ok(report.avgNodesExpandedAStar > 0);
  assert.ok(
    report.avgNodesExpandedAStar <= report.avgNodesExpandedDijkstra,
    "A* must expand fewer or equal nodes compared to Dijkstra"
  );
  assert.ok(report.nodeExpansionReductionPercent > 0, "A* should achieve positive node expansion savings");

  // 8 & 9. Real graph benchmark and latency
  assert.ok(report.computeTimeMs.p50 < 200, "Median latency should be under 200ms on real graph");
  assert.ok(report.computeTimeMs.p95 < 1000, "p95 compute time must be well under 1000ms");
  assert.equal(report.isWellUnderOneSecond, true);
});
