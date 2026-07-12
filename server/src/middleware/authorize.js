const apiResponse = require('../utils/apiResponse');

/**
 * authorize(...allowedRoles)
 * --------------------------
 * Factory that returns a middleware restricting access to the given role names.
 * Must be used AFTER the `authenticate` middleware (which sets req.user).
 *
 * Usage:
 *   router.get('/vehicles', authenticate, authorize('Fleet Manager', 'Driver'), getAll)
 *
 * Pass no arguments to allow any authenticated user:
 *   router.get('/profile', authenticate, authorize(), getProfile)
 */
const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return apiResponse.error(res, 'Unauthorized. Please log in.', 401);
    }

    // If no roles are specified, allow any authenticated user
    if (allowedRoles.length === 0) {
      return next();
    }

    const userRole = req.user.role_name;

    if (!allowedRoles.includes(userRole)) {
      return apiResponse.error(
        res,
        `Access denied. Required role(s): ${allowedRoles.join(', ')}. Your role: ${userRole}.`,
        403
      );
    }

    next();
  };
};

module.exports = authorize;
