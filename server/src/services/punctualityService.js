const { query } = require('../config/db');

class PunctualityServiceError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

/**
 * Driver Punctuality & Accountability Service
 */
const punctualityService = {
  /**
   * Evaluate trip completion punctuality and update driver's rolling metrics.
   * Can run within a transaction client or independently.
   */
  evaluateTripCompletion: async (tripId, organizationId, client = null) => {
    const db = client || { query };

    // 1. Fetch trip details
    const tripRes = await db.query(
      `SELECT t.*, v.registration_number AS vehicle_reg, d.name AS driver_name
       FROM trips t
       LEFT JOIN vehicles v ON v.id = t.vehicle_id
       LEFT JOIN drivers d ON d.id = t.driver_id
       WHERE t.id = $1 AND t.organization_id = $2`,
      [tripId, organizationId]
    );

    if (tripRes.rows.length === 0) return null;
    const trip = tripRes.rows[0];
    if (!trip.driver_id) return null;

    // 2. Fetch pre-trip availability check if one was logged
    const checkRes = await db.query(
      `SELECT * FROM driver_availability_checks
       WHERE trip_id = $1 AND driver_id = $2
       ORDER BY created_at DESC LIMIT 1`,
      [tripId, trip.driver_id]
    );
    const availCheck = checkRes.rows[0] || null;

    // 3. Compute Reporting Punctuality (Arrival at origin/pickup point)
    const scheduledReporting = trip.start_time ? new Date(trip.start_time) : new Date();
    const actualReporting = trip.arrived_pickup_at ? new Date(trip.arrived_pickup_at) : scheduledReporting;
    const reportingDiffMs = actualReporting.getTime() - scheduledReporting.getTime();
    const reportingDelayMinutes = Math.max(0, Math.round(reportingDiffMs / 60000));
    const isOnTimeReporting = reportingDelayMinutes <= 15; // 15-minute grace period

    // 4. Compute Delivery Punctuality (Arrival at destination)
    const expectedDelivery = trip.expected_arrival ? new Date(trip.expected_arrival) : new Date();
    const actualDelivery = trip.actual_arrival ? new Date(trip.actual_arrival) : (trip.arrived_dest_at ? new Date(trip.arrived_dest_at) : new Date());
    const deliveryDiffMs = actualDelivery.getTime() - expectedDelivery.getTime();
    const deliveryDelayMinutes = Math.round(deliveryDiffMs / 60000);
    const isOnTimeDelivery = deliveryDelayMinutes <= 15;

    // 5. Compute Claimed ETA vs Actual Transit variance
    let claimedEtaMinutes = null;
    let actualTransitMinutes = null;
    let etaVarianceMinutes = null;

    if (availCheck && availCheck.claimed_eta_minutes != null && trip.arrived_pickup_at) {
      claimedEtaMinutes = availCheck.claimed_eta_minutes;
      const checkTime = new Date(availCheck.responded_at || availCheck.created_at);
      const actualElapsedMs = new Date(trip.arrived_pickup_at).getTime() - checkTime.getTime();
      actualTransitMinutes = Math.max(1, Math.round(actualElapsedMs / 60000));
      etaVarianceMinutes = actualTransitMinutes - claimedEtaMinutes;
    }

    // 6. Compute Trip Punctuality Score (1.0 to 5.0)
    let score = 5.0;

    if (deliveryDelayMinutes > 120) {
      score = 1.0;
    } else if (deliveryDelayMinutes > 60) {
      score = 2.0;
    } else if (deliveryDelayMinutes > 30) {
      score = 3.2;
    } else if (deliveryDelayMinutes > 15) {
      score = 4.0;
    } else {
      score = 5.0;
    }

    // Deduct penalty if driver under-claimed pre-trip ETA by more than 45 minutes
    if (etaVarianceMinutes != null && etaVarianceMinutes > 45) {
      score = Math.max(1.0, score - 0.5);
    }

    // 7. Formulate summary notes
    let notes = '';
    if (isOnTimeDelivery) {
      notes = deliveryDelayMinutes <= 0
        ? `On time delivery (${Math.abs(deliveryDelayMinutes)} min ahead of schedule).`
        : `Delivered within standard 15-minute grace window (+${deliveryDelayMinutes} min).`;
    } else {
      notes = `Delayed by ${deliveryDelayMinutes} minutes beyond expected arrival.`;
    }

    if (etaVarianceMinutes != null && etaVarianceMinutes > 30) {
      notes += ` Pre-trip claimed ETA exceeded by +${etaVarianceMinutes} min.`;
    }

    // 8. Upsert into driver_punctuality_logs
    await db.query(
      `INSERT INTO driver_punctuality_logs (
        organization_id, driver_id, trip_id,
        scheduled_reporting_time, actual_reporting_time, reporting_delay_minutes, is_on_time_reporting,
        expected_delivery_time, actual_delivery_time, delivery_delay_minutes, is_on_time_delivery,
        claimed_eta_minutes, actual_transit_minutes, eta_variance_minutes,
        trip_punctuality_score, summary_notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      ON CONFLICT (trip_id) DO UPDATE SET
        actual_delivery_time = EXCLUDED.actual_delivery_time,
        delivery_delay_minutes = EXCLUDED.delivery_delay_minutes,
        is_on_time_delivery = EXCLUDED.is_on_time_delivery,
        trip_punctuality_score = EXCLUDED.trip_punctuality_score,
        summary_notes = EXCLUDED.summary_notes`,
      [
        organizationId,
        trip.driver_id,
        trip.id,
        scheduledReporting,
        actualReporting,
        reportingDelayMinutes,
        isOnTimeReporting,
        expectedDelivery,
        actualDelivery,
        Math.max(0, deliveryDelayMinutes),
        isOnTimeDelivery,
        claimedEtaMinutes,
        actualTransitMinutes,
        etaVarianceMinutes,
        score,
        notes
      ]
    );

    // 9. Recalculate driver aggregate rolling punctuality stats
    const statsRes = await db.query(
      `SELECT
        COUNT(*)::int AS total_completed,
        COUNT(CASE WHEN is_on_time_delivery THEN 1 END)::int AS on_time_count,
        COUNT(CASE WHEN NOT is_on_time_delivery THEN 1 END)::int AS late_count,
        COALESCE(AVG(delivery_delay_minutes), 0)::numeric(6,1) AS avg_delay,
        COALESCE(AVG(trip_punctuality_score), 5.0)::numeric(3,1) AS overall_score
       FROM driver_punctuality_logs
       WHERE driver_id = $1 AND organization_id = $2`,
      [trip.driver_id, organizationId]
    );

    const stats = statsRes.rows[0];
    const total = stats.total_completed || 1;
    const onTimeRate = parseFloat(((stats.on_time_count / total) * 100).toFixed(2));

    await db.query(
      `UPDATE drivers
       SET punctuality_score = $1,
           on_time_rate = $2,
           avg_delay_minutes = $3,
           total_completed_trips = $4,
           on_time_trips_count = $5,
           late_trips_count = $6,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $7 AND organization_id = $8`,
      [
        stats.overall_score,
        onTimeRate,
        stats.avg_delay,
        stats.total_completed,
        stats.on_time_count,
        stats.late_count,
        trip.driver_id,
        organizationId
      ]
    );

    return {
      trip_id: trip.id,
      driver_id: trip.driver_id,
      trip_score: score,
      delivery_delay_minutes: deliveryDelayMinutes,
      is_on_time_delivery: isOnTimeDelivery,
      driver_overall_score: stats.overall_score,
      driver_on_time_rate: onTimeRate,
      notes
    };
  },

  /**
   * Get complete punctuality scorecard and log history for a driver.
   */
  getDriverPunctuality: async (driverId, organizationId) => {
    const driverRes = await query(
      `SELECT id, name, contact_number, status, license_category,
              punctuality_score, on_time_rate, avg_delay_minutes,
              total_completed_trips, on_time_trips_count, late_trips_count
       FROM drivers
       WHERE id = $1 AND organization_id = $2`,
      [driverId, organizationId]
    );

    if (driverRes.rows.length === 0) {
      throw new PunctualityServiceError('Driver not found.', 404);
    }

    const driver = driverRes.rows[0];

    const logsRes = await query(
      `SELECT dpl.*, t.origin, t.destination, t.start_time, t.expected_arrival, t.actual_arrival
       FROM driver_punctuality_logs dpl
       JOIN trips t ON t.id = dpl.trip_id
       WHERE dpl.driver_id = $1 AND dpl.organization_id = $2
       ORDER BY dpl.created_at DESC
       LIMIT 50`,
      [driverId, organizationId]
    );

    return {
      driver,
      logs: logsRes.rows
    };
  },

  /**
   * Get fleet-wide driver punctuality leaderboard.
   */
  getLeaderboard: async (organizationId) => {
    const result = await query(
      `SELECT id, name, contact_number, status, license_category,
              COALESCE(punctuality_score, 5.0) AS punctuality_score,
              COALESCE(on_time_rate, 100.0) AS on_time_rate,
              COALESCE(avg_delay_minutes, 0.0) AS avg_delay_minutes,
              COALESCE(total_completed_trips, 0) AS total_completed_trips,
              COALESCE(on_time_trips_count, 0) AS on_time_trips_count,
              COALESCE(late_trips_count, 0) AS late_trips_count
       FROM drivers
       WHERE organization_id = $1
       ORDER BY punctuality_score DESC, on_time_rate DESC, total_completed_trips DESC`,
      [organizationId]
    );

    return result.rows;
  }
};

module.exports = {
  punctualityService,
  PunctualityServiceError
};
