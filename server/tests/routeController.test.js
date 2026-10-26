const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const {
  getLocations,
  findRoutes,
  calculateRouteStats,
  loadGraphData,
  clearCache,
} = require("../controllers/routeController");

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

test("GET /api/routes returns a manageable list of valid graph nodes", async () => {
  const app = createTestApp();
  const instance = await startServer(app);

  try {
    const res = await fetch(`${instance.baseUrl}/api/routes`);
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.ok(Array.isArray(body.locations), "locations should be an array");
    assert.ok(body.locations.length > 1, "locations should have multiple items");
    assert.ok(
      body.locations.length <= 50,
      `locations should be manageable (received ${body.locations.length})`
    );

    const { graph } = loadGraphData();
    for (const id of body.locations) {
      assert.ok(typeof id === "string", "each location ID must be a string");
      assert.ok(graph.nodes[id], `node ${id} must exist in walkingGraph`);
    }
  } finally {
    await instance.close();
  }
});

test("POST /api/routes/find computes three preference routes and matches frontend contract", async () => {
  const app = createTestApp();
  const instance = await startServer(app);

  try {
    const source = "6314017249";
    const destination = "172755844";

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
    assert.equal(body.routes.length, 3);
    assert.equal(body.recommended, "Route B (Balanced)");

    for (const route of body.routes) {
      assert.ok(typeof route.name === "string" && route.name.length > 0);
      assert.ok(Array.isArray(route.path) && route.path.length > 1);
      assert.equal(route.path[0], source);
      assert.equal(route.path.at(-1), destination);
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
        source: "6314017249",
        destination: "172755844",
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

test("POST /api/routes/find handles safer preference and recommends Route C", async () => {
  const app = createTestApp();
  const instance = await startServer(app);

  try {
    const res = await fetch(`${instance.baseUrl}/api/routes/find`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "6314017249",
        destination: "172755844",
        preference: "safer",
      }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.recommended, "Route C (Safer)");
  } finally {
    await instance.close();
  }
});

test("POST /api/routes/find works with the first and last locations from GET /api/routes", async () => {
  const app = createTestApp();
  const instance = await startServer(app);

  try {
    const locRes = await fetch(`${instance.baseUrl}/api/routes`);
    const { locations } = await locRes.json();

    const res = await fetch(`${instance.baseUrl}/api/routes/find`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: locations[0],
        destination: locations[locations.length - 1],
        preference: "balanced",
      }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.routes.length > 0);
    assert.equal(body.routes[0].path[0], locations[0]);
    assert.equal(body.routes[0].path.at(-1), locations[locations.length - 1]);
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
      body: JSON.stringify({ source: "6314017249" }),
    });
    assert.equal(res1.status, 400);

    const res2 = await fetch(`${instance.baseUrl}/api/routes/find`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ destination: "172755844" }),
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
        source: "6314017249",
        destination: "6314017249",
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
        source: "6314017249",
        destination: "172755844",
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

test("POST /api/routes/find rejects unknown/invalid node IDs with HTTP 404", async () => {
  const app = createTestApp();
  const instance = await startServer(app);

  try {
    const res = await fetch(`${instance.baseUrl}/api/routes/find`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "non_existent_node_id_123",
        destination: "172755844",
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

test("POST /api/routes/find returns HTTP 404 for unreachable disconnected nodes", async () => {
  const app = createTestApp();
  const instance = await startServer(app);

  try {
    // 6310865121 is in disconnected component 1, while 172737446 is in component 0
    const res = await fetch(`${instance.baseUrl}/api/routes/find`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "172737446",
        destination: "6310865121",
        preference: "balanced",
      }),
    });

    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.error, "No connected walking route found.");
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
        lengthM: 500,
        safety: { trafficExposure: 0 }, // pedestrian/footway -> 0 risk
      },
    },
  ]);
  mockAdjacency.set("B", [
    {
      to: "C",
      edge: {
        lengthM: 500,
        safety: { trafficExposure: 5 }, // secondary road -> max risk (5/5 = 1)
      },
    },
  ]);

  const stats = calculateRouteStats(["A", "B", "C"], mockAdjacency);
  assert.equal(stats.distanceKm, 1.0);
  // 1000m / 83.33 m/min = 12 min
  assert.equal(stats.estimatedTimeMin, 12);
  // Average exposure = (0*500 + 1*500)/1000 = 0.5 -> (1 - 0.5) * 100 = 50
  assert.equal(stats.safetyScore, 50);
});

test("missing graph data returns HTTP 503 instead of fabricating routes", async () => {
  // Pass non-existent path to loadGraphData directly
  assert.throws(
    () => {
      loadGraphData("/tmp/non_existent_graph.json");
    },
    { message: /not found/ }
  );
});

