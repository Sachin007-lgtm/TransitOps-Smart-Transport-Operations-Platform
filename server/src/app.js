const express = require('express');
const cors = require('cors');
const { query } = require('./config/db');
const apiRouter = require('./routes');
const { authLimiter, apiLimiter } = require('./middleware/rateLimiter');

const app = express();

// CORS: an allowlist covering configured origins, Vercel deployments, and dev servers.
const isProduction = process.env.NODE_ENV === 'production' || process.env.TRANSITOPS_ENV === 'production';

// Support CLIENT_URL, CORS_ORIGIN, and default local dev servers
const configuredOrigins = [
  process.env.CLIENT_URL,
  process.env.CORS_ORIGIN,
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:3000',
  'http://localhost:8081',
  'http://localhost:19006',
  'http://127.0.0.1:8081'
]
  .filter(Boolean)
  .join(',');

const allowedOrigins = configuredOrigins
  .split(',')
  .map(o => o.trim().replace(/\/+$/, ''))
  .filter(Boolean);

const isAllowedOrigin = (origin) => {
  // Allow non-browser tools (curl, mobile app, health checks, same-origin) with no Origin header
  if (!origin) return true;

  const cleanOrigin = origin.trim().replace(/\/+$/, '');

  // Exact match from allowed origins
  if (allowedOrigins.includes(cleanOrigin)) return true;

  try {
    const url = new URL(cleanOrigin);
    const host = url.hostname;

    // Automatically allow any Vercel deployment (preview branches and production)
    if (host.endsWith('.vercel.app')) return true;

    // Allow local development servers
    if (host === 'localhost' || host === '127.0.0.1' || host.startsWith('10.') || host.startsWith('192.168.') || host.startsWith('172.')) {
      return true;
    }
  } catch {
    return false;
  }

  return false;
};

app.use(cors({
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) {
      return callback(null, true);
    }
    return callback(null, false);
  },
  credentials: true
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
