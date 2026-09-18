const express = require('express');
const cors = require('cors');
const { query } = require('./config/db');
const apiRouter = require('./routes');

const app = express();

app.use(cors());
app.use(express.json());

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
  // Business-logic errors can carry a statusCode (400/404/409); default 500.
  const status = err.statusCode || 500;
  if (status >= 500) console.error(err.stack);
  res.status(status).json({
    error: status >= 500 ? 'Internal Server Error' : 'Request failed',
    message: err.message
  });
});

module.exports = app;
