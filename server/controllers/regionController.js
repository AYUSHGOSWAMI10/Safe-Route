const Region = require("../models/Region");

/**
 * Region controller for multi-region walking graph support.
 * Provides region listing and coverage detection.
 */
function regionController(regionRegistry) {
  async function listRegions(req, res) {
    try {
      const regions = regionRegistry.list();
      return res.json({
        success: true,
        regions,
        defaultRegion: regionRegistry.getDefaultRegionCode(),
      });
    } catch (error) {
      console.error("List regions error:", error.message);
      return res.status(500).json({
        success: false,
        message: "Unable to list regions.",
      });
    }
  }

  async function getCoverage(req, res) {
    const { lat, lng } = req.query;

    if (
      typeof lat !== "string" ||
      typeof lng !== "string" ||
      !lat.trim() ||
      !lng.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "lat and lng query parameters are required.",
      });
    }

    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);

    if (
      !Number.isFinite(latNum) ||
      !Number.isFinite(lngNum) ||
      latNum < -90 ||
      latNum > 90 ||
      lngNum < -180 ||
      lngNum > 180
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid latitude or longitude.",
      });
    }

    try {
      const region = regionRegistry.findRegionByCoords(latNum, lngNum);

      if (!region) {
        return res.json({
          success: true,
          supported: false,
          region: null,
          message: "Coordinates are outside any supported walking region.",
        });
      }

      return res.json({
        success: true,
        supported: true,
        region: {
          regionCode: region.regionCode,
          name: region.name,
          bounds: region.bounds,
          version: region.version,
          nodeCount: region.nodeCount,
          edgeCount: region.edgeCount,
        },
        message: "Coordinates are within a supported walking region.",
      });
    } catch (error) {
      console.error("Coverage check error:", error.message);
      return res.status(500).json({
        success: false,
        message: "Unable to check coverage.",
      });
    }
  }

  async function getRegionByCode(req, res) {
    const { regionCode } = req.params;

    if (!regionCode) {
      return res.status(400).json({
        success: false,
        message: "regionCode is required.",
      });
    }

    try {
      const region = await Region.findOne({
        regionCode: regionCode.toLowerCase(),
        isActive: true,
      }).lean();

      if (!region) {
        return res.status(404).json({
          success: false,
          message: "Region not found.",
        });
      }

      return res.json({
        success: true,
        region: {
          regionCode: region.regionCode,
          name: region.name,
          bounds: region.bounds,
          version: region.version,
          sourceUrl: region.sourceUrl,
          generatedAt: region.generatedAt,
          nodeCount: region.nodeCount,
          edgeCount: region.edgeCount,
          isActive: region.isActive,
        },
      });
    } catch (error) {
      console.error("Get region error:", error.message);
      return res.status(500).json({
        success: false,
        message: "Unable to load region.",
      });
    }
  }

  return {
    listRegions,
    getCoverage,
    getRegionByCode,
  };
}

module.exports = { regionController };