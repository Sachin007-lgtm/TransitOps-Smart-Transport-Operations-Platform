const express = require('express');
const router = express.Router();
const { login, getMe } = require('../controllers/authController');
const { validateLogin } = require('../validators/authValidator');
const authenticate = require('../middleware/authenticate');

// POST /api/auth/login  — public
router.post('/login', validateLogin, login);

// GET  /api/auth/me     — protected (any authenticated user)
router.get('/me', authenticate, getMe);

module.exports = router;
