
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.userId || !req.userRole) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    if (!allowedRoles.includes(req.userRole)) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission.",
      });
    }

    return next();
  };
}

module.exports = requireRole;