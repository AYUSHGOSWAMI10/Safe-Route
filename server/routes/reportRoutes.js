const express = require("express");
const requireAuth = require("../middleware/authMiddleware");

const {
  createReport,
  getMyReports,
} = require("../controllers/reportController");

const router = express.Router();

router.use(requireAuth);

router.post("/", createReport);
router.get("/", getMyReports);

module.exports = router;