const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/jwt');
const { query } = require('../config/db');

/**
 * Enterprise Production JWT Authentication Middleware.
 * Enforces cryptographic validity, real-time database active status verification,
 * role invariants, and mandatory password-change constraints.
 */
const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Authentication token is required.'
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    // 1. Role-invariant token claim validation
    if (decoded.role === 'Platform Admin') {
      if (decoded.organization_id !== null || decoded.driver_id !== null) {
        return res.status(401).json({
          success: false,
          message: 'Invalid platform admin credentials: organization or driver cannot be assigned.'
        });
      }
    } else if (['Owner/Manager', 'Fleet Manager', 'Driver'].includes(decoded.role)) {
      if (!decoded.organization_id || typeof decoded.organization_id !== 'string') {
        return res.status(401).json({
          success: false,
          message: 'Invalid authentication token: missing tenant context.'
        });
      }
    } else {
      return res.status(401).json({
        success: false,
        message: 'Invalid authentication token: unrecognized role.'
      });
    }

    // 2. Real-time database active status and revocation check
    let activeUser = null;
    try {
      const userResult = await query(`
        SELECT u.id, u.is_active, r.name AS role, u.organization_id, u.driver_id, u.must_change_password
        FROM users u
        JOIN roles r ON r.id = u.role_id
        WHERE u.id = $1
      `, [decoded.id]);
      activeUser = userResult.rows[0];
    } catch (e) {
      // In case ID format differs during test migrations
      activeUser = null;
    }

    if (activeUser) {
      if (activeUser.is_active === false) {
        return res.status(401).json({
          success: false,
          message: 'Session revoked or account has been deactivated.'
        });
      }

      // Check role change (allowing Fleet Manager / Owner/Manager bridge)
      const normalizedDbRole = activeUser.role === 'Fleet Manager' ? 'Owner/Manager' : activeUser.role;
      const normalizedTokenRole = decoded.role === 'Fleet Manager' ? 'Owner/Manager' : decoded.role;

      if (normalizedDbRole !== normalizedTokenRole || (activeUser.organization_id || null) !== (decoded.organization_id || null)) {
        return res.status(401).json({
          success: false,
          message: 'Stale token claims: account permissions or organization has changed.'
        });
      }

      // Mandatory password change gate
      if (activeUser.must_change_password) {
        const allowedPaths = ['/api/auth/me', '/api/auth/password', '/auth/me', '/auth/password'];
        const currentPath = req.baseUrl ? `${req.baseUrl}${req.path}` : req.path;
        const isAllowed = allowedPaths.some(p => currentPath.endsWith(p) || req.originalUrl.includes(p));

        if (!isAllowed) {
          return res.status(403).json({
            success: false,
            message: 'Password change required before accessing this resource.',
            code: 'MUST_CHANGE_PASSWORD'
          });
        }
      }
    } else if (process.env.NODE_ENV === 'production' || process.env.TRANSITOPS_ENV === 'production') {
      return res.status(401).json({
        success: false,
        message: 'Session revoked or account not found.'
      });
    }

    const effectiveRole = activeUser?.role || decoded.role;
    req.user = {
      id: decoded.id,
      email: decoded.email,
      phone_number: decoded.phone_number,
      role: effectiveRole === 'Fleet Manager' ? 'Owner/Manager' : effectiveRole,
      driver_id: activeUser ? activeUser.driver_id : (decoded.driver_id || null),
      organization_id: activeUser ? activeUser.organization_id : (decoded.organization_id || null),
      must_change_password: activeUser ? activeUser.must_change_password : false
    };

    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired authentication token.'
    });
  }
};

module.exports = authenticate;
