process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://localhost:5432/mock';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../src/config/jwt');
const {
  hashPassword,
  comparePassword,
  generateTemporaryPassword
} = require('../src/utils/credentials');
const { normalizePhoneNumber } = require('../src/utils/phone');
const { signToken, publicUser } = require('../src/services/authService');

describe('Unit Tests: JWT, Credentials & Phone Normalization', () => {

  // ==================== PHONE NORMALIZATION ====================
  describe('normalizePhoneNumber utility', () => {
    test('Formats 10-digit Indian numbers with +91 prefix', () => {
      assert.equal(normalizePhoneNumber('9876543210'), '+919876543210');
    });

    test('Leaves already prefixed +91 numbers unchanged', () => {
      assert.equal(normalizePhoneNumber('+919876543210'), '+919876543210');
    });

    test('Strips spaces, dashes, and parentheses', () => {
      assert.equal(normalizePhoneNumber('+91 (987) 654-3210'), '+919876543210');
      assert.equal(normalizePhoneNumber('987-654-3210'), '+919876543210');
    });

    test('Returns null for empty or invalid strings', () => {
      assert.equal(normalizePhoneNumber(''), null);
      assert.equal(normalizePhoneNumber('abc'), null);
      assert.equal(normalizePhoneNumber(null), null);
    });
  });

  // ==================== CREDENTIAL UTILITIES ====================
  describe('Credentials & Password hashing', () => {
    test('generateTemporaryPassword returns compliant 12-char alphanumeric with symbol', () => {
      const tempPass = generateTemporaryPassword();
      assert.equal(typeof tempPass, 'string');
      assert.ok(tempPass.length >= 10, 'Password length should be at least 10');
      assert.ok(/[A-Z]/.test(tempPass), 'Should have uppercase');
      assert.ok(/[a-z]/.test(tempPass), 'Should have lowercase');
      assert.ok(/[0-9]/.test(tempPass), 'Should have number');
    });

    test('hashPassword produces bcrypt hash and comparePassword verifies correctly', async () => {
      const password = 'TestSecurePassword123!';
      const hash = await hashPassword(password);
      assert.ok(hash.startsWith('$2a$') || hash.startsWith('$2b$'));

      const isMatch = await comparePassword(password, hash);
      assert.equal(isMatch, true);

      const isWrong = await comparePassword('wrongPassword!', hash);
      assert.equal(isWrong, false);
    });
  });

  // ==================== TOKEN GENERATION & CLAIMS ====================
  describe('JWT token signing and claim serialization', () => {
    test('signToken packages canonical claims including organization_id and role', () => {
      const mockUser = {
        id: '10000000-0000-0000-0000-000000000099',
        name: 'Test Manager',
        email: 'mgr@test.com',
        phone_number: '+919876543210',
        role: 'Owner/Manager',
        role_id: '00000000-0000-0000-0000-000000000002',
        driver_id: null,
        organization_id: '10000000-0000-0000-0000-000000000001',
        must_change_password: false
      };

      const token = signToken(mockUser);
      assert.ok(typeof token === 'string');

      const decoded = jwt.verify(token, JWT_SECRET);
      assert.equal(decoded.id, mockUser.id);
      assert.equal(decoded.email, mockUser.email);
      assert.equal(decoded.role, 'Owner/Manager');
      assert.equal(decoded.organization_id, mockUser.organization_id);
      assert.equal(decoded.driver_id, null);
    });

    test('publicUser sanitizes sensitive fields and omits password_hash', () => {
      const rawUser = {
        id: '10000000-0000-0000-0000-000000000099',
        name: 'Test Manager',
        email: 'mgr@test.com',
        phone_number: '+919876543210',
        password_hash: '$2a$10$supersecret',
        role: 'Owner/Manager',
        role_id: '00000000-0000-0000-0000-000000000002',
        driver_id: null,
        organization_id: '10000000-0000-0000-0000-000000000001',
        must_change_password: false,
        temporary_password_encrypted: 'old-secret'
      };

      const sanitized = publicUser(rawUser);
      assert.equal(sanitized.id, rawUser.id);
      assert.equal(sanitized.email, rawUser.email);
      assert.equal(sanitized.password_hash, undefined);
      assert.equal(sanitized.temporary_password_encrypted, undefined);
    });
  });
});
