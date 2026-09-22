# TransitOps Mobile App Architecture & Development Context

## 1. Product Overview

TransitOps consists of an admin/dispatcher web application, a driver mobile application, a shared backend API, and a shared database.

The mobile app is for drivers. The web app is primarily for administrators and dispatchers. Both frontends communicate with the backend API; neither frontend accesses the database directly.

```text
Admin/Dispatcher Web App <-> Backend API <-> Database
Driver Mobile App        <-> Backend API
```

## 2. Mobile Development Setup

The Expo/EAS setup in `mobile/` is complete. A custom Android development build named `mobile` is installed on the phone alongside Expo Go.

Use the custom `mobile` development build for TransitOps testing, not Expo Go.

Normal development from this directory:

```powershell
npm start
```

This starts the Expo development server. QR-code connections and ordinary JavaScript, TypeScript, UI, navigation, and API changes do not require a new EAS build.

Use a tunnel if the phone cannot connect over the local network:

```powershell
npx expo start --tunnel
```

A new EAS build is needed only for native dependency changes, native Android configuration changes, a refreshed development build, or a production build.

## 3. Driver Onboarding

Drivers do not sign up independently. An admin creates each driver through the web Drivers page.

```text
Admin adds driver
  -> Backend creates driver
  -> Backend creates secure invitation
  -> Driver receives invitation link
  -> Link opens TransitOps mobile app
  -> Driver activates account
  -> Driver logs in
  -> Driver sees dashboard
```

Driver creation may include name, phone, email, license number, and employee ID. A newly created driver can initially have an `INVITED` status.

## 4. Invitation Requirements

Invitation links must contain a secure, temporary, single-use token and must not contain a password. The backend should store a token hash where practical, enforce expiration, and invalidate the invitation after successful use.

The final domain and URL structure must not be hardcoded until the backend/domain configuration is established.

## 5. Deep Linking and Activation

The intended future flow is:

```text
Driver taps invitation link
  -> TransitOps app opens
  -> App receives invitation token
  -> Account activation screen appears
  -> Driver creates a password
  -> Backend validates and consumes the token
  -> Driver is authenticated
```

Conceptual endpoint:

```text
POST /api/auth/activate
```

The backend must validate token existence, expiration, prior use, and driver ownership before activating the account.

## 6. Authentication

After activation, a driver logs in with email or phone and password. Passwords must never be stored in the mobile app. The eventual session design should use a short-lived access token, refresh token, and secure device storage.

The first mobile UI may use local/demo behavior while API contracts are being established, but production authentication must be backend-driven.

## 7. Roles and Authorization

Initial roles are:

- `ADMIN`: manages drivers, vehicles, routes, users, and configuration.
- `DISPATCHER`: views drivers, assigns and monitors trips, handles incidents, and communicates with drivers.
- `DRIVER`: views their own profile and assignments, starts and ends their own trips, sends location, reports incidents, and receives relevant notifications.

Authorization must be enforced by the backend. Hiding screens in the mobile app is not sufficient. A driver must not receive other drivers' data merely because they are authenticated.

## 8. Driver Dashboard

After login, the driver should immediately see the current operational task:

- Greeting and driver identity
- Today's assignment
- Route and destination
- Scheduled time
- Assigned vehicle
- View-trip action
- Start-trip action
- Home, Trips, and Profile navigation

The dashboard should stay simple and operationally focused.

## 9. Trips and Assignments

Assignments are controlled by the web app. A dispatcher selects a driver, vehicle, and route, then assigns a trip.

A conceptual trip includes:

```text
trip_id
driver_id
vehicle_id
route_id
scheduled_start
scheduled_end
status
```

Possible statuses are `SCHEDULED`, `IN_PROGRESS`, `COMPLETED`, and `CANCELLED`.

The mobile app should retrieve only the logged-in driver's assignments, for example through a future endpoint such as `GET /api/driver/today`.

Starting a trip changes `SCHEDULED` to `IN_PROGRESS`. Ending a trip changes `IN_PROGRESS` to `COMPLETED` and may record start/end times, locations, distance, driver, vehicle, and route.

## 10. Active Trip, Location, and Incidents

The active-trip experience may include route details, vehicle details, issue reporting, emergency action, and end-trip action.

If live tracking is required, the intended flow is:

```text
Phone GPS -> Mobile location service -> Periodic updates -> Backend API -> Dispatcher dashboard
```

Update frequency should balance accuracy, battery use, and network usage. Do not send GPS coordinates every second without an operational reason.

Potential incident categories include vehicle breakdown, accident, traffic issue, medical emergency, passenger issue, and other. Emergency behavior must be designed around real operational requirements; creating a database record alone is not necessarily sufficient.

## 11. Notifications

Future notifications may include new or changed trip assignments, cancellations, schedule changes, vehicle changes, and dispatcher messages. Push notification infrastructure comes after the core authentication and trip flow.

## 12. API Areas

Implement only the API areas needed for the current phase. Potential groups include:

```text
/api/auth
/api/drivers
/api/vehicles
/api/routes
/api/trips
/api/assignments
/api/locations
/api/incidents
/api/notifications
```

The mobile app should be built against defined backend API contracts and may use temporary mock data only where the backend contract is not yet available.

## 13. Recommended Implementation Order

1. Mobile foundation: structure, navigation, screens, theme, and environment configuration.
2. Authentication: login, invitations, activation, secure sessions, and logout.
3. Driver profile.
4. Driver dashboard and today's assignment.
5. Trip details, start trip, active trip, end trip, and history.
6. Location permissions and backend location updates.
7. Incident and emergency flows.
8. Push notifications.
9. Reliability: network failures, offline behavior, retries, loading states, and session expiry.
10. Security and device testing.
11. Production configuration and EAS release build.

## 14. Current Direction

The Expo/EAS setup is complete. Do not recreate the Expo project, repeat `eas init`, or create EAS builds for ordinary UI/code changes. The current implementation work should focus on the mobile application, beginning with the authentication and onboarding flow, while respecting the existing/shared backend contracts.

All mobile-only changes must remain inside the `mobile/` directory.
