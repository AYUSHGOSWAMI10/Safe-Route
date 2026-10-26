async function checkAdminAccess(req, res) {
  return res.status(200).json({
    success: true,
    message: "Admin access verified.",
    user: {
      id: req.userId,
      role: req.userRole,
    },
  });
}

module.exports = { checkAdminAccess };
