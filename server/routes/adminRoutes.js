const express = require("express");
const requireAuth = require("../middleware/authMiddleware");
const requireRole = require("../middleware/requireRole");
const {
  checkAdminAccess,
  importGraph,
  listGraphs,
  clearCache,
} = require("../controllers/adminController");

const router = express.Router();

router.get(
  "/check",
  requireAuth,
  requireRole("admin"),
  checkAdminAccess
);

router.post(
  "/graphs/import",
  requireAuth,
  requireRole("admin"),
  importGraph
);

router.get(
  "/graphs",
  requireAuth,
  requireRole("admin"),
  listGraphs
);

router.post(
  "/graphs/clear-cache",
  requireAuth,
  requireRole("admin"),
  clearCache
);

module.exports = router;