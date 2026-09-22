const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const { login, me, changePassword } = require('../controllers/authController');

router.post('/login', login);
router.get('/me', authenticate, me);
router.patch('/password', authenticate, changePassword);

module.exports = router;
