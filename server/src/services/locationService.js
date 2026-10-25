const Location = require('../models/locationModel');
const Trip = require('../models/tripModel');
const { haversineMeters } = require('../utils/geo');
const { query } = require('../config/db');

class LocationServiceError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

const GEOFENCE_RADIUS_METERS = 500; // 500-meter proximity radius for arrival

/**
 * Determine geofence milestone event based on current coordinate and trip endpoints.
 */
function evaluateGeofence(trip, lat, lng) {
  let geofence_status = 'IN_TRANSIT';
  let triggerPickup = false;
  let triggerDest = false;

  if (trip.origin_lat != null && trip.origin_lng != null) {
    const distToPickup = haversineMeters([lat, lng], [trip.origin_lat, trip.origin_lng]);
    if (distToPickup <= GEOFENCE_RADIUS_METERS) {
      geofence_status = 'ARRIVED_PICKUP';
      if (!trip.arrived_pickup_at) {
        triggerPickup = true;
      }
    }
  }

  if (trip.dest_lat != null && trip.dest_lng != null) {
    const distToDest = haversineMeters([lat, lng], [trip.dest_lat, trip.dest_lng]);
    if (distToDest <= GEOFENCE_RADIUS_METERS) {
      geofence_status = 'ARRIVED_DESTINATION';
      if (!trip.arrived_dest_at) {
        triggerDest = true;
      }
    }
  }

  return { geofence_status, triggerPickup, triggerDest };
}

const locationService = {
  /**
   * Record a GPS location point for a trip.
   * Server derives vehicle_id and driver_id from the trip record.
   * Drivers can only post locations for their own dispatched trips.
   */
  recordLocation: async (data, user) => {
    const {
      trip_id,
      latitude,
      longitude,
      speed,
      heading,
      accuracy,
      altitude,
      battery_level,
      is_offline_sync,
      captured_at
    } = data;

    if (!trip_id) {
      throw new LocationServiceError('trip_id is required.', 400);
    }

    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);

    if (isNaN(lat) || lat < -90 || lat > 90) {
      throw new LocationServiceError('Valid latitude between -90 and 90 is required.', 400);
    }

    if (isNaN(lng) || lng < -180 || lng > 180) {
      throw new LocationServiceError('Valid longitude between -180 and 180 is required.', 400);
    }

    const parsedCapturedAt = captured_at === undefined ? new Date() : new Date(captured_at);
    if (isNaN(parsedCapturedAt.getTime())) {
      throw new LocationServiceError('captured_at must be a valid timestamp.', 400);
    }

    const now = Date.now();
    const capturedTime = parsedCapturedAt.getTime();
    if (capturedTime < now - 48 * 60 * 60 * 1000 || capturedTime > now + 5 * 60 * 1000) {
      throw new LocationServiceError('captured_at must be within the last 48 hours and not more than 5 minutes in the future.', 400);
    }

    const parsedAccuracy = accuracy == null ? null : parseFloat(accuracy);
    if (parsedAccuracy != null && (isNaN(parsedAccuracy) || parsedAccuracy < 0 || parsedAccuracy > 1000)) {
      throw new LocationServiceError('accuracy must be between 0 and 1000 meters.', 400);
    }

    const parsedSpeed = speed == null ? null : parseFloat(speed);
    if (parsedSpeed != null && (isNaN(parsedSpeed) || parsedSpeed < 0)) {
      throw new LocationServiceError('speed must be a non-negative number.', 400);
    }

    const parsedHeading = heading == null ? null : parseFloat(heading);
    if (parsedHeading != null && (isNaN(parsedHeading) || parsedHeading < 0 || parsedHeading > 360)) {
      throw new LocationServiceError('heading must be between 0 and 360 degrees.', 400);
    }

    const parsedBattery = battery_level == null ? null : Math.max(0, Math.min(100, parseInt(battery_level, 10)));

    // Lookup trip strictly scoped to user's organization
    const trip = await Trip.findById(trip_id, user.organization_id);
    if (!trip) {
      throw new LocationServiceError('Trip not found or belongs to another organization.', 404);
    }

    // RBAC: Drivers can only record locations for their own assigned trips
    if (user.role === 'Driver') {
      if (!user.driver_id || trip.driver_id !== user.driver_id) {
        throw new LocationServiceError('Forbidden: You can only record location for trips assigned to you.', 403);
      }
    }

    // Operational lifecycle check: Tracking is only valid for Dispatched trips
    if (trip.status !== 'Dispatched') {
      throw new LocationServiceError(
        `Cannot record location for a trip in '${trip.status}' status. Location tracking is only active during 'Dispatched' status.`,
        400
      );
    }

    const { geofence_status, triggerPickup, triggerDest } = evaluateGeofence(trip, lat, lng);

    // If geofence threshold crossed, stamp arrival timestamps on trip
    if (triggerPickup) {
      await query(
        'UPDATE trips SET arrived_pickup_at = $1 WHERE id = $2 AND organization_id = $3 AND arrived_pickup_at IS NULL',
        [parsedCapturedAt, trip.id, user.organization_id]
      );
    }
    if (triggerDest) {
      await query(
        'UPDATE trips SET arrived_dest_at = $1 WHERE id = $2 AND organization_id = $3 AND arrived_dest_at IS NULL',
        [parsedCapturedAt, trip.id, user.organization_id]
      );
    }

    const recorded = await Location.create({
      trip_id: trip.id,
      vehicle_id: trip.vehicle_id || null,
      driver_id: trip.driver_id || null,
      organization_id: user.organization_id,
      latitude: lat,
      longitude: lng,
      speed: parsedSpeed,
      heading: parsedHeading,
      accuracy: parsedAccuracy,
      altitude: altitude != null && !isNaN(parseFloat(altitude)) ? parseFloat(altitude) : null,
      battery_level: parsedBattery,
      is_offline_sync: Boolean(is_offline_sync),
      geofence_status,
      captured_at: parsedCapturedAt
    });

    return {
      ...recorded,
      geofence_status,
      triggered_pickup: triggerPickup,
      triggered_destination: triggerDest
    };
  },

  /**
   * Batch sync offline buffered GPS pings.
   * Useful when drivers pass through dead zones and dump accumulated pings upon reconnection.
   */
  syncBatchLocations: async (data, user) => {
    const { trip_id, pings } = data;
    if (!trip_id) {
      throw new LocationServiceError('trip_id is required.', 400);
    }
    if (!Array.isArray(pings) || pings.length === 0) {
      throw new LocationServiceError('pings array must not be empty.', 400);
    }
    if (pings.length > 500) {
      throw new LocationServiceError('Batch size cannot exceed 500 pings per sync.', 400);
    }

    const trip = await Trip.findById(trip_id, user.organization_id);
    if (!trip) {
      throw new LocationServiceError('Trip not found or belongs to another organization.', 404);
    }

    if (user.role === 'Driver') {
      if (!user.driver_id || trip.driver_id !== user.driver_id) {
        throw new LocationServiceError('Forbidden: You can only record location for trips assigned to you.', 403);
      }
    }

    if (trip.status !== 'Dispatched') {
      throw new LocationServiceError(
        `Cannot record location for a trip in '${trip.status}' status. Location tracking is only active during 'Dispatched' status.`,
        400
      );
    }

    // Sort pings chronologically
    const sortedPings = [...pings].sort(
      (a, b) => new Date(a.captured_at || 0).getTime() - new Date(b.captured_at || 0).getTime()
    );

    let triggeredPickupTimestamp = null;
    let triggeredDestTimestamp = null;

    const validatedPings = [];
    for (const p of sortedPings) {
      const lat = parseFloat(p.latitude);
      const lng = parseFloat(p.longitude);
      if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        continue; // skip malformed coordinates in batch
      }

      const capturedAt = p.captured_at ? new Date(p.captured_at) : new Date();
      const { geofence_status, triggerPickup, triggerDest } = evaluateGeofence(trip, lat, lng);

      if (triggerPickup && !triggeredPickupTimestamp && !trip.arrived_pickup_at) {
        triggeredPickupTimestamp = capturedAt;
      }
      if (triggerDest && !triggeredDestTimestamp && !trip.arrived_dest_at) {
        triggeredDestTimestamp = capturedAt;
      }

      validatedPings.push({
        trip_id: trip.id,
        vehicle_id: trip.vehicle_id || null,
        driver_id: trip.driver_id || null,
        latitude: lat,
        longitude: lng,
        speed: p.speed != null ? parseFloat(p.speed) : null,
        heading: p.heading != null ? parseFloat(p.heading) : null,
        accuracy: p.accuracy != null ? parseFloat(p.accuracy) : null,
        altitude: p.altitude != null ? parseFloat(p.altitude) : null,
        battery_level: p.battery_level != null ? parseInt(p.battery_level, 10) : null,
        is_offline_sync: true,
        geofence_status,
        captured_at: capturedAt
      });
    }

    if (validatedPings.length === 0) {
      throw new LocationServiceError('No valid coordinate points provided in batch.', 400);
    }

    // Update trip timestamps if geofences were entered during the offline period
    if (triggeredPickupTimestamp) {
      await query(
        'UPDATE trips SET arrived_pickup_at = $1 WHERE id = $2 AND organization_id = $3 AND arrived_pickup_at IS NULL',
        [triggeredPickupTimestamp, trip.id, user.organization_id]
      );
    }
    if (triggeredDestTimestamp) {
      await query(
        'UPDATE trips SET arrived_dest_at = $1 WHERE id = $2 AND organization_id = $3 AND arrived_dest_at IS NULL',
        [triggeredDestTimestamp, trip.id, user.organization_id]
      );
    }

    const insertedRows = await Location.createBatch(validatedPings, user.organization_id);

    return {
      synced_count: insertedRows.length,
      trip_id: trip.id,
      triggered_pickup: Boolean(triggeredPickupTimestamp),
      triggered_destination: Boolean(triggeredDestTimestamp),
      latest_point: insertedRows[insertedRows.length - 1]
    };
  },

  /**
   * Retrieve the latest location of all active/dispatched trips in the organization.
   */
  getLatestActiveLocations: async (user) => {
    return await Location.getLatestActiveLocations(user.organization_id);
  },

  /**
   * Retrieve location trail/breadcrumbs for a trip.
   */
  getTripHistory: async (tripId, user, limit = 500) => {
    const trip = await Trip.findById(tripId, user.organization_id);
    if (!trip) {
      throw new LocationServiceError('Trip not found or belongs to another organization.', 404);
    }

    if (user.role === 'Driver') {
      if (!user.driver_id || trip.driver_id !== user.driver_id) {
        throw new LocationServiceError('Forbidden: You may only view locations for trips assigned to you.', 403);
      }
    }

    return await Location.getTripHistory(tripId, user.organization_id, limit);
  }
};

module.exports = {
  locationService,
  LocationServiceError
};
