const { query } = require('../config/db');
const asyncWrapper = require('../utils/asyncWrapper');
const apiResponse = require('../utils/apiResponse');
const { sendCSVResponse } = require('../utils/csvExporter');

const getDashboardStats = asyncWrapper(async (req, res) => {
  // 1. Vehicle Stats
  const vehicleStatsResult = await query(`
    SELECT 
      COUNT(*) as total_vehicles,
      SUM(CASE WHEN status = 'Available' THEN 1 ELSE 0 END) as available_vehicles,
      SUM(CASE WHEN status = 'On Trip' THEN 1 ELSE 0 END) as vehicles_on_trip,
      SUM(CASE WHEN status = 'In Shop' THEN 1 ELSE 0 END) as vehicles_in_shop
    FROM vehicles;
  `);

  // 2. Driver Stats
  const driverStatsResult = await query(`
    SELECT 
      COUNT(*) as total_drivers,
      SUM(CASE WHEN status = 'Available' THEN 1 ELSE 0 END) as available_drivers,
      SUM(CASE WHEN status = 'On Trip' THEN 1 ELSE 0 END) as drivers_on_trip
    FROM drivers;
  `);

  // 3. Trip Stats
  const tripStatsResult = await query(`
    SELECT 
      COUNT(*) as total_trips,
      SUM(CASE WHEN status = 'Dispatched' THEN 1 ELSE 0 END) as active_trips,
      SUM(revenue) as total_revenue
    FROM trips;
  `);

  // 4. Financial Stats
  const fuelStatsResult = await query(`SELECT COALESCE(SUM(cost), 0) as total_fuel_cost FROM fuel_logs;`);
  const maintenanceStatsResult = await query(`SELECT COALESCE(SUM(cost), 0) as total_maintenance_cost FROM maintenance_logs;`);
  const expenseStatsResult = await query(`SELECT COALESCE(SUM(amount), 0) as total_other_expenses FROM expenses;`);

  const totalRevenue = Number(tripStatsResult.rows[0].total_revenue || 0);
  const totalFuelCost = Number(fuelStatsResult.rows[0].total_fuel_cost || 0);
  const totalMaintenanceCost = Number(maintenanceStatsResult.rows[0].total_maintenance_cost || 0);
  const totalOtherExpenses = Number(expenseStatsResult.rows[0].total_other_expenses || 0);

  const totalExpenses = totalFuelCost + totalMaintenanceCost + totalOtherExpenses;
  const netProfit = totalRevenue - totalExpenses;

  const dashboardData = {
    vehicles: vehicleStatsResult.rows[0],
    drivers: driverStatsResult.rows[0],
    trips: {
      total_trips: tripStatsResult.rows[0].total_trips,
      active_trips: tripStatsResult.rows[0].active_trips
    },
    financials: {
      total_revenue: totalRevenue,
      total_expenses: totalExpenses,
      breakdown: {
        fuel: totalFuelCost,
        maintenance: totalMaintenanceCost,
        other: totalOtherExpenses
      },
      net_profit: netProfit
    }
  };

  return apiResponse.success(res, dashboardData, 'Dashboard statistics retrieved successfully.');
});

// Fuel Efficiency Report (Distance / Fuel Liters)
const getFuelEfficiency = asyncWrapper(async (req, res) => {
  const sql = `
    WITH trip_sums AS (
      SELECT vehicle_id, COALESCE(SUM(actual_distance), 0) as total_distance
      FROM trips
      WHERE status = 'Completed'
      GROUP BY vehicle_id
    ),
    fuel_sums AS (
      SELECT vehicle_id, COALESCE(SUM(liters), 0) as total_liters
      FROM fuel_logs
      GROUP BY vehicle_id
    )
    SELECT 
      v.id,
      v.registration_number,
      v.name,
      v.type,
      COALESCE(ts.total_distance, 0) as total_distance_km,
      COALESCE(fs.total_liters, 0) as total_fuel_liters,
      CASE 
        WHEN COALESCE(fs.total_liters, 0) > 0 THEN ROUND((COALESCE(ts.total_distance, 0) / COALESCE(fs.total_liters, 0))::numeric, 2)
        ELSE 0.00
      END as fuel_efficiency_km_per_liter
    FROM vehicles v
    LEFT JOIN trip_sums ts ON v.id = ts.vehicle_id
    LEFT JOIN fuel_sums fs ON v.id = fs.vehicle_id
    ORDER BY fuel_efficiency_km_per_liter DESC;
  `;
  const result = await query(sql);
  return apiResponse.success(res, result.rows, 'Fuel efficiency report retrieved successfully.');
});

// Fleet Utilization Report
const getFleetUtilization = asyncWrapper(async (req, res) => {
  const sql = `
    SELECT 
      COUNT(*) as total_vehicles,
      SUM(CASE WHEN status = 'Available' THEN 1 ELSE 0 END) as available_vehicles,
      SUM(CASE WHEN status = 'On Trip' THEN 1 ELSE 0 END) as vehicles_on_trip,
      SUM(CASE WHEN status = 'In Shop' THEN 1 ELSE 0 END) as vehicles_in_shop,
      SUM(CASE WHEN status = 'Retired' THEN 1 ELSE 0 END) as retired_vehicles,
      CASE 
        WHEN SUM(CASE WHEN status IN ('Available', 'On Trip', 'In Shop') THEN 1 ELSE 0 END) > 0 THEN
          ROUND((SUM(CASE WHEN status = 'On Trip' THEN 1 ELSE 0 END)::numeric / 
                 SUM(CASE WHEN status IN ('Available', 'On Trip', 'In Shop') THEN 1 ELSE 0 END)) * 100, 2)
        ELSE 0.00
      END as fleet_utilization_percentage
    FROM vehicles;
  `;
  const result = await query(sql);
  return apiResponse.success(res, result.rows[0], 'Fleet utilization report retrieved successfully.');
});

// Operational Cost Report (Fuel + Maintenance + Other expenses)
const getOperationalCosts = asyncWrapper(async (req, res) => {
  const sql = `
    WITH maintenance_sums AS (
      SELECT vehicle_id, COALESCE(SUM(cost), 0) as total_maintenance_cost
      FROM maintenance_logs
      GROUP BY vehicle_id
    ),
    fuel_sums AS (
      SELECT vehicle_id, COALESCE(SUM(cost), 0) as total_fuel_cost
      FROM fuel_logs
      GROUP BY vehicle_id
    ),
    expense_sums AS (
      SELECT vehicle_id, COALESCE(SUM(amount), 0) as total_other_expenses
      FROM expenses
      GROUP BY vehicle_id
    )
    SELECT 
      v.id,
      v.registration_number,
      v.name,
      v.type,
      COALESCE(fs.total_fuel_cost, 0) as fuel_cost,
      COALESCE(ms.total_maintenance_cost, 0) as maintenance_cost,
      COALESCE(es.total_other_expenses, 0) as other_expense_cost,
      (COALESCE(fs.total_fuel_cost, 0) + COALESCE(ms.total_maintenance_cost, 0) + COALESCE(es.total_other_expenses, 0)) as total_operational_cost
    FROM vehicles v
    LEFT JOIN fuel_sums fs ON v.id = fs.vehicle_id
    LEFT JOIN maintenance_sums ms ON v.id = ms.vehicle_id
    LEFT JOIN expense_sums es ON v.id = es.vehicle_id
    ORDER BY total_operational_cost DESC;
  `;
  const result = await query(sql);
  return apiResponse.success(res, result.rows, 'Operational costs report retrieved successfully.');
});

// Vehicle ROI Report ((Revenue - (Maintenance + Fuel)) / Acquisition Cost)
const getVehicleROI = asyncWrapper(async (req, res) => {
  const sql = `
    WITH trip_sums AS (
      SELECT vehicle_id, COALESCE(SUM(revenue), 0) as total_revenue
      FROM trips
      WHERE status = 'Completed'
      GROUP BY vehicle_id
    ),
    maintenance_sums AS (
      SELECT vehicle_id, COALESCE(SUM(cost), 0) as total_maintenance_cost
      FROM maintenance_logs
      GROUP BY vehicle_id
    ),
    fuel_sums AS (
      SELECT vehicle_id, COALESCE(SUM(cost), 0) as total_fuel_cost
      FROM fuel_logs
      GROUP BY vehicle_id
    )
    SELECT 
      v.id,
      v.registration_number,
      v.name,
      v.acquisition_cost,
      COALESCE(ts.total_revenue, 0) as total_revenue,
      (COALESCE(ms.total_maintenance_cost, 0) + COALESCE(fs.total_fuel_cost, 0)) as total_expenses,
      (COALESCE(ts.total_revenue, 0) - (COALESCE(ms.total_maintenance_cost, 0) + COALESCE(fs.total_fuel_cost, 0))) as net_earnings,
      CASE 
        WHEN v.acquisition_cost > 0 THEN 
          ROUND(((COALESCE(ts.total_revenue, 0) - (COALESCE(ms.total_maintenance_cost, 0) + COALESCE(fs.total_fuel_cost, 0)))::numeric / v.acquisition_cost) * 100, 2)
        ELSE 0.00
      END as roi_percentage
    FROM vehicles v
    LEFT JOIN trip_sums ts ON v.id = ts.vehicle_id
    LEFT JOIN maintenance_sums ms ON v.id = ms.vehicle_id
    LEFT JOIN fuel_sums fs ON v.id = fs.vehicle_id
    ORDER BY roi_percentage DESC;
  `;
  const result = await query(sql);
  return apiResponse.success(res, result.rows, 'Vehicle ROI report retrieved successfully.');
});

// CSV Export Endpoint
const exportCSVReport = asyncWrapper(async (req, res) => {
  const { type } = req.query;
  let data = [];
  let filename = 'report';

  if (type === 'fuel-efficiency') {
    const r = await query(`
      WITH trip_sums AS (
        SELECT vehicle_id, COALESCE(SUM(actual_distance), 0) as total_distance FROM trips WHERE status = 'Completed' GROUP BY vehicle_id
      ),
      fuel_sums AS (
        SELECT vehicle_id, COALESCE(SUM(liters), 0) as total_liters FROM fuel_logs GROUP BY vehicle_id
      )
      SELECT v.registration_number, v.name, v.type, COALESCE(ts.total_distance, 0) as total_distance_km, COALESCE(fs.total_liters, 0) as total_fuel_liters,
             CASE WHEN COALESCE(fs.total_liters, 0) > 0 THEN ROUND((COALESCE(ts.total_distance, 0) / COALESCE(fs.total_liters, 0))::numeric, 2) ELSE 0.00 END as fuel_efficiency
      FROM vehicles v LEFT JOIN trip_sums ts ON v.id = ts.vehicle_id LEFT JOIN fuel_sums fs ON v.id = fs.vehicle_id ORDER BY fuel_efficiency DESC;
    `);
    data = r.rows;
    filename = 'fuel_efficiency_report';
  } else if (type === 'operational-cost') {
    const r = await query(`
      WITH maintenance_sums AS (
        SELECT vehicle_id, COALESCE(SUM(cost), 0) as total_maintenance_cost FROM maintenance_logs GROUP BY vehicle_id
      ),
      fuel_sums AS (
        SELECT vehicle_id, COALESCE(SUM(cost), 0) as total_fuel_cost FROM fuel_logs GROUP BY vehicle_id
      ),
      expense_sums AS (
        SELECT vehicle_id, COALESCE(SUM(amount), 0) as total_other_expenses FROM expenses GROUP BY vehicle_id
      )
      SELECT v.registration_number, v.name, v.type, COALESCE(fs.total_fuel_cost, 0) as fuel_cost, COALESCE(ms.total_maintenance_cost, 0) as maintenance_cost,
             COALESCE(es.total_other_expenses, 0) as other_expense_cost, (COALESCE(fs.total_fuel_cost, 0) + COALESCE(ms.total_maintenance_cost, 0) + COALESCE(es.total_other_expenses, 0)) as total_operational_cost
      FROM vehicles v LEFT JOIN fuel_sums fs ON v.id = fs.vehicle_id LEFT JOIN maintenance_sums ms ON v.id = ms.vehicle_id LEFT JOIN expense_sums es ON v.id = es.vehicle_id ORDER BY total_operational_cost DESC;
    `);
    data = r.rows;
    filename = 'operational_costs_report';
  } else if (type === 'vehicle-roi') {
    const r = await query(`
      WITH trip_sums AS (
        SELECT vehicle_id, COALESCE(SUM(revenue), 0) as total_revenue FROM trips WHERE status = 'Completed' GROUP BY vehicle_id
      ),
      maintenance_sums AS (
        SELECT vehicle_id, COALESCE(SUM(cost), 0) as total_maintenance_cost FROM maintenance_logs GROUP BY vehicle_id
      ),
      fuel_sums AS (
        SELECT vehicle_id, COALESCE(SUM(cost), 0) as total_fuel_cost FROM fuel_logs GROUP BY vehicle_id
      )
      SELECT v.registration_number, v.name, v.acquisition_cost, COALESCE(ts.total_revenue, 0) as total_revenue, (COALESCE(ms.total_maintenance_cost, 0) + COALESCE(fs.total_fuel_cost, 0)) as total_expenses,
             (COALESCE(ts.total_revenue, 0) - (COALESCE(ms.total_maintenance_cost, 0) + COALESCE(fs.total_fuel_cost, 0))) as net_earnings,
             CASE WHEN v.acquisition_cost > 0 THEN ROUND(((COALESCE(ts.total_revenue, 0) - (COALESCE(ms.total_maintenance_cost, 0) + COALESCE(fs.total_fuel_cost, 0)))::numeric / v.acquisition_cost) * 100, 2) ELSE 0.00 END as roi_percentage
      FROM vehicles v LEFT JOIN trip_sums ts ON v.id = ts.vehicle_id LEFT JOIN maintenance_sums ms ON v.id = ms.vehicle_id LEFT JOIN fuel_sums fs ON v.id = fs.vehicle_id ORDER BY roi_percentage DESC;
    `);
    data = r.rows;
    filename = 'vehicle_roi_report';
  } else {
    return apiResponse.error(res, 'Invalid report type for CSV export. Supported: fuel-efficiency, operational-cost, vehicle-roi', 400);
  }

  return sendCSVResponse(res, filename, data);
});

module.exports = {
  getDashboardStats,
  getFuelEfficiency,
  getFleetUtilization,
  getOperationalCosts,
  getVehicleROI,
  exportCSVReport
};
