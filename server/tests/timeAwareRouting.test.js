const test = require("node:test");
const assert = require("node:assert/strict");
const { periodOf, calculateEdgeRisk, getActiveRiskConfig } = require("../data/ingest/riskConfig");
const { getEdgeCost } = require("../data/ingest/routeWeights");
const { findRoute, findRouteAStar, buildAdjacency } = require("../data/ingest/routingEngine");
const { findRoutes } = require("../controllers/routeController");

test("Point 1: periodOf correctly maps Date / ISO timestamps to day, evening, and night", () => {
  // Day: 06:00 to 17:59
  assert.equal(periodOf(new Date("2026-10-15T06:00:00")), "day");
  assert.equal(periodOf(new Date("2026-10-15T12:00:00")), "day");
  assert.equal(periodOf(new Date("2026-10-15T17:59:59")), "day");

  // Evening: 18:00 to 21:59
  assert.equal(periodOf(new Date("2026-10-15T18:00:00")), "evening");
  assert.equal(periodOf(new Date("2026-10-15T20:30:00")), "evening");
  assert.equal(periodOf(new Date("2026-10-15T21:59:59")), "evening");

  // Night: 22:00 to 05:59
  assert.equal(periodOf(new Date("2026-10-15T22:00:00")), "night");
  assert.equal(periodOf(new Date("2026-10-15T23:45:00")), "night");
  assert.equal(periodOf(new Date("2026-10-15T02:30:00")), "night");
  assert.equal(periodOf(new Date("2026-10-15T05:59:59")), "night");

  // Defaults on invalid / missing
  assert.equal(periodOf(null), "day");
  assert.equal(periodOf(undefined), "day");
  assert.equal(periodOf("invalid-date-string"), "day");
});

test("Point 2 & 3: day, evening, and night multipliers apply to edge risk and edge cost", () => {
  const edge = {
    lengthM: 1000,
    safetyScore: 50, // Base risk = 0.50
  };
  const config = getActiveRiskConfig();

  const dayRisk = calculateEdgeRisk(edge, config, { period: "day" });
  const eveningRisk = calculateEdgeRisk(edge, config, { period: "evening" });
  const nightRisk = calculateEdgeRisk(edge, config, { period: "night" });

  assert.equal(dayRisk, 0.50);
  // Evening multiplier: 1.2 * 0.50 = 0.60
  assert.equal(Number(eveningRisk.toFixed(2)), 0.60);
  // Night multiplier: 1.5 * 0.50 = 0.75
  assert.equal(Number(nightRisk.toFixed(2)), 0.75);

  // Cost function verification with period
  const dayCost = getEdgeCost(edge, { slider: 1.0, period: "day" });
  const nightCost = getEdgeCost(edge, { slider: 1.0, period: "night" });

  assert.ok(nightCost > dayCost, "Night cost should be higher than day cost due to night multiplier");
});

test("Point 4: findRoute and findRouteAStar calculate nodesExpanded", () => {
  const adjacency = new Map();
  adjacency.set("A", [
    { to: "B", edge: { lengthM: 1000 } },
    { to: "C", edge: { lengthM: 2000 } },
  ]);
  adjacency.set("B", [
    { to: "D", edge: { lengthM: 1000 } },
  ]);
  adjacency.set("C", [
    { to: "D", edge: { lengthM: 500 } },
  ]);
  adjacency.set("D", []);

  const coords = {
    A: { lat: 27.57, lng: 77.67 },
    B: { lat: 27.575, lng: 77.675 },
    C: { lat: 27.572, lng: 77.672 },
    D: { lat: 27.58, lng: 77.68 },
  };

  const dijkstraResult = findRoute(adjacency, "A", "D", "faster");
  assert.ok(dijkstraResult.found);
  assert.ok(Number.isInteger(dijkstraResult.nodesExpanded));
  assert.ok(dijkstraResult.nodesExpanded > 0, "Dijkstra must expand at least 1 node");

  const astarResult = findRouteAStar(adjacency, coords, "A", "D", "faster");
  assert.ok(astarResult.found);
  assert.ok(Number.isInteger(astarResult.nodesExpanded));
  assert.ok(astarResult.nodesExpanded > 0, "A* must expand at least 1 node");
  assert.ok(
    astarResult.nodesExpanded <= dijkstraResult.nodesExpanded,
    "A* must expand no more nodes than Dijkstra"
  );
});

test("Point 5: findRoute and findRouteAStar measure computeTimeMs", () => {
  const adjacency = new Map();
  adjacency.set("A", [{ to: "B", edge: { lengthM: 500 } }]);
  adjacency.set("B", []);

  const result = findRoute(adjacency, "A", "B", "faster");
  assert.ok(result.found);
  assert.ok(typeof result.computeTimeMs === "number");
  assert.ok(result.computeTimeMs >= 0);
});

test("Point 6: POST /api/routes/find returns search statistics in metadata", async () => {
  function invokeHandler(handler, req) {
    return new Promise((resolve) => {
      let statusCode = 200;
      const res = {
        status(code) {
          statusCode = code;
          return res;
        },
        json(body) {
          resolve({ status: statusCode, body });
        },
      };
      handler(req, res);
    });
  }

  const eveningTime = "2026-10-15T19:30:00";
  const res = await invokeHandler(findRoutes, {
    body: {
      source: "Central Park",
      destination: "University",
      preference: "balanced",
      departAt: eveningTime,
    },
  });

  assert.equal(res.status, 200);
  assert.ok(res.body.metadata, "Response must include top-level metadata");
  assert.equal(res.body.metadata.period, "evening");
  assert.ok(Number.isInteger(res.body.metadata.nodesExpanded));
  assert.ok(res.body.metadata.nodesExpanded > 0);
  assert.ok(typeof res.body.metadata.computeTimeMs === "number");

  for (const route of res.body.routes) {
    assert.ok(route.metadata, "Each route card must include metadata");
    assert.equal(route.metadata.period, "evening");
    assert.ok(Number.isInteger(route.metadata.nodesExpanded));
    assert.ok(typeof route.metadata.computeTimeMs === "number");
  }
});
