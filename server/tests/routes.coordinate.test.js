const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { app } = require("../server");
const { loadGraph } = require("../controllers/walkingRouteController");
const { findRoute, isRouteFound, isValidMode } = require("../data/ingest/routingEngine");

// Connected walking-graph nodes in the Mathura region (from walkingGraph.json).
// These two nodes are linked by an edge, so a route is found between them.
const SRC_NODE = "6289797866";
const DST_NODE = "172744092";

// Coordinates that fail validation (used for HTTP input-validation tests).
const BAD_COORD = { lat: "not-a-number", lng: 77.7 };
const OUTSIDE_COORD = { lat: 28.5, lng: 78.5 };

// ---------------- HTTP input-validation tests (no MongoDB region needed) ----------------

test("POST /api/routes/walking/coordinates rejects invalid coordinates", async () => {
  const cases = [
    { source: BAD_COORD, destination: { lat: 27.58, lng: 77.70 } },
    { source: { lat: 27.58, lng: 77.70 }, destination: BAD_COORD },
    { source: { lat: 91, lng: 77.70 }, destination: { lat: 27.58, lng: 77.70 } },
    { source: { lng: 77.70 }, destination: { lat: 27.58, lng: 77.70 } },
    { source: null, destination: { lat: 27.58, lng: 77.70 } },
  ];
  for (const body of cases) {
    const response = await request(app)
      .post("/api/routes/walking/coordinates")
      .send(body);
    assert.equal(response.status, 400, JSON.stringify(body));
    assert.ok(response.body.error);
  }
});

test("POST /api/routes/walking/coordinates rejects an invalid slider value", async () => {
  const response = await request(app)
    .post("/api/routes/walking/coordinates")
    .send({ source: { lat: 27.58, lng: 77.70 }, destination: OUTSIDE_COORD, preference: "balanced", slider: 1.5 });
  assert.equal(response.status, 400);
  assert.ok(response.body.error);
});

test("POST /api/routes/walking/coordinates rejects an invalid preference", async () => {
  const response = await request(app)
    .post("/api/routes/walking/coordinates")
    .send({ source: { lat: 27.58, lng: 77.70 }, destination: OUTSIDE_COORD, preference: "unknown" });
  assert.equal(response.status, 400);
  assert.ok(response.body.error);
});

// ---------------- Route calculation logic (no MongoDB region needed) ----------------

test("walking route calculation returns geometry and metrics for faster/balanced/safer", async () => {
  const { graph, adjacency } = loadGraph();
  assert.ok(adjacency.has(SRC_NODE));
  assert.ok(adjacency.has(DST_NODE));

  const modes = ["faster", "balanced", "safer"];
  const results = {};
  for (const mode of modes) {
    const result = findRoute(adjacency, SRC_NODE, DST_NODE, mode);
    assert.ok(isRouteFound(result), `route not found for mode ${mode}`);
    assert.ok(result.nodes.length >= 2);

    // Distance accumulates real edge lengths (never invented).
    let distanceM = 0;
    for (let i = 0; i < result.nodes.length - 1; i++) {
      const connection = adjacency.get(result.nodes[i]).find((item) => item.to === result.nodes[i + 1]);
      assert.ok(connection, `missing edge ${result.nodes[i]} -> ${result.nodes[i + 1]}`);
      distanceM += connection.edge.lengthM;
    }
    assert.ok(distanceM > 0);

    // Geometry is real node coordinates from the graph ([lat, lng]).
    const geometry = result.nodes.map((id) => graph.nodes[id]);
    assert.ok(geometry.every((pt) => typeof pt.lat === "number" && typeof pt.lng === "number"));
    assert.ok(geometry.length >= 2);

    results[mode] = { distanceM, weightedCost: result.weightedCost, nodes: result.nodes };
  }

  // Each preference produces a calculable route; geometry is present for all.
  assert.ok(results.faster.nodes.length >= 2);
  assert.ok(results.balanced.nodes.length >= 2);
  assert.ok(results.safer.nodes.length >= 2);
});

test("custom slider is accepted by the router and returns a route with geometry", () => {
  const { graph, adjacency } = loadGraph();
  const result = findRoute(adjacency, SRC_NODE, DST_NODE, { slider: 0.75 });
  assert.ok(isRouteFound(result), "custom slider route not found");
  assert.ok(result.nodes.length >= 2);
  const geometry = result.nodes.map((id) => graph.nodes[id]);
  assert.ok(geometry.every((pt) => typeof pt.lat === "number" && typeof pt.lng === "number"));

  // slider bounds are enforced by isValidMode.
  assert.ok(isValidMode({ slider: 0 }));
  assert.ok(isValidMode({ slider: 0.5 }));
  assert.ok(isValidMode({ slider: 1 }));
  assert.ok(isValidMode({ slider: 0.75 }));
  assert.ok(!isValidMode({ slider: -0.1 }));
  assert.ok(!isValidMode({ slider: 1.2 }));
});
