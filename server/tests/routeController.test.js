const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const http = require("node:http");

const {
  getLocations,
  findRoutes,
  calculateRouteStats,
  loadWalkingGraph,
  clearCache,
} = require("../controllers/routeController");
const {
  buildAdjacency,
  findRoute,
  findRouteAStar
} = require("../data/ingest/routingEngine");

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.get("/api/routes", getLocations);
  app.post("/api/routes/find", findRoutes);
  return app;
}

function startServer(app) {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      resolve({
        server,
        baseUrl: `http://127.0.0.1:${port}`,
        close: () => new Promise((res) => server.close(res)),
      });
    });
  });
}

test("GET /api/routes returns available location place names", async () => {
  const app = createTestApp();
  const instance = await startServer(app);

  try {
    const res = await fetch(`${instance.baseUrl}/api/routes`);
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.ok(Array.isArray(body.locations), "locations should be an array");
    assert.ok(body.locations.includes("Central Park"), "should include Central Park");
    assert.ok(body.locations.includes("University"), "should include University");
    assert.ok(body.locations.includes("Market Square"), "should include Market Square");

    // Ensure all returned locations are human-readable place names, not raw coordinates/numbers
    for (const loc of body.locations) {
      assert.ok(typeof loc === "string");
      assert.ok(!/^\d+$/.test(loc), `Location "${loc}" should be a place name, not a numeric coordinate`);
    }
  } finally {
    await instance.close();
  }
});

test("POST /api/routes/find returns place names in path and recommended route", async () => {
  const app = createTestApp();
  const instance = await startServer(app);

  try {
    const source = "Central Park";
    const destination = "University";

    const res = await fetch(`${instance.baseUrl}/api/routes/find`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source,
        destination,
        preference: "balanced",
      }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();

    assert.equal(body.source, source);
    assert.equal(body.destination, destination);
    assert.ok(Array.isArray(body.routes));
    assert.ok(body.routes.length > 0);
    assert.equal(body.recommended, "Route B (Balanced)");

    for (const route of body.routes) {
      assert.ok(typeof route.name === "string" && route.name.length > 0);
      assert.ok(Array.isArray(route.path) && route.path.length > 1);
      assert.equal(route.path[0], source);
      assert.equal(route.path.at(-1), destination);

      // Verify that every segment in path is a place name, not numeric coordinates
      for (const step of route.path) {
        assert.ok(!/^\d+$/.test(step), `Path step "${step}" should be a place name`);
      }

      assert.ok(Number.isFinite(route.distance) && route.distance > 0);
      assert.ok(Number.isFinite(route.estimatedTime) && route.estimatedTime > 0);
      assert.ok(
        Number.isFinite(route.safetyScore) &&
          route.safetyScore >= 0 &&
          route.safetyScore <= 100
      );
      assert.ok(Number.isFinite(route.cost));
    }
  } finally {
    await instance.close();
  }
});

test("POST /api/routes/find handles faster preference and recommends Route A", async () => {
  const app = createTestApp();
  const instance = await startServer(app);

  try {
    const res = await fetch(`${instance.baseUrl}/api/routes/find`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "Central Park",
        destination: "University",
        preference: "faster",
      }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.recommended, "Route A (Faster)");
  } finally {
    await instance.close();
  }
});

test("POST /api/routes/find handles safer preference and recommends Route C with safer path", async () => {
  const app = createTestApp();
  const instance = await startServer(app);

  try {
    const res = await fetch(`${instance.baseUrl}/api/routes/find`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "Central Park",
        destination: "University",
        preference: "safer",
      }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.recommended, "Route C (Safer)");
    const saferRoute = body.routes.find((r) => r.name === "Route C (Safer)");
    assert.ok(saferRoute);
    // Safer route takes Riverside
    assert.ok(saferRoute.path.includes("Riverside"), "Safer route should route via Riverside for higher safety");
  } finally {
    await instance.close();
  }
});

test("POST /api/routes/find also supports OSM node IDs when queried", async () => {
  const app = createTestApp();
  const instance = await startServer(app);

  try {
    const res = await fetch(`${instance.baseUrl}/api/routes/find`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "6314017249",
        destination: "172755844",
        preference: "balanced",
      }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.source, "6314017249");
    assert.equal(body.destination, "172755844");
    assert.ok(body.routes.length > 0);
  } finally {
    await instance.close();
  }
});

test("POST /api/routes/find rejects missing source or destination with HTTP 400", async () => {
  const app = createTestApp();
  const instance = await startServer(app);

  try {
    const res1 = await fetch(`${instance.baseUrl}/api/routes/find`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: "Central Park" }),
    });
    assert.equal(res1.status, 400);

    const res2 = await fetch(`${instance.baseUrl}/api/routes/find`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ destination: "University" }),
    });
    assert.equal(res2.status, 400);

    const res3 = await fetch(`${instance.baseUrl}/api/routes/find`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(res3.status, 400);
  } finally {
    await instance.close();
  }
});

test("POST /api/routes/find rejects identical source and destination with HTTP 400", async () => {
  const app = createTestApp();
  const instance = await startServer(app);

  try {
    const res = await fetch(`${instance.baseUrl}/api/routes/find`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "Central Park",
        destination: "Central Park",
        preference: "balanced",
      }),
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, "Choose two different locations.");
  } finally {
    await instance.close();
  }
});

test("POST /api/routes/find rejects invalid preference with HTTP 400", async () => {
  const app = createTestApp();
  const instance = await startServer(app);

  try {
    const res = await fetch(`${instance.baseUrl}/api/routes/find`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "Central Park",
        destination: "University",
        preference: "fastest_possible_route",
      }),
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, "Choose Faster, Balanced, or Safer.");
  } finally {
    await instance.close();
  }
});

test("POST /api/routes/find rejects unknown/invalid locations with HTTP 404", async () => {
  const app = createTestApp();
  const instance = await startServer(app);

  try {
    const res = await fetch(`${instance.baseUrl}/api/routes/find`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "Unknown Nonexistent Place",
        destination: "University",
        preference: "balanced",
      }),
    });

    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(
      body.error,
      "One or both locations are outside the walking graph."
    );
  } finally {
    await instance.close();
  }
});

test("calculateRouteStats accurately calculates distance, walking time, and safety score", () => {
  const mockAdjacency = new Map();
  mockAdjacency.set("A", [
    {
      to: "B",
      edge: {
        distance: 1.0,
        estimatedTime: 5,
        safetyScore: 80,
      },
    },
  ]);
  mockAdjacency.set("B", [
    {
      to: "C",
      edge: {
        distance: 2.0,
        estimatedTime: 10,
        safetyScore: 90,
      },
    },
  ]);

  const stats = calculateRouteStats(["A", "B", "C"], mockAdjacency, true);
  assert.equal(stats.distanceKm, 3.0);
  assert.equal(stats.estimatedTimeMin, 15);
  // Weighted: (80*1 + 90*2) / 3 = 260 / 3 ≈ 87
  assert.equal(stats.safetyScore, 87);
});

test("findRoute uses priority queue and returns same path as expected on small graph", () => {
  const adjacency = new Map();
  adjacency.set("A", [{ to: "B", edge: { lengthM: 1000 } }]);
  adjacency.set("B", [
    { to: "A", edge: { lengthM: 1000 } },
    { to: "C", edge: { lengthM: 500 } },
  ]);
  adjacency.set("C", [{ to: "B", edge: { lengthM: 500 } }]);

  const result = findRoute(adjacency, "A", "C", "faster");
  assert.ok(result);
  assert.deepEqual(result.nodes, ["A", "B", "C"]);
  assert.equal(result.weightedCost, 1500);
});

test("findRoute returns null when source or destination missing from adjacency", () => {
  const adjacency = new Map();
  adjacency.set("A", [{ to: "B", edge: { lengthM: 1000 } }]);
  adjacency.set("B", [{ to: "A", edge: { lengthM: 1000 } }]);

  assert.equal(findRoute(adjacency, "A", "Z", "faster"), null);
  assert.equal(findRoute(adjacency, "Z", "B", "faster"), null);
});

test("findRouteAStar returns same path as findRoute when coordinates are available", () => {
  const adjacency = new Map();
  adjacency.set("A", [{ to: "B", edge: { lengthM: 1000 } }]);
  adjacency.set("B", [
    { to: "A", edge: { lengthM: 1000 } },
    { to: "C", edge: { lengthM: 500 } },
  ]);
  adjacency.set("C", [{ to: "B", edge: { lengthM: 500 } }]);

  const coords = {
    A: { lat: 27.57, lng: 77.67 },
    B: { lat: 27.571, lng: 77.671 },
    C: { lat: 27.572, lng: 77.672 },
  };

  const dijkstra = findRoute(adjacency, "A", "C", "faster");
  const astar = findRouteAStar(adjacency, coords, "A", "C", "faster");

  assert.ok(astar);
  assert.deepEqual(astar.nodes, dijkstra.nodes);
  assert.equal(astar.weightedCost, dijkstra.weightedCost);
});

test("findRouteAStar falls back gracefully when coordinates are missing", () => {
  const adjacency = new Map();
  adjacency.set("A", [{ to: "B", edge: { lengthM: 1000 } }]);
  adjacency.set("B", [{ to: "A", edge: { lengthM: 1000 } }]);

  const coords = {}; // no coordinates available

  const result = findRouteAStar(adjacency, coords, "A", "B", "faster");
  assert.ok(result);
  assert.deepEqual(result.nodes, ["A", "B"]);
  assert.equal(result.weightedCost, 1000);
});

test("findRouteAStar returns null when source or destination missing", () => {
  const adjacency = new Map();
  adjacency.set("A", [{ to: "B", edge: { lengthM: 1000 } }]);
  adjacency.set("B", [{ to: "A", edge: { lengthM: 1000 } }]);

  const coords = {
    A: { lat: 27.57, lng: 77.67 },
    B: { lat: 27.571, lng: 77.671 },
  };

  assert.equal(findRouteAStar(adjacency, coords, "A", "Z", "faster"), null);
  assert.equal(findRouteAStar(adjacency, coords, "Z", "B", "faster"), null);
});

test("invalid routing mode throws in findRouteAStar", () => {
  const adjacency = new Map();
  adjacency.set("A", [{ to: "B", edge: { lengthM: 1000 } }]);
  adjacency.set("B", [{ to: "A", edge: { lengthM: 1000 } }]);

  const coords = {
    A: { lat: 27.57, lng: 77.67 },
    B: { lat: 27.571, lng: 77.671 },
  };

  assert.throws(() => {
    findRouteAStar(adjacency, coords, "A", "B", "invalid_mode");
  });
});

test("getOneWay returns null for missing oneway tag", () => {
  const { getOneWay } = require("../data/ingest/walkingRules");
  assert.equal(getOneWay({ tag: [] }), null);
  assert.equal(getOneWay({ tag: [{ k: "highway", v: "residential" }] }), null);
});

test("getOneWay returns 'yes' for oneway=yes", () => {
  const { getOneWay } = require("../data/ingest/walkingRules");
  assert.equal(getOneWay({ tag: [{ k: "oneway", v: "yes" }] }), "yes");
  assert.equal(getOneWay({ tag: [{ k: "oneway", v: "true" }] }), "yes");
});

test("getOneWay returns 'reverse' for oneway=-1 or reverse", () => {
  const { getOneWay } = require("../data/ingest/walkingRules");
  assert.equal(getOneWay({ tag: [{ k: "oneway", v: "-1" }] }), "reverse");
  assert.equal(getOneWay({ tag: [{ k: "oneway", v: "reverse" }] }), "reverse");
});

test("buildAdjacency respects oneway=yes (forward only)", () => {
  const { buildAdjacency } = require("../data/ingest/routingEngine");
  const graph = {
    nodes: { A: { lat: 0, lng: 0 }, B: { lat: 0, lng: 0.001 } },
    edges: [
      { from: "A", to: "B", oneway: "yes", edge: null, lengthM: 100 },
    ],
  };
  // Fix edge self-reference
  graph.edges[0].edge = graph.edges[0];

  const adj = buildAdjacency(graph);
  // A -> B exists
  assert.ok(adj.get("A").some(c => c.to === "B"));
  // B -> A does NOT exist (one-way)
  assert.ok(!adj.get("B").some(c => c.to === "A"));
});

test("buildAdjacency respects oneway=reverse (reverse only)", () => {
  const { buildAdjacency } = require("../data/ingest/routingEngine");
  // graphBuilder swaps from/to for oneway=reverse, so edge is B->A
  const graph = {
    nodes: { A: { lat: 0, lng: 0 }, B: { lat: 0, lng: 0.001 } },
    edges: [
      { from: "B", to: "A", oneway: "reverse", edge: null, lengthM: 100 },
    ],
  };
  graph.edges[0].edge = graph.edges[0];

  const adj = buildAdjacency(graph);
  // B -> A exists (forward direction of the reversed edge)
  assert.ok(adj.get("B").some(c => c.to === "A"));
  // A -> B does NOT exist (reverse not added for one-way)
  assert.ok(!adj.get("A").some(c => c.to === "B"));
});

test("buildAdjacency adds both directions for non-one-way edges", () => {
  const { buildAdjacency } = require("../data/ingest/routingEngine");
  const graph = {
    nodes: { A: { lat: 0, lng: 0 }, B: { lat: 0, lng: 0.001 } },
    edges: [
      { from: "A", to: "B", oneway: null, edge: null, lengthM: 100 },
    ],
  };
  graph.edges[0].edge = graph.edges[0];

  const adj = buildAdjacency(graph);
  assert.ok(adj.get("A").some(c => c.to === "B"));
  assert.ok(adj.get("B").some(c => c.to === "A"));
});

test("findRoute cannot traverse one-way edge in wrong direction", () => {
  const { buildAdjacency, findRoute } = require("../data/ingest/routingEngine");
  const graph = {
    nodes: { A: { lat: 0, lng: 0 }, B: { lat: 0, lng: 0.001 } },
    edges: [
      { from: "A", to: "B", oneway: "yes", edge: null, lengthM: 100 },
    ],
  };
  graph.edges[0].edge = graph.edges[0];

  const adj = buildAdjacency(graph);

  // A -> B should work
  assert.ok(findRoute(adj, "A", "B", "faster"));
  // B -> A should fail (one-way)
  assert.equal(findRoute(adj, "B", "A", "faster"), null);
});
