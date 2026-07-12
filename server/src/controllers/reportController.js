const { query } = require('../config/db');
const asyncWrapper = require('../utils/asyncWrapper');
const apiResponse = require('../utils/apiResponse');

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

module.exports = {
  getDashboardStats
};
