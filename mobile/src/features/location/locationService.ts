import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';

import {
  ACTIVE_TRIP_ID_KEY,
  ACTIVE_TRIP_TOKEN_KEY,
  LAST_BACKGROUND_LOCATION_KEY,
  LOCATION_TASK_NAME,
} from './locationTask';

export type LocationPermissionResult = {
  granted: boolean;
  canAskAgain: boolean;
  status: Location.PermissionStatus;
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

export async function requestLocationPermissions(): Promise<LocationPermissionResult> {
  const result = await Location.requestForegroundPermissionsAsync();
  return {
    granted: result.granted,
    canAskAgain: result.canAskAgain,
    status: result.status,
  };
}

export async function getLocationPermissions(): Promise<LocationPermissionResult> {
  const result = await Location.getForegroundPermissionsAsync();
  return {
    granted: result.granted,
    canAskAgain: result.canAskAgain,
    status: result.status,
  };
}

export async function startBackgroundLocationUpdates(
  tripId: number | string,
  token: string
): Promise<void> {
  const foreground = await Location.getForegroundPermissionsAsync();
  if (!foreground.granted) {
    throw new Error('Foreground location permission is required.');
  }

  let background = await Location.getBackgroundPermissionsAsync();
  if (!background.granted) {
    background = await Location.requestBackgroundPermissionsAsync();
  }
  if (!background.granted) {
    throw new Error('Background location permission is required to keep sharing while the app is closed.');
  }

  await SecureStore.setItemAsync(ACTIVE_TRIP_ID_KEY, String(tripId));
  await SecureStore.setItemAsync(ACTIVE_TRIP_TOKEN_KEY, token);

  const alreadyStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
  if (!alreadyStarted) {
    await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
      accuracy: Location.Accuracy.High,
      timeInterval: 5000,
      distanceInterval: 5,
      pausesUpdatesAutomatically: false,
      foregroundService: {
        notificationTitle: 'TransitOps trip tracking is active',
        notificationBody: 'Your location is being shared with fleet dispatch while this trip is active.',
        notificationColor: '#4B2D42',
      },
    });
  }
}

export async function stopBackgroundLocationUpdates(): Promise<void> {
  const started = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
  if (started) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
  }

  await Promise.all([
    SecureStore.deleteItemAsync(ACTIVE_TRIP_ID_KEY),
    SecureStore.deleteItemAsync(ACTIVE_TRIP_TOKEN_KEY),
    SecureStore.deleteItemAsync(LAST_BACKGROUND_LOCATION_KEY),
  ]);
}

export type LastBackgroundLocation = {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  timestamp: number;
  sentAt: number;
};

export async function getLastBackgroundLocation(): Promise<LastBackgroundLocation | null> {
  const value = await SecureStore.getItemAsync(LAST_BACKGROUND_LOCATION_KEY);
  if (!value) return null;

  try {
    return JSON.parse(value) as LastBackgroundLocation;
  } catch {
    return null;
  }
}

export async function getCurrentPosition(): Promise<Coordinates | null> {
  try {
    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
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

export async function watchLocationUpdates(
  onLocation: (coords: Coordinates) => void,
  options: { timeInterval?: number; distanceInterval?: number } = {}
): Promise<Location.LocationSubscription> {
  return await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.High,
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
