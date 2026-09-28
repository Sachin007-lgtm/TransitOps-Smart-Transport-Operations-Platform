import { Platform } from 'react-native';
import { getItem, setItem } from '@/utils/secureStorage';
import { sendLocationUpdate } from './locationApi';
import { ApiError } from '@/utils/api';

export const LOCATION_TASK_NAME = 'transitops-active-trip-location';
export const ACTIVE_TRIP_ID_KEY = 'transitops.location.trip-id';
export const ACTIVE_TRIP_TOKEN_KEY = 'transitops.location.token';
export const LAST_BACKGROUND_LOCATION_KEY = 'transitops.location.last-sent';

// TaskManager and background location tasks only work on native.
// On web, we skip registration entirely — foreground watcher handles telemetry.
if (Platform.OS !== 'web') {
  // Dynamic requires to prevent bundler from including native-only modules on web
  const TaskManager = require('expo-task-manager');
  const Location = require('expo-location');

  TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }: { data: any; error: any }) => {
    if (error || !data) return;

    const locations = (data as { locations?: any[] }).locations;
    const location = locations?.[locations.length - 1];
    if (!location) return;

    const [tripId, token] = await Promise.all([
      getItem(ACTIVE_TRIP_ID_KEY),
      getItem(ACTIVE_TRIP_TOKEN_KEY),
    ]);

    if (!tripId || !token) return;
    if (location.coords.accuracy != null && location.coords.accuracy > 100) return;

    const previousValue = await getItem(LAST_BACKGROUND_LOCATION_KEY);
    if (previousValue) {
      try {
        const previous = JSON.parse(previousValue) as { latitude: number; longitude: number; sentAt?: number };
        const heartbeatDue = !previous.sentAt || Date.now() - previous.sentAt >= 30000;
        if (!heartbeatDue && distanceInMeters(previous.latitude, previous.longitude, location.coords.latitude, location.coords.longitude) < 5) {
          return;
        }
      } catch {
        // Ignore malformed local state and send the current valid fix.
      }
    }

    const payload = {
      trip_id: tripId,
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      accuracy: location.coords.accuracy,
      speed: location.coords.speed,
      heading: location.coords.heading,
      altitude: location.coords.altitude,
      captured_at: new Date(location.timestamp).toISOString(),
    };

    const retryDelays = [1000, 3000];
    for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
      try {
        await sendLocationUpdate(payload, token);
        break;
      } catch (requestError) {
        const isClientError = requestError instanceof ApiError && requestError.status >= 400 && requestError.status < 500;
        if (isClientError || attempt === retryDelays.length) return;
        await new Promise(resolve => setTimeout(resolve, retryDelays[attempt]));
      }
    }

    await setItem(
      LAST_BACKGROUND_LOCATION_KEY,
      JSON.stringify({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy,
        timestamp: location.timestamp,
        sentAt: Date.now(),
      })
    );
  });
}

function distanceInMeters(firstLatitude: number, firstLongitude: number, secondLatitude: number, secondLongitude: number) {
  const earthRadius = 6371000;
  const latitudeDelta = ((secondLatitude - firstLatitude) * Math.PI) / 180;
  const longitudeDelta = ((secondLongitude - firstLongitude) * Math.PI) / 180;
  const firstLatitudeRadians = (firstLatitude * Math.PI) / 180;
  const secondLatitudeRadians = (secondLatitude * Math.PI) / 180;
  const value =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(firstLatitudeRadians) * Math.cos(secondLatitudeRadians) * Math.sin(longitudeDelta / 2) ** 2;

  return 2 * earthRadius * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

