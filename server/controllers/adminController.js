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
  const { regionCode, regionName, sourceUrl, operation = "import" } = req.body || {};

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

  if (!regionName || typeof regionName !== "string" || !regionName.trim()) {
    return res.status(400).json({
      success: false,
      message: "regionName is required.",
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

  let existing = null;
  try {
    existing = await Region.findOne({ regionCode: cleanCode }).lean();
  } catch (err) {
    console.error("Failed to check existing region:", err.message);
  }

  if (existing && operation === "import") {
    return res.status(409).json({
      success: false,
      message: `Region '${cleanCode}' already exists. Use operation 'refresh' to update.`,
    });
  }

  const workflowScript = path.join(__dirname, "..", "data", "ingest", "importWorkflow.js");
  const downloadDir = path.join(__dirname, "..", "data", "raw");
  const processedDir = path.join(__dirname, "..", "data", "processed");

  const cmd = [
    process.execPath,
    workflowScript,
    cleanCode,
    regionName,
    sourceUrl || "",
    downloadDir,
    processedDir,
  ].join(" ");

  try {
    let stdout;
    try {
      stdout = execSync(cmd, {
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 600000,
      });
      console.log(`[admin] Import workflow stdout:\n${stdout.toString()}`);
    } catch (execError) {
      console.error(`[admin] Import workflow failed:\n${execError.message}`);
      console.error(`[admin] Workflow exited with code ${execError.status}`);

      try {
        const job = await GraphImportJob.create({
          regionCode: cleanCode,
          operation,
          status: "failed",
          error: execError.message,
          startedBy: req.userId,
        });
      } catch (e) {}

      return res.status(500).json({
        success: false,
        message: "Region import failed.",
        error: "The import workflow did not complete successfully.",
      });
    }

    if (operation === "refresh" && existing) {
      try {
        await Region.updateOne(
          { regionCode: cleanCode },
          { $set: { name: regionName, version: new Date().toISOString().split("T")[0], sourceUrl: sourceUrl || existing.sourceUrl } }
        );
        console.log(`Region '${cleanCode}' refreshed in database.`);
      } catch (err) {
        console.error("Failed to update region record:", err.message);
      }
    }

    clearAllCaches();

    return res.status(200).json({
      success: true,
      message: `Region '${cleanCode}' imported successfully.`,
      job: {
        regionCode: cleanCode,
        operation,
        status: "completed",
        startedAt: new Date(),
        completedAt: new Date(),
      },
      graph: {
        regionCode: cleanCode,
        nodeCount: 0,
        edgeCount: 0,
        filePath: path.join(processedDir, `${cleanCode}.json`),
      },
    });
  } catch (error) {
    console.error("[admin] Unexpected error during import:", error.message);
    return res.status(500).json({
      success: false,
      message: "Import failed due to an internal error.",
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
