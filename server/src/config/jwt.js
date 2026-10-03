const dotenv = require('dotenv');
dotenv.config();

const secret = process.env.JWT_SECRET;
const isProduction = process.env.NODE_ENV === 'production' || process.env.TRANSITOPS_ENV === 'production';

// Vulnerable-JWT-secret guard: a missing or short secret is fatal in
// production, and so is relying on the well-known dev fallback below — a
// fallback constant ships in the source, so every attacker has it.
if (!secret || secret.trim().length < 16) {
  if (isProduction) {
    console.error('❌ FATAL CONFIGURATION ERROR: JWT_SECRET environment variable is missing or insufficiently secure for production.');
    process.exit(1);
  }
  console.warn('⚠️  JWT_SECRET not set — using the development fallback secret. NEVER run production on this.');
}

if (secret === 'transitops_secure_dev_jwt_secret_key_at_least_32_chars!' && isProduction) {
  console.error('❌ FATAL CONFIGURATION ERROR: JWT_SECRET is set to the well-known development fallback. Generate a real secret for production.');
  process.exit(1);
}

const JWT_SECRET = secret || 'transitops_secure_dev_jwt_secret_key_at_least_32_chars!';

module.exports = { JWT_SECRET };
