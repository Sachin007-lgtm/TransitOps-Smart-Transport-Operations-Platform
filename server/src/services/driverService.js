const Driver = require('../models/driverModel');
const { query, pool } = require('../config/db');
const User = require('../models/userModel');
const {
  generateTemporaryPassword,
  hashPassword
} = require('../utils/credentials');
const { normalizePhoneNumber } = require('../utils/phone');

class DriverServiceError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'DriverServiceError';
    this.statusCode = statusCode;
  }
}

function isDateExpired(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d < today;
}

const driverService = {
  /**
   * List drivers strictly scoped to user's organization with optional filters.
   * Passwords are NEVER included in list responses.
   */
  listDrivers: async (filters = {}, user) => {
    let { status, license_category, search } = filters;

    let drivers = await Driver.findAll({
      status,
      license_category,
      organization_id: user.organization_id
    });

    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      drivers = drivers.filter(d =>
        (d.name && d.name.toLowerCase().includes(q)) ||
        (d.license_number && d.license_number.toLowerCase().includes(q)) ||
        (d.contact_number && d.contact_number.toLowerCase().includes(q)) ||
        (d.status && d.status.toLowerCase().includes(q))
      );
    }

    return drivers;
  },

  /**
   * Get single driver by ID, strictly scoped to user's organization.
   * Passwords are NEVER included.
   */
  getDriverById: async (id, user) => {
    const driver = await Driver.findById(id, user.organization_id);
    if (!driver) {
      throw new DriverServiceError('Driver not found.', 404);
    }
    return driver;
  },

  /**
   * Create a new driver and linked user account within user's organization.
   * The temporary password is held in memory strictly for the minimum duration
   * needed to compute the bcrypt hash and format the immediate one-time response.
   */
  createDriver: async (data, user) => {
    const {
      name,
      license_number,
      license_category = 'LMV',
      license_expiry_date,
      contact_number,
      safety_score = 100,
      status = 'Available'
    } = data;

    // Check license uniqueness
    const existing = await Driver.findByLicense(license_number);
    if (existing) {
      throw new DriverServiceError('License number already exists.', 409);
    }

    // Server-side business rule: expired license cannot be Available or On Trip
    if (isDateExpired(license_expiry_date) && ['Available', 'On Trip'].includes(status)) {
      throw new DriverServiceError(
        'Cannot set status to Available or On Trip when license is expired.',
        400
      );
    }

    const phoneNumber = normalizePhoneNumber(contact_number);
    if (!phoneNumber) throw new DriverServiceError('A valid phone number is required for driver login.', 400);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const driver = await Driver.create({
        name: name.trim(),
        license_number: license_number.trim(),
        license_category,
        license_expiry_date,
        contact_number: phoneNumber,
        safety_score,
        status,
        organization_id: user.organization_id
      }, client);

      const temporaryPassword = generateTemporaryPassword();
      const passwordHash = await hashPassword(temporaryPassword);

      await User.createDriverAccount({
        name: name.trim(),
        phoneNumber,
        passwordHash,
        organizationId: user.organization_id,
        driverId: driver.id
      }, client);

      await client.query('COMMIT');
      const savedDriver = await Driver.findById(driver.id, user.organization_id);

      // Returned strictly once in immediate creation response
      return { ...savedDriver, temporary_password: temporaryPassword, must_change_password: true };
    } catch (error) {
      await client.query('ROLLBACK');
      if (error.code === '23505') throw new DriverServiceError('A driver account already exists for this phone number or license.', 409);
      throw error;
    } finally {
      client.release();
    }
  },

  /**
   * Reset driver password to a new temporary credential.
   * Returned strictly once in immediate response.
   */
  resetDriverPassword: async (id, user) => {
    const driver = await Driver.findById(id, user.organization_id);
    if (!driver) throw new DriverServiceError('Driver not found.', 404);

    const account = await User.findDriverAccount(id, user.organization_id);
    if (!account) throw new DriverServiceError('Driver login account not found.', 404);

    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);

    const updated = await User.resetTemporaryPassword(
      account.id,
      passwordHash
    );
    if (!updated) throw new DriverServiceError('Driver login account is inactive.', 400);

    return { driver_id: id, temporary_password: temporaryPassword, must_change_password: true };
  },

  /**
   * Update driver profile details, strictly scoped to user's organization.
   */
  updateDriver: async (id, data, user) => {
    const existing = await Driver.findById(id, user.organization_id);
    if (!existing) {
      throw new DriverServiceError('Driver not found.', 404);
    }

    if (data.license_number && data.license_number.trim() !== existing.license_number) {
      const duplicate = await Driver.findByLicense(data.license_number.trim(), id);
      if (duplicate) {
        throw new DriverServiceError('License number already in use.', 409);
      }
    }

    if (existing.status === 'On Trip' && data.status && data.status !== 'On Trip') {
      throw new DriverServiceError('Cannot manually change status while driver is currently On Trip.', 400);
    }

    const effectiveExpiry = data.license_expiry_date || existing.license_expiry_date;
    const effectiveStatus = data.status || existing.status;
    if (isDateExpired(effectiveExpiry) && ['Available', 'On Trip'].includes(effectiveStatus)) {
      throw new DriverServiceError(
        'Cannot set status to Available or On Trip when license is expired.',
        400
      );
    }

    const updatePayload = { ...data };
    if (updatePayload.name) updatePayload.name = updatePayload.name.trim();
    if (updatePayload.license_number) updatePayload.license_number = updatePayload.license_number.trim();
    if (updatePayload.contact_number) updatePayload.contact_number = updatePayload.contact_number.trim();

    await Driver.update(id, updatePayload, user.organization_id);
    return await Driver.findById(id, user.organization_id);
  },

  /**
   * Dedicated status update endpoint (PATCH /api/drivers/:id/status).
   * Transactionally synchronizes driver profile status and user account active status.
   */
  updateDriverStatus: async (id, status, user) => {
    const existing = await Driver.findById(id, user.organization_id);
    if (!existing) {
      throw new DriverServiceError('Driver not found.', 404);
    }

    const allowed = ['Available', 'On Trip', 'Off Duty', 'Suspended'];
    if (!allowed.includes(status)) {
      throw new DriverServiceError(`Status must be one of: ${allowed.join(', ')}`, 400);
    }

    if (existing.status === 'On Trip' && status !== 'On Trip') {
      throw new DriverServiceError('Cannot manually change status while driver is currently On Trip.', 400);
    }

    if (isDateExpired(existing.license_expiry_date) && ['Available', 'On Trip'].includes(status)) {
      throw new DriverServiceError(
        'Cannot set status to Available or On Trip when license is expired.',
        400
      );
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await Driver.setStatus(id, status, user.organization_id, client);

      if (status === 'Suspended') {
        // Immediately deactivate user login account
        await User.deactivateDriverAccount(id, user.organization_id, client);
      } else if (existing.status === 'Suspended' && status !== 'Suspended') {
        // Reactivate user login account when unsuspended
        await User.activateDriverAccount(id, user.organization_id, client);
      }

      await client.query('COMMIT');
      return await Driver.findById(id, user.organization_id);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  /**
   * Delete a driver, strictly scoped to user's organization.
   * Historical records cannot be deleted.
   */
  deleteDriver: async (id, user) => {
    const existing = await Driver.findById(id, user.organization_id);
    if (!existing) {
      throw new DriverServiceError('Driver not found.', 404);
    }

    if (existing.status === 'On Trip') {
      throw new DriverServiceError('Cannot delete a driver currently On Trip.', 400);
    }

    // Check if driver has active or historical trips
    const tripCheck = await query(
      `SELECT id, status FROM trips 
       WHERE driver_id = $1 AND organization_id = $2 LIMIT 1`,
      [id, user.organization_id]
    );
    if (tripCheck.rows.length > 0) {
      throw new DriverServiceError(
        `Cannot delete driver with existing trip history (Trip #${tripCheck.rows[0].id}). Deactivate or suspend the driver instead.`,
        400
      );
    }

    // Check if driver has telemetry history
    const locCheck = await query(
      `SELECT id FROM vehicle_locations WHERE driver_id = $1 AND organization_id = $2 LIMIT 1`,
      [id, user.organization_id]
    );
    if (locCheck.rows.length > 0) {
      throw new DriverServiceError(
        'Cannot delete driver with existing GPS telemetry history. Deactivate or suspend the driver instead.',
        400
      );
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Delete linked user account first to satisfy ON DELETE RESTRICT
      await client.query(
        'DELETE FROM users WHERE driver_id = $1 AND organization_id = $2',
        [id, user.organization_id]
      );
      const deleted = await Driver.delete(id, user.organization_id, client);
      await client.query('COMMIT');
      return deleted;
    } catch (err) {
      await client.query('ROLLBACK');
      if (['23503', '23001'].includes(err.code)) {
        throw new DriverServiceError('Cannot delete driver with existing operational history.', 400);
      }
      throw err;
    } finally {
      client.release();
    }
  }
};

module.exports = { driverService, DriverServiceError };
