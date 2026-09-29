/**
 * locationService.ts
 *
 * Web-safe wrapper around expo-location and expo-secure-store.
 * On native (iOS/Android): uses expo-location + SecureStore (real GPS + encrypted storage).
 * On web (expo web / npm run web): uses browser navigator.geolocation + localStorage.
 *
 * Background location updates are not supported on web — this gracefully skips them.
 */

import { Platform } from 'react-native';
import { getItem, setItem, deleteItem } from '@/utils/secureStorage';
import {
  ACTIVE_TRIP_ID_KEY,
  ACTIVE_TRIP_TOKEN_KEY,
  LAST_BACKGROUND_LOCATION_KEY,
  LOCATION_TASK_NAME,
} from './locationTask';

const IS_WEB = Platform.OS === 'web';

// Lazy-import expo-location only on native to avoid crashes on web
let Location: typeof import('expo-location') | null = null;
if (!IS_WEB) {
  Location = require('expo-location');
}

export type LocationPermissionResult = {
  granted: boolean;
  canAskAgain: boolean;
  status: string;
};

export type Coordinates = {
  latitude: number;
  longitude: number;
  altitude?: number | null;
  accuracy?: number | null;
  heading?: number | null;
  speed?: number | null;
  timestamp: number;
};

export type LastBackgroundLocation = {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  timestamp: number;
  sentAt: number;
};

let backgroundOperation: Promise<void> = Promise.resolve();

function queueBackgroundOperation(operation: () => Promise<void>): Promise<void> {
  const nextOperation = backgroundOperation.then(operation, operation);
  backgroundOperation = nextOperation.catch(() => undefined);
  return nextOperation;
}

// ─── Permission APIs ─────────────────────────────────────────────────────────

export async function requestLocationPermissions(): Promise<LocationPermissionResult> {
  if (IS_WEB) {
    // Browser will prompt automatically when we call getCurrentPosition
    return { granted: true, canAskAgain: true, status: 'granted' };
  }
  const result = await Location!.requestForegroundPermissionsAsync();
  return {
    granted: result.granted,
    canAskAgain: result.canAskAgain,
    status: result.status,
  };
}

export async function getLocationPermissions(): Promise<LocationPermissionResult> {
  if (IS_WEB) {
    return { granted: true, canAskAgain: true, status: 'granted' };
  }
  const result = await Location!.getForegroundPermissionsAsync();
  return {
    granted: result.granted,
    canAskAgain: result.canAskAgain,
    status: result.status,
  };
}

export async function requestTripLocationPermissions(): Promise<LocationPermissionResult> {
  if (IS_WEB) {
    return { granted: true, canAskAgain: true, status: 'granted' };
  }

  const foreground = await Location!.getForegroundPermissionsAsync();
  const foregroundResult = foreground.granted
    ? foreground
    : await Location!.requestForegroundPermissionsAsync();

  if (!foregroundResult.granted) {
    return {
      granted: false,
      canAskAgain: foregroundResult.canAskAgain,
      status: foregroundResult.status,
    };
  }

  const background = await Location!.getBackgroundPermissionsAsync();
  const backgroundResult = background.granted
    ? background
    : await Location!.requestBackgroundPermissionsAsync();

  return {
    granted: backgroundResult.granted,
    canAskAgain: backgroundResult.canAskAgain,
    status: backgroundResult.status,
  };
}

// ─── Background location (native-only) ───────────────────────────────────────

export async function startBackgroundLocationUpdates(
  tripId: number | string,
  token: string
): Promise<void> {
  return queueBackgroundOperation(() => startBackgroundLocationUpdatesInternal(tripId, token));
}

async function startBackgroundLocationUpdatesInternal(
  tripId: number | string,
  token: string
): Promise<void> {
  if (IS_WEB) {
    await setItem(ACTIVE_TRIP_ID_KEY, String(tripId));
    await setItem(ACTIVE_TRIP_TOKEN_KEY, token);
    // Background location tasks are not available on web — silently skip.
    console.info('[LocationService] Background tracking not supported on web; using foreground only.');
    return;
  }

  const foreground = await Location!.getForegroundPermissionsAsync();
  if (!foreground.granted) {
    throw new Error('Foreground location permission is required.');
  }

  let background = await Location!.getBackgroundPermissionsAsync();
  if (!background.granted) {
    background = await Location!.requestBackgroundPermissionsAsync();
  }
  if (!background.granted) {
    throw new Error('Background location permission is required to keep sharing while the app is closed.');
  }

  await setItem(ACTIVE_TRIP_ID_KEY, String(tripId));
  await setItem(ACTIVE_TRIP_TOKEN_KEY, token);

  const alreadyStarted = await Location!.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
  if (alreadyStarted) {
    await Location!.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
  }
  await Location!.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
    accuracy: Location!.Accuracy.High,
    timeInterval: 5000,
    distanceInterval: 5,
    pausesUpdatesAutomatically: false,
    foregroundService: {
      notificationTitle: 'TransitOps trip tracking is active',
      notificationBody: 'Your location is being shared with fleet dispatch while this trip is active.',
      notificationColor: '#4B2D42',
      killServiceOnDestroy: false,
    },
  });
}

export async function stopBackgroundLocationUpdates(): Promise<void> {
  return queueBackgroundOperation(stopBackgroundLocationUpdatesInternal);
}

async function stopBackgroundLocationUpdatesInternal(): Promise<void> {
  if (!IS_WEB) {
    const started = await Location!.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
    if (started) {
      await Location!.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
    }
  }

  await Promise.all([
    deleteItem(ACTIVE_TRIP_ID_KEY),
    deleteItem(ACTIVE_TRIP_TOKEN_KEY),
    deleteItem(LAST_BACKGROUND_LOCATION_KEY),
  ]);
}

// ─── Last known background location ──────────────────────────────────────────

export async function getLastBackgroundLocation(): Promise<LastBackgroundLocation | null> {
  const value = await getItem(LAST_BACKGROUND_LOCATION_KEY);
  if (!value) return null;
  try {
    return JSON.parse(value) as LastBackgroundLocation;
  } catch {
    return null;
  }
}

export async function saveLastBackgroundLocation(location: LastBackgroundLocation): Promise<void> {
  await setItem(LAST_BACKGROUND_LOCATION_KEY, JSON.stringify(location));
}

// ─── One-shot position ────────────────────────────────────────────────────────

export async function getCurrentPosition(): Promise<Coordinates | null> {
  if (IS_WEB) {
    return new Promise((resolve) => {
      if (!navigator.geolocation) { resolve(null); return; }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          altitude: pos.coords.altitude,
          accuracy: pos.coords.accuracy,
          heading: pos.coords.heading,
          speed: pos.coords.speed,
          timestamp: pos.timestamp,
        }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
  }

  try {
    const location = await Location!.getCurrentPositionAsync({
      accuracy: Location!.Accuracy.Balanced,
    });
    return {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      altitude: location.coords.altitude,
      accuracy: location.coords.accuracy,
      heading: location.coords.heading,
      speed: location.coords.speed,
      timestamp: location.timestamp,
    };
  } catch (error) {
    console.warn('[LocationService] Failed to read current position:', error);
    return null;
  }
}

// ─── Continuous watcher ───────────────────────────────────────────────────────

export async function watchLocationUpdates(
  onLocation: (coords: Coordinates) => void,
  options: { timeInterval?: number; distanceInterval?: number } = {}
): Promise<{ remove: () => void }> {
  if (IS_WEB) {
    if (!navigator.geolocation) {
      console.warn('[LocationService] navigator.geolocation not available.');
      return { remove: () => {} };
    }
    const watchId = navigator.geolocation.watchPosition(
      (pos) => onLocation({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        altitude: pos.coords.altitude,
        accuracy: pos.coords.accuracy,
        heading: pos.coords.heading,
        speed: pos.coords.speed,
        timestamp: pos.timestamp,
      }),
      (err) => console.warn('[LocationService] watchPosition error:', err),
      { enableHighAccuracy: true, maximumAge: options.timeInterval ?? 5000 }
    );
    return { remove: () => navigator.geolocation.clearWatch(watchId) };
  }

  return await Location!.watchPositionAsync(
    {
      accuracy: Location!.Accuracy.High,
      timeInterval: options.timeInterval ?? 5000,
      distanceInterval: options.distanceInterval ?? 5,
    },
    (location) => {
      onLocation({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        altitude: location.coords.altitude,
        accuracy: location.coords.accuracy,
        heading: location.coords.heading,
        speed: location.coords.speed,
        timestamp: location.timestamp,
      });
    }
  );
}
