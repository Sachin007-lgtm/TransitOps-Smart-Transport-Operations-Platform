const jwt = require('jsonwebtoken');

/**
 * Production JWT Authentication Middleware.
 * Enforces valid Bearer JWT on protected endpoints.
 */
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Authentication token is required.'
    });
  }

  const token = authHeader.split(' ')[1];
  const secret = process.env.JWT_SECRET || 'your_jwt_secret_key_here';

  try {
    const decoded = jwt.verify(token, secret);

    if (!decoded || !decoded.organization_id) {
      return res.status(401).json({
        success: false,
        message: 'Invalid authentication token: missing tenant context.'
      });
    }

    req.user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
      role_id: decoded.role_id,
      driver_id: decoded.driver_id || null,
      organization_id: decoded.organization_id
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
