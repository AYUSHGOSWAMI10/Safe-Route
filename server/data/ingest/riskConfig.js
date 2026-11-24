const fs = require("fs");
const path = require("path");

const FACTORS = [
  "lighting",
  "activity",
  "pedestrian",
  "isolation",
  "roadCondition",
  "incident",
];

const DEFAULT_RISK_CONFIG = {
  version: "1.0.0",
  weights: {
    lighting: 0.20,
    activity: 0.15,
    pedestrian: 0.20,
    isolation: 0.15,
    roadCondition: 0.15,
    incident: 0.15,
  },
  k: 3.0,
  bands: {
    low: 0.30,
    medium: 0.60,
    high: 1.00,
  },
  timeMultipliers: {
    day: 1.0,
    evening: 1.2,
    night: 1.5,
  },
  walkingSpeedKph: 5.0,
};

const FLOAT_TOLERANCE = 1e-6;

/**
 * Validates that all six weights exist and sum to exactly 1.0
 * within an appropriate floating-point tolerance (1e-6).
 * Also validates k and risk band thresholds.
 *
 * @param {object} config - Configuration object
 * @returns {boolean} true if valid; throws Error otherwise
 */
function validateRiskConfig(config) {
  if (!config || typeof config !== "object") {
    throw new Error("Invalid risk config: configuration must be an object.");
  }

  if (!config.weights || typeof config.weights !== "object") {
    throw new Error("Invalid risk config: weights object is required.");
  }

  let sum = 0;
  for (const factor of FACTORS) {
    const w = config.weights[factor];
    if (typeof w !== "number" || !Number.isFinite(w) || w < 0) {
      throw new Error(
        `Invalid risk config: weight for "${factor}" must be a non-negative finite number.`
      );
    }
    sum += w;
  }

  if (Math.abs(sum - 1.0) > FLOAT_TOLERANCE) {
    throw new Error(
      `Invalid risk config: all six weights must sum to exactly 1.0 (got ${sum.toFixed(6)}).`
    );
  }

  if (typeof config.k !== "number" || !Number.isFinite(config.k) || config.k < 0) {
    throw new Error(
      "Invalid risk config: risk sensitivity constant k must be a non-negative finite number."
    );
  }

  if (config.bands && typeof config.bands === "object") {
    const { low, medium } = config.bands;
    if (
      typeof low === "number" &&
      typeof medium === "number" &&
      low >= medium
    ) {
      throw new Error(
        "Invalid risk config: bands.low must be strictly less than bands.medium."
      );
    }
  }

  return true;
}

let activeConfig = JSON.parse(JSON.stringify(DEFAULT_RISK_CONFIG));

/**
 * Loads and validates a risk configuration.
 *
 * @param {string|object} [source] - File path or configuration object. If omitted,
 *                                   loads from server/data/risk_config.json or defaults.
 * @returns {object} Validated risk configuration
 */
function loadRiskConfig(source) {
  let loaded;

  if (!source) {
    const configPath = path.join(__dirname, "../risk_config.json");
    if (fs.existsSync(configPath)) {
      try {
        const raw = fs.readFileSync(configPath, "utf8");
        loaded = JSON.parse(raw);
      } catch (err) {
        throw new Error(`Failed to parse risk_config.json: ${err.message}`);
      }
    } else {
      loaded = JSON.parse(JSON.stringify(DEFAULT_RISK_CONFIG));
    }
  } else if (typeof source === "string") {
    if (!fs.existsSync(source)) {
      throw new Error(`Risk config file not found: ${source}`);
    }
    const raw = fs.readFileSync(source, "utf8");
    try {
      loaded = JSON.parse(raw);
    } catch (err) {
      throw new Error(`Failed to parse risk config file: ${err.message}`);
    }
  } else if (typeof source === "object") {
    loaded = {
      ...DEFAULT_RISK_CONFIG,
      ...source,
      weights: {
        ...DEFAULT_RISK_CONFIG.weights,
        ...(source.weights || {}),
      },
      bands: {
        ...DEFAULT_RISK_CONFIG.bands,
        ...(source.bands || {}),
      },
      timeMultipliers: {
        ...DEFAULT_RISK_CONFIG.timeMultipliers,
        ...(source.timeMultipliers || {}),
      },
    };
  } else {
    throw new Error("Invalid source for risk configuration: expected file path or object.");
  }

  validateRiskConfig(loaded);
  activeConfig = loaded;
  return activeConfig;
}

function getActiveRiskConfig() {
  return activeConfig;
}

function resetRiskConfig() {
  activeConfig = JSON.parse(JSON.stringify(DEFAULT_RISK_CONFIG));
  return activeConfig;
}

/**
 * Maps a risk value to a risk band: "Low", "Medium", or "High".
 *
 * @param {number} risk - Normalized risk (0.0 to 1.0) or percentage (0 to 100)
 * @param {object} [config] - Risk configuration
 * @returns {"Low"|"Medium"|"High"}
 */
function getRiskBand(risk, config = activeConfig) {
  if (!Number.isFinite(risk)) return "Unknown";

  const r = risk > 1 ? risk / 100 : Math.max(0, risk);
  const low = config?.bands?.low ?? DEFAULT_RISK_CONFIG.bands.low;
  const medium = config?.bands?.medium ?? DEFAULT_RISK_CONFIG.bands.medium;

  if (r < low) return "Low";
  if (r < medium) return "Medium";
  return "High";
}

/**
 * Extracts or derives the six risk factors for an edge.
 *
 * @param {object} edge - Graph edge
 * @returns {Record<string, number>}
 */
function deriveEdgeFactors(edge, options = {}) {
  const period = options.period || "day";

  if (edge?.factors && typeof edge.factors === "object") {
    const hasAll = FACTORS.every((f) => typeof edge.factors[f] === "number");
    if (hasAll) {
      const res = {};
      for (const f of FACTORS) {
        res[f] = Math.max(0, Math.min(1, edge.factors[f]));
      }
      return res;
    }
  }

  const road = edge?.road || {};
  const safety = edge?.safety || {};

  const hasRoadMeta = Boolean(
    road.highway ||
      road.lit ||
      road.surface ||
      road.sidewalk ||
      safety.lighting ||
      safety.surface ||
      safety.sidewalk ||
      typeof safety.incidentRisk === "number" ||
      typeof safety.trafficExposure === "number"
  );

  // When road has calibrated biases (e.g. place graph), calculate distinct dynamic factors
  if (typeof edge?.safetyScore === "number" && edge?.biases) {
    const baseRisk = Math.max(0, Math.min(1, (100 - edge.safetyScore) / 100));
    const pMod =
      period === "night"
        ? { lit: 1.55, act: 1.35, iso: 1.45, inc: 1.20, ped: 1.0, rc: 1.0 }
        : period === "evening"
        ? { lit: 1.20, act: 1.15, iso: 1.20, inc: 1.10, ped: 1.0, rc: 1.0 }
        : { lit: 0.85, act: 0.90, iso: 0.90, inc: 0.95, ped: 1.0, rc: 1.0 };
    const b = edge.biases;
    return {
      lighting: Math.max(0, Math.min(1, Number((baseRisk * (b.litBias || 1.0) * pMod.lit).toFixed(4)))),
      activity: Math.max(0, Math.min(1, Number((baseRisk * (b.actBias || 1.0) * pMod.act).toFixed(4)))),
      pedestrian: Math.max(0, Math.min(1, Number((baseRisk * (b.pedBias || 1.0) * pMod.ped).toFixed(4)))),
      isolation: Math.max(0, Math.min(1, Number((baseRisk * (b.isoBias || 1.0) * pMod.iso).toFixed(4)))),
      roadCondition: Math.max(0, Math.min(1, Number((baseRisk * (b.rcBias || 1.0) * pMod.rc).toFixed(4)))),
      incident: Math.max(0, Math.min(1, Number((baseRisk * (b.incBias || 1.0) * pMod.inc).toFixed(4)))),
    };
  }

  // Fallback for simple synthetic mock edges that only supply safetyScore
  if (!hasRoadMeta && typeof edge?.safetyScore === "number") {
    const baseRisk = Math.max(0, Math.min(1, (100 - edge.safetyScore) / 100));
    return {
      lighting: baseRisk,
      activity: baseRisk,
      pedestrian: baseRisk,
      isolation: baseRisk,
      roadCondition: baseRisk,
      incident: baseRisk,
    };
  }

  // 1. lighting (0 = well-lit, 1 = unlit)
  let lighting = 0.2;
  const lit = (road.lit || safety.lighting || "").toLowerCase();
  if (lit === "yes" || lit === "24/7") {
    lighting = period === "night" ? 0.22 : period === "evening" ? 0.12 : 0.05;
  } else if (lit === "limited" || lit === "disused") {
    lighting = period === "night" ? 0.65 : period === "evening" ? 0.40 : 0.12;
  } else if (lit === "no") {
    lighting = period === "night" ? 0.90 : period === "evening" ? 0.60 : 0.18;
  } else {
    lighting = period === "night" ? 0.60 : period === "evening" ? 0.35 : 0.12;
  }

  // 2. activity (0 = busy/high pedestrian activity, 1 = deserted)
  let activity = 0.35;
  const hw = (road.highway || "").toLowerCase();
  if (["pedestrian", "living_street", "market"].includes(hw)) {
    activity = period === "night" ? 0.45 : period === "evening" ? 0.20 : 0.08;
  } else if (["residential", "service"].includes(hw)) {
    activity = period === "night" ? 0.60 : period === "evening" ? 0.38 : 0.25;
  } else if (["tertiary", "secondary"].includes(hw)) {
    activity = period === "night" ? 0.65 : period === "evening" ? 0.48 : 0.35;
  } else if (["track", "path", "footway"].includes(hw)) {
    activity = period === "night" ? 0.80 : period === "evening" ? 0.58 : 0.30;
  } else {
    activity = period === "night" ? 0.65 : period === "evening" ? 0.45 : 0.30;
  }

  // 3. pedestrian infrastructure (0 = dedicated pedestrian facility, 1 = high traffic exposure)
  let pedestrian = 0.3;
  const sidewalk = (road.sidewalk || safety.sidewalk || "").toLowerCase();
  if (["both", "separate"].includes(sidewalk)) {
    pedestrian = 0.08;
  } else if (["yes", "left", "right"].includes(sidewalk)) {
    pedestrian = 0.20;
  } else if (["no", "none"].includes(sidewalk)) {
    pedestrian = 0.75;
  } else if (["footway", "pedestrian", "living_street"].includes(hw)) {
    pedestrian = 0.08;
  } else if (typeof safety.trafficExposure === "number") {
    pedestrian = Math.max(0, Math.min(1, 0.08 + (safety.trafficExposure / 5) * 0.6));
  }

  // 4. isolation (0 = active eyes on street, 1 = isolated area)
  let isolation = 0.3;
  if (["track", "path"].includes(hw)) {
    isolation = period === "night" ? 0.80 : period === "evening" ? 0.55 : 0.35;
  } else if (["footway"].includes(hw)) {
    isolation = period === "night" ? 0.70 : period === "evening" ? 0.45 : 0.22;
  } else if (["pedestrian", "living_street", "market"].includes(hw)) {
    isolation = period === "night" ? 0.38 : period === "evening" ? 0.22 : 0.12;
  } else if (["residential"].includes(hw)) {
    isolation = period === "night" ? 0.50 : period === "evening" ? 0.35 : 0.22;
  } else {
    isolation = period === "night" ? 0.55 : period === "evening" ? 0.40 : 0.25;
  }

  // 5. roadCondition (0 = paved/smooth, 1 = unpaved/rough)
  let roadCondition = 0.2;
  const surface = (road.surface || safety.surface || "").toLowerCase();
  if (["asphalt", "paved", "concrete"].includes(surface)) {
    roadCondition = 0.08;
  } else if (["cobblestone", "paving_stones"].includes(surface)) {
    roadCondition = 0.30;
  } else if (["unpaved", "dirt", "gravel", "ground"].includes(surface)) {
    roadCondition = 0.80;
  } else {
    roadCondition = ["footway", "living_street"].includes(hw) ? 0.12 : 0.22;
  }

  // 6. incident (0 = no known incidents, 1 = verified incident hotspot)
  let incident = 0.04;
  if (typeof safety.incidentRisk === "number") {
    incident = Math.max(0, Math.min(1, safety.incidentRisk));
  } else if (Array.isArray(edge?.incidents)) {
    incident = Math.min(1, edge.incidents.length * 0.25);
  }
  if (period === "night" && incident > 0) {
    incident = Math.min(1, incident * 1.25);
  }

  return {
    lighting,
    activity,
    pedestrian,
    isolation,
    roadCondition,
    incident,
  };
}

/**
 * Calculates the six-factor weighted edge risk R(e), normalized to [0, 1].
 *
 * @param {object} edge - Graph edge
 * @param {object} [config] - Validated risk configuration
 * @param {object} [options] - Options like period ("day" | "evening" | "night")
 * @returns {number} Normalized edge risk R(e)
 */
function calculateEdgeRisk(edge, config = activeConfig, options = {}) {
  const period = options.period || "day";
  const factors = deriveEdgeFactors(edge, { period });
  const weights = config?.weights || DEFAULT_RISK_CONFIG.weights;

  let weightedRisk = 0;
  for (const factor of FACTORS) {
    const val = typeof factors[factor] === "number" ? factors[factor] : 0.5;
    const clamped = Math.max(0, Math.min(1, val));
    weightedRisk += (weights[factor] || 0) * clamped;
  }

  const multiplier = config?.timeMultipliers?.[period] ?? 1.0;
  weightedRisk *= multiplier;

  return Math.max(0, Math.min(1, weightedRisk));
}

/**
 * Calculates travel time T(e) in seconds for a given edge.
 *
 * @param {object} edge - Graph edge
 * @param {number} [speedKph=5.0] - Walking speed in km/h
 * @returns {number} Travel time in seconds
 */
function getEdgeTravelTime(edge, speedKph = 5.0) {
  if (typeof edge?.travelTimeSeconds === "number") {
    return edge.travelTimeSeconds;
  }
  if (typeof edge?.estimatedTime === "number" && !edge?.lengthM) {
    return edge.estimatedTime * 60;
  }
  const lengthM = edge?.lengthM ?? ((edge?.distance || 0) * 1000);
  const speedMps = (speedKph * 1000) / 3600;
  return lengthM / speedMps;
}

/**
 * Cost function:
 * C(e) = T(e) * (1 + s * k * R(e))
 *
 * Where:
 * - T(e) = edge travel time
 * - s = safety slider (0.0 to 1.0)
 * - k = risk sensitivity constant
 * - R(e) = normalized edge risk
 *
 * @param {number} travelTime - Edge travel time T(e)
 * @param {number} slider - Safety slider s in [0, 1]
 * @param {number} k - Risk sensitivity constant k
 * @param {number} normalizedRisk - Normalized edge risk R(e) in [0, 1]
 * @returns {number} C(e)
 */
function calculateCost(travelTime, slider, k, normalizedRisk) {
  if (!Number.isFinite(travelTime) || travelTime < 0) return Infinity;

  const s = Number.isFinite(slider) ? Math.max(0, Math.min(1, slider)) : 0;
  const sensitivity = Number.isFinite(k) && k >= 0 ? k : 2.0;
  const risk = Number.isFinite(normalizedRisk) ? Math.max(0, Math.min(1, normalizedRisk)) : 0;

  return travelTime * (1 + s * sensitivity * risk);
}

/**
 * Maps a departure timestamp or Date to a risk period:
 * - "day": 06:00 to 17:59
 * - "evening": 18:00 to 21:59
 * - "night": 22:00 to 05:59
 *
 * @param {Date|string|number} [departAt] - Departure time
 * @returns {"day"|"evening"|"night"}
 */
function periodOf(departAt) {
  if (!departAt) return "day";
  const date = departAt instanceof Date ? departAt : new Date(departAt);
  if (isNaN(date.getTime())) return "day";

  const hour = date.getHours();
  if (hour >= 6 && hour < 18) {
    return "day";
  } else if (hour >= 18 && hour < 22) {
    return "evening";
  } else {
    return "night";
  }
}

module.exports = {
  FACTORS,
  DEFAULT_RISK_CONFIG,
  FLOAT_TOLERANCE,
  validateRiskConfig,
  loadRiskConfig,
  getActiveRiskConfig,
  resetRiskConfig,
  getRiskBand,
  periodOf,
  deriveEdgeFactors,
  calculateEdgeRisk,
  getEdgeTravelTime,
  calculateCost,
};
