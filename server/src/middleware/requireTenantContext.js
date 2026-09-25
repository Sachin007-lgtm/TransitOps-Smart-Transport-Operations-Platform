/**
 * Tenant Context Enforcement Middleware.
 * Enforces that operational endpoints require valid tenant organization membership.
 * Platform Admins do not receive an automatic bypass and cannot access tenant operations directly.
 */
const requireTenantContext = (req, res, next) => {
  if (!req.user || !req.user.organization_id || typeof req.user.organization_id !== 'string') {
    return res.status(403).json({
      success: false,
      message: 'Forbidden: Tenant operational context required. Platform Administrators cannot directly access tenant operational routes.'
    });
  }
  next();
};

module.exports = requireTenantContext;
