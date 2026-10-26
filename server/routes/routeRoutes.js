const express = require("express");
const { getLocations, findRoutes } = require("../controllers/routeController");
const { findWalkingRoute } = require("../controllers/walkingRouteController");

const { findWalkingRouteByCoordinates } = require("../controllers/walkingCoordinateController");

const router = express.Router();

router.get("/", getLocations);
router.post("/find", findRoutes);
router.post("/walking", findWalkingRoute);
router.post("/walking/coordinates", findWalkingRouteByCoordinates);

module.exports = router;