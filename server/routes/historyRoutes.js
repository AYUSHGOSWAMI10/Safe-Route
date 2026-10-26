const express = require("express");
const requireAuth = require("../middleware/authMiddleware");
const {
  createHistory,
  getHistory,
  getHistoryById,
} = require("../controllers/historyController");

const router = express.Router();

router.use(requireAuth);

router.post("/", createHistory);
router.get("/", getHistory);
router.get("/:id", getHistoryById);

module.exports = router;
