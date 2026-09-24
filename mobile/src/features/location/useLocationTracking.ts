import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Coordinates,
  getLastBackgroundLocation,
  getLocationPermissions,
  requestLocationPermissions,
  startBackgroundLocationUpdates,
  stopBackgroundLocationUpdates,
  watchLocationUpdates,
} from './locationService';

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

  const subscriptionRef = useRef<{ remove: () => void } | null>(null);

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

  useEffect(() => {
    if (!isTripActive || !tripId || !token) return undefined;

    let isMounted = true;
    const refreshLastSend = async () => {
      const lastBackgroundLocation = await getLastBackgroundLocation();
      if (!isMounted || !lastBackgroundLocation) return;
      const lastSent = new Date(lastBackgroundLocation.sentAt);
      setLastSentAt(lastSent);
      setSendCount((current) => Math.max(current, 1));
      if (Date.now() - lastSent.getTime() > 30000) {
        setConnectionState('offline');
        setTrackingError('GPS sync is stale. Checking the connection...');
      } else {
        setConnectionState('online');
        setTrackingError(null);
      }
    };

    void refreshLastSend();
    const interval = setInterval(refreshLastSend, 5000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [isTripActive, tripId, token]);

  // Manage watcher lifecycle based on isTripActive, tripId, and token
  useEffect(() => {
    // If trip is not active or token/tripId is missing, stop tracking immediately
    if (!isTripActive || !tripId || !token) {
      if (subscriptionRef.current) {
        subscriptionRef.current.remove();
        subscriptionRef.current = null;
      }
      void stopBackgroundLocationUpdates();
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

        await startBackgroundLocationUpdates(currentTripId, currentToken);
        if (isCancelled) {
          await stopBackgroundLocationUpdates();
          return;
        }

        // Keep a foreground watcher for immediate driver-facing telemetry.
        // Uploading is owned by the background task to avoid duplicate points.
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
      if (subscriptionRef.current) {
        subscriptionRef.current.remove();
        subscriptionRef.current = null;
      }
      void stopBackgroundLocationUpdates();
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
