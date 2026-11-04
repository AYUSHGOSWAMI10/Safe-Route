const fs = require("fs");
const path = require("path");
const Region = require("../models/Region");
const GraphImportJob = require("../models/GraphImportJob");
const { regionRegistry } = require("../data/ingest/regionRegistry");
const { clearCache: clearRouteCache } = require("./routeController");
const { clearCache: clearWalkingRouteCache } = require("./walkingRouteController");
const { clearCache: clearWalkingCoordinateCache } = require("./walkingCoordinateController");

function clearAllCaches() {
  clearRouteCache();
  clearWalkingRouteCache();
  clearWalkingCoordinateCache();
}

async function checkAdminAccess(req, res) {
  return res.status(200).json({
    success: true,
    message: "Admin access verified.",
    user: {
      id: req.userId,
      role: req.userRole,
    },
  });
}

/**
 * Import or refresh a regional walking graph.
 *
 * The full import workflow (download, parse, validate, register) is not
 * yet safe to run synchronously from an HTTP endpoint. This endpoint
 * creates a pending job and returns honestly that the import must be
 * triggered via the CLI scripts:
 *   node server/data/ingest/downloadRegion.js <region>
 *   node server/data/ingest/importRegion.js <regionCode> <osmFile>
 *
 * Body: { regionCode, sourceUrl, operation: "import"|"refresh" }
 */
async function importGraph(req, res) {
  const { regionCode, sourceUrl, operation = "import" } = req.body || {};

  if (!regionCode || typeof regionCode !== "string") {
    return res.status(400).json({
      success: false,
      message: "regionCode is required.",
    });
  }

  const cleanCode = regionCode.trim().toLowerCase();
  if (!/^[a-z0-9-]+$/.test(cleanCode)) {
    return res.status(400).json({
      success: false,
      message: "Invalid regionCode. Use lowercase letters, numbers, and hyphens only.",
    });
  }

  if (operation !== "import" && operation !== "refresh") {
    return res.status(400).json({
      success: false,
      message: "operation must be 'import' or 'refresh'.",
    });
  }

  // Validate sourceUrl if provided
  if (sourceUrl) {
    try {
      new URL(sourceUrl);
    } catch {
      return res.status(400).json({
        success: false,
        message: "Invalid sourceUrl.",
      });
    }
  }

  try {
    // Check if region already exists (for import)
    const existing = await Region.findOne({ regionCode: cleanCode });
    if (existing && operation === "import") {
      return res.status(409).json({
        success: false,
        message: `Region '${cleanCode}' already exists. Use operation 'refresh' to update.`,
      });
    }

    // Create import job with honest pending status — no fake completion.
    const job = await GraphImportJob.create({
      regionCode: cleanCode,
      operation,
      status: "pending",
      sourceUrl: sourceUrl || null,
      startedBy: req.userId,
    });

    return res.status(202).json({
      success: true,
      message: `Graph ${operation} for region '${cleanCode}' is pending. ` +
        "Run the import via CLI: " +
        `node server/data/ingest/downloadRegion.js ${cleanCode} && ` +
        `node server/data/ingest/importRegion.js ${cleanCode} <osmFile>`,
      job: {
        id: job._id,
        regionCode: cleanCode,
        operation,
        status: "pending",
        startedAt: job.startedAt,
      },
    });
  } catch (error) {
    console.error("Graph import error:", error.message);

    // Record failed job if possible
    try {
      if (error.code !== 11000) {
        await GraphImportJob.create({
          regionCode: cleanCode,
          operation,
          status: "failed",
          error: error.message,
          startedBy: req.userId,
        });
      }
    } catch (e) {
      // Ignore job creation errors
    }

    return res.status(500).json({
      success: false,
      message: "Graph import failed.",
    });
  }
}

/**
 * List all regions with their graph status.
 */
async function listGraphs(req, res) {
  try {
    const regions = await Region.find({}).lean().sort({ regionCode: 1 });
    const jobs = await GraphImportJob.find({})
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    return res.json({
      success: true,
      regions: regions.map((r) => ({
        regionCode: r.regionCode,
        name: r.name,
        bounds: r.bounds,
        version: r.version,
        nodeCount: r.nodeCount,
        edgeCount: r.edgeCount,
        isActive: r.isActive,
        filePath: r.filePath,
        generatedAt: r.generatedAt,
      })),
      recentJobs: jobs.map((j) => ({
        id: j._id,
        regionCode: j.regionCode,
        operation: j.operation,
        status: j.status,
        startedAt: j.startedAt,
        completedAt: j.completedAt,
        error: j.error,
      })),
      defaultRegion: regionRegistry.getDefaultRegionCode(),
    });
  } catch (error) {
    console.error("List graphs error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to list graphs.",
    });
  }
}

/**
 * Clear all in-memory graph caches.
 */
async function clearCacheHandler(req, res) {
  try {
    clearAllCaches();
    return res.json({
      success: true,
      message: "All graph caches cleared (route, walking route, walking coordinate).",
    });
  } catch (error) {
    console.error("Clear cache error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to clear caches.",
    });
  }
}

module.exports = {
  checkAdminAccess,
  importGraph,
  listGraphs,
  clearCache: clearCacheHandler,
};
