const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const requirePlatformAdmin = require('../src/middleware/requirePlatformAdmin');
const requireTenantContext = require('../src/middleware/requireTenantContext');
const authorize = require('../src/middleware/authorize');
const validate = require('../src/middleware/validate');
const { createTripSchema, updateTripSchema } = require('../src/validators/tripValidator');

function mockResponse() {
  const res = {
    statusCode: null,
    jsonData: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.jsonData = data;
      return this;
    }
  };
  return res;
}

describe('Unit Tests: Authentication & Authorization Middleware Invariants', () => {

  // ==================== REQUIRE PLATFORM ADMIN ====================
  describe('requirePlatformAdmin middleware', () => {
    test('Rejects unauthenticated request with 403', () => {
      const req = {};
      const res = mockResponse();
      let nextCalled = false;
      requirePlatformAdmin(req, res, () => { nextCalled = true; });

      assert.equal(res.statusCode, 403);
      assert.equal(res.jsonData.success, false);
      assert.match(res.jsonData.message, /restricted to Platform Administrators/i);
      assert.equal(nextCalled, false);
    });

    test('Rejects Owner/Manager with 403', () => {
      const req = { user: { role: 'Owner/Manager', organization_id: 'org-123' } };
      const res = mockResponse();
      let nextCalled = false;
      requirePlatformAdmin(req, res, () => { nextCalled = true; });

      assert.equal(res.statusCode, 403);
      assert.equal(nextCalled, false);
    });

    test('Rejects Driver with 403', () => {
      const req = { user: { role: 'Driver', organization_id: 'org-123' } };
      const res = mockResponse();
      let nextCalled = false;
      requirePlatformAdmin(req, res, () => { nextCalled = true; });

      assert.equal(res.statusCode, 403);
      assert.equal(nextCalled, false);
    });

    test('Rejects Platform Admin if organization_id is unexpectedly set', () => {
      const req = { user: { role: 'Platform Admin', organization_id: 'org-rogue' } };
      const res = mockResponse();
      let nextCalled = false;
      requirePlatformAdmin(req, res, () => { nextCalled = true; });

      assert.equal(res.statusCode, 403);
      assert.equal(nextCalled, false);
    });

    test('Permits genuine Platform Admin with organization_id === null', () => {
      const req = { user: { role: 'Platform Admin', organization_id: null } };
      const res = mockResponse();
      let nextCalled = false;
      requirePlatformAdmin(req, res, () => { nextCalled = true; });

      assert.equal(res.statusCode, null);
      assert.equal(nextCalled, true);
    });
  });

  // ==================== REQUIRE TENANT CONTEXT ====================
  describe('requireTenantContext middleware', () => {
    test('Rejects unauthenticated request with 403', () => {
      const req = {};
      const res = mockResponse();
      let nextCalled = false;
      requireTenantContext(req, res, () => { nextCalled = true; });

      assert.equal(res.statusCode, 403);
      assert.match(res.jsonData.message, /Tenant operational context required/i);
      assert.equal(nextCalled, false);
    });

    test('Rejects Platform Admin (organization_id === null) from tenant operations with 403', () => {
      const req = { user: { role: 'Platform Admin', organization_id: null } };
      const res = mockResponse();
      let nextCalled = false;
      requireTenantContext(req, res, () => { nextCalled = true; });

      assert.equal(res.statusCode, 403);
      assert.match(res.jsonData.message, /Platform Administrators cannot directly access tenant operational routes/i);
      assert.equal(nextCalled, false);
    });

    test('Rejects non-string organization_id with 403', () => {
      const req = { user: { role: 'Owner/Manager', organization_id: 12345 } };
      const res = mockResponse();
      let nextCalled = false;
      requireTenantContext(req, res, () => { nextCalled = true; });

      assert.equal(res.statusCode, 403);
      assert.equal(nextCalled, false);
    });

    test('Permits valid tenant user with organization_id string', () => {
      const req = { user: { role: 'Owner/Manager', organization_id: '10000000-0000-0000-0000-000000000001' } };
      const res = mockResponse();
      let nextCalled = false;
      requireTenantContext(req, res, () => { nextCalled = true; });

      assert.equal(res.statusCode, null);
      assert.equal(nextCalled, true);
    });
  });

  // ==================== AUTHORIZE RBAC ====================
  describe('authorize middleware', () => {
    test('Permits Owner/Manager on Owner/Manager-only endpoint', () => {
      const middleware = authorize('Owner/Manager');
      const req = { user: { role: 'Owner/Manager' } };
      const res = mockResponse();
      let nextCalled = false;
      middleware(req, res, () => { nextCalled = true; });

      assert.equal(res.statusCode, null);
      assert.equal(nextCalled, true);
    });

    test('Bridges legacy Fleet Manager role to Owner/Manager', () => {
      const middleware = authorize('Owner/Manager');
      const req = { user: { role: 'Fleet Manager' } };
      const res = mockResponse();
      let nextCalled = false;
      middleware(req, res, () => { nextCalled = true; });

      assert.equal(res.statusCode, null);
      assert.equal(nextCalled, true);
    });

    test('Rejects Driver on Owner/Manager endpoint with 403', () => {
      const middleware = authorize('Owner/Manager');
      const req = { user: { role: 'Driver' } };
      const res = mockResponse();
      let nextCalled = false;
      middleware(req, res, () => { nextCalled = true; });

      assert.equal(res.statusCode, 403);
      assert.equal(nextCalled, false);
    });
  });

  // ==================== VALIDATE & TRIP VALIDATOR ====================
  describe('validate middleware & tripValidator UUID checks', () => {
    test('Validates UUID format for vehicle_id and driver_id in trip creation', () => {
      const middleware = validate(createTripSchema);
      const req = {
        body: {
          origin: 'Point A',
          destination: 'Point B',
          planned_route: 'Route A to B',
          start_time: new Date().toISOString(),
          expected_arrival: new Date(Date.now() + 3600000).toISOString(),
          vehicle_id: '30000000-0000-0000-0000-000000000001',
          driver_id: '20000000-0000-0000-0000-000000000001'
        }
      };
      const res = mockResponse();
      let nextCalled = false;
      middleware(req, res, () => { nextCalled = true; });

      assert.equal(res.statusCode, null);
      assert.equal(nextCalled, true);
    });

    test('Rejects non-UUID vehicle_id with 400', () => {
      const middleware = validate(createTripSchema);
      const req = {
        body: {
          origin: 'Point A',
          destination: 'Point B',
          planned_route: 'Route A to B',
          start_time: new Date().toISOString(),
          expected_arrival: new Date(Date.now() + 3600000).toISOString(),
          vehicle_id: 'invalid-non-uuid-string'
        }
      };
      const res = mockResponse();
      let nextCalled = false;
      middleware(req, res, () => { nextCalled = true; });

      assert.equal(res.statusCode, 400);
      assert.match(res.jsonData.message, /vehicle_id must be a valid UUID/i);
      assert.equal(nextCalled, false);
    });

    test('Rejects numeric integer vehicle_id with 400', () => {
      const middleware = validate(createTripSchema);
      const req = {
        body: {
          origin: 'Point A',
          destination: 'Point B',
          planned_route: 'Route A to B',
          start_time: new Date().toISOString(),
          expected_arrival: new Date(Date.now() + 3600000).toISOString(),
          vehicle_id: 123
        }
      };
      const res = mockResponse();
      let nextCalled = false;
      middleware(req, res, () => { nextCalled = true; });

      assert.equal(res.statusCode, 400);
      assert.match(res.jsonData.message, /vehicle_id must be a valid UUID/i);
      assert.equal(nextCalled, false);
    });
  });
});
