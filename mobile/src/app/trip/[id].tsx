import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/contexts/AuthContext';
import { useLocationTracking } from '@/features/location/useLocationTracking';
import { getTripById, Trip, updateTripStatus } from '@/features/trips/tripsApi';

export default function TripDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { token, user, isRestoring } = useAuth();

  const [trip, setTrip] = useState<Trip | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Complete Trip modal state
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [actualDistanceInput, setActualDistanceInput] = useState('');

  const tripId = id ? String(id) : null;
  const isDispatched = trip?.status === 'Dispatched';

  // Live Location Tracking Hook
  const {
    isTracking,
    permissionStatus,
    lastLocation,
    lastSentAt,
    trackingError,
    connectionState,
    gpsQuality,
    sendCount,
    requestPermission,
  } = useLocationTracking({
    tripId: tripId,
    isTripActive: isDispatched,
    token: token ?? null,
  });
  const isLocationStale = lastSentAt ? Date.now() - lastSentAt.getTime() > 30000 : true;

  const loadTrip = useCallback(async () => {
    if (!token || !tripId) return;
    try {
      setIsLoading(true);
      setErrorMessage('');
      const data = await getTripById(tripId, token);
      setTrip(data);
      if (data.planned_distance) {
        setActualDistanceInput(String(data.planned_distance));
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to load trip details.');
    } finally {
      setIsLoading(false);
    }
  }, [token, tripId]);

  useEffect(() => {
    loadTrip();
  }, [loadTrip]);

  if (isRestoring) {
    return null;
  }

  if (!user) {
    return <Redirect href="/" />;
  }

  async function handleStartTrip() {
    if (!token || !tripId) return;

    Alert.alert(
      'Start Trip',
      'Are you ready to depart? Live GPS location sharing will begin automatically.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Start Trip',
          onPress: async () => {
            try {
              setActionLoading(true);
              const updated = await updateTripStatus(tripId, 'Dispatched', token);
              setTrip(updated);
            } catch (err) {
              Alert.alert('Unable to Start Trip', err instanceof Error ? err.message : 'Please check your connection.');
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  }

  async function handleConfirmComplete() {
    if (!token || !tripId) return;

    try {
      setActionLoading(true);
      const dist = parseFloat(actualDistanceInput);
      const extra: { actual_distance?: number; actual_arrival?: string } = {
        actual_arrival: new Date().toISOString(),
      };
      if (!isNaN(dist) && dist > 0) {
        extra.actual_distance = dist;
      }

      const updated = await updateTripStatus(tripId, 'Completed', token, extra);
      setTrip(updated);
      setShowCompleteModal(false);
      Alert.alert('Trip Completed', 'Great job! Live GPS sharing has ended and fleet assets have been updated.');
    } catch (err) {
      Alert.alert('Unable to Complete Trip', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.headerBar}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
        >
          <Text style={styles.backButtonText}>← Back</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Trip #{tripId}</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {isLoading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator color="#D97D00" size="large" />
            <Text style={styles.loadingText}>Loading trip details...</Text>
          </View>
        ) : errorMessage ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>Error Loading Trip</Text>
            <Text style={styles.errorSubtitle}>{errorMessage}</Text>
            <Pressable onPress={loadTrip} style={styles.retryButton}>
              <Text style={styles.retryButtonText}>Retry</Text>
            </Pressable>
          </View>
        ) : trip ? (
          <>
            {/* Route Summary Card */}
            <View style={styles.card}>
              <View style={styles.routeHeader}>
                <View style={styles.statusBadge}>
                  <Text style={styles.statusBadgeText}>{trip.status.toUpperCase()}</Text>
                </View>
                {trip.cargo_weight ? (
                  <Text style={styles.cargoText}>{trip.cargo_weight} kg</Text>
                ) : null}
              </View>

              <Text style={styles.routeTitle}>{trip.origin}</Text>
              <Text style={styles.routeArrow}>↓</Text>
              <Text style={styles.routeTitle}>{trip.destination}</Text>

              {trip.planned_route ? (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Planned Route</Text>
                  <Text style={styles.detailValue}>{trip.planned_route}</Text>
                </View>
              ) : null}

              <View style={styles.statsRow}>
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>DISTANCE</Text>
                  <Text style={styles.statValue}>
                    {trip.planned_distance ? `${trip.planned_distance} km` : '--'}
                  </Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>VEHICLE</Text>
                  <Text style={styles.statValue}>
                    {trip.vehicle_registration || trip.vehicle_name || 'Assigned'}
                  </Text>
                </View>
              </View>
            </View>

            {/* GPS Live Telemetry Section */}
            <View style={styles.card}>
              <Text style={styles.cardSectionTitle}>OPERATIONAL TELEMETRY</Text>

              {isDispatched ? (
                <>
                  <View style={styles.telemetryStatusRow}>
                    <View
                      style={[
                        styles.indicatorDot,
                        isTracking ? styles.indicatorGreen : styles.indicatorAmber,
                      ]}
                    />
                    <Text style={styles.telemetryTitle}>
                      {gpsQuality === 'poor'
                        ? 'GPS accuracy is poor'
                        : connectionState === 'offline'
                        ? 'Offline - retrying GPS sync'
                        : isTracking
                        ? isLocationStale
                          ? 'GPS update is stale'
                          : 'Live GPS Sharing Active'
                        : permissionStatus === 'denied'
                        ? 'GPS Permission Required'
                        : 'Connecting GPS...'}
                    </Text>
                  </View>

                  {permissionStatus === 'denied' ? (
                    <View style={styles.permissionBox}>
                      <Text style={styles.permissionText}>
                        TransitOps needs device location permission to stream real-time trip progress to dispatchers.
                      </Text>
                      <Pressable onPress={requestPermission} style={styles.permissionButton}>
                        <Text style={styles.permissionButtonText}>Enable Location</Text>
                      </Pressable>
                    </View>
                  ) : null}

                  <View style={styles.gpsGrid}>
                    <View style={styles.gpsGridItem}>
                      <Text style={styles.gpsGridLabel}>TELEMETRY SYNCS</Text>
                      <Text style={styles.gpsGridValue}>{sendCount}</Text>
                    </View>
                    <View style={styles.gpsGridItem}>
                      <Text style={styles.gpsGridLabel}>LAST UPDATE</Text>
                      <Text style={styles.gpsGridValue}>
                        {lastSentAt ? lastSentAt.toLocaleTimeString() : 'Waiting...'}
                      </Text>
                    </View>
                    <View style={styles.gpsGridItem}>
                      <Text style={styles.gpsGridLabel}>LATITUDE</Text>
                      <Text style={styles.gpsGridValue}>
                        {lastLocation ? lastLocation.latitude.toFixed(5) : '--'}
                      </Text>
                    </View>
                    <View style={styles.gpsGridItem}>
                      <Text style={styles.gpsGridLabel}>LONGITUDE</Text>
                      <Text style={styles.gpsGridValue}>
                        {lastLocation ? lastLocation.longitude.toFixed(5) : '--'}
                      </Text>
                    </View>
                  </View>

                  {trackingError ? (
                    <Text style={styles.trackingErrorText}>{trackingError}</Text>
                  ) : null}
                </>
              ) : trip.status === 'Assigned' ? (
                <View style={styles.idleTelemetryBox}>
                  <Text style={styles.idleTelemetryText}>
                    GPS location streaming will start automatically once you tap "Start Trip".
                  </Text>
                </View>
              ) : trip.status === 'Completed' ? (
                <View style={styles.idleTelemetryBox}>
                  <Text style={styles.completedTelemetryText}>
                    ✓ Trip completed. Location tracking deactivated.
                  </Text>
                </View>
              ) : (
                <View style={styles.idleTelemetryBox}>
                  <Text style={styles.idleTelemetryText}>
                    Trip status: {trip.status}. Live tracking inactive.
                  </Text>
                </View>
              )}
            </View>

            {/* Lifecycle Action Buttons */}
            {trip.status === 'Assigned' ? (
              <Pressable
                accessibilityRole="button"
                disabled={actionLoading}
                onPress={handleStartTrip}
                style={({ pressed }) => [
                  styles.primaryActionButton,
                  pressed && styles.actionButtonPressed,
                  actionLoading && styles.buttonDisabled,
                ]}
              >
                {actionLoading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.primaryActionText}>Start Trip</Text>
                )}
              </Pressable>
            ) : null}

            {trip.status === 'Dispatched' ? (
              <Pressable
                accessibilityRole="button"
                disabled={actionLoading}
                onPress={() => setShowCompleteModal(true)}
                style={({ pressed }) => [
                  styles.completeActionButton,
                  pressed && styles.actionButtonPressed,
                  actionLoading && styles.buttonDisabled,
                ]}
              >
                <Text style={styles.completeActionText}>End Trip & Complete</Text>
              </Pressable>
            ) : null}
          </>
        ) : null}
      </ScrollView>

      {/* Complete Trip Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={showCompleteModal}
        onRequestClose={() => setShowCompleteModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Complete Trip #{tripId}</Text>
            <Text style={styles.modalSubtitle}>
              Please verify the final odometer reading or total actual distance driven.
            </Text>

            <Text style={styles.inputLabel}>ACTUAL DISTANCE (KM)</Text>
            <TextInput
              keyboardType="decimal-pad"
              onChangeText={setActualDistanceInput}
              placeholder="e.g. 25.5"
              placeholderTextColor="#9E94A3"
              style={styles.textInput}
              value={actualDistanceInput}
            />

            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setShowCompleteModal(false)}
                style={styles.modalCancelButton}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>

              <Pressable
                disabled={actionLoading}
                onPress={handleConfirmComplete}
                style={[styles.modalConfirmButton, actionLoading && styles.buttonDisabled]}
              >
                {actionLoading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalConfirmText}>Confirm & Finish</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: '#F3F2F5',
    flex: 1,
  },
  headerBar: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderBottomColor: '#E5E1E8',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  backButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  backButtonPressed: {
    opacity: 0.6,
  },
  backButtonText: {
    color: '#D97D00',
    fontSize: 15,
    fontWeight: '700',
  },
  headerTitle: {
    color: '#2A2030',
    fontSize: 16,
    fontWeight: '800',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  centerContainer: {
    alignItems: 'center',
    marginTop: 60,
  },
  loadingText: {
    color: '#7D7382',
    fontSize: 14,
    marginTop: 12,
  },
  errorCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#C93737',
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
  },
  errorTitle: {
    color: '#C93737',
    fontSize: 16,
    fontWeight: '800',
  },
  errorSubtitle: {
    color: '#7D7382',
    fontSize: 14,
    marginTop: 6,
  },
  retryButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#2A2030',
    borderRadius: 8,
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E1E8',
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 16,
    padding: 20,
  },
  routeHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  statusBadge: {
    backgroundColor: '#F0E7ED',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusBadgeText: {
    color: '#D97D00',
    fontSize: 11,
    fontWeight: '800',
  },
  cargoText: {
    color: '#7D7382',
    fontSize: 13,
    fontWeight: '600',
  },
  routeTitle: {
    color: '#2A2030',
    fontSize: 18,
    fontWeight: '800',
  },
  routeArrow: {
    color: '#D97D00',
    fontSize: 18,
    fontWeight: '800',
    marginVertical: 2,
  },
  detailRow: {
    borderTopColor: '#F3F2F5',
    borderTopWidth: 1,
    marginTop: 16,
    paddingTop: 12,
  },
  detailLabel: {
    color: '#7D7382',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  detailValue: {
    color: '#2A2030',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 4,
  },
  statsRow: {
    borderTopColor: '#F3F2F5',
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
    paddingTop: 14,
  },
  statBox: {
    flex: 1,
  },
  statLabel: {
    color: '#7D7382',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  statValue: {
    color: '#2A2030',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 4,
  },
  cardSectionTitle: {
    color: '#7D7382',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.1,
    marginBottom: 14,
  },
  telemetryStatusRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  indicatorDot: {
    borderRadius: 5,
    height: 10,
    width: 10,
  },
  indicatorGreen: {
    backgroundColor: '#2E7D32',
  },
  indicatorAmber: {
    backgroundColor: '#D97D00',
  },
  telemetryTitle: {
    color: '#2A2030',
    fontSize: 15,
    fontWeight: '700',
  },
  permissionBox: {
    backgroundColor: '#FFF9E6',
    borderColor: '#FFE082',
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 12,
    padding: 14,
  },
  permissionText: {
    color: '#7A5200',
    fontSize: 13,
    lineHeight: 18,
  },
  permissionButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#D97D00',
    borderRadius: 8,
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  permissionButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  gpsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 14,
  },
  gpsGridItem: {
    backgroundColor: '#F8F7F9',
    borderRadius: 10,
    flexBasis: '47%',
    padding: 12,
  },
  gpsGridLabel: {
    color: '#7D7382',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.7,
  },
  gpsGridValue: {
    color: '#2A2030',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 4,
  },
  trackingErrorText: {
    color: '#C93737',
    fontSize: 12,
    marginTop: 10,
  },
  idleTelemetryBox: {
    backgroundColor: '#F8F7F9',
    borderRadius: 10,
    padding: 14,
  },
  idleTelemetryText: {
    color: '#7D7382',
    fontSize: 13,
    lineHeight: 18,
  },
  completedTelemetryText: {
    color: '#2E7D32',
    fontSize: 13,
    fontWeight: '700',
  },
  primaryActionButton: {
    alignItems: 'center',
    backgroundColor: '#F09A1B',
    borderRadius: 14,
    marginTop: 8,
    paddingVertical: 16,
  },
  primaryActionText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  completeActionButton: {
    alignItems: 'center',
    backgroundColor: '#2A2030',
    borderRadius: 14,
    marginTop: 8,
    paddingVertical: 16,
  },
  completeActionText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  actionButtonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  modalOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    width: '100%',
  },
  modalTitle: {
    color: '#2A2030',
    fontSize: 18,
    fontWeight: '800',
  },
  modalSubtitle: {
    color: '#7D7382',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 6,
  },
  inputLabel: {
    color: '#7D7382',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginTop: 18,
  },
  textInput: {
    borderColor: '#E5E1E8',
    borderRadius: 10,
    borderWidth: 1,
    color: '#2A2030',
    fontSize: 15,
    fontWeight: '600',
    marginTop: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'flex-end',
    marginTop: 22,
  },
  modalCancelButton: {
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  modalCancelText: {
    color: '#7D7382',
    fontWeight: '700',
  },
  modalConfirmButton: {
    backgroundColor: '#2A2030',
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  modalConfirmText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
