const fs = require("fs");
const path = require("path");
const { buildAdjacency } = require("./routingEngine");
const { SpatialIndex } = require("./spatialIndex");

/**
 * In-memory registry of regional walking graphs.
 *
 * Loads graph metadata from MongoDB Region model and caches
 * graph data, adjacency, and spatial index per region.
 * Falls back to the default Mathura graph when no region is specified.
 */
class RegionRegistry {
  constructor() {
    this.regions = new Map(); // regionCode -> { graph, adjacency, spatialIndex, metadata }
    this.defaultRegionCode = null;
    this.initialized = false;
  }

  /**
   * Initialize the registry from MongoDB Region documents.
   * @param {import('mongoose').Model} Region - Mongoose Region model
   */
  async init(Region) {
    if (this.initialized) return;

    try {
      const regions = await Region.find({ isActive: true }).lean();
      for (const region of regions) {
        await this._loadRegion(region);
      }

      // Set default to the first active region, or 'mathura' if it exists
      if (regions.length > 0) {
        this.defaultRegionCode = regions.find(
          (r) => r.regionCode === "mathura"
        )?.regionCode || regions[0].regionCode;
      }

      this.initialized = true;
    } catch (error) {
      console.error("Region registry init failed:", error.message);
      this.initialized = true; // Prevent retry loops; registry stays empty
    }
  }

  /**
   * Load a single region's graph into memory.
   * @param {Object} region - Region document from MongoDB
   */
  async _loadRegion(region) {
    const filePath = path.resolve(__dirname, "..", "..", region.filePath);
    if (!fs.existsSync(filePath)) {
      console.warn(`Region graph file not found: ${filePath}`);
      return;
    }

    try {
      const raw = fs.readFileSync(filePath, "utf8");
      const graph = JSON.parse(raw);

      if (!graph || !graph.nodes || !Array.isArray(graph.edges)) {
        console.warn(`Region graph malformed: ${region.regionCode}`);
        return;
      }

      const adjacency = buildAdjacency(graph);
      const spatialIndex = new SpatialIndex();
      spatialIndex.build(graph.nodes);

      this.regions.set(region.regionCode, {
        graph,
        adjacency,
        spatialIndex,
        metadata: {
          regionCode: region.regionCode,
          name: region.name,
          bounds: region.bounds,
          version: region.version,
          sourceUrl: region.sourceUrl,
          generatedAt: region.generatedAt,
          nodeCount: region.nodeCount,
          edgeCount: region.edgeCount,
          filePath: region.filePath,
        },
      });
    } catch (error) {
      console.error(`Failed to load region ${region.regionCode}:`, error.message);
    }
  }

  /**
   * Get region data by code. Returns null if not found.
   */
  get(regionCode) {
    if (!regionCode) regionCode = this.defaultRegionCode;
    return this.regions.get(regionCode) || null;
  }

  /**
   * Check if coordinates fall within any active region's bounds.
   * Returns the matching region metadata or null.
   */
  findRegionByCoords(lat, lng) {
    for (const [, data] of this.regions) {
      const { minLat, maxLat, minLng, maxLng } = data.metadata.bounds;
      if (
        lat >= minLat &&
        lat <= maxLat &&
        lng >= minLng &&
        lng <= maxLng
      ) {
        return data.metadata;
      }
    }
    return null;
  }

  /**
   * List all active regions (metadata only, no graph data).
   */
  list() {
    return [...this.regions.values()].map((d) => d.metadata);
  }

  /**
   * Get or set the default region code.
   */
  getDefaultRegionCode() {
    return this.defaultRegionCode;
  }

  setDefaultRegionCode(code) {
    if (this.regions.has(code)) {
      this.defaultRegionCode = code;
    }
  }
}

const regionRegistry = new RegionRegistry();
module.exports = { RegionRegistry, regionRegistry };