const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const fs = require("fs");

const {
  FACTORS,
  DEFAULT_RISK_CONFIG,
  FLOAT_TOLERANCE,
  validateRiskConfig,
  loadRiskConfig,
  getActiveRiskConfig,
  resetRiskConfig,
  getRiskBand,
  deriveEdgeFactors,
  calculateEdgeRisk,
  getEdgeTravelTime,
  calculateCost,
} = require("../data/ingest/riskConfig");
const { getEdgeCost } = require("../data/ingest/routeWeights");

test("Point 1: risk_config configuration structure is complete and well-formed", () => {
  const config = getActiveRiskConfig();

  assert.ok(config, "Config should exist");
  assert.equal(typeof config.version, "string");
  assert.ok(config.weights, "Weights object must exist");

  // Verify all six required factors exist
  for (const factor of FACTORS) {
    assert.equal(
      typeof config.weights[factor],
      "number",
      `Weight for factor "${factor}" must be a number`
    );
  }
  assert.equal(FACTORS.length, 6, "There must be exactly six factors");

  // Verify sensitivity constant k
  assert.equal(typeof config.k, "number");
  assert.ok(config.k > 0, "k must be positive");

  // Verify risk bands
  assert.ok(config.bands);
  assert.equal(typeof config.bands.low, "number");
  assert.equal(typeof config.bands.medium, "number");
  assert.equal(typeof config.bands.high, "number");
  assert.ok(config.bands.low < config.bands.medium);
  assert.ok(config.bands.medium <= config.bands.high);

  // Verify time multipliers
  assert.ok(config.timeMultipliers);
  assert.equal(typeof config.timeMultipliers.day, "number");
  assert.equal(typeof config.timeMultipliers.evening, "number");
  assert.equal(typeof config.timeMultipliers.night, "number");
});

test("Point 2: loadRiskConfig loads from defaults, files, and custom objects", () => {
  resetRiskConfig();

  // Load defaults
  const loadedDefault = loadRiskConfig();
  assert.equal(loadedDefault.version, "1.0.0");
  assert.equal(loadedDefault.weights.lighting, 0.20);

  // Load from explicit file
  const configFilePath = path.join(__dirname, "../data/risk_config.json");
  if (fs.existsSync(configFilePath)) {
    const loadedFile = loadRiskConfig(configFilePath);
    assert.equal(loadedFile.version, "1.0.0");
  }

  // Load from custom valid object
  const customConfig = {
    version: "2.0.0",
    weights: {
      lighting: 0.30,
      activity: 0.10,
      pedestrian: 0.20,
      isolation: 0.10,
      roadCondition: 0.10,
      incident: 0.20,
    },
    k: 3.5,
  };
  const loadedCustom = loadRiskConfig(customConfig);
  assert.equal(loadedCustom.version, "2.0.0");
  assert.equal(loadedCustom.k, 3.5);
  assert.equal(loadedCustom.weights.lighting, 0.30);

  // Reset to default for subsequent tests
  resetRiskConfig();
});

test("Point 3: validateRiskConfig verifies all six weights sum to exactly 1 within tolerance", () => {
  // Valid config summing to 1.0
  const validConfig = {
    weights: {
      lighting: 0.20,
      activity: 0.15,
      pedestrian: 0.20,
      isolation: 0.15,
      roadCondition: 0.15,
      incident: 0.15,
    },
    k: 2.0,
    bands: { low: 0.3, medium: 0.6 },
  };
  assert.equal(validateRiskConfig(validConfig), true);

  // Valid config with floating-point variance within tolerance (1e-6)
  const validFloatConfig = {
    weights: {
      lighting: 1 / 6,
      activity: 1 / 6,
      pedestrian: 1 / 6,
      isolation: 1 / 6,
      roadCondition: 1 / 6,
      incident: 1 / 6,
    },
    k: 2.0,
  };
  assert.equal(validateRiskConfig(validFloatConfig), true);

  // Invalid: sum exceeds 1
  assert.throws(
    () =>
      validateRiskConfig({
        weights: {
          lighting: 0.30,
          activity: 0.20,
          pedestrian: 0.20,
          isolation: 0.20,
          roadCondition: 0.20,
          incident: 0.20, // sum = 1.3
        },
        k: 2.0,
      }),
    /must sum to exactly 1\.0/
  );

  // Invalid: sum less than 1
  assert.throws(
    () =>
      validateRiskConfig({
        weights: {
          lighting: 0.10,
          activity: 0.10,
          pedestrian: 0.10,
          isolation: 0.10,
          roadCondition: 0.10,
          incident: 0.10, // sum = 0.6
        },
        k: 2.0,
      }),
    /must sum to exactly 1\.0/
  );

  // Invalid: missing a factor
  assert.throws(
    () =>
      validateRiskConfig({
        weights: {
          lighting: 0.25,
          activity: 0.25,
          pedestrian: 0.25,
          isolation: 0.25,
          roadCondition: 0.0,
          // missing incident
        },
        k: 2.0,
      }),
    /weight for "incident" must be a non-negative finite number/
  );

  // Invalid: negative weight
  assert.throws(
    () =>
      validateRiskConfig({
        weights: {
          lighting: 1.20,
          activity: -0.20,
          pedestrian: 0.0,
          isolation: 0.0,
          roadCondition: 0.0,
          incident: 0.0,
        },
        k: 2.0,
      }),
    /must be a non-negative finite number/
  );
});

test("Point 4: calculateEdgeRisk computes six-factor weighted edge risk", () => {
  resetRiskConfig();
  const config = getActiveRiskConfig();

  // Edge with explicit factors
  const testEdge = {
    lengthM: 200,
    factors: {
      lighting: 0.0,     // well lit
      activity: 0.0,     // active
      pedestrian: 0.0,   // pedestrian street
      isolation: 0.0,    // not isolated
      roadCondition: 0.0,// perfect surface
      incident: 0.0,     // no incidents
    },
  };
  assert.equal(calculateEdgeRisk(testEdge, config), 0.0);

  // Edge with max risk on all factors
  const dangerousEdge = {
    lengthM: 200,
    factors: {
      lighting: 1.0,
      activity: 1.0,
      pedestrian: 1.0,
      isolation: 1.0,
      roadCondition: 1.0,
      incident: 1.0,
    },
  };
  assert.equal(calculateEdgeRisk(dangerousEdge, config), 1.0);

  // Edge with mixed factors
  // Weights: lighting: 0.20, activity: 0.15, pedestrian: 0.20, isolation: 0.15, roadCondition: 0.15, incident: 0.15
  const mixedEdge = {
    lengthM: 100,
    factors: {
      lighting: 1.0,     // 0.20 * 1.0 = 0.20
      activity: 0.0,     // 0.15 * 0.0 = 0.00
      pedestrian: 0.5,   // 0.20 * 0.5 = 0.10
      isolation: 0.0,    // 0.15 * 0.0 = 0.00
      roadCondition: 0.0,// 0.15 * 0.0 = 0.00
      incident: 0.0,     // 0.15 * 0.0 = 0.00
    },
  };
  // Expected sum: 0.20 + 0.10 = 0.30
  assert.ok(Math.abs(calculateEdgeRisk(mixedEdge, config) - 0.30) < 1e-6);

  // Time multiplier: night multiplier (1.5x)
  const nightRisk = calculateEdgeRisk(mixedEdge, config, { period: "night" });
  assert.ok(Math.abs(nightRisk - 0.45) < 1e-6);
});

test("Point 5: getRiskBand categorizes into Low, Medium, and High bands", () => {
  resetRiskConfig();
  const config = getActiveRiskConfig();

  // Test 0.0 - 1.0 scale
  assert.equal(getRiskBand(0.10, config), "Low");
  assert.equal(getRiskBand(0.29, config), "Low");
  assert.equal(getRiskBand(0.30, config), "Medium");
  assert.equal(getRiskBand(0.55, config), "Medium");
  assert.equal(getRiskBand(0.59, config), "Medium");
  assert.equal(getRiskBand(0.60, config), "High");
  assert.equal(getRiskBand(0.95, config), "High");

  // Test 0 - 100 percentage scale
  assert.equal(getRiskBand(15, config), "Low");
  assert.equal(getRiskBand(29, config), "Low");
  assert.equal(getRiskBand(30, config), "Medium");
  assert.equal(getRiskBand(59, config), "Medium");
  assert.equal(getRiskBand(60, config), "High");
  assert.equal(getRiskBand(90, config), "High");
});

test("Point 6: calculateCost implements C(e) = T(e) * (1 + s * k * R(e))", () => {
  const travelTime = 120; // 120 seconds
  const k = 2.0;

  // When slider s = 0 (faster mode): cost equals travel time regardless of risk
  assert.equal(calculateCost(travelTime, 0.0, k, 0.8), 120);
  assert.equal(calculateCost(travelTime, 0.0, k, 0.0), 120);

  // When risk R(e) = 0: cost equals travel time regardless of slider
  assert.equal(calculateCost(travelTime, 1.0, k, 0.0), 120);

  // When slider s = 0.5 (balanced) and R(e) = 0.5:
  // C(e) = 120 * (1 + 0.5 * 2.0 * 0.5) = 120 * (1 + 0.5) = 120 * 1.5 = 180
  assert.equal(calculateCost(travelTime, 0.5, k, 0.5), 180);

  // When slider s = 1.0 (safer) and R(e) = 0.5:
  // C(e) = 120 * (1 + 1.0 * 2.0 * 0.5) = 120 * (1 + 1.0) = 120 * 2.0 = 240
  assert.equal(calculateCost(travelTime, 1.0, k, 0.5), 240);

  // High risk R(e) = 1.0 with s = 1.0:
  // C(e) = 120 * (1 + 1.0 * 2.0 * 1.0) = 120 * 3.0 = 360
  assert.equal(calculateCost(travelTime, 1.0, k, 1.0), 360);
});

test("Integration: getEdgeCost in routeWeights integrates the cost function and six-factor risk", () => {
  const edge = {
    lengthM: 100,
    factors: {
      lighting: 0.5,
      activity: 0.5,
      pedestrian: 0.5,
      isolation: 0.5,
      roadCondition: 0.5,
      incident: 0.5,
    },
  };

  // Faster mode: s = 0 -> cost = distance
  const costFaster = getEdgeCost(edge, "faster");
  assert.equal(costFaster, 100);

  // Balanced mode: s = 0.5, k = 3.0, R(e) = 0.5
  // C(e) = 100 * (1 + 0.5 * 3.0 * 0.5) = 100 * 1.75 = 175
  const costBalanced = getEdgeCost(edge, "balanced");
  assert.equal(costBalanced, 175);

  // Safer mode: s = 1.0, k = 3.0, R(e) = 0.5
  // C(e) = 100 * (1 + 1.0 * 3.0 * 0.5) = 100 * 2.5 = 250
  const costSafer = getEdgeCost(edge, "safer");
  assert.equal(costSafer, 250);

  // Using seconds unit
  const travelTimeSeconds = getEdgeTravelTime(edge, 5.0); // 100m / (5km/h in m/s) = 100 / 1.38888... = 72s
  assert.ok(Math.abs(travelTimeSeconds - 72) < 0.1);
  const costInSeconds = getEdgeCost(edge, { slider: 0.5, useSeconds: true });
  assert.ok(Math.abs(costInSeconds - 72 * 1.75) < 0.2);
});
