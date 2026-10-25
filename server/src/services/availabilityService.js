const AvailabilityCheck = require('../models/availabilityCheckModel');
const Trip = require('../models/tripModel');
const Driver = require('../models/driverModel');
const Vehicle = require('../models/vehicleModel');

class AvailabilityServiceError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

function haversineDistanceKm(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return 6371 * c;
}

async function calculateRoadEta(driverLat, driverLng, pickupLat, pickupLng) {
  const mapboxToken = process.env.MAPBOX_ACCESS_TOKEN || process.env.VITE_MAPBOX_ACCESS_TOKEN;
  if (mapboxToken) {
    try {
      const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${driverLng},${driverLat};${pickupLng},${pickupLat}?overview=false&access_token=${mapboxToken}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const route = data.routes?.[0];
        if (route) {
          const roadDistanceKm = Math.round((route.distance / 1000) * 10) / 10;
          const systemEtaMinutes = Math.max(5, Math.round(route.duration / 60));
          return { roadDistanceKm, systemEtaMinutes };
        }
      }
    } catch (err) {
      console.warn('Mapbox Directions API fallback to routing heuristic:', err.message);
    }
  }

  // Fallback: Haversine distance with 1.35x Indian road network tortuosity factor & 40 km/h average commercial speed
  const straightKm = haversineDistanceKm(driverLat, driverLng, pickupLat, pickupLng);
  const roadDistanceKm = Math.max(1, Math.round(straightKm * 1.35 * 10) / 10);
  const systemEtaMinutes = Math.max(5, Math.round((roadDistanceKm / 40) * 60));
  return { roadDistanceKm, systemEtaMinutes };
}

const availabilityService = {
  /**
   * Manager requests availability and location ping for a driver on a trip.
   */
  requestCheck: async ({ trip_id, driver_id, pickup_latitude, pickup_longitude, notes }, user) => {
    if (!trip_id) throw new AvailabilityServiceError('trip_id is required.');
    if (!driver_id) throw new AvailabilityServiceError('driver_id is required.');

    const trip = await Trip.findById(trip_id, user.organization_id);
    if (!trip) throw new AvailabilityServiceError('Trip not found in your organization.', 404);

    const driver = await Driver.findById(driver_id, user.organization_id);
    if (!driver) throw new AvailabilityServiceError('Driver not found in your organization.', 404);

    // If pickup coordinates were not passed, default to Gandhinagar / Ahmedabad depot coordinates
    const pLat = pickup_latitude ? parseFloat(pickup_latitude) : 23.2156;
    const pLng = pickup_longitude ? parseFloat(pickup_longitude) : 72.6369;

    const check = await AvailabilityCheck.createRequest({
      organization_id: user.organization_id,
      trip_id,
      driver_id,
      requested_by: user.id || null,
      pickup_latitude: pLat,
      pickup_longitude: pLng,
      notes: notes || null
    });

    return check;
  },

  /**
   * Driver sends GPS location ping and claimed ETA in response to an availability check.
   */
  respondCheck: async ({
    check_id, driver_latitude, driver_longitude, driver_accuracy,
    driver_location_name, driver_claimed_minutes, driver_claimed_eta_text
  }, user) => {
    if (!check_id) throw new AvailabilityServiceError('check_id is required.');
    if (driver_latitude == null || driver_longitude == null) {
      throw new AvailabilityServiceError('Valid GPS coordinates (latitude & longitude) are required.');
    }

    const check = await AvailabilityCheck.findById(check_id, user.organization_id);
    if (!check) throw new AvailabilityServiceError('Availability check request not found.', 404);

    const lat = parseFloat(driver_latitude);
    const lng = parseFloat(driver_longitude);
    const pickupLat = check.pickup_latitude ? parseFloat(check.pickup_latitude) : 23.2156;
    const pickupLng = check.pickup_longitude ? parseFloat(check.pickup_longitude) : 72.6369;

    const { roadDistanceKm, systemEtaMinutes } = await calculateRoadEta(lat, lng, pickupLat, pickupLng);

    const claimedMins = driver_claimed_minutes != null ? parseInt(driver_claimed_minutes, 10) : systemEtaMinutes;
    const etaGapMinutes = systemEtaMinutes - claimedMins;

    let decisionRecommendation = 'FEASIBLE';
    if (etaGapMinutes >= 45 || (claimedMins > 0 && systemEtaMinutes >= claimedMins * 1.7 && etaGapMinutes >= 30)) {
      decisionRecommendation = 'HIGH_RISK_DELAY';
    } else if (systemEtaMinutes <= 40 && Math.abs(etaGapMinutes) <= 15) {
      decisionRecommendation = 'BEST_OPTION';
    }

    const updated = await AvailabilityCheck.respond(check_id, user.organization_id, {
      driver_latitude: lat,
      driver_longitude: lng,
      driver_accuracy: driver_accuracy ? parseFloat(driver_accuracy) : null,
      driver_location_name: driver_location_name || null,
      driver_claimed_minutes: claimedMins,
      driver_claimed_eta_text: driver_claimed_eta_text || `${claimedMins} minutes`,
      road_distance_km: roadDistanceKm,
      system_eta_minutes: systemEtaMinutes,
      eta_gap_minutes: etaGapMinutes,
      decision_recommendation: decisionRecommendation
    });

    return updated;
  },

  /**
   * Retrieve all availability checks for candidate drivers on a trip.
   */
  getTripChecks: async (trip_id, user) => {
    if (!trip_id) throw new AvailabilityServiceError('trip_id is required.');
    return AvailabilityCheck.findByTrip(trip_id, user.organization_id);
  },

  /**
   * Retrieve pending availability check requests for a driver (driver app/mobile view).
   */
  getDriverPendingChecks: async (driver_id, user) => {
    const dId = driver_id || user.driver_id;
    if (!dId) throw new AvailabilityServiceError('driver_id is required.');
    return AvailabilityCheck.findPendingForDriver(dId, user.organization_id);
  },

  /**
   * Manager decides to assign trip to a checked driver.
   */
  assignFromCheck: async (check_id, { vehicle_id }, user) => {
    const check = await AvailabilityCheck.findById(check_id, user.organization_id);
    if (!check) throw new AvailabilityServiceError('Availability check not found.', 404);

    if (vehicle_id) {
      const vehicle = await Vehicle.findById(vehicle_id, user.organization_id);
      if (!vehicle) throw new AvailabilityServiceError('Vehicle not found.', 404);
    }

    // Update trip assignment
    await Trip.update(check.trip_id, user.organization_id, {
      driver_id: check.driver_id,
      vehicle_id: vehicle_id || undefined
    });

    // Mark trip as Assigned if currently Draft or Planned
    const trip = await Trip.findById(check.trip_id, user.organization_id);
    if (trip && ['Draft', 'Planned'].includes(trip.status)) {
      await Trip.updateStatus(check.trip_id, user.organization_id, 'Assigned');
    }

    // Mark selected check as ASSIGNED
    await AvailabilityCheck.updateStatus(check_id, user.organization_id, 'ASSIGNED');

    // Reject all other pending/responded checks for this trip
    const allTripChecks = await AvailabilityCheck.findByTrip(check.trip_id, user.organization_id);
    for (const c of allTripChecks) {
      if (c.id !== check_id && ['PENDING', 'RESPONDED'].includes(c.status)) {
        await AvailabilityCheck.updateStatus(c.id, user.organization_id, 'REJECTED');
      }
    }

    return { success: true, message: `Trip assigned to ${check.driver_name}.`, trip_id: check.trip_id, driver_id: check.driver_id };
  }
};

module.exports = { availabilityService, AvailabilityServiceError };
