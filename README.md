# TransitOps — Smart Transport Operations Platform

TransitOps is an enterprise-grade fleet and transport operations platform designed for logistics coordinators, fleet managers, and dispatchers, paired with a dedicated Android driver mobile application.

The platform coordinates the end-to-end operational lifecycle of trips, fleet vehicles, drivers, and multi-tenant organizational assets with real-time state synchronization, concurrency protection, and automated compliance enforcement.

---

## Platform Architecture & Role Separation

Per the system design specification ([`agent.md`](./agent.md)), TransitOps strictly divides responsibilities between two primary roles across distinct platform clients:

```text
┌─────────────────────────────────────────────────────────────┐
│                 TransitOps System Architecture              │
└─────────────────────────────────────────────────────────────┘
                               │
       ┌───────────────────────┴───────────────────────┐
       ▼                                               ▼
┌──────────────────────────────┐        ┌──────────────────────────────┐
│       Web Application        │        │      Android Mobile APK      │
│     (Fleet Manager Only)     │        │        (Drivers Only)        │
│       React 19 + Vite        │        │      React Native + Expo     │
└──────────────┬───────────────┘        └──────────────┬───────────────┘
               │                                       │
               │ HTTP REST                             │ HTTP REST
               ▼                                       ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    TransitOps Node.js / Express API                  │
│                     (Port 5001, Tenant-Scoped)                       │
└──────────────────────────────────┬───────────────────────────────────┘
                                   │ Native Pool
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│                 Neon Cloud PostgreSQL / Local Docker                 │
│              (Multi-Tenant Scoped: org_id + FK RESTRICT)             │
└──────────────────────────────────────────────────────────────────────┘
```

- **Manager (Web Client Only)**:
  - Full access to the locked 5 manager pages: **Dashboard**, **Fleet (`/vehicles`)**, **Drivers (`/drivers`)**, **Trips (`/trips`)**, and **Billing (`/billing`)**.
  - No public self-signup; managers onboard and administer the operational fleet.
- **Driver (Android APK Only — No Web Login)**:
  - Driver accounts are strictly 1:1 with driver roster profiles.
  - Adding a driver profile automatically provisions an APK login ID and temporary password.
  - Driver APK access is strictly scoped to assigned trip(s), live trip status updates, document expiry viewing, and proof-of-delivery (POD) uploads.

---

## Locked 5-Page Web Architecture

The web platform is strictly scoped to 5 core operational pages. Secondary operational workflows are consolidated directly into their respective parent profiles rather than fragmented across standalone routes:

| Page Route | Purpose & Consolidated Architecture |
|---|---|
| **1. Dashboard** (`/`) | Real-time KPI strip (vehicles, active trips, fleet utilization), active trip ETA feed, and centralized **Compliance & Operations Alerts** (license expiry, vehicle document expiry, service due). Dissolves high-level analytics widgets into actionable cards. |
| **2. Fleet** (`/vehicles`) | Live fleet registry (plate, type, size, status, trips count, lifetime odometer). Incorporates per-vehicle **Compliance Documents** (RC, insurance, fitness, permit, pollution) and merged **Maintenance / Service Logs** and **Fuel Logs**. |
| **3. Drivers** (`/drivers`) | Driver roster with license verification, phone format validation, automated driver APK credential generation, dynamic completed trips counter, and server-side license expiry protection. |
| **4. Trips** (`/trips`) | Dispatch operational lifecycle (`Draft` $\rightarrow$ `Planned` $\rightarrow$ `Assigned` $\rightarrow$ `Dispatched` $\rightarrow$ `Completed` / `Cancelled`), capacity validation, collision double-booking prevention, and trip-level expense entries. |
| **5. Billing** (`/billing`) | Trip and customer invoices, payment status (`Paid`, `Pending`, `Overdue`), delayed-payment alerts, and revenue tracking. |

> [!NOTE]
> **Compliance Architecture**: Compliance is implemented as an automated rule layer rather than a separate page. Vehicle documents live on Fleet vehicle profiles and driver licensing lives on Driver profiles; upcoming or expired dates automatically populate the Dashboard alerts stream.

---

## Directory Structure

```text
TransitOps-Smart-Transport-Operations-Platform/
├── client/                     # Web Application for Managers (React 19 + Vite 5)
│   ├── src/
│   │   ├── components/         # Reusable UI components & layouts
│   │   ├── contexts/           # Global search & auth contexts
│   │   ├── pages/              # Dashboard, Vehicles, Drivers, TripDispatcher, Billing
│   │   └── utils/              # API request wrappers & formatters
│   └── package.json
├── mobile/                     # Android APK for Drivers (React Native / Expo)
│   ├── src/
│   │   ├── app/                # Driver screens (dashboard, trips, profile, auth)
│   │   ├── components/         # Mobile components & driver navigation
│   │   ├── contexts/           # Driver auth context
│   │   └── features/           # Driver trips & auth API clients
│   └── package.json
├── server/                     # Backend REST API (Node.js + Express)
│   ├── src/
│   │   ├── config/             # DB connection pool & environment configuration
│   │   ├── controllers/        # REST controllers (auth, trips, vehicles, drivers)
│   │   ├── database/           # Migrations (001-013) & seed files
│   │   ├── middleware/         # Auth JWT, request validation, error handlers
│   │   ├── models/             # Data access models (Trip, Vehicle, Driver, Organization, User)
│   │   ├── routes/             # API routes
│   │   ├── services/           # Business logic (tripService, vehicleService, driverService, authService)
│   │   └── utils/              # Encryption credentials, phone formatting, apiResponse
│   ├── test/                   # Automated backend test suites
│   │   ├── tenant_isolation.test.js
│   │   ├── trip.test.js
│   │   ├── vehicle.test.js
│   │   └── driver.test.js
│   └── package.json
├── docker-compose.yml          # Local PostgreSQL dev database (optional fallback)
├── .gitignore                  # Git ignore rules
├── agent.md                    # Locked scope rules and agent guidelines
├── package.json                # Root package metadata
└── README.md                   # Platform documentation
```

---

## Getting Started

### Prerequisites
- **Node.js**: v18.0.0 or higher
- **PostgreSQL**: Neon Cloud PostgreSQL database (or local PostgreSQL via Docker)

### 1. Backend Environment Setup

Create `server/.env` using `server/.env.example`:

```bash
cp server/.env.example server/.env
```

Configure your environment variables in `server/.env`:
```env
PORT=5001
NODE_ENV=development
JWT_SECRET=your_jwt_secret_key_here
CREDENTIAL_ENCRYPTION_KEY=c3f7d8a9e2b1450689fedcba0123456789abcdef0123456789abcdef01234567
DATABASE_URL=postgresql://username:password@ep-your-pooler.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
```

### 2. Install Dependencies

```bash
# Install backend dependencies
cd server && npm install

# Install web client dependencies
cd ../client && npm install

# Install driver mobile dependencies (optional)
cd ../mobile && npm install
```

### 3. Run Database Migrations

Apply schema migrations (001-013) and baseline seeds:

```bash
cd server && npm run db:migrate
```

### 4. Start Development Servers

```bash
# Terminal 1: Backend API (http://localhost:5001)
cd server && npm run dev

# Terminal 2: Web Client for Managers (http://localhost:5173)
cd client && npm run dev

# Terminal 3: Driver Mobile App (Expo development server)
cd mobile && npm start
```

---

## Automated Test Suites

The backend includes comprehensive test suites using the native Node.js test runner:

```bash
cd server && npm test
```

- **Tenant Isolation (`tenant_isolation.test.js`)**: 34 tests verifying organization barriers, SQL scoping, and foreign key restrict rules.
- **Trips Lifecycle (`trip.test.js`)**: 31 test items verifying operational transitions, collision prevention, resource state locking, and driver RBAC.
- **Vehicle Module (`vehicle.test.js`)**: 12 tests validating duplicate plate conflicts, odometer accumulation on trip completion, and deletion guards.
- **Driver Module (`driver.test.js`)**: 13 tests validating licensing compliance, phone formatting, expired license blocks, and trips count aggregation.

---

## API Summary

| Method | Endpoint | Access Role | Description |
|---|---|---|---|
| `POST` | `/api/auth/login` | Manager | Web login returning JWT with tenant context |
| `POST` | `/api/auth/driver-login`| Driver (APK) | Phone-based driver authentication |
| `GET` | `/api/trips` | Manager / Driver | List tenant trips (drivers strictly restricted to assigned trips) |
| `POST` | `/api/trips` | Manager | Create trip in Draft or Planned status |
| `GET` | `/api/trips/:id` | Manager / Driver | Fetch trip details |
| `PATCH` | `/api/trips/:id` | Manager | Reassign trip vehicle or driver |
| `PATCH` | `/api/trips/:id/status` | Manager / Driver | Advance lifecycle (`Assigned`, `Dispatched`, `Completed`, `Cancelled`) |
| `DELETE` | `/api/trips/:id` | Manager | Delete draft trip |
| `GET` | `/api/vehicles` | Manager | List fleet vehicles with dynamic completed trips and odometer |
| `POST` | `/api/vehicles` | Manager | Register vehicle |
| `PUT` | `/api/vehicles/:id` | Manager | Update vehicle details or manual odometer reading |
| `PATCH` | `/api/vehicles/:id/status`| Manager | Update vehicle status (`Available`, `In Shop`, `Retired`) |
| `DELETE` | `/api/vehicles/:id` | Manager | Delete vehicle (blocked if on active trip) |
| `GET` | `/api/drivers` | Manager | List drivers with dynamic completed trips and license status |
| `POST` | `/api/drivers` | Manager | Register driver, validate license/phone, auto-generate APK credentials |
| `PUT` | `/api/drivers/:id` | Manager | Update driver profile |
| `PATCH` | `/api/drivers/:id/status`| Manager | Update driver status (`Available`, `On Trip`, `Off Duty`, `Suspended`) |
| `DELETE` | `/api/drivers/:id` | Manager | Delete driver (blocked if on active trip) |
