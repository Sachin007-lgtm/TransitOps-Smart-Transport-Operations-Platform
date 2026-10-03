const express = require('express');
const cors = require('cors');
const { query } = require('./config/db');
const apiRouter = require('./routes');
const { authLimiter, apiLimiter } = require('./middleware/rateLimiter');

const app = express();

// CORS: an allowlist, not `*`. The API answers with Authorization headers
// carrying JWTs, so reflecting any origin would let any site read
// authenticated responses (the video checklist's "overly permissive CORS").
// The dev origins cover the Vite dev servers; set CORS_ORIGIN in production.
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173,http://localhost:5174,http://localhost:3000')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);
app.use(cors({
  origin(origin, callback) {
    // Allow non-browser tools (curl, mobile app, same-origin) with no Origin.
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(null, false);
  },
  credentials: false
}));

// Baseline security headers on every response (helmet's core set, without
// adding a dependency): nosniff, no framing, no referrer leak.
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

app.use(express.json({ limit: '1mb' }));

// Rate limits: strict on the credential endpoints, broad ceiling on the API.
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/password', authLimiter);
app.use('/api', apiLimiter);

app.use('/api', apiRouter);

// Healthcheck endpoint that validates Neon database connectivity
app.get('/api/health', async (req, res) => {
  try {
    const dbResult = await query('SELECT NOW()');
    res.status(200).json({
      status: 'healthy',
      database: 'connected',
      timestamp: dbResult.rows[0].now
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      database: 'error',
      error: error.message
    });
  }
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message
  });
});

module.exports = app;
