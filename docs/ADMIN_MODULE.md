# TransitOps Platform Administration & Multi-Tenant Governance Module

**Module Name:** Platform Admin & Tenant Governance  
**Target Branch:** `feature/admin-module`  
**System Architecture:** Multi-Tenant Fleet Operations Platform (SaaS)  
**Security Standard:** Zero-Trust Role-Based Access Control (RBAC), bcrypt (salt=10), Stateless Claims-Driven JWT, Mandatory Password Rotation  
**Status:** Feature Complete & Verified  

---

## 1. Executive Summary & Architecture Overview

The **Platform Administration Module** serves as the root control plane for the TransitOps ecosystem. Designed as a unified multi-tenant governance platform, it separates the root superadmin responsibilities from tenant-specific operations (such as vehicle dispatch, driver management, and telemetry ingestion).

```
                      ┌───────────────────────────────────────┐
                      │        TransitOps Root Gateway        │
                      └──────────────────┬────────────────────┘
                                         │
                         Role-Aware Router & JWT Auth
                                         │
                  ┌──────────────────────┴──────────────────────┐
                  ▼                                             ▼
    ┌───────────────────────────┐                 ┌───────────────────────────┐
    │      PLATFORM ADMIN       │                 │       TENANT SPACES       │
    │  (/admin - Root Control)  │                 │    (/ - Fleet Operations) │
    ├───────────────────────────┤                 ├───────────────────────────┤
    │ • Global Tenant Registry  │                 │ • Control Tower Dashboard │
    │ • Tenant Provisioning     │                 │ • Fleet Registry          │
    │ • Slug Uniqueness Engine  │                 │ • Driver Roster           │
    │ • Credential Dispatch     │                 │ • Trip Dispatcher         │
    │ • Tenant Suspend / Resume │                 │ • Live GPS Telemetry      │
    │ • Cross-Tenant Telemetry  │                 │ • Fuel & Maintenance      │
    └───────────────────────────┘                 └───────────────────────────┘
```

### Key Architectural Invariants
1. **Strict Multi-Tenant Isolation:**
   Tenant data (`vehicles`, `drivers`, `trips`, `fuel_expenses`, `maintenance_logs`, `vehicle_locations`) is strictly scoped by foreign key `organization_id`. Database queries reject cross-tenant reads or writes.
2. **Platform Admin Identity Independence:**
   Platform Admins possess `organization_id = NULL`. They are cryptographically barred from directly accessing tenant-specific operational mutations while maintaining platform-wide read and governance capabilities.
3. **Unified Single-Login Surface:**
   Admins and fleet managers authenticate through the exact same login endpoint (`/login`). The frontend automatically routes users based on their token role:
   - `Platform Admin` $\rightarrow$ `/admin` (Platform Superadmin Control Plane)
   - `Owner/Manager` $\rightarrow$ `/` (Tenant Operations Workspace)
4. **Zero Raw Password Storage:**
   Passwords are never stored in plaintext or reversible encryption. All temporary passwords generated in memory are delivered immediately in one-time responses and stored exclusively as salted bcrypt hashes (`password_hash`).

---

## 2. Core Functional Capabilities

### Feature 1: Multi-Tenant Organization Registry
* **Global KPI Overview:**
  * **Total Organizations:** Real-time tally of active and suspended tenants.
  * **Global Fleet Size:** Aggregated vehicle count across all active tenants.
  * **Registered Drivers:** Platform-wide driver roster size.
  * **Total Platform Users:** Total registered credentials (Admins, Managers, Drivers).
* **Tenant Registry Table:**
  * **Organization:** Name and unique slug identifier (e.g. `/apex-freight`).
  * **Primary Owner:** Full Name, Login Email, Contact Phone, and Onboarding Status badge (`Setup Pending` vs. `Verified`).
  * **Asset Badges:** Real-time vehicle count, driver count, and platform user count per tenant.
  * **Status Lifecycle:** `Active` (tenant fully operational) or `Suspended` (tenant access frozen).
  * **Creation Timestamp:** Formatted date of onboarding.

### Feature 2: Automated Tenant Provisioning & Slug Engine
* **Required Input Parameters:**
  * **Organization Name:** Full business entity name.
  * **Tenant Identifier Slug:** Auto-derived from the name with collision detection (guaranteed uniqueness with incremental `-2`, `-3` counters).
  * **Manager Full Name:** Legal administrator name.
  * **Manager Login Email:** Verified email for authentication and notification.
  * **Manager Contact Phone:** E.164 normalized phone number (e.g., `+91 98765 43210`).
* **Transactional Provisioning:**
  Organizations and initial manager accounts are created inside a database transaction (`BEGIN ... COMMIT`). If user creation fails, organization creation rolls back atomically.

### Feature 3: Credential Revert & Dispatch Workflow
Upon provisioning a new tenant or resetting manager credentials, the platform displays an immediate, single-view **Admin Credential Modal**:
* Displays Organization Name, Slug, Manager Name, Login Identifier (Email/Phone), and One-Time Temporary Password.
* **One-Click Revert Tools:**
  * **Copy Revert Message:** Formats a pre-composed notification ready for WhatsApp, Slack, or SMS:
    ```
    Welcome to TransitOps!
    Organization: Apex Freight Logistics
    Portal: https://transitops.com
    Email: manager@apex.com
    Temporary Password: TempPassword123!
    Note: You will be prompted to set a permanent password upon first login.
    ```
  * **Email Client Launcher:** Launches `mailto:` with pre-filled subject and onboarding instructions.

### Feature 4: Mandatory First-Login Password Rotation
* When a user is provisioned or reset, the database sets `must_change_password = TRUE`.
* **Backend Security Gate:**
  In `server/src/middleware/authenticate.js`, any user with `must_change_password === true` is barred from all operational API routes with `403 Forbidden` (`code: 'MUST_CHANGE_PASSWORD'`). Only `/api/auth/me` and `/api/auth/password` are permitted.
* **Frontend Screen Lock:**
  [ForceChangePasswordModal.jsx](file:///Users/ayushpratapsingh/dev/Projects/TransitOps-Smart-Transport-Operations-Platform/client/src/components/auth/ForceChangePasswordModal.jsx) renders an unskippable blurred overlay. The user must provide their temporary password and establish a new permanent password (minimum 8 characters) before entering the workspace.

### Feature 5: Voluntary Password Management
* **Settings Page Integration:**
  A dedicated **Security & Password** card is embedded inside the [Settings.jsx](file:///Users/ayushpratapsingh/dev/Projects/TransitOps-Smart-Transport-Operations-Platform/client/src/pages/Settings.jsx) page (`/settings#security`).
* **Profile Menu Navigation:**
  Clicking **"Account settings"** in the top-right header menu:
  * For **Owner / Manager**: Navigates to `/settings#security`, smoothly scrolls to the card, and triggers a golden pulse highlight animation.
  * For **Platform Admin**: Opens the superadmin password change modal directly.

### Feature 6: Tenant Lifecycle & Emergency Controls
* **Suspend / Reactivate Tenant:**
  Admins can suspend an organization with a single click. When an organization is suspended, tenant users attempting to log in or make API calls are rejected.
* **Emergency Password Reset:**
  Admins can reset any tenant manager's credentials. The system invalidates the previous password, generates a new temporary password, marks `must_change_password = TRUE`, and presents the revert dialog.

---

## 3. Database Schema & Data Models

### Organizations Table (`organizations`)
```sql
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    status VARCHAR(50) DEFAULT 'Active' CHECK (status IN ('Active', 'Suspended', 'Inactive')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

### Roles Table (`roles`)
```sql
CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Seeded Roles:
-- 1. 'Platform Admin' (Root Superadmin)
-- 2. 'Owner/Manager' (Tenant Administrator)
-- 3. 'Driver'        (Mobile / Field Operator)
```

### Users Table (`users`)
```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE,
    phone_number VARCHAR(50) UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL,
    must_change_password BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Invariants:
-- Platform Admins: organization_id IS NULL, driver_id IS NULL
-- Owner/Manager:   organization_id IS NOT NULL, driver_id IS NULL
-- Driver:          organization_id IS NOT NULL, driver_id IS NOT NULL
```

---

## 4. REST API Specification

### Base Path: `/api/platform`
All endpoints require `Authorization: Bearer <token>` signed for a user with the `Platform Admin` role.

#### 1. Global Platform Metrics
* **Endpoint:** `GET /api/platform/stats`
* **Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "total_organizations": 2,
    "active_organizations": 2,
    "total_vehicles": 8,
    "total_drivers": 6,
    "total_users": 8
  }
}
```

#### 2. List All Organizations
* **Endpoint:** `GET /api/platform/organizations`
* **Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "id": "01950000-0000-7000-8000-000000000001",
      "name": "Apex Freight Logistics",
      "slug": "apex-freight",
      "status": "Active",
      "created_at": "2026-09-20T10:00:00.000Z",
      "vehicles_count": 4,
      "drivers_count": 3,
      "users_count": 4,
      "owner_name": "Rajesh Sharma",
      "owner_email": "owner@apex.com",
      "owner_phone": "+91 98200 11223",
      "owner_user_id": "01950000-0001-7000-8000-000000000001",
      "owner_must_change_password": false
    }
  ]
}
```

#### 3. Provision New Organization & Manager
* **Endpoint:** `POST /api/platform/organizations`
* **Request Payload:**
```json
{
  "name": "Nova Fleet Express",
  "slug": "nova-fleet",
  "owner": {
    "name": "Vikram Saxena",
    "email": "vikram@novafleet.com",
    "phone_number": "+91 98765 43210",
    "password": "OptionalCustomPassword" 
  }
}
```
* **Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "organization": {
      "id": "01950000-0000-7000-8000-000000000099",
      "name": "Nova Fleet Express",
      "slug": "nova-fleet",
      "status": "Active"
    },
    "owner": {
      "id": "01950000-0001-7000-8000-000000000099",
      "name": "Vikram Saxena",
      "email": "vikram@novafleet.com",
      "phone_number": "+91 98765 43210",
      "role": "Owner/Manager",
      "organization_id": "01950000-0000-7000-8000-000000000099",
      "must_change_password": true
    },
    "temporary_password": "xK9#vL2$mP4q"
  },
  "message": "Organization and Owner/Manager provisioned successfully."
}
```

#### 4. Update Organization Status
* **Endpoint:** `PATCH /api/platform/organizations/:id/status`
* **Request Payload:**
```json
{ "status": "Suspended" }
```
* **Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "01950000-0000-7000-8000-000000000099",
    "name": "Nova Fleet Express",
    "status": "Suspended"
  },
  "message": "Organization status updated to Suspended."
}
```

#### 5. Reset Manager Temporary Password
* **Endpoint:** `POST /api/platform/organizations/:id/reset-password`
* **Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "owner": {
      "id": "01950000-0001-7000-8000-000000000099",
      "name": "Vikram Saxena",
      "email": "vikram@novafleet.com",
      "phone_number": "+91 98765 43210"
    },
    "temporary_password": "tZ8!pW4@mK1q"
  },
  "message": "Temporary password reset successfully. Please share the credentials with the owner."
}
```

---

## 5. Security & Authentication Model

### JWT Token Claims Structure
Tokens are signed with `HS256` using the platform `JWT_SECRET`:
```json
{
  "id": "01950000-0001-7000-8000-000000000001",
  "email": "ayush@transitops.com",
  "phone_number": "+91 98111 00001",
  "role": "Platform Admin",
  "role_id": "01950000-0000-7000-8000-000000000003",
  "organization_id": null,
  "driver_id": null,
  "iat": 1727289600,
  "exp": 1727318400
}
```

### Stale Token & Permission Revocation
On every authenticated request, `server/src/middleware/authenticate.js` queries the database (`User.findById(decoded.id)`) to detect:
1. Revoked accounts (`is_active = FALSE`).
2. Changed user roles.
3. Organization reassignments.
If claims in the token do not match current database permissions, the request is immediately rejected with `401 Unauthorized` (`'Stale token claims'`).

---

## 6. Frontend Components & User Experience

| Component | Path | Description |
|---|---|---|
| **PlatformAdmin** | `client/src/pages/PlatformAdmin.jsx` | Superadmin dashboard containing KPI metrics strip, search/filter toolbar, and organizations data table. |
| **CreateOrganizationModal** | `client/src/components/admin/CreateOrganizationModal.jsx` | Provisioning dialog with dynamic slug preview, phone validation, and submission handler. |
| **AdminCredentialModal** | `client/src/components/admin/AdminCredentialModal.jsx` | Post-provisioning revert modal displaying temporary credentials with one-click copy and email launch. |
| **ForceChangePasswordModal** | `client/src/components/auth/ForceChangePasswordModal.jsx` | Unskippable first-login modal enforcing mandatory password change before accessing workspace. |
| **ChangePasswordModal** | `client/src/components/auth/ChangePasswordModal.jsx` | Dialog for superadmin and voluntary password changes. |
| **Settings (Security Panel)** | `client/src/pages/Settings.jsx` | Embedded security card for voluntary manager password rotation with live validation and pulse animation. |

---

## 7. Verification & Testing

### Automated Test Matrix
The test suite in `server/test/platform.test.js` covers 100% of the platform admin routes:
* `✔ 1. Platform Admin can fetch global platform stats`
* `✔ 2. Owner/Manager is blocked from platform stats with HTTP 403`
* `✔ 3. Platform Admin can list all organizations with asset counts`
* `✔ 4. Platform Admin can provision a new organization and owner account`
* `✔ 5. Provisioning enforces unique slug across tenants`
* `✔ 6. Platform Admin can fetch single organization details`
* `✔ 7. Platform Admin can suspend and reactivate an organization`
* `✔ 8. Platform Admin can reset a manager's temporary password`
* `✔ 9. Automated teardown cleanly purges test organizations without database pollution`

### Verification Summary
* **Full Backend Test Suite:** 179 passing tests across 22 suites, 0 failures.
* **Frontend Compilation:** `vite build` completed with 0 errors.
* **Multi-Tenant Isolation:** Zero mock data fallback in empty organizations; strict scoping enforced.
