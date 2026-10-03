const rateLimit = require('express-rate-limit');

// Rate limiting: the API's only DoS/brute-force defence. Two limiters —
//
//  - authLimiter: strict on the credential endpoints (login / password
//    change), where an attacker brute-forces passwords. The window/count is
//    sized above the test suite's 9 login POSTs so `npm test` never trips it.
//  - apiLimiter: a broad ceiling on every /api request, high enough that no
//    real dashboard session (polling every 6-15s) ever approaches it.
//
// Both are keyed per IP (req.ip), the standard for a stateless JWT API —
// there are no sessions to key on.
const isProduction = process.env.NODE_ENV === 'production' || process.env.TRANSITOPS_ENV === 'production';

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 50,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Too many authentication attempts. Try again in 15 minutes.' }
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: isProduction ? 300 : 3000,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Slow down and retry in a minute.' }
});

module.exports = { authLimiter, apiLimiter };
