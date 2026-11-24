const {
  FACTORS,
  getActiveRiskConfig,
  getRiskBand,
  deriveEdgeFactors,
  calculateEdgeRisk,
} = require("./riskConfig");

// Realistic default coordinates for sample places (Mathura region)
const SAMPLE_PLACE_COORDINATES = {
  "Central Park": { lat: 27.5700, lng: 77.6750 },
  "City Library": { lat: 27.5740, lng: 77.6780 },
  "Market Square": { lat: 27.5780, lng: 77.6820 },
  "Riverside": { lat: 27.5820, lng: 77.6900 },
  "University": { lat: 27.5850, lng: 77.6950 },
  "Bus Station": { lat: 27.5870, lng: 77.7010 },
};

/**
 * Derives factor provenance sources for an edge:
 * 'osm' | 'estimated' | 'simulated' | 'report'
 *
 * @param {object} edge
 * @returns {Record<string, 'osm'|'estimated'|'simulated'|'report'>}
 */
function deriveFactorSources(edge) {
  if (edge?.factorSource && typeof edge.factorSource === "object") {
    const res = {};
    for (const factor of FACTORS) {
      res[factor] = edge.factorSource[factor] || "estimated";
    }
    return res;
  }

  // If synthetic/sample road with only safetyScore
  if (typeof edge?.safetyScore === "number" && !edge?.road?.highway) {
    return {
      lighting: "estimated",
      activity: "estimated",
      pedestrian: "estimated",
      isolation: "estimated",
      roadCondition: "estimated",
      incident: "estimated",
    };
  }

  const road = edge?.road || {};
  const safety = edge?.safety || {};

  return {
    lighting: road.lit || safety.lighting ? "osm" : "estimated",
    activity: road.highway ? "osm" : "estimated",
    pedestrian: road.sidewalk || safety.sidewalk ? "osm" : "estimated",
    isolation: "estimated",
    roadCondition: road.surface || safety.surface ? "osm" : "estimated",
    incident:
      safety.incidentSource === "report"
        ? "report"
        : safety.incidentSource === "simulated" || safety.incidentRisk
        ? "simulated"
        : "estimated",
  };
}

/**
 * Generates user-facing explanations and warnings using templates.
 *
 * @param {object} params
 * @returns {{ explanations: string[], warnings: string[] }}
 */
function generateTemplates({
  riskScore,
  riskBand,
  worstSegment,
  riskBreakdown,
  highRiskPercentage,
  dataConfidence,
}) {
  const explanations = [];
  const warnings = [];

  // 1. Overall route summary explanation
  if (riskBand === "Low") {
    explanations.push("Safe route prioritizing well-lit, active streets.");
  } else if (riskBand === "Medium") {
    explanations.push("Balanced route with moderate safety and direct transit.");
  } else {
    warnings.push("Route contains elevated risk sections; caution advised.");
  }

  // 2. High-risk segment exposure
  if (highRiskPercentage > 0) {
    warnings.push(`${highRiskPercentage}% of route passes through High-risk segments.`);
  } else {
    explanations.push("0% of route passes through High-risk segments.");
  }

  // 3. Six-factor explanations and warnings
  if (riskBreakdown) {
    // Lighting
    if (riskBreakdown.lighting <= 0.30) {
      explanations.push("Well-lit streets along majority of the path.");
    } else if (riskBreakdown.lighting >= 0.60) {
      warnings.push("Contains poorly lit or dark stretches; carry a flashlight after dark.");
    }

    // Pedestrian infrastructure
    if (riskBreakdown.pedestrian <= 0.30) {
      explanations.push("Dedicated sidewalks or pedestrian paths available.");
    } else if (riskBreakdown.pedestrian >= 0.60) {
      warnings.push("Limited pedestrian infrastructure; expect road shoulder walking.");
    }

    // Activity & Isolation
    if (riskBreakdown.activity <= 0.35 && riskBreakdown.isolation <= 0.35) {
      explanations.push("Active neighborhood with regular foot traffic and open storefronts.");
    } else if (riskBreakdown.isolation >= 0.60) {
      warnings.push("Passes through quiet or isolated sections with lower foot traffic.");
    }

    // Surface / Road Condition
    if (riskBreakdown.roadCondition <= 0.25) {
      explanations.push("Paved, smooth walking surfaces throughout.");
    } else if (riskBreakdown.roadCondition >= 0.60) {
      warnings.push("Unpaved or uneven walking surfaces present.");
    }

    // Incidents
    if (riskBreakdown.incident >= 0.30) {
      warnings.push("Passes near areas with historical or reported incident activity.");
    } else if (riskBreakdown.incident === 0) {
      explanations.push("No verified incidents reported along this path.");
    }
  }

  // 4. Worst segment warning
  if (worstSegment && (worstSegment.riskBand === "High" || worstSegment.riskBand === "Medium")) {
    const factorLabel = worstSegment.primaryFactor ? ` (${worstSegment.primaryFactor} risk)` : "";
    warnings.push(
      `Caution near ${worstSegment.name}: segment has elevated risk${factorLabel}.`
    );
  }

  // 5. Data confidence note if low
  if (dataConfidence && dataConfidence.level === "Low") {
    warnings.push("Data confidence is limited; some road attributes use estimated defaults.");
  }

  return { explanations, warnings };
}

/**
 * Assembles complete route metrics, geometry, segment risks,
 * breakdowns, confidence split, and template explanations.
 *
 * @param {string[]} nodeIds - Sequence of node IDs along the route
 * @param {Map<string, Array<{to: string, edge: object}>>} adjacency - Graph adjacency
 * @param {object} [options] - Options: isPlaceGraph, config, period, nodes
 * @returns {object} Full route assembly result
 */
function assembleRoute(nodeIds, adjacency, options = {}) {
  const isPlaceGraph = options.isPlaceGraph ?? true;
  const config = options.config || getActiveRiskConfig();
  const period = options.period || "day";
  const nodeCoords = options.nodes || {};

  let totalDistanceKm = 0;
  let totalLengthM = 0;
  let totalTimeMin = 0;
  let totalTimeSec = 0;
  let weightedRiskSum = 0;
  let weightedSafetySum = 0;
  let highRiskLengthM = 0;

  const factorWeightedSums = {};
  for (const factor of FACTORS) {
    factorWeightedSums[factor] = 0;
  }

  const sourceWeights = { osm: 0, estimated: 0, simulated: 0, report: 0 };
  const segments = [];
  const fullGeometry = [];

  for (let i = 0; i < nodeIds.length - 1; i++) {
    const from = nodeIds[i];
    const to = nodeIds[i + 1];
    const neighbors = adjacency.get(from) || [];
    const connection = neighbors.find((c) => c.to === to);

    if (!connection || !connection.edge) {
      throw new Error(`Missing graph edge between ${from} and ${to}`);
    }

    const edge = connection.edge;

    // Determine segment length in meters
    const lengthM =
      edge.lengthM ??
      (typeof edge.distance === "number" ? edge.distance * 1000 : 0);
    const distKm = lengthM / 1000;

    // Determine segment travel time in seconds
    const speedKph = config?.walkingSpeedKph || 5.0;
    const speedModifier = period === "night" ? 0.88 : period === "evening" ? 0.95 : 1.0;
    const effectiveSpeedMps = ((speedKph * 1000) / 3600) * speedModifier;

    let timeSec;
    if (typeof edge.travelTimeSeconds === "number") {
      timeSec = Math.round(edge.travelTimeSeconds / speedModifier);
    } else if (typeof edge.estimatedTime === "number" && !options.period) {
      // Preserve explicit mock estimatedTime only when period is omitted (e.g. unit tests)
      timeSec = edge.estimatedTime * 60;
    } else {
      timeSec = Math.max(1, Math.round(lengthM / effectiveSpeedMps));
    }

    const timeMin = Math.max(1, Math.round(timeSec / 60));

    // Factors and risk calculation
    const factors = deriveEdgeFactors(edge, { period });
    const factorSources = deriveFactorSources(edge);
    const segmentRisk = calculateEdgeRisk(edge, config, { period });
    const segmentBand = getRiskBand(segmentRisk, config);

    // Geometry resolution for this segment
    let segmentGeometry = [];
    if (Array.isArray(edge.geometry) && edge.geometry.length > 0) {
      segmentGeometry = edge.geometry.map((pt) => [pt[0], pt[1]]);
    } else {
      // Lookup coordinates from nodeCoords or SAMPLE_PLACE_COORDINATES
      const fromPt = nodeCoords[from] || SAMPLE_PLACE_COORDINATES[from];
      const toPt = nodeCoords[to] || SAMPLE_PLACE_COORDINATES[to];
      if (fromPt && toPt && typeof fromPt.lng === "number" && typeof toPt.lng === "number") {
        segmentGeometry = [
          [fromPt.lng, fromPt.lat],
          [toPt.lng, toPt.lat],
        ];
      }
    }

    // Assemble continuous route geometry (prevent duplicate coordinates at junction)
    for (let g = 0; g < segmentGeometry.length; g++) {
      const pt = segmentGeometry[g];
      if (
        fullGeometry.length === 0 ||
        fullGeometry[fullGeometry.length - 1][0] !== pt[0] ||
        fullGeometry[fullGeometry.length - 1][1] !== pt[1]
      ) {
        fullGeometry.push(pt);
      }
    }

    // Identify primary risk factor on this segment
    let maxFactorName = FACTORS[0];
    let maxFactorVal = -1;
    for (const f of FACTORS) {
      const fVal = typeof factors[f] === "number" ? factors[f] : 0;
      if (fVal > maxFactorVal) {
        maxFactorVal = fVal;
        maxFactorName = f;
      }
    }

    const segmentName =
      edge.road?.name ||
      (isPlaceGraph ? `${from} - ${to}` : `Segment ${from} -> ${to}`);

    segments.push({
      from,
      to,
      name: segmentName,
      lengthM: Number(lengthM.toFixed(2)),
      estimatedTimeSec: timeSec,
      geometry: segmentGeometry,
      risk: Number(segmentRisk.toFixed(4)),
      riskBand: segmentBand,
      primaryFactor: maxFactorName,
      factors,
      factorSource: factorSources,
    });

    // Accumulate route aggregates
    totalDistanceKm += distKm;
    totalLengthM += lengthM;
    totalTimeMin += timeMin;
    totalTimeSec += timeSec;

    weightedRiskSum += segmentRisk * lengthM;
    const segmentSafety = Math.max(0, Math.min(100, Math.round((1 - segmentRisk) * 100)));
    const safetyScoreEdge = options.period ? segmentSafety : (edge.safetyScore ?? segmentSafety);
    weightedSafetySum += safetyScoreEdge * distKm;

    if (segmentBand === "High") {
      highRiskLengthM += lengthM;
    }

    // Accumulate factor breakdown
    for (const factor of FACTORS) {
      factorWeightedSums[factor] += (factors[factor] || 0) * lengthM;
    }

    // Accumulate data confidence provenance
    for (const factor of FACTORS) {
      const src = factorSources[factor] || "estimated";
      sourceWeights[src] = (sourceWeights[src] || 0) + lengthM;
    }
  }

  // Aggregate distance and time
  const distanceKm = Number(totalDistanceKm.toFixed(1));
  const estimatedTimeMin = totalTimeMin > 0 ? totalTimeMin : Math.max(1, Math.round(totalTimeSec / 60));

  // Length-weighted route risk score R_route in [0, 1]
  const rawRiskScore = totalLengthM > 0 ? weightedRiskSum / totalLengthM : 0.3;
  const riskScore = Number(rawRiskScore.toFixed(4));

  // Dynamic safety score (0-100), inverse of route risk score derived from the 6 factors
  const safetyScore =
    isPlaceGraph && totalDistanceKm > 0 && !options.period
      ? Math.round(weightedSafetySum / totalDistanceKm)
      : Math.max(0, Math.min(100, Math.round((1 - rawRiskScore) * 100)));

  const riskBand = getRiskBand(riskScore, config);

  // High-risk segment exposure percentage
  const highRiskPercentage =
    totalLengthM > 0 ? Number(((highRiskLengthM / totalLengthM) * 100).toFixed(1)) : 0;

  // Worst segment identification
  let worstSegment = null;
  if (segments.length > 0) {
    worstSegment = segments.reduce((worst, cur) => (cur.risk > worst.risk ? cur : worst), segments[0]);
    worstSegment = {
      from: worstSegment.from,
      to: worstSegment.to,
      name: worstSegment.name,
      lengthM: worstSegment.lengthM,
      risk: worstSegment.risk,
      riskBand: worstSegment.riskBand,
      primaryFactor: worstSegment.primaryFactor,
      factors: { ...worstSegment.factors },
    };
  }

  // Six-factor risk breakdown
  const riskBreakdown = {};
  for (const factor of FACTORS) {
    riskBreakdown[factor] =
      totalLengthM > 0
        ? Number((factorWeightedSums[factor] / totalLengthM).toFixed(3))
        : 0.3;
  }

  // Data-confidence breakdown
  const totalConfidenceWeight =
    sourceWeights.osm + sourceWeights.estimated + sourceWeights.simulated + sourceWeights.report;

  const dataConfidenceSplit = {
    osm: totalConfidenceWeight > 0 ? Number(((sourceWeights.osm / totalConfidenceWeight) * 100).toFixed(1)) : 0,
    estimated: totalConfidenceWeight > 0 ? Number(((sourceWeights.estimated / totalConfidenceWeight) * 100).toFixed(1)) : 100,
    simulated: totalConfidenceWeight > 0 ? Number(((sourceWeights.simulated / totalConfidenceWeight) * 100).toFixed(1)) : 0,
    report: totalConfidenceWeight > 0 ? Number(((sourceWeights.report / totalConfidenceWeight) * 100).toFixed(1)) : 0,
  };

  const highConfidenceShare = dataConfidenceSplit.osm + dataConfidenceSplit.report;
  const confidenceLevel =
    highConfidenceShare >= 60 ? "High" : highConfidenceShare >= 25 ? "Medium" : "Low";

  const dataConfidence = {
    level: confidenceLevel,
    score: highConfidenceShare,
    split: dataConfidenceSplit,
  };

  // Explanation and warning messages using templates
  const { explanations, warnings } = generateTemplates({
    riskScore,
    riskBand,
    worstSegment,
    riskBreakdown,
    highRiskPercentage,
    dataConfidence,
  });

  return {
    distanceKm,
    distanceM: Math.round(totalLengthM),
    estimatedTimeMin,
    estimatedTimeSec: totalTimeSec,
    safetyScore,
    riskScore,
    riskBand,
    geometry: fullGeometry,
    segments,
    highRiskPercentage,
    highRiskLengthM: Math.round(highRiskLengthM),
    worstSegment,
    riskBreakdown,
    dataConfidence,
    explanations,
    warnings,
  };
}

module.exports = {
  SAMPLE_PLACE_COORDINATES,
  deriveFactorSources,
  generateTemplates,
  assembleRoute,
};
