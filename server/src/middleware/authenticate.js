const jwt = require('jsonwebtoken');
const User = require('../models/userModel');
const apiResponse = require('../utils/apiResponse');

/**
 * authenticate
 * -----------
 * Verifies the JWT from the Authorization: Bearer <token> header.
 * On success, attaches the full user object (with role_name) to req.user.
 * On failure, returns 401 Unauthorized.
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return apiResponse.error(res, 'Access denied. No token provided.', 401);
    }

    const token = authHeader.split(' ')[1];

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return apiResponse.error(res, 'Token has expired. Please log in again.', 401);
      }
      return apiResponse.error(res, 'Invalid token.', 401);
    }

    // Fetch fresh user data (so revoked/deleted accounts are caught)
    const user = await User.findById(decoded.id);
    if (!user) {
      return apiResponse.error(res, 'User not found.', 401);
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
};

module.exports = authenticate;
