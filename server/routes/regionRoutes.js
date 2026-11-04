const express = require("express");
const { regionController } = require("../controllers/regionController");

function createRegionRoutes(regionRegistry) {
  const { listRegions, getCoverage, getRegionByCode } =
    regionController(regionRegistry);

  const router = express.Router();

  router.get("/", listRegions);
  router.get("/coverage", getCoverage);
  router.get("/:regionCode", getRegionByCode);

  return router;
}

module.exports = { createRegionRoutes };