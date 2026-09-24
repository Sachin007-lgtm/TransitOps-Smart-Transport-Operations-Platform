# TransitOps Mobile Development Progress

Last updated: 2026-09-23

## Completed

- Expo project exists in `mobile/`.
- Expo/EAS setup and Android development build are complete.
- Custom `mobile` development build is installed on the Android phone.
- `mobile/package.json` dependencies are installed with `npm ci`.
- Normal development command confirmed: `npm start` from the `mobile/` directory.
- TypeScript validation completed successfully with `npx --no-install tsc --noEmit` from `mobile/`.
- Initial mobile login screen implementation is in place and is ready for device verification.
- Login form baseline improved with email-format validation, keyboard next/submit actions, and accessibility labels.
- TypeScript validation passed after the login form update.
- Expo development server started successfully from `mobile/` on port `8082` because port `8081` was already in use.
- Phase 1 foundation started: shared TransitOps light/dark theme tokens now power the login screen.
- TypeScript validation passed after the shared theme refactor.
- Login screen now selects the shared light or dark theme from the device color scheme, including input placeholders.
- TypeScript validation passed after dynamic theme support was added.
- Login visual direction aligned with the web reference: plum brand panel, amber accents, fleet metrics, and a compact mobile form surface.
- TypeScript validation passed after the visual redesign.
- Removed the oversized login header block and fleet metrics at the requested smaller scale.
- TypeScript and mobile diff validation passed after simplifying the login screen.
- Vertically centered the compact login form on the page while preserving scroll behavior for small screens and keyboard use.
- TypeScript and mobile diff validation passed after centering the login layout.
- Phase 2 started: added mobile `.env.example` with `EXPO_PUBLIC_API_URL` guidance for physical Android testing.
- Added a typed mobile API request client with timeout, JSON parsing, HTTP errors, and network-error handling.
- TypeScript and mobile diff validation passed for the API foundation.
- Read the existing backend auth contract: `POST /api/auth/login` accepts `email` and `password` and returns a token plus safe user data.
- Connected the mobile login form to that contract with loading, success, validation, and server/network error states.
- TypeScript and mobile diff validation passed after the login integration.
- Added an in-memory auth provider for the driver session and routed successful login to a protected dashboard screen.
- Added dashboard sign-out behavior and redirect protection for unauthenticated access.
- TypeScript and mobile diff validation passed for the login-to-dashboard flow.
- Added `expo-secure-store` for encrypted token and safe-user persistence.
- Sessions now restore at app startup and are cleared from SecureStore during sign-out.
- TypeScript and mobile diff validation passed after SecureStore integration.
- Fixed cold-start routing: after SecureStore restores an authenticated session, the login route now redirects to the dashboard instead of showing the login form.
- TypeScript and mobile diff validation passed after the session-routing fix.
- Added authenticated API requests with the `Authorization: Bearer <token>` header.
- Added startup session verification through `GET /api/auth/me`.
- Invalid or expired sessions are cleared; temporary network failures preserve the cached session for retry.
- TypeScript and mobile diff validation passed after session verification was added.
- Added the authenticated driver app shell with Home, Trips, and Profile routes plus shared bottom navigation.
- Added a truthful Trips empty state until dispatcher assignment APIs are available.
- Added Profile details from the authenticated user and secure sign-out from both Home and Profile.
- TypeScript and mobile diff validation passed for the authenticated app shell.
- Product architecture and development context saved in `TRANSITOPS_MOBILE_ARCHITECTURE.md`.
- Teammate built the driver Trips list page (`mobile/src/app/trips.tsx`) with trip cards, empty state, and error handling.
- Teammate built the `getTrips` API client (`mobile/src/features/trips/tripsApi.ts`) calling `GET /api/trips` with the driver JWT.
- Teammate's dashboard (`dashboard.tsx`) already shows active trip detection from the trips list.
- Server trip CRUD and full status lifecycle (`Draft → Planned → Assigned → Dispatched → Completed/Cancelled`) confirmed complete in `tripService.js` and `tripModel.js`.
- GPS live tracking implementation plan drafted and agreed — see **Live Location Implementation Plan** section below (updated).

## Current Status

- Authenticated app shell complete: Home, Trips, Profile navigation working.
- Trips list page (teammate) fetches real trips from `GET /api/trips` with driver RBAC filtering.
- Dashboard shows active trip detection (`Dispatched` or `Assigned`) and upcoming trip count.
- **GPS foreground tracking is implemented:** the mobile app requests foreground permission, watches active-trip coordinates, sends authenticated updates, and the server stores tenant-scoped vehicle locations.
- **Trip detail and owner map paths are implemented:** drivers can start/end trips, and the web Live Map polls active locations and renders markers and breadcrumbs.
- **Production GPS work remains pending:** native background-task verification, GPS-disabled handling, backend rate limiting and retention cleanup, and real Android end-to-end verification.
- A new EAS build is required after `expo-location` or native location configuration changes.
- `mobile/.env` points to `http://10.7.22.144:5001/api` for LAN testing.
- `npm run lint` is not usable (no ESLint config). Do not configure unless specifically needed.
- All future implementation changes must remain inside the `mobile/` directory (server changes go in `server/`).

## Next Steps

### Immediate — GPS Tracking (Phase L0–L4)

1. **Completed:** server location migration, model, service, controller, routes, and tenant/RBAC integration.
2. **Completed:** mobile `expo-location` setup, permission-aware service, authenticated API client, tracking hook, trip detail lifecycle, and trips navigation.
3. **Completed:** owner web Live Map with active-location polling, marker rendering, and trip breadcrumb retrieval.
4. **Completed:** bounded retry/backoff for transient uploads, GPS-quality gating, and explicit driver offline/stale states without overlapping sends.
5. **Completed:** background location task, startup task registration, secure active-trip handoff, Android foreground-service configuration, one-time permission checks, and tracking cleanup on trip/session end.
6. **Completed:** add server timestamp bounds and accuracy/speed/heading validation; rate limiting and location retention cleanup remain pending.
7. **Pending:** run a new native EAS build and verify the complete flow on a real Android device.

## Phasewise Implementation Plan

### Phase 0: Baseline and device verification

**Goal:** Confirm that the existing app loads reliably on the Android development build.

**How:** Start Expo with `npm start`, open the QR code in the custom `mobile` development build, and verify the login route, keyboard behavior, scrolling, and screen layout on a real phone. Keep the first pass UI-only and use local validation rather than pretending authentication succeeded against an unavailable API.

**Validation:** Run `npx --no-install tsc --noEmit`, then manually test empty fields, invalid email, password visibility, keyboard dismissal, and the loading/error states. Record any device-specific issue here before continuing.

**Exit condition:** The login screen opens from a clean development-server reload and remains usable on the target Android device.

### Phase 1: Mobile foundation and design system

**Goal:** Establish a consistent structure before adding business features.

**How:** Organize the Expo Router routes into authentication and driver-app areas. Create shared theme tokens for colors, typography, spacing, radii, shadows, and status colors. Add reusable primitives only where they remove repeated UI logic, such as screen containers, buttons, text fields, loading states, and error banners.

**Validation:** Check all touched routes with TypeScript, verify light/dark behavior if supported, and inspect narrow Android screens for clipping, overlap, and keyboard problems.

**Exit condition:** Routes, shared styling, and reusable controls have one clear ownership location and the login screen uses them without visual regressions.

### Phase 2: Environment and API client

**Goal:** Give the mobile app a controlled way to communicate with the shared backend.

**How:** Add mobile-only environment configuration using Expo's public environment variable convention, with a development LAN URL that can be changed without editing request code. Create one API client responsible for the base URL, JSON headers, timeouts, response parsing, and normalized errors. Do not put database credentials or private secrets in the app.

**Validation:** Test the client against a health or authentication endpoint when available, test an unreachable server, and confirm that secrets are not bundled into the client configuration.

**Exit condition:** A request can be made from the phone to the intended backend address and failures produce useful UI-safe errors.

### Phase 3: Authentication and session lifecycle

**Goal:** Replace demo login behavior with real driver authentication.

**How:** Implement the login request against the confirmed backend contract. Add loading, invalid-credentials, network-error, and session-expired states. Store only the required session material using secure device storage; never store plaintext passwords. Add an auth provider that restores a session at startup, protects driver routes, and supports logout.

**Validation:** Test successful login, wrong credentials, offline login, app restart with a valid session, logout, expired/invalid token, and a driver account attempting an unauthorized resource.

**Exit condition:** A valid driver reaches the driver area, an invalid session reaches login, and logout removes local session state.

### Phase 4: Invitation activation and deep linking

**Goal:** Support the intended admin-created driver onboarding flow.

**How:** Define the invitation URL contract with the backend team before hardcoding a production domain. Configure the existing Expo scheme for development deep links. Parse and validate the invitation token, show the activation form, submit new credentials to the activation endpoint, and transition into the authenticated state. Handle expired, already-used, malformed, and missing tokens.

**Validation:** Open a development invitation link while the app is closed and open, test invalid and expired tokens, prevent passwords from appearing in URLs or logs, and verify that a used invitation cannot activate a second time.

**Exit condition:** A valid invitation opens the app's activation route and completes onboarding without requiring a second invitation.

### Phase 5: Driver profile and app shell

**Goal:** Give the driver a dependable authenticated shell.

**How:** Add Home, Trips, and Profile navigation with route protection. Load the driver's own profile from the API, show safe loading and empty states, and add logout in Profile. Keep driver data scoped to the authenticated user and do not expose admin-only collections.

**Validation:** Test navigation after login, refresh/restart behavior, missing profile data, slow responses, logout, and direct navigation to protected routes.

**Exit condition:** The driver can move between their permitted areas and never sees another user's information.

### Phase 6: Dashboard and assignment retrieval

**Goal:** Make the driver's next operational task immediately visible.

**How:** Implement the today's-assignment request against the confirmed endpoint. Model scheduled, in-progress, completed, and cancelled states. Build the dashboard around the primary assignment, vehicle, route, scheduled time, and one clear action. Use mock data only behind a temporary data boundary when the backend endpoint is unavailable.

**Validation:** Test no assignment, one assignment, multiple upcoming assignments, cancelled assignment, stale data, retry, and slow network states on a real phone.

**Exit condition:** A driver can understand today's work from the first authenticated screen and can open assignment details.

### Phase 7: Trip lifecycle

**Goal:** Let a driver safely start, operate, and complete an assigned trip.

**How:** Add trip detail, start-trip, active-trip, and end-trip flows. Confirm the backend performs the state transition and enforce valid transitions in the UI as well. Disable duplicate submissions, show confirmation for consequential actions, and refresh server state after mutations.

**Validation:** Test start, duplicate taps, server rejection, app reload during an active trip, end-trip confirmation, already-completed trips, and network loss during each mutation.

**Exit condition:** The mobile state and backend state agree after every successful trip action.

### Phase 8: Location tracking and operational incidents

**Goal:** Add only the operational telemetry the backend and dispatcher workflows can support.

**How:** Confirm tracking frequency and permissions first. Request foreground/background location only when required, explain permission needs in the UI, queue or retry updates when appropriate, and stop tracking when the trip ends. Add issue categories and an emergency flow based on an agreed operational response, not just a database insert.

**Validation:** Test denied and revoked permissions, poor GPS, offline mode, battery-conscious update behavior, trip start/stop boundaries, incident submission failure, and repeated emergency taps.

**Exit condition:** Location and incident behavior is permission-aware, bounded, recoverable, and visible to the dispatcher through the backend contract.

### Phase 9: Notifications and reliability

**Goal:** Make the app dependable under normal transport-work conditions.

**How:** Add push notification registration only after the notification backend is ready. Add consistent loading, retry, empty, offline, and session-expiry states. Define what can be cached locally and what must always come from the server. Avoid silently showing stale operational data.

**Validation:** Test cold-start notification navigation, revoked notification permission, intermittent connectivity, request retries, app backgrounding, token expiry, and recovery after a server restart.

**Exit condition:** The driver receives actionable updates and can recover from expected network and session failures without being trapped in a broken screen.

### Phase 10: Security, accessibility, and release readiness

**Goal:** Prepare the mobile app for real device testing and release builds.

**How:** Review route authorization assumptions, sensitive logging, secure storage, deep-link token handling, dependency health, accessibility labels, contrast, touch targets, Android back behavior, and screen-reader order. Add focused tests for auth, invitation reuse, protected data, and trip state transitions. Update app configuration only when a native rebuild is genuinely required.

**Validation:** Run TypeScript checks, focused automated tests when present, manual Android smoke tests, release-like builds, and a final API contract review.

**Exit condition:** The app has no known blocker in authentication, onboarding, driver authorization, trip actions, or recovery behavior.

## Working Rules For Each Phase

1. Before editing, identify the owning route, component, or API boundary and write one falsifiable implementation hypothesis.
2. Make the smallest mobile-only edit that tests that hypothesis.
3. Run the narrowest available validation immediately after the edit.
4. Test the changed flow on the Android development build when it affects user-visible behavior.
5. Update this file with the completed work, validation result, blockers, and next phase.
6. Do not create an EAS build for ordinary JavaScript, TypeScript, UI, navigation, or API-client changes.
7. Do not put backend credentials, passwords, or other private secrets in the mobile app.

## Live Location Implementation Plan

### Objective

Allow an authenticated driver to share the phone's current location with the owner dashboard while the driver is on an active trip. Tracking must be operationally useful, permission-aware, battery-conscious, and stoppable.

### Phase L0: Confirm the backend contract

Before writing the GPS sender, confirm the backend contract with the owner/dashboard team. The mobile app needs:

```text
POST /api/locations
```

The request should accept latitude, longitude, accuracy, captured timestamp, and the active trip identifier. The backend must identify the driver from the JWT and derive the permitted vehicle/trip relationship server-side. The mobile app must not be trusted to submit an arbitrary driver or vehicle ID.

The contract must define accepted units, timestamp format, accuracy behavior, authentication failures, duplicate handling, rate limits, and response shape. The owner dashboard also needs a read or realtime contract for the latest permitted vehicle location.

**Exit condition:** The request and response examples are agreed and the backend can accept an authenticated test location without exposing another driver's data.

### Phase L1: Add the native location capability

Add `expo-location` inside `mobile/` using the Expo-compatible installer. Configure only the permissions required for the first milestone. This is a native dependency, so the code can be prepared without a new build, but device testing requires a new development build.

**Exit condition:** The package is installed, the Android permission configuration is reviewed, and a development build containing the native module is available when GPS testing begins.

### Phase L2: Build a permission-aware location service

Create a mobile location service with explicit operations for requesting permission, reading the current position, starting updates, stopping updates, and reporting service errors. Request foreground permission only when the driver starts an active trip, explain why it is needed, and handle denied, restricted, unavailable, and revoked permissions.

Do not request background location in the first milestone unless the product explicitly requires tracking while the app is not visible. Background tracking needs additional Android permission/configuration, foreground-service behavior, battery testing, and a clearer user disclosure.

**Exit condition:** Permission state is visible to the app, denied permission produces an actionable state, and location updates can be started and stopped without leaking watchers.

### Phase L3: Connect tracking to the trip lifecycle

Tracking must be controlled by server-confirmed trip state:

```text
SCHEDULED -> driver starts trip -> IN_PROGRESS -> driver ends trip -> COMPLETED
								   |
								   -> location tracking active
```

Start tracking only after the backend confirms the trip is `IN_PROGRESS`. Stop tracking immediately after a successful end-trip response, logout, session invalidation, or unrecoverable permission loss. App restart behavior must query the server before deciding whether tracking should resume.

**Exit condition:** No location watcher runs while logged out, before a trip starts, or after a trip ends.

### Phase L4: Send locations reliably

Use a five-second update target only during an active trip, with a bounded implementation:

- Do not send if the location has not changed enough to be operationally meaningful.
- Include latitude, longitude, accuracy, captured timestamp, and trip ID.
- Attach the stored JWT through the authenticated API helper.
- Allow only one location request in flight at a time.
- Apply a timeout and bounded retry/backoff for network failures.
- Do not create an unbounded offline queue in the first milestone.
- Record the last successful send time and surface stale status to the driver.

If battery or network testing shows that five seconds is excessive, use a 10- to 15-second interval or significant-location updates and document the operational tradeoff.

**Exit condition:** The backend receives authenticated, correctly shaped updates at the chosen interval without duplicate request buildup or runaway retries.

### Phase L5: Add driver-facing tracking state

The active-trip screen should show a small, clear status such as `Location sharing active`, `Waiting for permission`, `GPS unavailable`, `Offline`, or `Last updated 12 seconds ago`. It should not expose raw technical logs to the driver.

The driver must be able to understand when tracking is active and what action is needed. A denied permission should block or clearly warn about starting a trip according to the agreed operational policy; it must not silently claim that the vehicle is being tracked.

**Exit condition:** Each permission, GPS, network, and backend state has a usable UI state and the driver can tell whether the owner is receiving recent data.

### Phase L6: Owner dashboard integration

The owner dashboard should display the latest permitted location with its captured time, accuracy, vehicle, driver, and trip status. It should distinguish live data from stale data and show a last-seen timestamp when updates stop.

The first version may poll the backend. Realtime transport such as WebSockets or Server-Sent Events can follow after the location write path is reliable. The dashboard must enforce owner authorization and never allow one owner to view another owner's vehicles.

**Exit condition:** An owner can see the correct vehicle move during an active test trip and sees an explicit stale/offline state when updates stop.

### L7: Reliability, privacy, and security verification

Test the complete lifecycle on a real Android device:

1. Logged-out user cannot start tracking.
2. Permission denied and permission later granted.
3. GPS disabled or inaccurate.
4. Active trip starts tracking only after server confirmation.
5. Five-second sends do not overlap.
6. Phone temporarily loses network and recovers.
7. App backgrounds and resumes.
8. App is killed and restarted during an active trip.
9. Trip ends and location updates stop.
10. Logout and token expiry stop tracking and clear local state.
11. Owner sees only authorized vehicle data.
12. No password, token, or sensitive location data is written to ordinary logs.

Location collection should be limited to the operational purpose, active-trip window, and retention policy agreed by the product owners. The app should explain location use before requesting permission.

**Final exit condition:** The mobile, backend, and owner dashboard agree on trip state, location freshness, authorization, failure behavior, and data retention.

## GPS Implementation Status (2026-09-23)

### Completed

- Foreground permission request and permission-state handling on the driver trip screen.
- Active-trip GPS watcher using Expo Location with a five-second target and five-meter movement filter.
- Authenticated `POST /api/locations` updates with server-derived driver and vehicle relationships.
- Tenant-scoped active-location and breadcrumb APIs with driver/owner authorization checks.
- Owner Live Map polling every six seconds with vehicle markers and breadcrumb trails.
- Bounded upload retry with 1-second and 3-second backoff; client errors are not retried and uploads remain single-flight.
- Driver offline/retrying status and owner stale-signal classification based on `captured_at`.
- Low-quality fixes over 100 meters accuracy are withheld from upload and shown as a driver-facing GPS quality warning.

### Pending

- Native verification of background tracking after app minimize, screen lock, app restart, and force-stop behavior.
- GPS-disabled and revoked-permission handling on a real Android device.
- Backend rate limiting, retention policy, and cleanup job.
- Native EAS rebuild and full mobile-to-server-to-owner acceptance test.

## Development Commands

From `mobile/`:

```powershell
npm start
```

For network connection issues:

```powershell
npx expo start --tunnel
```

For TypeScript validation:

```powershell
npx --no-install tsc --noEmit
```

A new EAS build is reserved for native dependency/configuration changes or release builds.
