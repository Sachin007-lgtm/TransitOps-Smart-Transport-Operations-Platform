// Dev/test launcher: runs the API server against DATABASE_URL (env or .env).
// Falls back to the local Docker test DB when nothing is configured.
// Not part of the app — convenience for local testing only.
require('dotenv').config();

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://transitops:test123@localhost:55432/transitops';
  console.log('NOTE: DATABASE_URL not set — using local Docker test default.');
}
process.env.PORT = process.env.PORT || '5001';

const app = require('./src/app');
app.listen(process.env.PORT, () => {
  console.log(`Test server on port ${process.env.PORT}`);
});
