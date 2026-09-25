# TransitOps — Locked Scope (Agent Instructions)

**Read this before touching any file. Do not add pages, routes, or features outside what's listed here — even if they seem useful or "obviously missing." If you think something should be added, stop and ask instead of building it.**

---

## Locked page set (5 pages only)

1. **Dashboard** — `/`
2. **Fleet** — `/vehicles` (includes maintenance + fuel/cost + compliance docs, per-vehicle)
3. **Drivers** — `/drivers`
4. **Trips** — `/trips`
5. **Billing** — `/billing` *(new — does not exist yet)*

No other top-level route gets built. Specifically:

- ❌ No standalone `/maintenance` page
- ❌ No standalone `/fuel` page
- ❌ No standalone `/analytics` page
- ❌ No third-party/API access page
- ⚪ `/settings` — on hold. Don't extend it, don't remove it. Leave as-is until told otherwise.

---

## Auth & Roles

Two roles only. No public self-signup for either — both identities are created from the manager side. **Platform split: Manager = web app only. Driver = Android APK only — no web login exists for drivers.**

**Manager (web)**
- [x] 🟢 One manager identity (or a few), created by admin/onboarding
- [x] 🟢 Full access to all 5 pages, web only
- [ ] 🟡 Support multiple manager accounts if more than one person needs full access

**Driver (Android APK only)**
- [x] 🟢 Auto-created the moment a driver profile is added on the Drivers page (web side) — system generates a login ID + password at that point
- [x] 🟢 Credentials shown once to the manager (copy/share action) to hand to the driver
- [ ] 🟢 Driver logs into the APK only: own assigned trip(s), trip status-update actions, POD upload — nothing else
- [x] 🟡 Manager can reset/regenerate a driver's password
- [ ] 🟡 Driver can view their own document expiry, earnings/advances (read-only) in the APK
- [ ] ⚪ Any further driver self-service (profile edits, leave requests, etc.)

**Rule:** driver accounts are 1:1 with driver profiles — deactivating a driver profile deactivates the login.

---

## What changes vs. the current codebase

The current build has 8 separate pages (`Dashboard`, `Vehicles`, `Drivers`, `TripDispatcher`, `Maintenance`, `FuelExpenses`, `Analytics`, `Settings`). Three of these get merged, not deleted outright — migrate their logic, then retire the standalone route.

| Current file | What happens to it |
|---|---|
| `Maintenance.jsx` (`/maintenance`) | **Merge into `Vehicles.jsx`.** Becomes a "Maintenance" tab/section on each vehicle's profile — same fields (service type, cost, date, status, auto vehicle-status-update to "In shop"). Retire the standalone route. |
| `FuelExpenses.jsx` (`/fuel`) | **Split in two.** Vehicle-level fuel logs (liters, cost, odometer) move into `Vehicles.jsx` per-vehicle. Trip-level expenses (toll, other, maintenance-linked) move into `TripDispatcher.jsx` per-trip. Retire the standalone route. |
| `Analytics.jsx` (`/analytics`) | **Dissolve into widgets.** ROI, fleet utilization, and cost-donut style KPIs move into `Dashboard.jsx`. Revenue/payment-related numbers (monthly revenue bar, top-costliest) move into `Billing.jsx`. Retire the standalone route. |
| `Vehicles.jsx`, `Drivers.jsx`, `TripDispatcher.jsx`, `Dashboard.jsx` | Keep as-is, extend in place per the checklist below. |
| `Settings.jsx` | Leave untouched for now. |

**Decision: no separate Compliance page.** Vehicle documents live on the Fleet vehicle profile; driver documents live on the Driver profile — that's where the upload/edit action belongs, and a separate page would just duplicate the same data. Compliance is a rule layer, not a page: it watches expiry dates on those two profiles and pushes results into the Dashboard alerts card. If that alert list ever grows too long to scan, add a "View all" link off Dashboard — do not add a new top-level nav item for it.

---

## Feature checklist by page

🟢 = build now · 🟡 = after pilot feedback · ⚪ = later, don't build yet

### 1. Dashboard
- [ ] 🟢 KPI strip: vehicles (total/available/maintenance), drivers on duty, active/pending trips, fleet utilization
- [ ] 🟢 Recent/active trips table with status + ETA
- [ ] 🟢 Alerts card: license expiry, document expiry, service due, delayed trip
- [ ] 🟡 Pending/overdue payments total (from Billing)
- [ ] 🟡 ROI card, fuel efficiency chart, operating-cost donut (moved from Analytics)
- [ ] ⚪ Live route map, sparkline charts, "simulate dispatch" demo button

### 2. Fleet (`Vehicles.jsx`)
- [x] 🟢 Vehicle table: plate, type, size, trips completed, distance, status — keep existing search/filter/status behavior
- [ ] 🟢 Vehicle profile: documents (RC, insurance, permit, fitness, pollution) + expiry dates
- [ ] 🟢 **Maintenance tab (merged in):** service log — type, cost, date, status; mark-as-completed; auto status → "In shop"/"Available"
- [ ] 🟡 **Fuel/cost tab (merged in):** fuel logs (liters, cost, odometer), cost/vehicle, cost/km
- [ ] 🟡 Total trips, total distance, total expenses per vehicle

### 3. Drivers
- [x] 🟢 Driver table: name, license, expiry, contact, status, safety score — keep existing validations (expiry blocks status change, license uniqueness, phone format)
- [x] 🟢 Status set: Available / On Trip / Off Duty / Suspended
- [ ] 🟡 Driver history: past trips, earnings, advances
- [ ] 🟢 Driver document upload/expiry lives on this same profile (RC-equivalent: license doc) — feeds Dashboard alerts, no separate Compliance page

### 4. Trips (`TripDispatcher.jsx`)
- [x] 🟢 Keep existing lifecycle: Draft → Planned → Assigned → Dispatched → Completed
- [x] 🟢 Keep existing guards: cargo capacity, license expiry, driver availability, double-booking conflict
- [ ] 🟡 **Expense entry per trip (merged in from Fuel & Expenses):** toll, other, maintenance-linked cost
- [ ] 🟡 Revenue + actual cost → profit per trip, pushed to Billing on completion
- [ ] 🟢 Driver-side (APK): status update actions + POD upload on their assigned trip

### 5. Billing *(new page)*
- [ ] 🟢 Invoice generation per trip/customer
- [ ] 🟢 Payment status: Paid / Pending / Overdue
- [ ] 🟢 Delayed-payment alerts & follow-up log → surfaces on Dashboard
- [ ] 🟡 Customer-wise billing history, outstanding balance
- [ ] 🟡 Monthly revenue view, top-costliest-vehicles view (moved from Analytics)
- [ ] ⚪ GST-compliant invoicing / e-way bill linkage — only if a specific customer/niche requires it
- [ ] ⚪ Bulk invoice export, WhatsApp/SMS payment reminders

---

## Deferred / not building yet

- [ ] ⚪ GPS live tracking page
- [ ] ⚪ 3rd-party truck-location access (API/webhook to partners)
- [ ] ⚪ Separate Compliance page
- [ ] ⚪ Standalone Maintenance / Fuel / Analytics pages (merged elsewhere — see above)
- [ ] ⚪ Multi-branch support

---

## Rules for the agent

1. Don't create a new top-level route without it being explicitly listed above.
2. If a task looks like it belongs on `/maintenance`, `/fuel`, or `/analytics`, it means the work belongs *inside* Fleet, Trips, or Billing/Dashboard instead — put it there.
3. Don't touch `/settings` unless asked.
4. Don't build third-party API/webhook access, GST e-way bill workflows, or multi-branch support — these are explicitly deferred.
5. When in doubt about which page a feature belongs on, ask rather than guess.
6. Don't build a separate Compliance page — document upload/expiry lives on Fleet and Driver profiles; alerts surface on Dashboard.
7. Driver login creation is triggered by adding a driver profile, not a separate signup flow. Don't build public self-signup for either role.
8. Never build a web login/view for drivers — driver access is APK-only. The web app (all 5 pages) is manager-only.