const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/userModel');
const asyncWrapper = require('../utils/asyncWrapper');
const apiResponse = require('../utils/apiResponse');

/**
 * POST /api/auth/login
 * Body: { email, password }
 */
const login = asyncWrapper(async (req, res) => {
  const { email, password } = req.body;

  // 1. Find user
  const user = await User.findByEmail(email);
  if (!user) {
    return apiResponse.error(res, 'Invalid email or password.', 401);
  }

  // 2. Compare password
  const isMatch = await bcrypt.compare(password, user.password_hash);
  if (!isMatch) {
    return apiResponse.error(res, 'Invalid email or password.', 401);
  }

  // 3. Sign JWT – payload carries user id and role
  const token = jwt.sign(
    { id: user.id, role: user.role_name },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );

  // 4. Return token + safe user object (no password hash)
  return apiResponse.success(res, {
    token,
    user: {
      id:      user.id,
      name:    user.name,
      email:   user.email,
      role:    user.role_name,
      role_id: user.role_id
    }
  }, 'Login successful.');
});

/**
 * GET /api/auth/me
 * Returns the currently authenticated user (requires authenticate middleware).
 */
const getMe = asyncWrapper(async (req, res) => {
  const { id, name, email, role_name, role_id } = req.user;
  return apiResponse.success(res, { id, name, email, role: role_name, role_id }, 'User profile fetched.');
});

module.exports = { login, getMe };
