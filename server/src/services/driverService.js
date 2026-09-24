const Driver = require('../models/driverModel');
const { query, pool } = require('../config/db');
const User = require('../models/userModel');
const { encryptTemporaryPassword, generateTemporaryPassword, hashPassword, decryptTemporaryPassword } = require('../utils/credentials');
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

function addManagerCredential(driver, user) {
  if (!user || !user.temporary_password_encrypted) return driver;
  try {
    return {
      ...driver,
      temporary_password: decryptTemporaryPassword(user.temporary_password_encrypted),
      must_change_password: user.must_change_password
    };
  } catch (error) {
    console.warn(`Unable to decrypt temporary password for driver ${driver.id}: ${error.message}`);
    return {
      ...driver,
      temporary_password_unavailable: true,
      must_change_password: user.must_change_password
    };
  }
}

function canViewTemporaryPassword(user) {
  return ['Fleet Manager', 'Dispatcher'].includes(user.role);
}

const driverService = {
  /**
   * List drivers strictly scoped to user's organization with optional filters.
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

    return drivers.map((driver) => (
      canViewTemporaryPassword(user) ? addManagerCredential(driver, driver) : driver
    ));
  },

  /**
   * Get single driver by ID, strictly scoped to user's organization.
   */
  getDriverById: async (id, user) => {
    const driver = await Driver.findById(id, user.organization_id);
    if (!driver) {
      throw new DriverServiceError('Driver not found.', 404);
    }
    return canViewTemporaryPassword(user) ? addManagerCredential(driver, driver) : driver;
  },

  /**
   * Create a new driver within user's organization.
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
      await User.createDriverAccount({
        name: name.trim(),
        phoneNumber,
        passwordHash: await hashPassword(temporaryPassword),
        temporaryPasswordEncrypted: encryptTemporaryPassword(temporaryPassword),
        organizationId: user.organization_id,
        driverId: driver.id
      }, client);
      await client.query('COMMIT');
      const savedDriver = await Driver.findById(driver.id, user.organization_id);
      return { ...savedDriver, temporary_password: temporaryPassword, must_change_password: true };
    } catch (error) {
      await client.query('ROLLBACK');
      if (error.code === '23505') throw new DriverServiceError('A driver account already exists for this phone number or license.', 409);
      throw error;
    } finally {
      client.release();
    }
  },

  resetDriverPassword: async (id, user) => {
    const driver = await Driver.findById(id, user.organization_id);
    if (!driver) throw new DriverServiceError('Driver not found.', 404);

    const account = await User.findDriverAccount(id, user.organization_id);
    if (!account) throw new DriverServiceError('Driver login account not found.', 404);

    const temporaryPassword = generateTemporaryPassword();
    const updated = await User.resetTemporaryPassword(
      account.id,
      await hashPassword(temporaryPassword),
      encryptTemporaryPassword(temporaryPassword)
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

    // Check license uniqueness if license_number is provided
    if (data.license_number && data.license_number.trim() !== existing.license_number) {
      const duplicate = await Driver.findByLicense(data.license_number.trim(), id);
      if (duplicate) {
        throw new DriverServiceError('License number already in use.', 409);
      }
    }

    // If driver is currently on trip, prevent manual status changes
    if (existing.status === 'On Trip' && data.status && data.status !== 'On Trip') {
      throw new DriverServiceError('Cannot manually change status while driver is currently On Trip.', 400);
    }

    // Check expired license rules
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
    const updatedDriver = await Driver.findById(id, user.organization_id);
    const account = await User.findDriverAccount(id, user.organization_id);
    return canViewTemporaryPassword(user) ? addManagerCredential(updatedDriver, account) : updatedDriver;
  },

  /**
   * Dedicated status update endpoint (PATCH /api/drivers/:id/status).
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

    // If driver is currently On Trip, reject manual status override
    if (existing.status === 'On Trip' && status !== 'On Trip') {
      throw new DriverServiceError('Cannot manually change status while driver is currently On Trip.', 400);
    }

    // Expired license check
    if (isDateExpired(existing.license_expiry_date) && ['Available', 'On Trip'].includes(status)) {
      throw new DriverServiceError(
        'Cannot set status to Available or On Trip when license is expired.',
        400
      );
    }

    await Driver.setStatus(id, status, user.organization_id);
    return await Driver.findById(id, user.organization_id);
  },

  /**
   * Delete a driver, strictly scoped to user's organization.
   */
  deleteDriver: async (id, user) => {
    const existing = await Driver.findById(id, user.organization_id);
    if (!existing) {
      throw new DriverServiceError('Driver not found.', 404);
    }

    if (existing.status === 'On Trip') {
      throw new DriverServiceError('Cannot delete a driver currently On Trip.', 400);
    }

    // Check if driver is reserved on any active trips
    const activeTrips = await query(
      `SELECT id FROM trips 
       WHERE driver_id = $1 AND organization_id = $2 AND status IN ('Assigned', 'Dispatched')`,
      [id, user.organization_id]
    );
    if (activeTrips.rows.length > 0) {
      throw new DriverServiceError(
        `Cannot delete driver assigned to active Trip #${activeTrips.rows[0].id}.`,
        400
      );
    }

    try {
      return await Driver.delete(id, user.organization_id);
    } catch (err) {
      if (['23503', '23001'].includes(err.code)) {
        throw new DriverServiceError('Cannot delete driver with existing trip history.', 400);
      }
      throw err;
    }
  }
};

module.exports = { driverService, DriverServiceError };
