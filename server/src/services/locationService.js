const Location = require('../models/locationModel');
const Trip = require('../models/tripModel');

class LocationServiceError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
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
    if (capturedTime < now - 24 * 60 * 60 * 1000 || capturedTime > now + 5 * 60 * 1000) {
      throw new LocationServiceError('captured_at must be within the last 24 hours and not more than 5 minutes in the future.', 400);
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
      captured_at: parsedCapturedAt
    });

    return recorded;
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
