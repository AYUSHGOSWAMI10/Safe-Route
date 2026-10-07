const Road = require("../models/Road");
const sampleRoads = require("../data/sampleRoads");

const preferenceWeights = {
  faster: { time: 0.75, distance: 0.2, safety: 0.05 },
  balanced: { time: 0.45, distance: 0.25, safety: 0.3 },
  safer: { time: 0.2, distance: 0.1, safety: 0.7 },
};

async function getRoads() {
  if (Road.db.readyState === 1) {
    const savedRoads = await Road.find().lean();
    if (savedRoads.length) return savedRoads;
  }
  return sampleRoads;
}

async function getLocations(req, res) {
  try {
    const roads = await getRoads();
    const locations = [...new Set(roads.flatMap((road) => [road.source, road.destination]))].sort();
    res.json({ locations });
  } catch (error) {
    res.status(500).json({ error: "Could not load locations." });
  }
}

function getPaths(roads, source, destination) {
  const paths = [];

  function walk(current, path, routeRoads) {
    if (current === destination) {
      paths.push(routeRoads);
      return;
    }
    for (const road of roads) {
      let next;
      if (road.source === current) next = road.destination;
      else if (road.destination === current) next = road.source;
      if (next && !path.includes(next)) {
        walk(next, [...path, next], [...routeRoads, road]);
      }
    }
  }

  walk(source, [source], []);
  return paths;
}

function scorePath(pathRoads, source, preference, index) {
  const distance = pathRoads.reduce((sum, road) => sum + road.distance, 0);
  const estimatedTime = pathRoads.reduce((sum, road) => sum + road.estimatedTime, 0);
  const safetyScore = Math.round(
    pathRoads.reduce((sum, road) => sum + road.safetyScore * road.distance, 0) / distance,
  );
  const weights = preferenceWeights[preference];
  const cost = weights.time * estimatedTime + weights.distance * distance + weights.safety * (100 - safetyScore);
  const path = [source];
  let current = source;
  for (const road of pathRoads) {
    current = road.source === current ? road.destination : road.source;
    path.push(current);
  }
  return {
    name: `Route ${String.fromCharCode(65 + index)}`,
    path,
    distance: Number(distance.toFixed(1)),
    estimatedTime,
    safetyScore,
    cost,
  };
}

async function findRoutes(req, res) {
  const { source, destination, preference = "balanced" } = req.body;
  if (!source || !destination) {
    return res.status(400).json({ error: "Choose a starting point and destination." });
  }
  if (source === destination) {
    return res.status(400).json({ error: "Choose two different locations." });
  }
  if (!preferenceWeights[preference]) {
    return res.status(400).json({ error: "Choose Faster, Balanced, or Safer." });
  }

  try {
    const roads = await getRoads();
    const paths = getPaths(roads, source, destination);
    if (!paths.length) return res.status(404).json({ error: "No route found for those locations." });

    const routes = paths
      .map((path, index) => scorePath(path, source, preference, index))
      .sort((a, b) => a.cost - b.cost)
      .slice(0, 3)
      .map(({ cost, ...route }, index) => ({
        ...route,
        name: `Route ${String.fromCharCode(65 + index)}`,
      }));
    res.json({ source, destination, routes, recommended: routes[0].name });
  } catch (error) {
    res.status(500).json({ error: "Could not find routes." });
  }
}

module.exports = { getLocations, findRoutes };
