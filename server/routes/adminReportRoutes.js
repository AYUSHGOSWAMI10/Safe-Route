const express = require("express");
const requireAuth = require("../middleware/authMiddleware");
const requireRole = require("../middleware/requireRole");

const {
  getAllReports,
  moderateReport,
} = require("../controllers/reportController");

const router = express.Router();

router.use(requireAuth, requireRole("admin"));

router.get("/", getAllReports);
router.patch("/:id", moderateReport);

module.exports = router;