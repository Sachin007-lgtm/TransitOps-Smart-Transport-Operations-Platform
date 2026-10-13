import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DriverNav } from '@/components/driver/DriverNav';
import { LanguageToggle } from '@/components/driver/LanguageToggle';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { getCurrentUser } from '@/features/auth/authApi';
import { getTrips, Trip } from '@/features/trips/tripsApi';

export default function ProfileScreen() {
  const { isRestoring, signOut, token, user } = useAuth();
  const { t, driverStatus } = useLanguage();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [driverState, setDriverState] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  async function loadProfileData() {
    if (!token) return;
    try {
      const [loadedTrips, currentUser] = await Promise.all([getTrips(token), getCurrentUser(token)]);
      setTrips(loadedTrips);
      setDriverState(currentUser.driver_status ?? null);
    } catch {
      // Keep the last values; the profile is still usable offline.
    }
  }

  useEffect(() => {
    void loadProfileData();
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isRestoring) {
    return null;
  }

  if (!user) {
    return <Redirect href="/" />;
  }

  async function handleRefresh() {
    setIsRefreshing(true);
    await loadProfileData();
    setIsRefreshing(false);
  }

  async function handleSignOut() {
    await signOut();
    router.replace('/');
  }

  const currentStatus = driverState ?? user.driver_status ?? null;
  const completedCount = trips.filter(trip => trip.status === 'Completed').length;
  const inTransitCount = trips.filter(trip => trip.status === 'Dispatched').length;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => void handleRefresh()} tintColor="#D97D00" />}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.eyebrow}>{t('account')}</Text>
        <Text style={styles.title}>{t('yourProfile')}</Text>
        <LanguageToggle />

        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{user.name.charAt(0).toUpperCase()}</Text>
          </View>
          <Text style={styles.name}>{user.name}</Text>
          <Text style={styles.role}>{user.role}</Text>

          {currentStatus ? (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>{t('driverStatusLabel')}</Text>
              <Text style={styles.detailValue}>{driverStatus(currentStatus)}</Text>
            </View>
          ) : null}

          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{trips.length}</Text>
              <Text style={styles.statLabel}>{t('totalTrips')}</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{completedCount}</Text>
              <Text style={styles.statLabel}>{t('completedTrips')}</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{inTransitCount}</Text>
              <Text style={styles.statLabel}>{t('inTransitTrips')}</Text>
            </View>
          </View>
        </View>

        <Pressable onPress={handleSignOut} style={styles.signOutButton}>
          <Text style={styles.signOutText}>{t('signOut')}</Text>
        </Pressable>
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
    flexGrow: 1,
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
  profileCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E1E8',
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 28,
    padding: 24,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: '#4B2D42',
    borderRadius: 32,
    height: 64,
    justifyContent: 'center',
    width: 64,
  },
  avatarText: {
    color: '#FFF8FB',
    fontSize: 24,
    fontWeight: '800',
  },
  name: {
    color: '#2A2030',
    fontSize: 22,
    fontWeight: '800',
    marginTop: 14,
  },
  role: {
    color: '#D97D00',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginTop: 5,
    textTransform: 'uppercase',
  },
  detailRow: {
    alignSelf: 'stretch',
    borderTopColor: '#E5E1E8',
    borderTopWidth: 1,
    marginTop: 20,
    paddingTop: 14,
  },
  detailLabel: {
    color: '#7D7382',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  detailValue: {
    color: '#2A2030',
    fontSize: 15,
    marginTop: 5,
  },
  statsRow: {
    alignSelf: 'stretch',
    borderTopColor: '#E5E1E8',
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
    paddingTop: 16,
  },
  statBox: {
    alignItems: 'center',
    backgroundColor: '#F7F5F8',
    borderRadius: 12,
    flex: 1,
    paddingVertical: 12,
  },
  statValue: {
    color: '#2A2030',
    fontSize: 22,
    fontWeight: '800',
  },
  statLabel: {
    color: '#7D7382',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
    marginTop: 3,
    textAlign: 'center',
  },
  signOutButton: {
    alignItems: 'center',
    borderColor: '#C93737',
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 22,
    paddingVertical: 14,
  },
  signOutText: {
    color: '#C93737',
    fontSize: 15,
    fontWeight: '800',
  },
});
