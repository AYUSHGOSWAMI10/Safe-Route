const express = require("express");
const { getLocations, findRoutes } = require("../controllers/routeController");
const { findWalkingRoute } = require("../controllers/walkingRouteController");

const router = express.Router();

router.get("/", getLocations);
router.post("/find", findRoutes);
router.post("/walking", findWalkingRoute);

module.exports = router;
