const express = require("express");
const { getLocations, findRoutes } = require("../controllers/routeController");

const router = express.Router();

router.get("/", getLocations);
router.post("/find", findRoutes);

module.exports = router;
