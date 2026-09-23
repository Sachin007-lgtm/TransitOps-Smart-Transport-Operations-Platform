import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Coordinates,
  getLocationPermissions,
  requestLocationPermissions,
  watchLocationUpdates,
} from './locationService';
import { sendLocationUpdate } from './locationApi';
import { ApiError } from '@/utils/api';

type UseLocationTrackingOptions = {
  tripId: number | string | null;
  isTripActive: boolean;
  token: string | null;
};

export function useLocationTracking({
  tripId,
  isTripActive,
  token,
}: UseLocationTrackingOptions) {
  const [isTracking, setIsTracking] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<'undetermined' | 'granted' | 'denied'>('undetermined');
  const [lastLocation, setLastLocation] = useState<Coordinates | null>(null);
  const [lastSentAt, setLastSentAt] = useState<Date | null>(null);
  const [trackingError, setTrackingError] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<'online' | 'offline'>('online');
  const [gpsQuality, setGpsQuality] = useState<'good' | 'poor'>('good');
  const [sendCount, setSendCount] = useState(0);

  const isSendingRef = useRef(false);
  const subscriptionRef = useRef<{ remove: () => void } | null>(null);
  const lastSentLocationRef = useRef<Coordinates | null>(null);

  // Function for user to manually trigger permission prompt
  const requestPermission = useCallback(async (): Promise<boolean> => {
    try {
      const result = await requestLocationPermissions();
      if (result.granted) {
        setPermissionStatus('granted');
        setTrackingError(null);
        return true;
      } else {
        setPermissionStatus('denied');
        setTrackingError('Location permission was denied. Enable GPS in Settings to share location.');
        return false;
      }
    } catch (err) {
      setTrackingError('Failed to request location permissions.');
      return false;
    }
  }, []);

  // Check initial permission on mount
  useEffect(() => {
    let isMounted = true;
    getLocationPermissions()
      .then((res) => {
        if (!isMounted) return;
        if (res.granted) {
          setPermissionStatus('granted');
        } else if (res.canAskAgain) {
          setPermissionStatus('undetermined');
        } else {
          setPermissionStatus('denied');
        }
      })
      .catch(() => {
        if (isMounted) setPermissionStatus('undetermined');
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Manage watcher lifecycle based on isTripActive, tripId, and token
  useEffect(() => {
    // If trip is not active or token/tripId is missing, stop tracking immediately
    if (!isTripActive || !tripId || !token) {
      if (subscriptionRef.current) {
        subscriptionRef.current.remove();
        subscriptionRef.current = null;
      }
      setIsTracking(false);
      return;
    }

    let isCancelled = false;

    const currentTripId = tripId;
    const currentToken = token;

    async function startTracking() {
      if (!currentTripId || !currentToken) return;

      try {
        setTrackingError(null);

        // Ensure permission is granted
        const currentPerms = await getLocationPermissions();
        if (!currentPerms.granted) {
          const requested = await requestLocationPermissions();
          if (!requested.granted) {
            if (!isCancelled) {
              setPermissionStatus('denied');
              setTrackingError('Location permission required while trip is dispatched.');
              setIsTracking(false);
            }
            return;
          }
        }

        if (isCancelled) return;
        setPermissionStatus('granted');

        // Watch location updates (every ~5 seconds or 5 meters)
        const sub = await watchLocationUpdates(
          async (coords) => {
            if (isCancelled) return;
            setLastLocation(coords);

            if (coords.accuracy != null && coords.accuracy > 100) {
              setGpsQuality('poor');
              setTrackingError('GPS accuracy is too low. Waiting for a clearer location fix.');
              return;
            }
            setGpsQuality('good');

            const previousLocation = lastSentLocationRef.current;
            if (previousLocation && distanceInMeters(previousLocation, coords) < 5) {
              return;
            }

            // Bounded sending: only 1 in flight at a time
            if (isSendingRef.current) {
              return;
            }

            isSendingRef.current = true;
            try {
              await sendWithBoundedRetry(
                {
                  trip_id: currentTripId,
                  latitude: coords.latitude,
                  longitude: coords.longitude,
                  accuracy: coords.accuracy,
                  speed: coords.speed,
                  heading: coords.heading,
                  altitude: coords.altitude,
                  captured_at: new Date(coords.timestamp).toISOString(),
                },
                currentToken,
                () => isCancelled
              );

              if (!isCancelled) {
                lastSentLocationRef.current = coords;
                setLastSentAt(new Date());
                setSendCount((prev) => prev + 1);
                setConnectionState('online');
                setTrackingError(null);
              }
            } catch (sendErr) {
              if (!isCancelled) {
                const msg = sendErr instanceof Error ? sendErr.message : 'Telemetry sync failed';
                setConnectionState('offline');
                setTrackingError(msg);
              }
            } finally {
              isSendingRef.current = false;
            }
          },
          { timeInterval: 5000, distanceInterval: 5 }
        );

        if (isCancelled) {
          sub.remove();
        } else {
          subscriptionRef.current = sub;
          setIsTracking(true);
        }
      } catch (err) {
        if (!isCancelled) {
          const msg = err instanceof Error ? err.message : 'Failed to start GPS tracking.';
          setTrackingError(msg);
          setIsTracking(false);
        }
      }
    }

    startTracking();

    return () => {
      isCancelled = true;
      lastSentLocationRef.current = null;
      if (subscriptionRef.current) {
        subscriptionRef.current.remove();
        subscriptionRef.current = null;
      }
      setIsTracking(false);
    };
  }, [isTripActive, tripId, token]);

  return {
    isTracking,
    permissionStatus,
    lastLocation,
    lastSentAt,
    trackingError,
    connectionState,
    gpsQuality,
    sendCount,
    requestPermission,
  };
}

async function sendWithBoundedRetry(
  payload: Parameters<typeof sendLocationUpdate>[0],
  token: string,
  isCancelled: () => boolean
) {
  const retryDelays = [1000, 3000];

  for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
    if (isCancelled()) throw new Error('Location tracking stopped.');

    try {
      return await sendLocationUpdate(payload, token);
    } catch (error) {
      const isClientError = error instanceof ApiError && error.status >= 400 && error.status < 500;
      const isLastAttempt = attempt === retryDelays.length;
      if (isClientError || isLastAttempt) throw error;

      await new Promise((resolve) => setTimeout(resolve, retryDelays[attempt]));
    }
  }

  throw new Error('Telemetry sync failed.');
}

function distanceInMeters(first: Coordinates, second: Coordinates) {
  const earthRadius = 6371000;
  const latitudeDelta = ((second.latitude - first.latitude) * Math.PI) / 180;
  const longitudeDelta = ((second.longitude - first.longitude) * Math.PI) / 180;
  const firstLatitude = (first.latitude * Math.PI) / 180;
  const secondLatitude = (second.latitude * Math.PI) / 180;
  const value =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(firstLatitude) * Math.cos(secondLatitude) * Math.sin(longitudeDelta / 2) ** 2;

  return 2 * earthRadius * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}
