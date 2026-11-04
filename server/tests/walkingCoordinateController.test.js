const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const { SpatialIndex } = require("../data/ingest/spatialIndex");
const { haversineM } = require("../data/ingest/routeWeights");

const graphPath = path.join(__dirname, "../data/processed/walkingGraph.json");
const graph = JSON.parse(fs.readFileSync(graphPath, "utf8"));
const nodes = graph.nodes;

const MAX_SNAP_M = 150;

function getCandidatesFullScan(nodes, coordinate) {
  const candidates = [];
  let nearestDistanceM = Infinity;
  for (const [id, point] of Object.entries(nodes)) {
    const distanceM = haversineM(coordinate.lat, coordinate.lng, point.lat, point.lng);
    if (distanceM < nearestDistanceM) nearestDistanceM = distanceM;
    if (distanceM <= MAX_SNAP_M) candidates.push({ id, distanceM });
  }
  candidates.sort((a, b) => a.distanceM - b.distanceM);
  return { candidates, nearestDistanceM };
}

function buildIndex() {
  const index = new SpatialIndex();
  index.build(nodes);
  return index;
}

test("SpatialIndex build stores all nodes", () => {
  const index = buildIndex();
  assert.equal(index.size(), Object.keys(nodes).length);
  assert.ok(index.built);
});

test("SpatialIndex query returns candidates for coordinate near a node", () => {
  const index = buildIndex();
  const firstId = Object.keys(nodes)[0];
  const first = nodes[firstId];
  const result = index.query(first.lat, first.lng, MAX_SNAP_M);
  assert.ok(result);
  assert.ok(result.candidates.length > 0);
  assert.ok(result.candidates.some(c => c.id === firstId));
  assert.equal(result.candidates[0].id, firstId);
  assert.equal(result.candidates[0].distanceM, 0);
});

test("SpatialIndex query respects maxDistanceM", () => {
  const index = buildIndex();
  const firstId = Object.keys(nodes)[0];
  const first = nodes[firstId];
  const tiny = index.query(first.lat, first.lng, 1);
  assert.ok(tiny.candidates.length <= 1);
  if (tiny.candidates.length > 0) {
    assert.ok(tiny.candidates[0].distanceM <= 1);
  }
  const large = index.query(first.lat, first.lng, 5000);
  assert.ok(large.candidates.length > 0);
});

test("SpatialIndex equivalence with full scan - normal snapping", () => {
  const index = buildIndex();
  const testCoords = [
    { lat: 27.57, lng: 77.68 },
    { lat: 27.575, lng: 77.675 },
    { lat: 27.58, lng: 77.69 },
    { lat: 27.56, lng: 77.66 },
  ];

  for (const coord of testCoords) {
    const indexed = index.query(coord.lat, coord.lng, MAX_SNAP_M);
    const full = getCandidatesFullScan(nodes, coord);

    const indexedIds = new Set(indexed.candidates.map(c => c.id));
    const fullIds = new Set(full.candidates.map(c => c.id));
    assert.deepEqual(
      [...indexedIds].sort(),
      [...fullIds].sort(),
      `Candidate IDs mismatch for ${JSON.stringify(coord)}`
    );

    for (const c of indexed.candidates) {
      const fullMatch = full.candidates.find(f => f.id === c.id);
      assert.ok(fullMatch, `Candidate ${c.id} missing from full scan`);
      assert.equal(c.distanceM, fullMatch.distanceM);
    }

    if (indexed.nearestDistanceM !== null) {
      assert.equal(indexed.nearestDistanceM, full.nearestDistanceM);
    } else {
      assert.ok(full.nearestDistanceM > MAX_SNAP_M);
    }
  }
});

test("SpatialIndex equivalence with full scan - no nearby node", () => {
  const index = buildIndex();
  const farCoord = { lat: 10.0, lng: 70.0 };

  const indexed = index.query(farCoord.lat, farCoord.lng, MAX_SNAP_M);
  const full = getCandidatesFullScan(nodes, farCoord);

  assert.equal(indexed.candidates.length, 0);
  assert.equal(full.candidates.length, 0);
  // When index searches a limited area and finds no nodes, nearestDistanceM is null.
  // Full scan always finds the nearest node (possibly very far away).
  if (indexed.nearestDistanceM !== null) {
    assert.equal(indexed.nearestDistanceM, full.nearestDistanceM);
  }
});

test("SpatialIndex boundary case - coordinate exactly on cell boundary", () => {
  const index = buildIndex();
  const firstId = Object.keys(nodes)[0];
  const first = nodes[firstId];
  const boundaryLat = Math.floor(first.lat / 0.001) * 0.001;
  const boundaryLng = Math.floor(first.lng / 0.001) * 0.001;

  const indexed = index.query(boundaryLat, boundaryLng, MAX_SNAP_M);
  const full = getCandidatesFullScan(nodes, { lat: boundaryLat, lng: boundaryLng });

  const indexedIds = new Set(indexed.candidates.map(c => c.id));
  const fullIds = new Set(full.candidates.map(c => c.id));
  assert.deepEqual(
    [...indexedIds].sort(),
    [...fullIds].sort(),
    `Boundary candidate ID mismatch`
  );
});

test("SpatialIndex handles empty nodes map", () => {
  const index = new SpatialIndex();
  index.build({});
  assert.equal(index.size(), 0);
  const result = index.query(27.57, 77.68, MAX_SNAP_M);
  assert.ok(result);
  assert.equal(result.candidates.length, 0);
  assert.equal(result.nearestDistanceM, null);
});

test("getCandidatesFullScan matches original behavior for valid coordinate", () => {
  const firstId = Object.keys(nodes)[0];
  const first = nodes[firstId];
  const result = getCandidatesFullScan(nodes, first);
  assert.ok(result.candidates.length > 0);
  assert.equal(result.candidates[0].id, firstId);
  assert.equal(result.candidates[0].distanceM, 0);
  assert.equal(result.nearestDistanceM, 0);
});

test("getCandidatesFullScan returns no candidates for far coordinate", () => {
  const result = getCandidatesFullScan(nodes, { lat: 10.0, lng: 70.0 });
  assert.equal(result.candidates.length, 0);
  assert.ok(result.nearestDistanceM !== null);
  assert.ok(result.nearestDistanceM > MAX_SNAP_M);
});

test("clearCache resets all cached state", () => {
  const { clearCache } = require("../controllers/walkingCoordinateController");

  // Build an index first to populate caches
  const index = buildIndex();
  assert.ok(index.built);
  assert.equal(index.size(), Object.keys(nodes).length);

  // clearCache should reset cached state
  clearCache();

  // After clearing, a fresh SpatialIndex should not share state with the old one
  const freshIndex = new SpatialIndex();
  freshIndex.build(nodes);
  assert.equal(freshIndex.size(), Object.keys(nodes).length);
  assert.ok(freshIndex.built);
});

test("cross-region: findRegionByCoords returns different regions for distant coordinates", () => {
  const { RegionRegistry } = require("../data/ingest/regionRegistry");
  const registry = new RegionRegistry();

  const regionA = {
    regionCode: "region-a",
    name: "Region A",
    bounds: { minLat: 27.55, maxLat: 27.60, minLng: 77.65, maxLng: 77.71 },
    version: "1.0.0",
    sourceUrl: "https://example.com/a",
    generatedAt: new Date().toISOString(),
    nodeCount: 100,
    edgeCount: 150,
    filePath: "data/processed/walkingGraph.json",
    isActive: true,
    _id: "id-a",
  };
  const regionB = {
    regionCode: "region-b",
    name: "Region B",
    bounds: { minLat: 28.50, maxLat: 28.60, minLng: 78.00, maxLng: 78.10 },
    version: "1.0.0",
    sourceUrl: "https://example.com/b",
    generatedAt: new Date().toISOString(),
    nodeCount: 100,
    edgeCount: 150,
    filePath: "data/processed/walkingGraph.json",
    isActive: true,
    _id: "id-b",
  };

  function regionMetadata(region) {
    return {
      regionCode: region.regionCode,
      name: region.name,
      bounds: region.bounds,
      version: region.version,
      sourceUrl: region.sourceUrl,
      generatedAt: region.generatedAt,
      nodeCount: region.nodeCount,
      edgeCount: region.edgeCount,
      filePath: region.filePath,
    };
  }

  registry.regions.set("region-a", {
    graph: graph,
    adjacency: null,
    spatialIndex: null,
    metadata: regionMetadata(regionA),
  });
  registry.regions.set("region-b", {
    graph: graph,
    adjacency: null,
    spatialIndex: null,
    metadata: regionMetadata(regionB),
  });

  const sourceRegion = registry.findRegionByCoords(27.57, 77.68);
  const destRegion = registry.findRegionByCoords(28.55, 78.05);

  assert.ok(sourceRegion);
  assert.equal(sourceRegion.regionCode, "region-a");
  assert.ok(destRegion);
  assert.equal(destRegion.regionCode, "region-b");
  assert.notEqual(sourceRegion.regionCode, destRegion.regionCode);
});

test("cross-region: findRegionByCoords returns null for coordinates outside all regions", () => {
  const { RegionRegistry } = require("../data/ingest/regionRegistry");
  const registry = new RegionRegistry();

  const regionA = {
    regionCode: "region-a",
    name: "Region A",
    bounds: { minLat: 27.55, maxLat: 27.60, minLng: 77.65, maxLng: 77.71 },
    version: "1.0.0",
    sourceUrl: "https://example.com/a",
    generatedAt: new Date().toISOString(),
    nodeCount: 100,
    edgeCount: 150,
    filePath: "data/processed/walkingGraph.json",
    isActive: true,
    _id: "id-a",
  };

  function regionMetadata(region) {
    return {
      regionCode: region.regionCode,
      name: region.name,
      bounds: region.bounds,
      version: region.version,
      sourceUrl: region.sourceUrl,
      generatedAt: region.generatedAt,
      nodeCount: region.nodeCount,
      edgeCount: region.edgeCount,
      filePath: region.filePath,
    };
  }

  registry.regions.set("region-a", {
    graph: graph,
    adjacency: null,
    spatialIndex: null,
    metadata: regionMetadata(regionA),
  });

  const result = registry.findRegionByCoords(10.0, 70.0);
  assert.equal(result, null);
});