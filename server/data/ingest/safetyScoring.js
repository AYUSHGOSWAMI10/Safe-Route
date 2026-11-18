const {
  deriveEdgeFactors,
  calculateEdgeRisk,
  getRiskBand,
} = require("./riskConfig");

const exposureByHighway = {
  footway: 0,
  pedestrian: 0,
  path: 1,
  living_street: 1,
  residential: 2,
  service: 2,
  track: 2,
  unclassified: 3,
  tertiary: 4,
  tertiary_link: 4,
  secondary: 5,
  secondary_link: 5,
};

function getTrafficExposure(road) {
  const score = exposureByHighway[road.highway];
  return score === undefined ? null : score;
}

function getEdgeSafetyMetadata(edge) {
  const factors = deriveEdgeFactors(edge);
  const risk = calculateEdgeRisk(edge);
  return {
    trafficExposure: getTrafficExposure(edge.road),
    lighting: edge.road.lit ?? null,
    surface: edge.road.surface ?? null,
    sidewalk: edge.road.sidewalk ?? null,
    factors,
    risk: Number(risk.toFixed(4)),
    riskBand: getRiskBand(risk),
    dataSource: "OpenStreetMap",
    scoreType: "heuristic",
  };
}

module.exports = {
  getTrafficExposure,
  getEdgeSafetyMetadata,
  deriveEdgeFactors,
  calculateEdgeRisk,
  getRiskBand,
};
