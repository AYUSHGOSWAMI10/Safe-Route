const test = require("node:test");
const assert = require("node:assert/strict");
const {
  assembleRoute,
  deriveFactorSources,
  generateTemplates,
  SAMPLE_PLACE_COORDINATES,
} = require("../data/ingest/routeAssembly");
const { buildPlaceGraph, calculateRouteStats, getLocations, findRoutes } = require("../controllers/routeController");
const sampleRoads = require("../data/sampleRoads");
const { buildAdjacency } = require("../data/ingest/routingEngine");

test("assembleRoute calculates total distance and estimated duration", () => {
  const mockAdjacency = new Map();
  mockAdjacency.set("A", [
    { to: "B", edge: { distance: 1.5, estimatedTime: 6, safetyScore: 80 } },
  ]);
  mockAdjacency.set("B", [
    { to: "C", edge: { distance: 2.5, estimatedTime: 10, safetyScore: 90 } },
  ]);

  const route = assembleRoute(["A", "B", "C"], mockAdjacency, { isPlaceGraph: true });

  assert.equal(route.distanceKm, 4.0);
  assert.equal(route.distanceM, 4000);
  assert.equal(route.estimatedTimeMin, 16);
  assert.equal(route.estimatedTimeSec, 960);
});

test("assembleRoute assembles route geometry with coordinates", () => {
  const placeGraph = buildPlaceGraph(sampleRoads);
  const adjacency = buildAdjacency(placeGraph);

  const path = ["Central Park", "Market Square", "University"];
  const route = assembleRoute(path, adjacency, { isPlaceGraph: true });

  assert.ok(Array.isArray(route.geometry));
  assert.ok(route.geometry.length >= 3);
  for (const pt of route.geometry) {
    assert.ok(Array.isArray(pt) && pt.length === 2);
    assert.ok(typeof pt[0] === "number" && typeof pt[1] === "number"); // [lng, lat]
  }
});

test("assembleRoute calculates risk and assigns risk bands for every segment", () => {
  const mockAdjacency = new Map();
  mockAdjacency.set("A", [
    {
      to: "B",
      edge: {
        distance: 1.0,
        safetyScore: 90, // Low risk (0.10)
      },
    },
  ]);
  mockAdjacency.set("B", [
    {
      to: "C",
      edge: {
        distance: 1.0,
        safetyScore: 20, // High risk (0.80)
      },
    },
  ]);

  const route = assembleRoute(["A", "B", "C"], mockAdjacency, { isPlaceGraph: true });

  assert.equal(route.segments.length, 2);

  // Segment 1
  assert.equal(route.segments[0].from, "A");
  assert.equal(route.segments[0].to, "B");
  assert.equal(route.segments[0].riskBand, "Low");
  assert.ok(route.segments[0].risk < 0.30);

  // Segment 2
  assert.equal(route.segments[1].from, "B");
  assert.equal(route.segments[1].to, "C");
  assert.equal(route.segments[1].riskBand, "High");
  assert.ok(route.segments[1].risk >= 0.60);
});

test("assembleRoute calculates length-weighted route risk score and percentage in High-risk segments", () => {
  const mockAdjacency = new Map();
  mockAdjacency.set("A", [
    { to: "B", edge: { distance: 3.0, safetyScore: 90 } }, // 3 km, risk 0.10 (Low)
  ]);
  mockAdjacency.set("B", [
    { to: "C", edge: { distance: 1.0, safetyScore: 20 } }, // 1 km, risk 0.80 (High)
  ]);

  const route = assembleRoute(["A", "B", "C"], mockAdjacency, { isPlaceGraph: true });

  // Weighted risk: (0.10 * 3000 + 0.80 * 1000) / 4000 = (300 + 800) / 4000 = 0.275
  assert.equal(route.riskScore, 0.275);
  // High risk percentage: 1000m / 4000m = 25.0%
  assert.equal(route.highRiskPercentage, 25.0);
  assert.equal(route.highRiskLengthM, 1000);
});

test("assembleRoute identifies the worst segment along the path", () => {
  const mockAdjacency = new Map();
  mockAdjacency.set("A", [
    { to: "B", edge: { distance: 1.0, safetyScore: 85 } },
  ]);
  mockAdjacency.set("B", [
    { to: "C", edge: { distance: 1.5, safetyScore: 30 } }, // Worst segment
  ]);
  mockAdjacency.set("C", [
    { to: "D", edge: { distance: 1.0, safetyScore: 70 } },
  ]);

  const route = assembleRoute(["A", "B", "C", "D"], mockAdjacency, { isPlaceGraph: true });

  assert.ok(route.worstSegment);
  assert.equal(route.worstSegment.from, "B");
  assert.equal(route.worstSegment.to, "C");
  assert.equal(route.worstSegment.riskBand, "High");
  assert.equal(route.worstSegment.risk, 0.7);
  assert.ok(route.worstSegment.primaryFactor);
});

test("assembleRoute generates six-factor risk breakdown", () => {
  const mockAdjacency = new Map();
  mockAdjacency.set("A", [
    {
      to: "B",
      edge: {
        distance: 1.0,
        factors: {
          lighting: 0.1,
          activity: 0.2,
          pedestrian: 0.3,
          isolation: 0.4,
          roadCondition: 0.5,
          incident: 0.0,
        },
      },
    },
  ]);

  const route = assembleRoute(["A", "B"], mockAdjacency, { isPlaceGraph: false });

  assert.ok(route.riskBreakdown);
  assert.equal(route.riskBreakdown.lighting, 0.1);
  assert.equal(route.riskBreakdown.activity, 0.2);
  assert.equal(route.riskBreakdown.pedestrian, 0.3);
  assert.equal(route.riskBreakdown.isolation, 0.4);
  assert.equal(route.riskBreakdown.roadCondition, 0.5);
  assert.equal(route.riskBreakdown.incident, 0.0);
});

test("assembleRoute generates data-confidence breakdown using factor source labels", () => {
  const mockAdjacency = new Map();
  mockAdjacency.set("A", [
    {
      to: "B",
      edge: {
        distance: 1.0,
        road: { lit: "yes", highway: "residential", sidewalk: "both", surface: "asphalt" },
        safety: { incidentSource: "report" },
      },
    },
  ]);

  const route = assembleRoute(["A", "B"], mockAdjacency, { isPlaceGraph: false });

  assert.ok(route.dataConfidence);
  assert.ok(route.dataConfidence.split);
  assert.ok(typeof route.dataConfidence.split.osm === "number");
  assert.ok(typeof route.dataConfidence.split.estimated === "number");
  assert.ok(typeof route.dataConfidence.split.report === "number");
  assert.ok(["High", "Medium", "Low"].includes(route.dataConfidence.level));
});

test("assembleRoute generates explanation and warning messages using templates", () => {
  const mockAdjacency = new Map();
  mockAdjacency.set("A", [
    {
      to: "B",
      edge: {
        distance: 1.0,
        factors: {
          lighting: 0.8, // poor lighting
          activity: 0.3,
          pedestrian: 0.2,
          isolation: 0.7, // high isolation
          roadCondition: 0.2,
          incident: 0.0,
        },
      },
    },
  ]);

  const route = assembleRoute(["A", "B"], mockAdjacency, { isPlaceGraph: false });

  assert.ok(Array.isArray(route.explanations));
  assert.ok(Array.isArray(route.warnings));
  assert.ok(route.explanations.length > 0);
  assert.ok(route.warnings.some((w) => w.includes("poorly lit") || w.includes("dark")));
  assert.ok(route.warnings.some((w) => w.includes("isolated")));
});

test("POST /api/routes/find response includes all assembled fields on routes", async () => {
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

  const res = await invokeHandler(findRoutes, {
    body: {
      source: "Central Park",
      destination: "University",
      preference: "balanced",
    },
  });

  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.routes));
  assert.ok(res.body.routes.length > 0);

  for (const route of res.body.routes) {
    // 1. Total distance
    assert.ok(Number.isFinite(route.distance));
    assert.ok(Number.isFinite(route.distanceKm));
    assert.ok(Number.isFinite(route.distanceM));

    // 2. Estimated duration
    assert.ok(Number.isFinite(route.estimatedTime));
    assert.ok(Number.isFinite(route.estimatedTimeMin));
    assert.ok(Number.isFinite(route.estimatedTimeSec));

    // 3. Assemble route geometry
    assert.ok(Array.isArray(route.geometry));
    assert.ok(route.geometry.length >= 2);

    // 4. Calculate risk for every segment & 5. Assign risk bands to segments
    assert.ok(Array.isArray(route.segments));
    assert.ok(route.segments.length >= 1);
    for (const seg of route.segments) {
      assert.ok(Number.isFinite(seg.risk));
      assert.ok(["Low", "Medium", "High"].includes(seg.riskBand));
      assert.ok(seg.factors);
      assert.ok(seg.factorSource);
    }

    // 6. Length-weighted route risk score
    assert.ok(Number.isFinite(route.riskScore));
    assert.ok(Number.isFinite(route.safetyScore));

    // 7. Percentage of route length in High-risk segments
    assert.ok(Number.isFinite(route.highRiskPercentage));

    // 8. Identify the worst segment
    assert.ok(route.worstSegment !== undefined);
    if (route.worstSegment) {
      assert.ok(route.worstSegment.name);
      assert.ok(Number.isFinite(route.worstSegment.risk));
      assert.ok(["Low", "Medium", "High"].includes(route.worstSegment.riskBand));
    }

    // 9. Six-factor risk breakdown
    assert.ok(route.riskBreakdown);
    assert.ok(Number.isFinite(route.riskBreakdown.lighting));
    assert.ok(Number.isFinite(route.riskBreakdown.pedestrian));

    // 10. Data-confidence breakdown
    assert.ok(route.dataConfidence);
    assert.ok(route.dataConfidence.split);

    // 11. Explanation and warning messages using templates
    assert.ok(Array.isArray(route.explanations));
    assert.ok(Array.isArray(route.warnings));
  }
});
