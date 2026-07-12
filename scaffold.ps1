$files = @(
  # Root
  '.gitignore',
  '.env.example',
  'README.md',
  'package.json',

  # Client public
  'client/public/index.html',
  'client/public/favicon.ico',

  # Client src root
  'client/src/main.jsx',
  'client/src/App.jsx',

  # Assets
  'client/src/assets/logo.svg',

  # Styles
  'client/src/styles/index.css',
  'client/src/styles/variables.css',
  'client/src/styles/themes/light.css',
  'client/src/styles/themes/dark.css',

  # Constants
  'client/src/constants/roles.js',
  'client/src/constants/statuses.js',
  'client/src/constants/routes.js',

  # Contexts
  'client/src/contexts/AuthContext.jsx',
  'client/src/contexts/ThemeContext.jsx',

  # Hooks
  'client/src/hooks/useAuth.js',
  'client/src/hooks/useDebounce.js',
  'client/src/hooks/usePagination.js',

  # Services (client)
  'client/src/services/api.js',
  'client/src/services/authService.js',
  'client/src/services/vehicleService.js',
  'client/src/services/driverService.js',
  'client/src/services/tripService.js',
  'client/src/services/maintenanceService.js',
  'client/src/services/fuelService.js',
  'client/src/services/expenseService.js',
  'client/src/services/reportService.js',

  # Utils (client)
  'client/src/utils/formatters.js',
  'client/src/utils/validators.js',
  'client/src/utils/exportCSV.js',
  'client/src/utils/exportPDF.js',

  # Components - common
  'client/src/components/common/Navbar.jsx',
  'client/src/components/common/Sidebar.jsx',
  'client/src/components/common/ProtectedRoute.jsx',
  'client/src/components/common/PageHeader.jsx',
  'client/src/components/common/LoadingSpinner.jsx',
  'client/src/components/common/ConfirmModal.jsx',
  'client/src/components/common/EmptyState.jsx',
  'client/src/components/common/ErrorBoundary.jsx',

  # Components - ui
  'client/src/components/ui/Button.jsx',
  'client/src/components/ui/Input.jsx',
  'client/src/components/ui/Select.jsx',
  'client/src/components/ui/Modal.jsx',
  'client/src/components/ui/Badge.jsx',
  'client/src/components/ui/Table.jsx',
  'client/src/components/ui/Pagination.jsx',
  'client/src/components/ui/SearchBar.jsx',
  'client/src/components/ui/FilterPanel.jsx',
  'client/src/components/ui/Tooltip.jsx',
  'client/src/components/ui/Toast.jsx',

  # Components - dashboard
  'client/src/components/dashboard/KPICard.jsx',
  'client/src/components/dashboard/KPIGrid.jsx',
  'client/src/components/dashboard/FleetUtilizationChart.jsx',
  'client/src/components/dashboard/TripStatusChart.jsx',
  'client/src/components/dashboard/CostTrendChart.jsx',
  'client/src/components/dashboard/DashboardFilters.jsx',

  # Components - vehicles
  'client/src/components/vehicles/VehicleTable.jsx',
  'client/src/components/vehicles/VehicleForm.jsx',
  'client/src/components/vehicles/VehicleCard.jsx',
  'client/src/components/vehicles/VehicleStatusBadge.jsx',

  # Components - drivers
  'client/src/components/drivers/DriverTable.jsx',
  'client/src/components/drivers/DriverForm.jsx',
  'client/src/components/drivers/DriverCard.jsx',
  'client/src/components/drivers/DriverStatusBadge.jsx',
  'client/src/components/drivers/LicenseExpiryAlert.jsx',

  # Components - trips
  'client/src/components/trips/TripTable.jsx',
  'client/src/components/trips/TripForm.jsx',
  'client/src/components/trips/TripCard.jsx',
  'client/src/components/trips/TripStatusBadge.jsx',
  'client/src/components/trips/TripCompletionModal.jsx',
  'client/src/components/trips/DispatchConfirmModal.jsx',

  # Components - maintenance
  'client/src/components/maintenance/MaintenanceTable.jsx',
  'client/src/components/maintenance/MaintenanceForm.jsx',
  'client/src/components/maintenance/MaintenanceStatusBadge.jsx',

  # Components - fuel
  'client/src/components/fuel/FuelLogTable.jsx',
  'client/src/components/fuel/FuelLogForm.jsx',

  # Components - expenses
  'client/src/components/expenses/ExpenseTable.jsx',
  'client/src/components/expenses/ExpenseForm.jsx',

  # Components - reports
  'client/src/components/reports/FuelEfficiencyReport.jsx',
  'client/src/components/reports/OperationalCostReport.jsx',
  'client/src/components/reports/VehicleROIReport.jsx',
  'client/src/components/reports/FleetUtilizationReport.jsx',
  'client/src/components/reports/ExportButtons.jsx',

  # Pages
  'client/src/pages/auth/LoginPage.jsx',
  'client/src/pages/auth/UnauthorizedPage.jsx',
  'client/src/pages/DashboardPage.jsx',
  'client/src/pages/VehiclesPage.jsx',
  'client/src/pages/VehicleDetailPage.jsx',
  'client/src/pages/DriversPage.jsx',
  'client/src/pages/DriverDetailPage.jsx',
  'client/src/pages/TripsPage.jsx',
  'client/src/pages/TripDetailPage.jsx',
  'client/src/pages/MaintenancePage.jsx',
  'client/src/pages/FuelLogsPage.jsx',
  'client/src/pages/ExpensesPage.jsx',
  'client/src/pages/ReportsPage.jsx',
  'client/src/pages/NotFoundPage.jsx',

  # Client config files
  'client/.env',
  'client/.eslintrc.json',
  'client/vite.config.js',
  'client/package.json',

  # Server src root
  'server/src/index.js',
  'server/src/app.js',

  # Server config
  'server/src/config/db.js',
  'server/src/config/env.js',
  'server/src/config/corsOptions.js',

  # Database migrations
  'server/src/database/migrations/001_create_users.sql',
  'server/src/database/migrations/002_create_roles.sql',
  'server/src/database/migrations/003_create_vehicles.sql',
  'server/src/database/migrations/004_create_drivers.sql',
  'server/src/database/migrations/005_create_trips.sql',
  'server/src/database/migrations/006_create_maintenance_logs.sql',
  'server/src/database/migrations/007_create_fuel_logs.sql',
  'server/src/database/migrations/008_create_expenses.sql',

  # Database seeds
  'server/src/database/seeds/seed_roles.sql',
  'server/src/database/seeds/seed_users.sql',
  'server/src/database/seeds/seed_vehicles.sql',
  'server/src/database/seeds/seed_drivers.sql',

  # DB migrate runner
  'server/src/database/migrate.js',

  # Middleware
  'server/src/middleware/authenticate.js',
  'server/src/middleware/authorize.js',
  'server/src/middleware/errorHandler.js',
  'server/src/middleware/validate.js',
  'server/src/middleware/rateLimiter.js',

  # Routes
  'server/src/routes/index.js',
  'server/src/routes/authRoutes.js',
  'server/src/routes/userRoutes.js',
  'server/src/routes/vehicleRoutes.js',
  'server/src/routes/driverRoutes.js',
  'server/src/routes/tripRoutes.js',
  'server/src/routes/maintenanceRoutes.js',
  'server/src/routes/fuelRoutes.js',
  'server/src/routes/expenseRoutes.js',
  'server/src/routes/reportRoutes.js',

  # Controllers
  'server/src/controllers/authController.js',
  'server/src/controllers/userController.js',
  'server/src/controllers/vehicleController.js',
  'server/src/controllers/driverController.js',
  'server/src/controllers/tripController.js',
  'server/src/controllers/maintenanceController.js',
  'server/src/controllers/fuelController.js',
  'server/src/controllers/expenseController.js',
  'server/src/controllers/reportController.js',

  # Services (server)
  'server/src/services/authService.js',
  'server/src/services/vehicleService.js',
  'server/src/services/driverService.js',
  'server/src/services/tripService.js',
  'server/src/services/maintenanceService.js',
  'server/src/services/fuelService.js',
  'server/src/services/expenseService.js',
  'server/src/services/reportService.js',

  # Models
  'server/src/models/userModel.js',
  'server/src/models/vehicleModel.js',
  'server/src/models/driverModel.js',
  'server/src/models/tripModel.js',
  'server/src/models/maintenanceModel.js',
  'server/src/models/fuelModel.js',
  'server/src/models/expenseModel.js',

  # Validators
  'server/src/validators/authValidator.js',
  'server/src/validators/vehicleValidator.js',
  'server/src/validators/driverValidator.js',
  'server/src/validators/tripValidator.js',
  'server/src/validators/maintenanceValidator.js',
  'server/src/validators/fuelValidator.js',
  'server/src/validators/expenseValidator.js',

  # Utils (server)
  'server/src/utils/asyncWrapper.js',
  'server/src/utils/apiResponse.js',
  'server/src/utils/dateHelpers.js',
  'server/src/utils/csvExporter.js',

  # Server config files
  'server/.env',
  'server/.eslintrc.json',
  'server/nodemon.json',
  'server/package.json'
)

$base = Split-Path -Parent $MyInvocation.MyCommand.Path

foreach ($file in $files) {
  $fullPath = Join-Path $base $file
  $dir = Split-Path $fullPath -Parent
  if (!(Test-Path $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
  }
  if (!(Test-Path $fullPath)) {
    New-Item -ItemType File -Path $fullPath -Force | Out-Null
  }
}

Write-Host "Done! All $($files.Count) files created successfully."
