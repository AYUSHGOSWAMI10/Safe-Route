const express = require("express");
const {
  signup,
  login,
  me,
  demoLogin,
} = require("../controllers/authController");
const requireAuth = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/signup", signup);
router.post("/login", login);
router.get("/me", requireAuth, me);
router.post("/demo-login", demoLogin);

module.exports = router;
