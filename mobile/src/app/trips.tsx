import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DriverNav } from '@/components/driver/DriverNav';
import { useAuth } from '@/contexts/AuthContext';
import { getTrips, Trip } from '@/features/trips/tripsApi';

export default function TripsScreen() {
  const { isRestoring, token, user } = useAuth();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;

    let isMounted = true;
    setIsLoading(true);
    setError('');

    getTrips(token)
      .then((loadedTrips) => {
        if (isMounted) setTrips(loadedTrips);
      })
      .catch((requestError) => {
        if (isMounted) {
          setError(requestError instanceof Error ? requestError.message : 'Unable to load trips.');
        }
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [token]);

  if (isRestoring) {
    return null;
  }

  if (!user) {
    return <Redirect href="/" />;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <Text style={styles.eyebrow}>DRIVER OPERATIONS</Text>
        <Text style={styles.title}>Your trips</Text>
        <Text style={styles.subtitle}>Assignments from your dispatcher will appear here.</Text>

        {isLoading ? <ActivityIndicator color="#D97D00" style={styles.loader} /> : null}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {!isLoading && !error && trips.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyMark}>--</Text>
            <Text style={styles.emptyTitle}>No trips yet</Text>
            <Text style={styles.emptyDescription}>
              Once a trip is assigned to you, you will see its route, schedule, and status here.
            </Text>
          </View>
        ) : null}
        <FlatList
          data={trips}
          keyExtractor={(trip) => String(trip.id)}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(`/trip/${item.id}` as any)}
              style={({ pressed }) => [styles.tripCard, pressed && styles.tripCardPressed]}
            >
              <View style={styles.tripHeader}>
                <Text style={styles.tripRoute}>{item.origin} to {item.destination}</Text>
                <Text style={styles.tripStatus}>{item.status}</Text>
              </View>
              <Text style={styles.tripMeta}>
                {item.vehicle_registration || item.vehicle_name || 'Vehicle not assigned'}
              </Text>
              {item.start_time ? <Text style={styles.tripMeta}>{formatTripDate(item.start_time)}</Text> : null}
            </Pressable>
          )}
          scrollEnabled={false}
        />
      </View>
      <DriverNav />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: '#F3F2F5',
    flex: 1,
  },
  content: {
    flex: 1,
    padding: 24,
  },
  eyebrow: {
    color: '#D97D00',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  title: {
    color: '#2A2030',
    fontSize: 30,
    fontWeight: '800',
    marginTop: 9,
  },
  subtitle: {
    color: '#7D7382',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
  },
  emptyState: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E1E8',
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 42,
    paddingHorizontal: 24,
    paddingVertical: 38,
  },
  emptyMark: {
    color: '#D97D00',
    fontSize: 28,
    fontWeight: '800',
  },
  emptyTitle: {
    color: '#2A2030',
    fontSize: 20,
    fontWeight: '800',
    marginTop: 18,
  },
  emptyDescription: {
    color: '#7D7382',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
    textAlign: 'center',
  },
  loader: {
    marginTop: 40,
  },
  errorText: {
    color: '#C93737',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 28,
  },
  tripCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E1E8',
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 14,
    padding: 16,
  },
  tripCardPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.99 }],
  },
  tripHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  tripRoute: {
    color: '#2A2030',
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
  },
  tripStatus: {
    color: '#D97D00',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  tripMeta: {
    color: '#7D7382',
    fontSize: 13,
    marginTop: 8,
  },
});

function formatTripDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
