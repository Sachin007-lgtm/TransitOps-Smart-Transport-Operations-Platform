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

## What changes vs. the current codebase

The current build has 8 separate pages (`Dashboard`, `Vehicles`, `Drivers`, `TripDispatcher`, `Maintenance`, `FuelExpenses`, `Analytics`, `Settings`). Three of these get merged, not deleted outright — migrate their logic, then retire the standalone route.

| Current file | What happens to it |
|---|---|
| `Maintenance.jsx` (`/maintenance`) | **Merge into `Vehicles.jsx`.** Becomes a "Maintenance" tab/section on each vehicle's profile — same fields (service type, cost, date, status, auto vehicle-status-update to "In shop"). Retire the standalone route. |
| `FuelExpenses.jsx` (`/fuel`) | **Split in two.** Vehicle-level fuel logs (liters, cost, odometer) move into `Vehicles.jsx` per-vehicle. Trip-level expenses (toll, other, maintenance-linked) move into `TripDispatcher.jsx` per-trip. Retire the standalone route. |
| `Analytics.jsx` (`/analytics`) | **Dissolve into widgets.** ROI, fleet utilization, and cost-donut style KPIs move into `Dashboard.jsx`. Revenue/payment-related numbers (monthly revenue bar, top-costliest) move into `Billing.jsx`. Retire the standalone route. |
| `Vehicles.jsx`, `Drivers.jsx`, `TripDispatcher.jsx`, `Dashboard.jsx` | Keep as-is, extend in place per the checklist below. |
| `Settings.jsx` | Leave untouched for now. |

Compliance (license expiry, document expiry, service-due) is **not a page** — it's a rule layer that already partly exists (license expiry guard in Drivers/Trips, alerts card on Dashboard). Keep it that way: checks live where the data lives (Fleet, Drivers), results surface as alerts on Dashboard.

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
- [ ] 🟢 Vehicle table: plate, type, size, trips completed, distance, status — keep existing search/filter/status behavior
- [ ] 🟢 Vehicle profile: documents (RC, insurance, permit, fitness, pollution) + expiry dates
- [ ] 🟢 **Maintenance tab (merged in):** service log — type, cost, date, status; mark-as-completed; auto status → "In shop"/"Available"
- [ ] 🟡 **Fuel/cost tab (merged in):** fuel logs (liters, cost, odometer), cost/vehicle, cost/km
- [ ] 🟡 Total trips, total distance, total expenses per vehicle

### 3. Drivers
- [ ] 🟢 Driver table: name, license, expiry, contact, status, safety score — keep existing validations (expiry blocks status change, license uniqueness, phone format)
- [ ] 🟢 Status set: Available / On Trip / Off Duty / Suspended
- [ ] 🟡 Driver history: past trips, earnings, advances

### 4. Trips (`TripDispatcher.jsx`)
- [ ] 🟢 Keep existing lifecycle: Draft → Planned → Assigned → Dispatched → Completed
- [ ] 🟢 Keep existing guards: cargo capacity, license expiry, driver availability, double-booking conflict
- [ ] 🟡 **Expense entry per trip (merged in from Fuel & Expenses):** toll, other, maintenance-linked cost
- [ ] 🟡 Revenue + actual cost → profit per trip, pushed to Billing on completion

### 5. Billing *(new page)*
- [ ] 🟢 Invoice generation per trip/customer
- [ ] 🟢 Payment status: Paid / Pending / Overdue
- [ ] 🟢 Delayed-payment alerts & follow-up log → surfaces on Dashboard
- [ ] 🟡 Customer-wise billing history, outstanding balance
- [ ] 🟡 Monthly revenue view, top-costliest-vehicles view (moved from Analytics)
- [ ] ⚪ GST-compliant invoicing / e-way bill linkage — only if a specific customer/niche requires it
- [ ] ⚪ Bulk invoice export, WhatsApp/SMS payment reminders

---

## Rules for the agent

1. Don't create a new top-level route without it being explicitly listed above.
2. If a task looks like it belongs on `/maintenance`, `/fuel`, or `/analytics`, it means the work belongs *inside* Fleet, Trips, or Billing/Dashboard instead — put it there.
3. Don't touch `/settings` unless asked.
4. Don't build third-party API/webhook access, GST e-way bill workflows, or multi-branch support — these are explicitly deferred.
5. When in doubt about which page a feature belongs on, ask rather than guess.