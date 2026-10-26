
const express = require("express");
const requireAuth = require("../middleware/authMiddleware");
const requireRole = require("../middleware/requireRole");
const {
  checkAdminAccess,
} = require("../controllers/adminController");

const router = express.Router();

router.get( "/check",
  requireAuth,
  requireRole("admin"),
  checkAdminAccess
);

module.exports = router;