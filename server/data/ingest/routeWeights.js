function getEdgeCost(edge, mode = "faster") {
  const distance = edge.lengthM;

  if (!Number.isFinite(distance) || distance <= 0) {
    return Infinity;
  }

  if (mode === "faster") {
    return distance;
  }

  const exposure = edge.safety?.trafficExposure;

  // Unknown exposure gets no assumed penalty.
  const normalizedExposure =
    typeof exposure === "number" && exposure >= 0 && exposure <= 5
      ? exposure / 5
      : 0;

  const lambda = mode === "safer" ? 3 : 0.5;

  if (mode !== "balanced" && mode !== "safer") {
    throw new Error(`Unknown routing mode: ${mode}`);
  }

  return distance * (1 + lambda * normalizedExposure);
}

module.exports = { getEdgeCost };