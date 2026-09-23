import * as Location from 'expo-location';

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
