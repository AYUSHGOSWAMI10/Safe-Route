const test = require("node:test");
const assert = require("node:assert/strict");

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
  findRouteAStar,
  RouteResult,
  NoRouteResult,
  isRouteFound,
} = require("../data/ingest/routingEngine");

function invokeHandler(handler, { body = {}, query = {}, params = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = { body, query, params };
    let statusCode = 200;
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        resolve({ status: statusCode, body: data });
        return this;
      },
      send(data) {
        resolve({ status: statusCode, body: data });
        return this;
      },
    };
    try {
      const result = handler(req, res);
      if (result && typeof result.catch === "function") {
        result.catch(reject);
      }
    } catch (err) {
      reject(err);
    }
  });
}

test("GET /api/routes returns available location place names", async () => {
  const res = await invokeHandler(getLocations);
  assert.equal(res.status, 200);

  const body = res.body;
  assert.ok(Array.isArray(body.locations), "locations should be an array");
  assert.ok(body.locations.includes("Central Park"), "should include Central Park");
  assert.ok(body.locations.includes("University"), "should include University");
  assert.ok(body.locations.includes("Market Square"), "should include Market Square");

  // Ensure all returned locations are human-readable place names, not raw coordinates/numbers
  for (const loc of body.locations) {
    assert.ok(typeof loc === "string");
    assert.ok(!/^\d+$/.test(loc), `Location "${loc}" should be a place name, not a numeric coordinate`);
  }
});

test("POST /api/routes/find returns place names in path and recommended route", async () => {
  const source = "Central Park";
  const destination = "University";

  const res = await invokeHandler(findRoutes, {
    body: {
      source,
      destination,
      preference: "balanced",
    },
  });

  assert.equal(res.status, 200);
  const body = res.body;

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
});

test("POST /api/routes/find handles faster preference and recommends Route A", async () => {
  const res = await invokeHandler(findRoutes, {
    body: {
      source: "Central Park",
      destination: "University",
      preference: "faster",
    },
  });

  assert.equal(res.status, 200);
  const body = res.body;
  assert.equal(body.recommended, "Route A (Faster)");
});

test("POST /api/routes/find handles safer preference and recommends Route C with safer path", async () => {
  const res = await invokeHandler(findRoutes, {
    body: {
      source: "Central Park",
      destination: "University",
      preference: "safer",
    },
  });

  assert.equal(res.status, 200);
  const body = res.body;
  assert.equal(body.recommended, "Route C (Safer)");
  const saferRoute = body.routes.find((r) => r.name === "Route C (Safer)");
  assert.ok(saferRoute);
  // Safer route takes Riverside
  assert.ok(saferRoute.path.includes("Riverside"), "Safer route should route via Riverside for higher safety");
});

test("POST /api/routes/find also supports OSM node IDs when queried", async () => {
  const res = await invokeHandler(findRoutes, {
    body: {
      source: "6314017249",
      destination: "172755844",
      preference: "balanced",
    },
  });

  assert.equal(res.status, 200);
  const body = res.body;
  assert.equal(body.source, "6314017249");
  assert.equal(body.destination, "172755844");
  assert.ok(body.routes.length > 0);
});

test("POST /api/routes/find rejects missing source or destination with HTTP 400", async () => {
  const res1 = await invokeHandler(findRoutes, {
    body: { source: "Central Park" },
  });
  assert.equal(res1.status, 400);

  const res2 = await invokeHandler(findRoutes, {
    body: { destination: "University" },
  });
  assert.equal(res2.status, 400);

  const res3 = await invokeHandler(findRoutes, {
    body: {},
  });
  assert.equal(res3.status, 400);
});

test("POST /api/routes/find rejects identical source and destination with HTTP 400", async () => {
  const res = await invokeHandler(findRoutes, {
    body: {
      source: "Central Park",
      destination: "Central Park",
      preference: "balanced",
    },
  });

  assert.equal(res.status, 400);
  const body = res.body;
  assert.equal(body.error, "Choose two different locations.");
});

test("POST /api/routes/find rejects invalid preference with HTTP 400", async () => {
  const res = await invokeHandler(findRoutes, {
    body: {
      source: "Central Park",
      destination: "University",
      preference: "fastest_possible_route",
    },
  });

  assert.equal(res.status, 400);
  const body = res.body;
  assert.equal(body.error, "Choose Faster, Balanced, or Safer.");
});

test("POST /api/routes/find rejects unknown/invalid locations with HTTP 404", async () => {
  const res = await invokeHandler(findRoutes, {
    body: {
      source: "Unknown Nonexistent Place",
      destination: "University",
      preference: "balanced",
    },
  });

  assert.equal(res.status, 404);
  const body = res.body;
  assert.equal(
    body.error,
    "One or both locations are outside the walking graph."
  );
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

  const astar = findRouteAStar(adjacency, coords, "A", "C", "faster");
  const dijkstra = findRoute(adjacency, "A", "C", "faster");
  assert.ok(astar);
  assert.deepEqual(astar.nodes, dijkstra.nodes);
  assert.equal(astar.weightedCost, dijkstra.weightedCost);
});

test("findRouteAStar falls back gracefully when coordinates are missing", () => {
  const adjacency = new Map();
  adjacency.set("A", [{ to: "B", edge: { lengthM: 1000 } }]);
  adjacency.set("B", [{ to: "A", edge: { lengthM: 1000 } }]);

  const result = findRouteAStar(adjacency, {}, "A", "B", "faster");
  assert.ok(result);
  assert.deepEqual(result.nodes, ["A", "B"]);
  assert.equal(result.weightedCost, 1000);
});

test("findRouteAStar returns null when source or destination missing", () => {
  const adjacency = new Map();
  adjacency.set("A", [{ to: "B", edge: { lengthM: 1000 } }]);
  adjacency.set("B", [{ to: "A", edge: { lengthM: 1000 } }]);

  assert.equal(findRouteAStar(adjacency, {}, "A", "Z", "faster"), null);
  assert.equal(findRouteAStar(adjacency, {}, "Z", "B", "faster"), null);
});

test("invalid routing mode throws in findRouteAStar", () => {
  const adjacency = new Map();
  assert.throws(
    () => findRouteAStar(adjacency, {}, "A", "B", "invalid_mode"),
    { message: /Invalid routing mode/ }
  );
});

test("disconnected nodes return a typed NoRouteResult with NO_ROUTE status in findRoute and findRouteAStar", () => {
  const adjacency = new Map();
  // Component 1: A <-> B
  adjacency.set("A", [{ to: "B", edge: { lengthM: 500 } }]);
  adjacency.set("B", [{ to: "A", edge: { lengthM: 500 } }]);
  // Component 2: C <-> D (disconnected from A and B)
  adjacency.set("C", [{ to: "D", edge: { lengthM: 300 } }]);
  adjacency.set("D", [{ to: "C", edge: { lengthM: 300 } }]);

  // Dijkstra on disconnected nodes
  const dijkstraResult = findRoute(adjacency, "A", "D", "faster");
  assert.ok(dijkstraResult);
  assert.ok(dijkstraResult instanceof RouteResult);
  assert.ok(dijkstraResult instanceof NoRouteResult);
  assert.equal(dijkstraResult.status, "NO_ROUTE");
  assert.equal(dijkstraResult.found, false);
  assert.equal(dijkstraResult.error, "NO_ROUTE");
  assert.equal(dijkstraResult.nodes, null);
  assert.equal(dijkstraResult.weightedCost, Infinity);
  assert.equal(isRouteFound(dijkstraResult), false);

  // A* on disconnected nodes
  const coords = {
    A: { lat: 27.57, lng: 77.67 },
    B: { lat: 27.571, lng: 77.671 },
    C: { lat: 28.57, lng: 78.67 },
    D: { lat: 28.571, lng: 78.671 },
  };
  const astarResult = findRouteAStar(adjacency, coords, "A", "D", "faster");
  assert.ok(astarResult);
  assert.ok(astarResult instanceof RouteResult);
  assert.ok(astarResult instanceof NoRouteResult);
  assert.equal(astarResult.status, "NO_ROUTE");
  assert.equal(astarResult.found, false);
  assert.equal(astarResult.error, "NO_ROUTE");
  assert.equal(astarResult.nodes, null);
  assert.equal(astarResult.weightedCost, Infinity);
  assert.equal(isRouteFound(astarResult), false);

  // Successful route returns RouteResult with found=true
  const successResult = findRoute(adjacency, "A", "B", "faster");
  assert.ok(successResult);
  assert.equal(successResult.status, "FOUND");
  assert.equal(successResult.found, true);
  assert.deepEqual(successResult.nodes, ["A", "B"]);
  assert.equal(isRouteFound(successResult), true);
});
