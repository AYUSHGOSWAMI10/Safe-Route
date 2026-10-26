
const jwt = require("jsonwebtoken");
const User = require("../models/User");

async function requireAuth(req, res, next) {
  const authorization = req.headers.authorization;
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Authentication required.",
    });
  }

  if (!process.env.JWT_SECRET) {
    console.error("JWT_SECRET is not configured.");
    return res.status(500).json({
      success: false,
      message: "Server authentication is not configured.",
    });
  }

  let payload;

  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);

    if (typeof payload.sub !== "string") {
      throw new Error("Invalid token subject");
    }
  } catch {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token.",
    });
  }

  try {
    const user = await User.findById(payload.sub).select("_id role");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User account not found.",
      });
    }

    req.userId = user._id.toString();
    req.userRole = user.role;

    return next();
  } catch (error) {
    console.error("Authentication lookup failed:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to verify user access.",
    });
  }
}

module.exports = requireAuth;