const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const { login, me, changePassword, updateProfile } = require('../controllers/authController');

router.post('/login', login);
router.get('/me', authenticate, me);
router.patch('/password', authenticate, changePassword);
router.patch('/profile', authenticate, updateProfile);
router.put('/profile', authenticate, updateProfile);

module.exports = router;
