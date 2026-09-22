const { pool } = require('../config/db');
const User = require('../models/userModel');
const { encryptTemporaryPassword, generateTemporaryPassword, hashPassword } = require('../utils/credentials');
const { normalizePhoneNumber } = require('../utils/phone');

async function backfillDriverAccounts() {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT d.id AS driver_id, d.name, d.contact_number, d.organization_id
      FROM drivers d
      LEFT JOIN users u ON u.driver_id = d.id
      WHERE u.id IS NULL
    `);

    let createdCount = 0;
    let skippedCount = 0;
    for (const driver of result.rows) {
      const phoneNumber = normalizePhoneNumber(driver.contact_number);
      if (!phoneNumber) {
        throw new Error(`Driver ${driver.driver_id} has an invalid phone number.`);
      }

      try {
        await client.query('BEGIN');
        const temporaryPassword = generateTemporaryPassword();
        await User.createDriverAccount({
          name: driver.name,
          phoneNumber,
          passwordHash: await hashPassword(temporaryPassword),
          temporaryPasswordEncrypted: encryptTemporaryPassword(temporaryPassword),
          organizationId: driver.organization_id,
          driverId: driver.driver_id
        }, client);
        await client.query('COMMIT');
        createdCount += 1;
        console.log(`Created driver account for ${driver.name} (${phoneNumber}).`);
      } catch (error) {
        await client.query('ROLLBACK');
        if (error.code === '23505') {
          skippedCount += 1;
          console.warn(`Skipped ${driver.name}: phone number or driver account already exists.`);
          continue;
        }
        throw error;
      }
    }
    console.log(`Backfilled ${createdCount} driver account(s); skipped ${skippedCount}.`);
  } catch (error) {
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

backfillDriverAccounts().catch((error) => {
  console.error('Driver account backfill failed:', error.message);
  process.exitCode = 1;
});