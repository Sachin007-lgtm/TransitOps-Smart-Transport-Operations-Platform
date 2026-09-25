const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const credentials = require('../src/utils/credentials');
const User = require('../src/models/userModel');
const Driver = require('../src/models/driverModel');

describe('Secure Credential Architecture Verification', () => {

  // 1. AES Encryption Removal
  describe('AES Encryption Removal & Clean Utility', () => {
    test('Credentials utility must not export AES encryption or decryption functions', () => {
      assert.equal(credentials.encryptTemporaryPassword, undefined, 'encryptTemporaryPassword must be removed');
      assert.equal(credentials.decryptTemporaryPassword, undefined, 'decryptTemporaryPassword must be removed');
      assert.equal(credentials.CREDENTIAL_ENCRYPTION_KEY, undefined, 'CREDENTIAL_ENCRYPTION_KEY must not be exposed');
    });

    test('Credentials utility only exports bcrypt hashing and generation utilities', () => {
      assert.equal(typeof credentials.hashPassword, 'function');
      assert.equal(typeof credentials.comparePassword, 'function');
      assert.equal(typeof credentials.generateTemporaryPassword, 'function');
    });

    test('Temporary passwords generated in memory are strong and verified by bcrypt', async () => {
      const tempPass = credentials.generateTemporaryPassword();
      assert.ok(typeof tempPass === 'string' && tempPass.length >= 10);
      
      const hash = await credentials.hashPassword(tempPass);
      assert.ok(hash.startsWith('$2a$') || hash.startsWith('$2b$'));

      const matches = await credentials.comparePassword(tempPass, hash);
      assert.equal(matches, true);

      const wrongMatches = await credentials.comparePassword('IncorrectPass!', hash);
      assert.equal(wrongMatches, false);
    });
  });

  // 2. Database Schema Cleanliness
  describe('Database Schema Invariants', () => {
    test('001_initial_transitops_schema.sql does not contain temporary_password_encrypted', () => {
      const schemaPath = path.join(__dirname, '../src/database/migrations/001_initial_transitops_schema.sql');
      const schemaSql = fs.readFileSync(schemaPath, 'utf8');
      assert.equal(
        schemaSql.includes('temporary_password_encrypted'),
        false,
        'Database migration schema must not contain temporary_password_encrypted column'
      );
    });

    test('Users table only stores password_hash and must_change_password', () => {
      const schemaPath = path.join(__dirname, '../src/database/migrations/001_initial_transitops_schema.sql');
      const schemaSql = fs.readFileSync(schemaPath, 'utf8');
      assert.ok(schemaSql.includes('password_hash VARCHAR(255) NOT NULL'));
      assert.ok(schemaSql.includes('must_change_password BOOLEAN NOT NULL DEFAULT FALSE'));
    });
  });

  // 3. Backend Model Queries & Projection Security
  describe('Backend Model Security Boundaries', () => {
    test('Driver model queries do not reference temporary_password_encrypted', () => {
      const modelPath = path.join(__dirname, '../src/models/driverModel.js');
      const code = fs.readFileSync(modelPath, 'utf8');
      assert.equal(
        code.includes('temporary_password_encrypted'),
        false,
        'driverModel.js must not query or project temporary_password_encrypted'
      );
      assert.equal(
        code.includes('temporary_password'),
        false,
        'driverModel.js must not contain password projections'
      );
    });

    test('User model queries do not insert or update temporary_password_encrypted', () => {
      const userModelPath = path.join(__dirname, '../src/models/userModel.js');
      const code = fs.readFileSync(userModelPath, 'utf8');
      assert.equal(
        code.includes('temporary_password_encrypted'),
        false,
        'userModel.js must not use temporary_password_encrypted'
      );
    });
  });

  // 4. Driver Service Contract Verification
  describe('Driver Service Credential Contract', () => {
    test('Driver creation returns temporary_password strictly in the one-time response', async () => {
      // Mock Driver model and User model
      const originalCreate = Driver.create;
      const originalFindByLicense = Driver.findByLicense;
      const originalFindById = Driver.findById;
      const originalCreateDriverAccount = User.createDriverAccount;
      const { pool } = require('../src/config/db');
      const originalConnect = pool.connect;

      let capturedCreatedAccount = null;

      try {
        Driver.findByLicense = async () => null;
        pool.connect = async () => ({
          query: async () => ({ rows: [] }),
          release: () => {}
        });
        Driver.create = async (data) => ({
          id: 'drv-test-uuid-1',
          name: data.name,
          license_number: data.license_number,
          contact_number: data.contact_number,
          organization_id: data.organization_id,
          status: 'Available'
        });
        User.createDriverAccount = async (params) => {
          capturedCreatedAccount = params;
          return { id: 'usr-test-uuid-1', ...params };
        };
        Driver.findById = async (id, orgId) => ({
          id,
          name: 'Rajesh Pilot',
          license_number: 'DL-9999-TEST',
          contact_number: '+919876543210',
          organization_id: orgId,
          status: 'Available',
          must_change_password: true
        });

        const { driverService } = require('../src/services/driverService');
        const result = await driverService.createDriver({
          name: 'Rajesh Pilot',
          license_number: 'DL-9999-TEST',
          license_category: 'LMV',
          license_expiry_date: '2029-01-01',
          contact_number: '+919876543210',
          status: 'Available'
        }, { organization_id: 'org-test-uuid' });

        // Verify response payload contains one-time temporary_password
        assert.ok(result.temporary_password, 'One-time response must include temporary_password');
        assert.equal(result.must_change_password, true);

        // Verify account creation only stored the bcrypt hash in the database, NOT the plaintext or encrypted password
        assert.ok(capturedCreatedAccount.passwordHash, 'Account must store passwordHash');
        assert.ok(capturedCreatedAccount.passwordHash.startsWith('$2a$') || capturedCreatedAccount.passwordHash.startsWith('$2b$'));
        assert.equal(capturedCreatedAccount.temporary_password, undefined);
        assert.equal(capturedCreatedAccount.temporary_password_encrypted, undefined);

        // Verify the stored hash matches the returned temporary password
        const passwordMatches = await credentials.comparePassword(result.temporary_password, capturedCreatedAccount.passwordHash);
        assert.equal(passwordMatches, true, 'Stored bcrypt hash must verify against returned one-time password');

      } finally {
        Driver.create = originalCreate;
        Driver.findByLicense = originalFindByLicense;
        Driver.findById = originalFindById;
        User.createDriverAccount = originalCreateDriverAccount;
        pool.connect = originalConnect;
      }
    });

    test('Driver password reset returns temporary_password strictly in the one-time response', async () => {
      const originalFindById = Driver.findById;
      const originalFindDriverAccount = User.findDriverAccount;
      const originalResetTemporaryPassword = User.resetTemporaryPassword;

      let capturedResetHash = null;

      try {
        Driver.findById = async () => ({ id: 'drv-test-uuid-1', organization_id: 'org-test-uuid' });
        User.findDriverAccount = async () => ({ id: 'usr-test-uuid-1', is_active: true });
        User.resetTemporaryPassword = async (userId, passwordHash) => {
          capturedResetHash = passwordHash;
          return { id: userId };
        };

        const { driverService } = require('../src/services/driverService');
        const result = await driverService.resetDriverPassword('drv-test-uuid-1', { organization_id: 'org-test-uuid' });

        assert.ok(result.temporary_password, 'One-time reset response must include temporary_password');
        assert.equal(result.must_change_password, true);
        assert.equal(result.driver_id, 'drv-test-uuid-1');

        assert.ok(capturedResetHash.startsWith('$2a$') || capturedResetHash.startsWith('$2b$'));
        const matches = await credentials.comparePassword(result.temporary_password, capturedResetHash);
        assert.equal(matches, true, 'Stored bcrypt hash must verify against returned one-time reset password');

      } finally {
        Driver.findById = originalFindById;
        User.findDriverAccount = originalFindDriverAccount;
        User.resetTemporaryPassword = originalResetTemporaryPassword;
      }
    });

    test('Driver listing and getDriverById NEVER expose passwords', async () => {
      const originalFindAll = Driver.findAll;
      const originalFindById = Driver.findById;

      try {
        Driver.findAll = async () => ([
          {
            id: 'drv-1',
            name: 'Driver 1',
            must_change_password: true,
            organization_id: 'org-1'
          }
        ]);
        Driver.findById = async () => ({
          id: 'drv-1',
          name: 'Driver 1',
          must_change_password: true,
          organization_id: 'org-1'
        });

        const { driverService } = require('../src/services/driverService');
        const list = await driverService.listDrivers({}, { organization_id: 'org-1' });
        assert.equal(list[0].temporary_password, undefined);
        assert.equal(list[0].temporary_password_encrypted, undefined);
        assert.equal(list[0].password_hash, undefined);
        assert.equal(list[0].must_change_password, true);

        const single = await driverService.getDriverById('drv-1', { organization_id: 'org-1' });
        assert.equal(single.temporary_password, undefined);
        assert.equal(single.temporary_password_encrypted, undefined);
        assert.equal(single.password_hash, undefined);
        assert.equal(single.must_change_password, true);

      } finally {
        Driver.findAll = originalFindAll;
        Driver.findById = originalFindById;
      }
    });
  });
});
