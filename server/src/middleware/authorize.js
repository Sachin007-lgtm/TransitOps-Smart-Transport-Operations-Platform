/**
 * Role-Based Access Control Middleware.
 * Usage: authorize(['Fleet Manager', 'Dispatcher'])
 */
const authorize = (allowedRoles = []) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized: User authentication required.'
      });
    }

    if (allowedRoles.length > 0 && !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Forbidden: Access restricted to [${allowedRoles.join(', ')}]. Your role is '${req.user.role}'.`
      });
    }

    next();
  };
};

module.exports = authorize;
