/**
 * Platform Admin Authorization Middleware.
 * Strictly verifies that the authenticated user has the Platform Admin role
 * and is not assigned to any tenant organization.
 */
const requirePlatformAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'Platform Admin' || req.user.organization_id !== null) {
    return res.status(403).json({
      success: false,
      message: 'Forbidden: Access restricted to Platform Administrators.'
    });
  }
  next();
};

module.exports = requirePlatformAdmin;
