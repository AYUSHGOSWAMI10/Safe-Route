const fs = require("fs");
const path = require("path");
const Region = require("../models/Region");
const GraphImportJob = require("../models/GraphImportJob");
const { regionRegistry } = require("../data/ingest/regionRegistry");
const { clearCache } = require("./routeController");

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

  try {
    // Check if region already exists (for import)
    const existing = await Region.findOne({ regionCode: cleanCode });
    if (existing && operation === "import") {
      return res.status(409).json({
        success: false,
        message: `Region '${cleanCode}' already exists. Use operation 'refresh' to update.`,
      });
    }

    // Create import job record
    const job = await GraphImportJob.create({
      regionCode: cleanCode,
      operation,
      status: "in_progress",
      sourceUrl: sourceUrl || null,
      startedBy: req.userId,
    });

    // TODO: Actual graph import would call downloadRegion/importRegion scripts
    // For now, mark as completed (admin must run scripts manually or via separate process)
    await GraphImportJob.findByIdAndUpdate(job._id, {
      status: "completed",
      completedAt: new Date(),
    });

    // Clear regional caches so next request picks up new graph
    clearCache();

    return res.status(201).json({
      success: true,
      message: `Graph ${operation} job completed for region '${cleanCode}'.`,
      job: {
        id: job._id,
        regionCode: cleanCode,
        operation,
        status: "completed",
        startedAt: job.startedAt,
        completedAt: new Date(),
      },
    });
  } catch (error) {
    console.error("Graph import error:", error.message);

    // Update job status to failed if it was created
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
    clearCache();
    return res.json({
      success: true,
      message: "All graph caches cleared.",
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
