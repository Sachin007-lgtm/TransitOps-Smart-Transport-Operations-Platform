import { Redirect, router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DriverNav } from '@/components/driver/DriverNav';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { getTrips, Trip } from '@/features/trips/tripsApi';

export default function TripsScreen() {
  const { isRestoring, token, user } = useAuth();
  const { t, tripStatus } = useLanguage();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadTrips = useCallback(async (refresh = false) => {
    if (!token) return;
    if (refresh) setIsRefreshing(true);
    else setIsLoading(true);
    setError('');
    try {
      setTrips(await getTrips(token));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load trips.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [token]);

  useEffect(() => { void loadTrips(); }, [loadTrips]);

  if (isRestoring) {
    return null;
  }

  if (!user) {
    return <Redirect href="/" />;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => void loadTrips(true)} tintColor="#D97D00" />}
      >
        <Text style={styles.eyebrow}>{t('driverOperations')}</Text>
        <Text style={styles.title}>{t('yourTrips')}</Text>
        <Text style={styles.subtitle}>{t('assignmentsAppear')}</Text>

        {isLoading ? <ActivityIndicator color="#D97D00" style={styles.loader} /> : null}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {!isLoading && !error && trips.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyMark}>--</Text>
            <Text style={styles.emptyTitle}>{t('noTrips')}</Text>
            <Text style={styles.emptyDescription}>
              {t('noTripsDescription')}
            </Text>
          </View>
        ) : null}
        {trips.map(item => (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(`/trip/${item.id}` as any)}
              style={({ pressed }) => [styles.tripCard, pressed && styles.tripCardPressed]}
              key={item.id}
            >
              <View style={styles.tripHeader}>
                <Text style={styles.tripRoute}>{t('routeFromTo', { origin: item.origin, destination: item.destination })}</Text>
                <Text style={styles.tripStatus}>{tripStatus(item.status)}</Text>
              </View>
              <Text style={styles.tripMeta}>
                {item.vehicle?.name || item.vehicle_name || item.vehicle?.registration_number || item.vehicle_registration
                  ? `${item.vehicle?.name || item.vehicle_name || t('vehicleFallback')}${item.vehicle?.registration_number || item.vehicle_registration ? ` · ${item.vehicle?.registration_number || item.vehicle_registration}` : ''}`
                  : t('vehicleNotAssigned')}
              </Text>
              {item.start_time ? <Text style={styles.tripMeta}>{t('startsAt', { date: formatTripDate(item.start_time) })}</Text> : null}
            </Pressable>
        ))}
      </ScrollView>
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
