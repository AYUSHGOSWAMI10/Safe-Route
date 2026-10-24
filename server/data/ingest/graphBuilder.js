const { getTags } = require("./walkingRules");

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const rad = deg => deg * Math.PI / 180;

  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) *
    Math.sin(dLng / 2) ** 2;

  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function buildGraph(nodes, walkingWays) {
  const nodeMap = new Map();

  for (const node of nodes) {
    const lat = Number(node.lat);
    const lng = Number(node.lon);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) continue;

    nodeMap.set(String(node.id), { lat, lng });
  }

  const walkingNodeIds = new Set();
  const edges = [];
  let missingNodes = 0;

  for (const way of walkingWays) {
    const tags = getTags(way);

    const refs = (Array.isArray(way.nd) ? way.nd : [way.nd])
      .filter(Boolean)
      .map(nd => String(nd.ref));

    for (const ref of refs) {
      if (nodeMap.has(ref)) walkingNodeIds.add(ref);
    }

    for (let i = 0; i < refs.length - 1; i++) {
      const from = refs[i];
      const to = refs[i + 1];

      const a = nodeMap.get(from);
      const b = nodeMap.get(to);

      if (!a || !b) {
        missingNodes++;
        continue;
      }

      if (from === to) continue;

      const lengthM = haversine(a.lat, a.lng, b.lat, b.lng);

      if (lengthM <= 0) continue;

      edges.push({
        from,
        to,
        wayId: String(way.id),
        geometry: [
            [a.lng, a.lat],
            [b.lng, b.lat]
        ],
        lengthM,
        road: {
            name: tags.name || null,
            highway: tags.highway || null,
            foot: tags.foot || null,
            access: tags.access || null,
            sidewalk: tags.sidewalk || null,
            lit: tags.lit || null,
            surface: tags.surface || null,
             maxspeed: tags.maxspeed || null,
            lanes: tags.lanes || null
        }
        });
            }
    } 

  return {
    nodeMap,
    walkingNodeIds,
    edges,
    missingNodes
  };
}

module.exports = {
  haversine,
  buildGraph
};