/**
 * Role-Based Access Control Middleware.
 * Enforces verified role access. Maps legacy 'Fleet Manager' to 'Owner/Manager'
 * for backward compatibility during transition.
 *
 * Usage: authorize(['Owner/Manager', 'Driver'])
 */
const authorize = (...roles) => {
  const allowedRoles = roles.flat(Infinity);
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized: User authentication required.'
      });
    }

    const normalizedUserRole = req.user.role === 'Fleet Manager' ? 'Owner/Manager' : req.user.role;
    const effectiveAllowed = allowedRoles.map(r => r === 'Fleet Manager' ? 'Owner/Manager' : r);

    if (effectiveAllowed.length > 0 && !effectiveAllowed.includes(normalizedUserRole)) {
      return res.status(403).json({
        success: false,
        message: `Forbidden: Access restricted to [${effectiveAllowed.join(', ')}]. Your role is '${req.user.role}'.`
      });
    }

    next();
  };
};

module.exports = authorize;
