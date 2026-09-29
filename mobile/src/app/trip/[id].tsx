import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import * as DocumentPicker from 'expo-document-picker';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/contexts/AuthContext';
import { requestTripLocationPermissions } from '@/features/location/locationService';
import { useLocationTracking } from '@/features/location/useLocationTracking';
import {
  createMaintenanceReport,
  getTripMaintenanceReport,
  getTripById,
  MaintenanceReport,
  MaintenancePriority,
  RepairReceiptFile,
  Trip,
  resolveMaintenanceReport,
  updateTripLoadingMilestone,
  updateMaintenanceReportStatus,
  uploadPendingMaintenanceReceipt,
  updateTripStatus,
} from '@/features/trips/tripsApi';

export default function TripDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { token, user, isRestoring } = useAuth();

  const [trip, setTrip] = useState<Trip | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const [maintenanceFormOpen, setMaintenanceFormOpen] = useState(false);
  const [maintenanceDescription, setMaintenanceDescription] = useState('');
  const [maintenancePriority, setMaintenancePriority] = useState<MaintenancePriority>('Routine');
  const [maintenanceReport, setMaintenanceReport] = useState<MaintenanceReport | null>(null);
  const [repairCostInput, setRepairCostInput] = useState('');
  const [repairReceipt, setRepairReceipt] = useState<RepairReceiptFile | null>(null);
  const [receiptPending, setReceiptPending] = useState(false);

  const tripId = id ? String(id) : null;
  const isDispatched = trip?.status === 'Dispatched';
  const isMaintenanceFixing = maintenanceReport?.status === 'Acknowledged';

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
    isTripActive: trip ? isDispatched : null,
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
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to load trip details.');
    } finally {
      setIsLoading(false);
    }
  }, [token, tripId]);

  useEffect(() => {
    loadTrip();
  }, [loadTrip]);

  useEffect(() => {
    if (!token || !tripId) {
      setMaintenanceReport(null);
      return undefined;
    }
    let isMounted = true;
    getTripMaintenanceReport(tripId, token)
      .then((report) => {
        if (!isMounted) return;
        setMaintenanceReport(report);
        if (report?.repair_cost != null) setRepairCostInput(String(report.repair_cost));
      })
      .catch(() => {
        if (isMounted) setMaintenanceReport(null);
      });
    return () => { isMounted = false; };
  }, [token, tripId]);

  if (isRestoring) {
    return null;
  }

  if (!user) {
    return <Redirect href="/" />;
  }

  async function handleStartTrip() {
    if (!token || !tripId) return;

    try {
      setActionLoading(true);
      const permission = await requestTripLocationPermissions();
      if (!permission.granted) {
        Alert.alert(
          'Location permission required',
          'Allow location access all the time so TransitOps can keep sharing the trip when the screen is locked.',
          permission.canAskAgain
            ? [{ text: 'OK' }]
            : [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Open Settings', onPress: () => Linking.openSettings() },
              ]
        );
        return;
      }
    } catch (error) {
      Alert.alert('Location setup failed', error instanceof Error ? error.message : 'Please check location settings.');
      return;
    } finally {
      setActionLoading(false);
    }

    const batteryMessage = Platform.OS === 'android'
      ? 'For reliable background tracking, set TransitOps battery usage to Unrestricted in Android Settings. You can do this now or change it later.'
      : 'Live location sharing will continue during this trip.';

    Alert.alert(
      'Start Trip',
      `Are you ready to depart? Live GPS location sharing will begin automatically.\n\n${batteryMessage}`,
      [
        { text: 'Cancel', style: 'cancel' },
        ...(Platform.OS === 'android'
          ? [{ text: 'Battery Settings', onPress: () => Linking.openSettings() }]
          : []),
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
      const updated = await updateTripStatus(tripId, 'Completed', token);
      setTrip(updated);
      Alert.alert('Trip Completed', 'Great job! Live GPS sharing has ended and fleet assets have been updated.');
    } catch (err) {
      Alert.alert('Unable to Complete Trip', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleLoadingMilestone(action: 'loaded' | 'unloaded') {
    if (!token || !tripId) return;
    try {
      setActionLoading(true);
      const updated = await updateTripLoadingMilestone(tripId, action, token);
      setTrip(updated);
      Alert.alert(action === 'loaded' ? 'Load Confirmed' : 'Unload Confirmed',
        action === 'loaded' ? 'The truck is marked as loaded.' : 'The delivery is marked as unloaded. You can now end the trip.');
    } catch (err) {
      Alert.alert('Unable to Update Load Status', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleMaintenanceReport() {
    if (!token || !tripId) return;
    if (maintenanceDescription.trim().length < 5) {
      Alert.alert('Add issue details', 'Describe the vehicle issue in at least 5 characters.');
      return;
    }
    try {
      setActionLoading(true);
      const report = await createMaintenanceReport(tripId, maintenanceDescription, maintenancePriority, token);
      setMaintenanceReport(report);
      setMaintenanceDescription('');
      setMaintenanceFormOpen(false);
      Alert.alert('Report Sent', 'The fleet manager can now review this vehicle issue in Maintenance.');
    } catch (err) {
      Alert.alert('Unable to Send Report', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleMaintenanceStatus(status: 'Open' | 'Acknowledged') {
    if (!token || !maintenanceReport) return;
    try {
      setActionLoading(true);
      const updated = await updateMaintenanceReportStatus(maintenanceReport.id, status, token);
      setMaintenanceReport(updated);
    } catch (err) {
      Alert.alert('Unable to Update Issue', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setActionLoading(false);
    }
  }

  async function chooseRepairReceipt(): Promise<RepairReceiptFile | null> {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/jpeg', 'image/png'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets[0]) return null;
      const asset = result.assets[0];
      if (asset.size != null && asset.size > 10 * 1024 * 1024) {
        Alert.alert('Bill is too large', 'Choose a PDF or image no larger than 10 MB.');
        return null;
      }
      const extension = asset.name.toLowerCase().split('.').pop();
      const mimeType = asset.mimeType || (extension === 'pdf'
        ? 'application/pdf'
        : extension === 'png' ? 'image/png' : 'image/jpeg');
      const file = { uri: asset.uri, name: asset.name, mimeType };
      setRepairReceipt(file);
      setReceiptPending(false);
      return file;
    } catch (error) {
      Alert.alert('Unable to Select Bill', error instanceof Error ? error.message : 'Please try again.');
      return null;
    }
  }

  async function handleResolveMaintenanceReport() {
    if (!token || !maintenanceReport) return;
    const costText = repairCostInput.trim();
    const repairCost = Number(costText);
    if (!costText || !Number.isFinite(repairCost) || repairCost < 0) {
      Alert.alert('Enter repair cost', 'Enter the amount paid, or 0 if the repair had no cost.');
      return;
    }
    if (repairCost > 0 && !repairReceipt && !receiptPending) {
      Alert.alert('Bill required', 'Upload the bill now or mark the receipt as pending.');
      return;
    }

    try {
      setActionLoading(true);
      const fixedReport = await resolveMaintenanceReport(
        maintenanceReport.id,
        repairCost,
        repairCost > 0 && receiptPending && !repairReceipt,
        repairReceipt,
        token,
      );
      setMaintenanceReport(fixedReport);
      setRepairReceipt(null);
      Alert.alert('Issue Fixed', 'Repair cost recorded. You can continue the trip.');
    } catch (error) {
      Alert.alert('Unable to Complete Repair', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleUploadPendingReceipt() {
    if (!token || !maintenanceReport) return;
    const receipt = repairReceipt || await chooseRepairReceipt();
    if (!receipt) return;

    try {
      setActionLoading(true);
      const updated = await uploadPendingMaintenanceReceipt(maintenanceReport.id, receipt, token);
      setMaintenanceReport(updated);
      setRepairReceipt(null);
      Alert.alert('Bill Uploaded', 'The receipt is attached to maintenance history.');
    } catch (error) {
      Alert.alert('Unable to Upload Bill', error instanceof Error ? error.message : 'Please try again.');
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

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
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
                  <Text style={styles.statLabel}>ASSIGNED VEHICLE</Text>
                  <Text style={styles.statValue}>
                    {trip.vehicle?.name || trip.vehicle_name || (trip.vehicle?.registration_number || trip.vehicle_registration ? 'Vehicle' : 'Vehicle not assigned')}
                  </Text>
                  {trip.vehicle?.registration_number || trip.vehicle_registration ? (
                    <Text style={styles.detailValue}>{trip.vehicle?.registration_number || trip.vehicle_registration}</Text>
                  ) : null}
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
              ) : trip.status === 'Draft' || trip.status === 'Planned' ? (
                <View style={styles.idleTelemetryBox}>
                  <Text style={styles.idleTelemetryText}>
                    This trip is {trip.status.toLowerCase()}. Your dispatcher must assign it to you before you can start.
                  </Text>
                </View>
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
              <View style={styles.tripOperationsCard}>
                <Text style={styles.tripOperationsTitle}>DELIVERY CHECKPOINTS</Text>
                <View style={styles.checkpointStatusRow}>
                  <Text style={styles.checkpointStatusLabel}>Loading</Text>
                  <Text style={trip.loaded_at ? styles.checkpointStatusDone : styles.checkpointStatusWaiting}>
                    {trip.loaded_at ? 'Loaded' : 'Waiting to load'}
                  </Text>
                </View>
                {trip.loaded_at ? (
                  <View style={styles.checkpointStatusRow}>
                    <Text style={styles.checkpointStatusLabel}>Unloading</Text>
                    <Text style={trip.unloaded_at ? styles.checkpointStatusDone : styles.checkpointStatusWaiting}>
                      {trip.unloaded_at ? 'Unloaded' : 'Waiting to unload'}
                    </Text>
                  </View>
                ) : null}
                {isMaintenanceFixing ? (
                  <Text style={styles.tripPausedText}>Trip actions are paused until the issue is marked fixed.</Text>
                ) : null}
                {!trip.loaded_at ? (
                  <Pressable
                    accessibilityRole="button"
                    disabled={actionLoading || isMaintenanceFixing}
                    onPress={() => handleLoadingMilestone('loaded')}
                    style={({ pressed }) => [styles.loadActionButton, pressed && styles.actionButtonPressed, (actionLoading || isMaintenanceFixing) && styles.buttonDisabled]}
                  >
                    <Text style={styles.loadActionText}>Mark Loaded</Text>
                  </Pressable>
                ) : !trip.unloaded_at ? (
                  <Pressable
                    accessibilityRole="button"
                      disabled={actionLoading || isMaintenanceFixing}
                    onPress={() => handleLoadingMilestone('unloaded')}
                      style={({ pressed }) => [styles.unloadActionButton, pressed && styles.actionButtonPressed, (actionLoading || isMaintenanceFixing) && styles.buttonDisabled]}
                  >
                    <Text style={styles.unloadActionText}>Mark Unloaded</Text>
                  </Pressable>
                ) : (
                  <Text style={styles.checkpointCompleteText}>Loaded and unloaded. Ready to end trip.</Text>
                )}

                {maintenanceReport?.status === 'Resolved' ? (
                  <View style={styles.reportResolvedBox}>
                    <Text style={styles.reportResolvedTitle}>Issue fixed</Text>
                    <Text style={styles.reportResolvedText}>
                      Repair cost: ₹{Number(maintenanceReport.repair_cost || 0).toLocaleString('en-IN')}
                    </Text>
                    {maintenanceReport.receipt_pending ? (
                      <>
                        <Text style={styles.receiptPendingText}>Receipt pending</Text>
                        <Pressable
                          accessibilityRole="button"
                          disabled={actionLoading}
                          onPress={handleUploadPendingReceipt}
                          style={[styles.receiptUploadButton, actionLoading && styles.buttonDisabled]}
                        >
                          <Text style={styles.receiptUploadButtonText}>{actionLoading ? 'Uploading...' : 'Upload Bill'}</Text>
                        </Pressable>
                      </>
                    ) : maintenanceReport.receipt_file_name ? (
                      <Text style={styles.receiptUploadedText}>Bill uploaded: {maintenanceReport.receipt_file_name}</Text>
                    ) : null}
                  </View>
                ) : null}
                {maintenanceReport && maintenanceReport.status !== 'Resolved' ? (
                  <View style={styles.maintenanceWorkflow}>
                    <Text style={styles.maintenanceWorkflowTitle}>VEHICLE ISSUE · {maintenanceReport.priority.toUpperCase()}</Text>
                    <Text style={styles.maintenanceWorkflowDescription}>{maintenanceReport.description}</Text>
                    {maintenanceReport.status === 'Open' ? (
                      <Pressable
                        accessibilityRole="button"
                        disabled={actionLoading}
                        onPress={() => handleMaintenanceStatus('Acknowledged')}
                        style={[styles.maintenanceChoice, styles.maintenanceChoiceSelected]}
                      >
                        <Text style={[styles.maintenanceChoiceText, styles.maintenanceChoiceTextSelected]}>Fixing</Text>
                      </Pressable>
                    ) : (
                      <View style={[styles.maintenanceChoice, styles.maintenanceChoiceSelected]}>
                        <Text style={[styles.maintenanceChoiceText, styles.maintenanceChoiceTextSelected]}>Fixing</Text>
                      </View>
                    )}
                    {maintenanceReport.status === 'Acknowledged' ? (
                      <View style={styles.repairCloseoutForm}>
                        <Text style={styles.inputLabel}>REPAIR COST (₹)</Text>
                        <TextInput
                          keyboardType="decimal-pad"
                          onChangeText={setRepairCostInput}
                          placeholder="0.00"
                          placeholderTextColor="#9E94A3"
                          style={styles.maintenanceInput}
                          value={repairCostInput}
                        />
                        <Pressable
                          accessibilityRole="button"
                          disabled={actionLoading}
                          onPress={chooseRepairReceipt}
                          style={[styles.receiptUploadButton, actionLoading && styles.buttonDisabled]}
                        >
                          <Text style={styles.receiptUploadButtonText}>
                            {repairReceipt ? `Bill: ${repairReceipt.name}` : 'Upload repair bill'}
                          </Text>
                        </Pressable>
                        <Pressable
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: receiptPending }}
                          onPress={() => {
                            setReceiptPending(value => !value);
                            if (!receiptPending) setRepairReceipt(null);
                          }}
                          style={styles.receiptPendingToggle}
                        >
                          <View style={[styles.receiptCheckbox, receiptPending && styles.receiptCheckboxChecked]}>
                            {receiptPending ? <Text style={styles.receiptCheckmark}>✓</Text> : null}
                          </View>
                          <Text style={styles.receiptPendingToggleText}>Receipt not available yet</Text>
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          disabled={actionLoading}
                          onPress={handleResolveMaintenanceReport}
                          style={[styles.reportSubmitButton, actionLoading && styles.buttonDisabled]}
                        >
                          <Text style={styles.reportSubmitText}>{actionLoading ? 'Saving...' : 'Mark Fixed'}</Text>
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                ) : (
                  <>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => setMaintenanceFormOpen(open => !open)}
                      style={[styles.maintenanceToggle, maintenanceFormOpen && styles.maintenanceToggleActive]}
                    >
                      <Text style={styles.maintenanceToggleText}>
                        {maintenanceFormOpen ? 'Cancel maintenance report' : 'Report vehicle issue'}
                      </Text>
                      <View style={[styles.toggleTrack, maintenanceFormOpen && styles.toggleTrackActive]}>
                        <View style={[styles.toggleThumb, maintenanceFormOpen && styles.toggleThumbActive]} />
                      </View>
                    </Pressable>
                    {maintenanceFormOpen ? (
                  <View style={styles.maintenanceForm}>
                    <Text style={styles.inputLabel}>ISSUE DETAILS</Text>
                    <TextInput
                      multiline
                      maxLength={2000}
                      onChangeText={setMaintenanceDescription}
                      placeholder="Describe the vehicle issue"
                      placeholderTextColor="#9E94A3"
                      style={styles.maintenanceInput}
                      value={maintenanceDescription}
                    />
                    <Text style={styles.inputLabel}>PRIORITY</Text>
                    <View style={styles.priorityRow}>
                      {(['Routine', 'Urgent', 'Critical'] as const).map(priority => (
                        <Pressable
                          key={priority}
                          onPress={() => setMaintenancePriority(priority)}
                          style={[styles.priorityOption, maintenancePriority === priority && styles.priorityOptionSelected]}
                        >
                          <Text style={[styles.priorityOptionText, maintenancePriority === priority && styles.priorityOptionTextSelected]}>
                            {priority}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      disabled={actionLoading}
                      onPress={handleMaintenanceReport}
                      style={[styles.reportSubmitButton, actionLoading && styles.buttonDisabled]}
                    >
                      <Text style={styles.reportSubmitText}>{actionLoading ? 'Sending...' : 'Send to Maintenance'}</Text>
                    </Pressable>
                  </View>
                    ) : null}
                  </>
                )}
              </View>
            ) : null}

            {trip.status !== 'Dispatched' && maintenanceReport?.status === 'Resolved' && maintenanceReport.receipt_pending ? (
              <View style={styles.receiptPendingCard}>
                <Text style={styles.reportResolvedTitle}>Repair receipt pending</Text>
                <Text style={styles.reportResolvedText}>
                  Repair cost: ₹{Number(maintenanceReport.repair_cost || 0).toLocaleString('en-IN')}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  disabled={actionLoading}
                  onPress={handleUploadPendingReceipt}
                  style={[styles.receiptUploadButton, actionLoading && styles.buttonDisabled]}
                >
                  <Text style={styles.receiptUploadButtonText}>{actionLoading ? 'Uploading...' : 'Upload Bill'}</Text>
                </Pressable>
              </View>
            ) : null}

            {trip.status === 'Dispatched' && trip.loaded_at && trip.unloaded_at ? (
              <Pressable
                accessibilityRole="button"
                disabled={actionLoading || isMaintenanceFixing}
                onPress={handleConfirmComplete}
                style={({ pressed }) => [
                  styles.completeActionButton,
                  pressed && styles.actionButtonPressed,
                  (actionLoading || isMaintenanceFixing) && styles.buttonDisabled,
                ]}
              >
                <Text style={styles.completeActionText}>End Trip & Complete</Text>
              </Pressable>
            ) : null}
          </>
        ) : null}
      </ScrollView>

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
  tripOperationsCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E1E8',
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 8,
    marginBottom: 8,
    padding: 16,
  },
  tripOperationsTitle: {
    color: '#7D7382',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  checkpointStatusRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 9 },
  checkpointStatusLabel: { color: '#7D7382', fontSize: 12, fontWeight: '600' },
  checkpointStatusDone: { color: '#2E7D32', fontSize: 12, fontWeight: '800' },
  checkpointStatusWaiting: { color: '#9A6500', fontSize: 12, fontWeight: '700' },
  tripPausedText: { color: '#9A4D00', fontSize: 12, fontWeight: '700', marginBottom: 10 },
  loadActionButton: {
    alignItems: 'center',
    backgroundColor: '#F09A1B',
    borderRadius: 10,
    paddingVertical: 13,
  },
  loadActionText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  unloadActionButton: {
    alignItems: 'center',
    backgroundColor: '#2E7D32',
    borderRadius: 10,
    paddingVertical: 13,
  },
  unloadActionText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  checkpointCompleteText: { color: '#2E7D32', fontSize: 13, fontWeight: '700', paddingVertical: 8 },
  maintenanceToggle: {
    alignItems: 'center',
    borderColor: '#E5E1E8',
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  maintenanceToggleActive: { backgroundColor: '#FFF5E6', borderColor: '#E8A23A' },
  maintenanceToggleText: { color: '#2A2030', fontSize: 13, fontWeight: '700' },
  toggleTrack: { backgroundColor: '#B7B1BC', borderRadius: 10, height: 20, justifyContent: 'center', width: 36 },
  toggleTrackActive: { backgroundColor: '#D97D00' },
  toggleThumb: { backgroundColor: '#FFFFFF', borderRadius: 8, height: 16, marginLeft: 2, width: 16 },
  toggleThumbActive: { alignSelf: 'flex-end', marginLeft: 0, marginRight: 2 },
  maintenanceForm: { marginTop: 4 },
  maintenanceInput: {
    borderColor: '#E5E1E8',
    borderRadius: 10,
    borderWidth: 1,
    color: '#2A2030',
    fontSize: 14,
    minHeight: 86,
    marginTop: 6,
    padding: 12,
    textAlignVertical: 'top',
  },
  priorityRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  priorityOption: { borderColor: '#E5E1E8', borderRadius: 16, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7 },
  priorityOptionSelected: { backgroundColor: '#FFF0D9', borderColor: '#D97D00' },
  priorityOptionText: { color: '#7D7382', fontSize: 12, fontWeight: '700' },
  priorityOptionTextSelected: { color: '#8A4D00' },
  reportSubmitButton: { alignItems: 'center', backgroundColor: '#2A2030', borderRadius: 10, marginTop: 14, paddingVertical: 12 },
  reportSubmitText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  maintenanceWorkflow: {
    backgroundColor: '#F8F7F9',
    borderRadius: 10,
    marginTop: 12,
    padding: 12,
  },
  maintenanceWorkflowTitle: { color: '#7D7382', fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
  maintenanceWorkflowDescription: { color: '#2A2030', fontSize: 13, lineHeight: 18, marginTop: 6 },
  repairCloseoutForm: { borderTopColor: '#E5E1E8', borderTopWidth: 1, marginTop: 12, paddingTop: 4 },
  receiptUploadButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#D8D2DC',
    borderRadius: 9,
    borderWidth: 1,
    marginTop: 10,
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  receiptUploadButtonText: { color: '#4B2D42', fontSize: 12, fontWeight: '800' },
  receiptPendingToggle: { alignItems: 'center', flexDirection: 'row', gap: 9, marginTop: 12, paddingVertical: 4 },
  receiptCheckbox: {
    alignItems: 'center',
    borderColor: '#9E94A3',
    borderRadius: 4,
    borderWidth: 1,
    height: 19,
    justifyContent: 'center',
    width: 19,
  },
  receiptCheckboxChecked: { backgroundColor: '#4B2D42', borderColor: '#4B2D42' },
  receiptCheckmark: { color: '#FFFFFF', fontSize: 13, fontWeight: '800', lineHeight: 16 },
  receiptPendingToggleText: { color: '#4B4350', fontSize: 12, fontWeight: '600' },
  receiptPendingText: { color: '#9A6500', fontSize: 12, fontWeight: '800', marginTop: 6 },
  receiptUploadedText: { color: '#2E7D32', fontSize: 12, fontWeight: '700', marginTop: 6 },
  maintenanceChoiceRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  maintenanceChoice: {
    alignItems: 'center',
    borderColor: '#E5E1E8',
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    paddingVertical: 10,
  },
  maintenanceChoiceSelected: { backgroundColor: '#FFF0D9', borderColor: '#D97D00' },
  maintenanceChoiceText: { color: '#7D7382', fontSize: 13, fontWeight: '700' },
  maintenanceChoiceTextSelected: { color: '#8A4D00' },
  reportResolvedBox: { backgroundColor: '#ECF7EF', borderRadius: 10, marginTop: 12, padding: 12 },
  receiptPendingCard: { backgroundColor: '#FFF7E8', borderColor: '#F0D5A3', borderRadius: 12, borderWidth: 1, marginTop: 8, padding: 14 },
  reportResolvedTitle: { color: '#2E7D32', fontSize: 13, fontWeight: '800' },
  reportResolvedText: { color: '#456B4A', fontSize: 12, marginTop: 4 },
  actionButtonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  inputLabel: {
    color: '#7D7382',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginTop: 18,
  },
});
