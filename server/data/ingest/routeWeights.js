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

module.exports = { getEdgeCost, haversineM };