const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('Error: DATABASE_URL environment variable is not defined.');
  process.exit(1);
}

const isLocal = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');

const pool = new Pool({
  connectionString: connectionString,
  // Neon requires SSL. For local dev, disable SSL unless explicitly needed.
  ssl: isLocal ? false : { rejectUnauthorized: false }
});

pool.on('connect', () => {
  console.log('Database pool connected successfully');
});

pool.on('error', (err) => {
  console.error('Unexpected database client error:', err);
  process.exit(-1);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
};
