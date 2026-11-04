const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const { RegionRegistry } = require("../data/ingest/regionRegistry");
const { buildAdjacency } = require("../data/ingest/routingEngine");

const graphPath = path.join(__dirname, "../data/processed/walkingGraph.json");
const graph = JSON.parse(fs.readFileSync(graphPath, "utf8"));
const adjacency = buildAdjacency(graph);

function makeRegion(overrides = {}) {
  return {
    regionCode: overrides.regionCode || "test-region",
    name: overrides.name || "Test Region",
    bounds: overrides.bounds || {
      minLat: 27.55, maxLat: 27.60,
      minLng: 77.65, maxLng: 77.71,
    },
    version: overrides.version || "1.0.0",
    sourceUrl: overrides.sourceUrl || "https://example.com/osm",
    generatedAt: overrides.generatedAt || new Date().toISOString(),
    nodeCount: overrides.nodeCount || Object.keys(graph.nodes).length,
    edgeCount: overrides.edgeCount || graph.edges.length,
    filePath: overrides.filePath || "data/processed/walkingGraph.json",
    isActive: overrides.isActive !== undefined ? overrides.isActive : true,
    _id: "test-id",
  };
}

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

test("RegionRegistry stores and retrieves regions", () => {
  const registry = new RegionRegistry();
  const region = makeRegion({ regionCode: "mathura" });
  registry.regions.set("mathura", {
    graph, adjacency, spatialIndex: null,
    metadata: regionMetadata(region),
  });

  const retrieved = registry.get("mathura");
  assert.ok(retrieved);
  assert.equal(retrieved.metadata.regionCode, "mathura");
  assert.equal(retrieved.metadata.name, "Test Region");
  assert.equal(retrieved.graph, graph);
  assert.equal(retrieved.adjacency, adjacency);
});

test("RegionRegistry.get returns null for unknown region", () => {
  const registry = new RegionRegistry();
  assert.equal(registry.get("nonexistent"), null);
});

test("RegionRegistry.default region code is null initially", () => {
  const registry = new RegionRegistry();
  assert.equal(registry.getDefaultRegionCode(), null);
});

test("RegionRegistry.setDefaultRegionCode only sets valid regions", () => {
  const registry = new RegionRegistry();
  registry.regions.set("mathura", { graph, adjacency, spatialIndex: null, metadata: { regionCode: "mathura" } });

  registry.setDefaultRegionCode("mathura");
  assert.equal(registry.getDefaultRegionCode(), "mathura");

  registry.setDefaultRegionCode("nonexistent");
  assert.equal(registry.getDefaultRegionCode(), "mathura");
});

test("RegionRegistry.findRegionByCoords returns matching region", () => {
  const registry = new RegionRegistry();
  const region = makeRegion({
    regionCode: "mathura",
    bounds: { minLat: 27.55, maxLat: 27.60, minLng: 77.65, maxLng: 77.71 },
  });
  registry.regions.set("mathura", {
    graph, adjacency, spatialIndex: null,
    metadata: regionMetadata(region),
  });

  const found = registry.findRegionByCoords(27.57, 77.68);
  assert.ok(found);
  assert.equal(found.regionCode, "mathura");
});

test("RegionRegistry.findRegionByCoords returns null for out-of-bounds coords", () => {
  const registry = new RegionRegistry();
  const region = makeRegion({
    regionCode: "mathura",
    bounds: { minLat: 27.55, maxLat: 27.60, minLng: 77.65, maxLng: 77.71 },
  });
  registry.regions.set("mathura", {
    graph, adjacency, spatialIndex: null,
    metadata: regionMetadata(region),
  });

  const found = registry.findRegionByCoords(10.0, 70.0);
  assert.equal(found, null);
});

test("RegionRegistry.list returns metadata for all regions", () => {
  const registry = new RegionRegistry();
  const r1 = makeRegion({ regionCode: "region-a", name: "Region A" });
  const r2 = makeRegion({ regionCode: "region-b", name: "Region B" });

  registry.regions.set("region-a", {
    graph, adjacency, spatialIndex: null,
    metadata: regionMetadata(r1),
  });
  registry.regions.set("region-b", {
    graph, adjacency, spatialIndex: null,
    metadata: regionMetadata(r2),
  });

  const list = registry.list();
  assert.equal(list.length, 2);
  const codes = new Set(list.map(r => r.regionCode));
  assert.ok(codes.has("region-a"));
  assert.ok(codes.has("region-b"));
});