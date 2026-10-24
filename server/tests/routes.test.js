const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { app } = require("../server");

test("GET /api/routes returns available locations", async () => {
  const response = await request(app).get("/api/routes");

  assert.equal(response.status, 200);
  assert.ok(Array.isArray(response.body.locations));
  assert.ok(response.body.locations.includes("Central Park"));
  assert.ok(response.body.locations.includes("University"));
});

test("POST /api/routes/find returns ranked routes", async () => {
  const response = await request(app)
    .post("/api/routes/find")
    .send({
      source: "Central Park",
      destination: "University",
      preference: "balanced",
    });

  assert.equal(response.status, 200);
  assert.ok(Array.isArray(response.body.routes));
  assert.ok(response.body.routes.length > 0);
  assert.ok(response.body.routes.length <= 3);
  assert.ok(
    response.body.routes.some(
      (route) => route.name === response.body.recommended
    )
  );

  for (const route of response.body.routes) {
    assert.equal(route.path[0], "Central Park");
    assert.equal(route.path.at(-1), "University");
    assert.ok(Number.isFinite(route.distance));
    assert.ok(Number.isFinite(route.estimatedTime));
    assert.ok(route.safetyScore >= 0 && route.safetyScore <= 100);
  }
});

test("missing locations return HTTP 400", async () => {
  const response = await request(app)
    .post("/api/routes/find")
    .send({ source: "Central Park" });

  assert.equal(response.status, 400);
});

test("same source and destination return HTTP 400", async () => {
  const response = await request(app)
    .post("/api/routes/find")
    .send({
      source: "Central Park",
      destination: "Central Park",
    });

  assert.equal(response.status, 400);
});

test("invalid preference returns HTTP 400", async () => {
  const response = await request(app)
    .post("/api/routes/find")
    .send({
      source: "Central Park",
      destination: "University",
      preference: "unknown",
    });

  assert.equal(response.status, 400);
});

test("unconnected locations return HTTP 404", async () => {
  const response = await request(app)
    .post("/api/routes/find")
    .send({
      source: "Unknown Location A",
      destination: "Unknown Location B",
      preference: "balanced",
    });

  assert.equal(response.status, 404);
});
