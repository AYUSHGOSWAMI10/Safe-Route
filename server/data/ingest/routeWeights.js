const {
  DEFAULT_RISK_CONFIG,
  loadRiskConfig,
  validateRiskConfig,
  getActiveRiskConfig,
  getRiskBand,
  calculateEdgeRisk,
  getEdgeTravelTime,
  calculateCost,
  deriveEdgeFactors,
  FACTORS,
} = require("./riskConfig");

function haversineM(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const rad = (deg) => (deg * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Calculates edge cost for shortest-path routing.
 *
 * Implements the cost function:
 * C(e) = T(e) * (1 + s * k * R(e))
 *
 * Where:
 * - T(e) = edge travel time (or distance-proportional time when using meters)
 * - s = safety slider (0 for "faster", 0.5 for "balanced", 1.0 for "safer", or custom 0..1)
 * - k = risk sensitivity constant
 * - R(e) = normalized 6-factor edge risk in [0, 1]
 *
 * @param {object} edge - Edge object
 * @param {string|object} [modeOrOptions="faster"] - "faster" | "balanced" | "safer" or { slider, k, period, useSeconds }
 * @param {object} [customConfig] - Optional risk config override
 * @returns {number} Cost value
 */
function getEdgeCost(edge, modeOrOptions = "faster", customConfig) {
  const distance = edge?.lengthM ?? ((edge?.distance || 0) * 1000);

  if (!Number.isFinite(distance) || distance <= 0) {
    return Infinity;
  }

  const config = customConfig || getActiveRiskConfig();
  let slider = 0;
  let k = config?.k ?? 3.0;
  let period = "day";
  let useSeconds = false;

  if (typeof modeOrOptions === "string") {
    if (modeOrOptions === "faster") {
      slider = 0;
    } else if (modeOrOptions === "balanced") {
      slider = 0.5;
    } else if (modeOrOptions === "safer") {
      slider = 1.0;
    } else {
      throw new Error(`Unknown routing mode: ${modeOrOptions}`);
    }
  } else if (modeOrOptions && typeof modeOrOptions === "object") {
    if (Number.isFinite(modeOrOptions.slider)) slider = modeOrOptions.slider;
    if (Number.isFinite(modeOrOptions.k)) k = modeOrOptions.k;
    if (modeOrOptions.period) period = modeOrOptions.period;
    if (modeOrOptions.useSeconds) useSeconds = true;
  }

  // Fast path: if slider === 0 (faster mode), cost is purely travel time with zero penalty
  if (slider === 0) {
    return useSeconds ? getEdgeTravelTime(edge, config?.walkingSpeedKph) : distance;
  }

  const edgeRisk = calculateEdgeRisk(edge, config, { period });
  const travelTime = useSeconds
    ? getEdgeTravelTime(edge, config?.walkingSpeedKph)
    : distance;

  return calculateCost(travelTime, slider, k, edgeRisk);
}

module.exports = {
  getEdgeCost,
  haversineM,
  calculateCost,
  calculateEdgeRisk,
  getEdgeTravelTime,
  getRiskBand,
  validateRiskConfig,
  loadRiskConfig,
  getActiveRiskConfig,
  deriveEdgeFactors,
  DEFAULT_RISK_CONFIG,
  FACTORS,
};
