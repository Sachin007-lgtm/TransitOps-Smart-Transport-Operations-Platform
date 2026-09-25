const dotenv = require('dotenv');
dotenv.config();

const secret = process.env.JWT_SECRET;

if (!secret || secret.trim().length < 16) {
  if (process.env.NODE_ENV === 'production' || process.env.TRANSITOPS_ENV === 'production') {
    console.error('❌ FATAL CONFIGURATION ERROR: JWT_SECRET environment variable is missing or insufficiently secure for production.');
    process.exit(1);
  }
}

const JWT_SECRET = secret || 'transitops_secure_dev_jwt_secret_key_at_least_32_chars!';

module.exports = { JWT_SECRET };
