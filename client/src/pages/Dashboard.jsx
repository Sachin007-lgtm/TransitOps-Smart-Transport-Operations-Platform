import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import {
  Truck,
  Users,
  Navigation,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Clock,
  Plus,
  RefreshCw,
  FileText,
  Wrench,
  ArrowRight,
  Lock,
  ShieldCheck,
  TrendingUp,
  IndianRupee,
  Calendar
} from 'lucide-react';
import { apiRequest } from '../utils/api';
import './Dashboard.css';

// Currency & Date formatters
function formatINR(val) {
  const num = Math.round(Number(val) || 0);
  return '₹' + num.toLocaleString('en-IN');
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

// Color tokens matching the design system
const DONUT_COLORS = {
  FUEL: '#1fa88f',        // Teal
  MAINTENANCE: '#e08a1e', // Amber
  TOLL: '#2f6fed',        // Blue
  OTHER: '#8a8794'        // Gray
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  // Real backend dataset states
  const [vehicles, setVehicles] = useState([]);
  const [trips, setTrips] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [monthlyBill, setMonthlyBill] = useState(null);
  const [maintenanceReports, setMaintenanceReports] = useState([]);
  const [error, setError] = useState(null);

  // Current year-month for expense aggregation
  const currentMonth = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }, []);

  const monthLabel = useMemo(() => {
    const now = new Date();
    return now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  }, []);

  // Fetch all dashboard data concurrently
  const fetchDashboardData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    const [
      vehiclesRes,
      tripsRes,
      driversRes,
      alertsRes,
      billRes,
      reportsRes
    ] = await Promise.allSettled([
      apiRequest('GET', '/vehicles'),
      apiRequest('GET', '/trips'),
      apiRequest('GET', '/drivers'),
      apiRequest('GET', '/documents/alerts'),
      apiRequest('GET', `/expenses/monthly-bill?month=${currentMonth}`),
      apiRequest('GET', '/maintenance/driver-reports?view=active')
    ]);

    // Unpack vehicles
    if (vehiclesRes.status === 'fulfilled') {
      const vData = vehiclesRes.value?.data || vehiclesRes.value || [];
      setVehicles(Array.isArray(vData) ? vData : []);
    }

    // Unpack trips
    if (tripsRes.status === 'fulfilled') {
      const tData = tripsRes.value?.data || tripsRes.value || [];
      setTrips(Array.isArray(tData) ? tData : []);
    }

    // Unpack drivers
    if (driversRes.status === 'fulfilled') {
      const dData = driversRes.value?.data || driversRes.value || [];
      setDrivers(Array.isArray(dData) ? dData : []);
    }

    // Unpack document alerts
    const docAlerts = alertsRes.status === 'fulfilled' && Array.isArray(alertsRes.value)
      ? alertsRes.value
      : (alertsRes.value?.data || []);

    // Unpack maintenance driver reports
    if (reportsRes.status === 'fulfilled') {
      const rData = reportsRes.value?.data || reportsRes.value || [];
      setMaintenanceReports(Array.isArray(rData) ? rData : []);
    }

    // Unpack monthly expenses
    if (billRes.status === 'fulfilled' && billRes.value?.data) {
      setMonthlyBill(billRes.value.data);
    } else {
      setMonthlyBill(null);
    }

    // Combine document alerts with driver license expiry checks
    const now = new Date();
    const currentDrivers = driversRes.status === 'fulfilled' && Array.isArray(driversRes.value?.data)
      ? driversRes.value.data
      : [];

    const driverLicenseAlerts = currentDrivers.filter(d => {
      if (!d.license_expiry) return false;
      const exp = new Date(d.license_expiry);
      const days = (exp - now) / (1000 * 60 * 60 * 24);
      return days <= 30;
    }).map(d => {
      const exp = new Date(d.license_expiry);
      const isExpired = exp < now;
      return {
        id: `driver-lic-${d.id}`,
        entity_type: 'DRIVER',
        entity_name: d.full_name || d.name || 'Driver',
        document_type: 'Driver License',
        status: isExpired ? 'Expired' : 'Expiring Soon',
        expiry_date: d.license_expiry
      };
    });

    // Merge and deduplicate alerts
    const allAlerts = [...(Array.isArray(docAlerts) ? docAlerts : [])];
    driverLicenseAlerts.forEach(dAlert => {
      if (!allAlerts.some(a => a.id === dAlert.id || (a.entity_name === dAlert.entity_name && a.document_type === 'Driver License'))) {
        allAlerts.push(dAlert);
      }
    });
    setAlerts(allAlerts);

    setLastUpdated(new Date());
    setLoading(false);
    setRefreshing(false);
  }, [currentMonth]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Derived Operational Metrics
  const totalVehicles = vehicles.length;
  const availableVehicles = vehicles.filter(v => v.status === 'Available').length;
  const inShopVehicles = vehicles.filter(v => ['In Shop', 'In shop', 'Maintenance'].includes(v.status)).length;
  const onTripVehicles = vehicles.filter(v => ['On Trip', 'On trip'].includes(v.status)).length;

  const totalDrivers = drivers.length;
  const driversOnDuty = drivers.filter(d => ['Available', 'On Trip'].includes(d.status)).length;
  const driversOnTrip = drivers.filter(d => d.status === 'On Trip').length;
  const driversAvailable = drivers.filter(d => d.status === 'Available').length;

  const activeTrips = trips.filter(t => ['Dispatched', 'Loaded', 'Unloaded'].includes(t.status));
  const pendingTrips = trips.filter(t => ['Created', 'Assigned', 'Draft', 'Planned'].includes(t.status));
  const completedTrips = trips.filter(t => t.status === 'Completed');

  const fleetUtilizationRate = totalVehicles > 0
    ? Math.round((onTripVehicles / totalVehicles) * 100)
    : 0;

  // Recent Trips (sorted descending)
  const recentTrips = useMemo(() => {
    return [...trips]
      .sort((a, b) => {
        const dateA = new Date(a.created_at || a.start_time || 0);
        const dateB = new Date(b.created_at || b.start_time || 0);
        return dateB - dateA || (b.id - a.id);
      })
      .slice(0, 6);
  }, [trips]);

  // Donut expense chart data from real breakdown
  const donutData = useMemo(() => {
    if (!monthlyBill || !Array.isArray(monthlyBill.breakdown) || monthlyBill.breakdown.length === 0) {
      return [];
    }

    return monthlyBill.breakdown
      .map(item => {
        const cat = (item.category || 'OTHER').toUpperCase();
        const label = cat === 'FUEL' ? 'Fuel'
          : cat === 'MAINTENANCE' ? 'Maintenance'
          : cat === 'TOLL' ? 'Tolls & Fastag'
          : 'Other & Ops';
        return {
          name: label,
          category: cat,
          value: Number(item.total_amount) || 0,
          color: DONUT_COLORS[cat] || DONUT_COLORS.OTHER
        };
      })
      .filter(item => item.value > 0);
  }, [monthlyBill]);

  const totalMonthlyExpense = useMemo(() => {
    if (monthlyBill && typeof monthlyBill.total === 'number') {
      return monthlyBill.total;
    }
    return donutData.reduce((acc, curr) => acc + curr.value, 0);
  }, [monthlyBill, donutData]);

  // Trip status helper for consistent badge rendering
  const renderTripStatus = (status) => {
    const s = status || 'Draft';
    if (s === 'Completed') {
      return <span className="pill pill-green">Completed</span>;
    }
    if (['Dispatched', 'Loaded', 'Unloaded'].includes(s)) {
      return (
        <span className="pill pill-blue">
          <span className="live-dot sm bg-blue-500"></span> {s}
        </span>
      );
    }
    if (s === 'Assigned') {
      return <span className="pill pill-amber">Assigned</span>;
    }
    if (s === 'Cancelled') {
      return <span className="pill pill-red">Cancelled</span>;
    }
    return <span className="pill pill-gray">{s}</span>;
  };

  if (loading) {
    return (
      <div className="dashboard-loading flex flex-col gap-6 w-full p-6">
        <div className="skeleton w-1/4 h-8 mb-2"></div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {Array(6).fill(0).map((_, i) => (
            <div key={i} className="skeleton h-28 rounded-lg"></div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-4">
          <div className="skeleton lg:col-span-2 h-80 rounded-lg"></div>
          <div className="skeleton h-80 rounded-lg"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-container fade-in pb-10">
      
      {/* Page Header & Quick Action Row */}
      <div className="dashboard-header flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold heading flex items-center gap-2">
            Control Tower
            <span className="text-xs font-normal text-muted bg-[var(--line)] px-2 py-0.5 rounded-full mono">
              {lastUpdated ? `Synced ${lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Live'}
            </span>
          </h1>
          <p className="text-xs text-muted mt-1">Real-time operational health, fleet availability, and active shipments</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            className="btn btn-outline flex items-center gap-1.5"
            onClick={() => fetchDashboardData(true)}
            disabled={refreshing}
            title="Refresh dashboard data"
          >
            <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">{refreshing ? 'Updating...' : 'Refresh'}</span>
          </button>

          <Link to="/trips" className="btn btn-primary flex items-center gap-1.5">
            <Plus size={16} /> New Trip
          </Link>

          <Link to="/vehicles" className="btn btn-secondary flex items-center gap-1.5">
            <Truck size={15} /> Add Vehicle
          </Link>

          <Link to="/drivers" className="btn btn-secondary flex items-center gap-1.5">
            <Users size={15} /> Add Driver
          </Link>
        </div>
      </div>

      {/* KPI Strip (6 real operational metrics) */}
      <div className="dashboard-kpi-grid mb-6">
        
        {/* 1. Total Fleet */}
        <div className="card kpi-card border-l-blue">
          <div className="kpi-label">Active Fleet</div>
          <div className="text-3xl font-bold mono kpi-value mb-1">
            {totalVehicles}
          </div>
          <div className="text-xs text-muted flex items-center justify-between">
            <span><strong className="text-[var(--green)]">{availableVehicles}</strong> available</span>
            <span><strong className="text-[var(--blue)]">{onTripVehicles}</strong> on trip</span>
          </div>
        </div>

        {/* 2. Active Trips */}
        <div className="card kpi-card border-l-green">
          <div className="kpi-label">Active Trips</div>
          <div className="text-3xl font-bold mono kpi-value flex items-center gap-2 mb-1">
            {activeTrips.length}
            {activeTrips.length > 0 && <span className="live-dot bg-green-500"></span>}
          </div>
          <div className="text-xs text-muted">
            {pendingTrips.length} awaiting dispatch
          </div>
        </div>

        {/* 3. Drivers On Duty */}
        <div className="card kpi-card">
          <div className="kpi-label">Drivers on Duty</div>
          <div className="text-3xl font-bold mono kpi-value mb-1">
            {driversOnDuty}
          </div>
          <div className="text-xs text-muted">
            of {totalDrivers} registered drivers
          </div>
        </div>

        {/* 4. Fleet Utilization */}
        <div className="card kpi-card border-l-teal">
          <div className="kpi-label">Fleet Utilization</div>
          <div className="text-3xl font-bold mono kpi-value mb-1">
            {fleetUtilizationRate}%
          </div>
          <div className="w-full bg-[var(--line)] rounded-full h-1.5 mt-1 overflow-hidden">
            <div
              className="bg-[var(--teal)] h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, fleetUtilizationRate)}%` }}
            ></div>
          </div>
        </div>

        {/* 5. In Maintenance */}
        <div className="card kpi-card border-l-amber">
          <div className="kpi-label">In Maintenance</div>
          <div className="text-3xl font-bold mono kpi-value mb-1">
            {inShopVehicles}
          </div>
          <div className="text-xs text-[var(--amber)] flex items-center gap-1 font-medium">
            <Lock size={12} /> Auto-locked from dispatch
          </div>
        </div>

        {/* 6. Open Defect Reports */}
        <div className="card kpi-card">
          <div className="kpi-label">Pending Issues</div>
          <div className="text-3xl font-bold mono kpi-value mb-1">
            {maintenanceReports.length}
          </div>
          <Link to="/maintenance" className="text-xs text-[var(--blue)] hover:underline flex items-center gap-1">
            Review reports <ArrowRight size={11} />
          </Link>
        </div>

      </div>

      {/* Main Grid: Row 1 (Recent Trips Table + Fleet Status Distribution) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        
        {/* Recent & Active Trips Table (Col-span 2) */}
        <div className="card lg:col-span-2">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="heading text-base font-semibold">Active & Recent Trips</h2>
              <p className="text-xs text-muted">Latest operational trip movements and cargo dispatches</p>
            </div>
            <Link to="/trips" className="text-xs font-medium text-[var(--blue)] hover:underline flex items-center gap-1">
              View all trips ({trips.length}) <ArrowRight size={12} />
            </Link>
          </div>

          <div className="table-container">
            {recentTrips.length === 0 ? (
              <div className="empty-state-box text-center py-10 text-muted">
                <Navigation size={32} className="mx-auto mb-2 opacity-40" />
                <p className="text-sm font-medium">No trips recorded yet</p>
                <p className="text-xs text-muted mb-4">Create your first shipment to start monitoring your control tower</p>
                <Link to="/trips" className="btn btn-primary text-xs">
                  <Plus size={14} /> Create Trip
                </Link>
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Trip ID</th>
                    <th>Route</th>
                    <th>Vehicle</th>
                    <th>Driver</th>
                    <th>Status</th>
                    <th className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTrips.map(trip => (
                    <tr key={trip.id} className="hover:bg-[var(--bg)] transition-colors">
                      <td className="mono font-medium text-xs">
                        {trip.trip_code || `TR-${String(trip.id).padStart(4, '0')}`}
                      </td>
                      <td className="text-xs font-medium">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[var(--text)]">{trip.origin || trip.source || 'Hub'}</span>
                          <ArrowRight size={12} className="text-muted" />
                          <span className="text-[var(--text)]">{trip.destination || 'Destination'}</span>
                        </div>
                      </td>
                      <td className="text-xs mono">
                        {trip.vehicle_name || trip.vehicle_registration || (
                          <span className="text-muted italic">Unassigned</span>
                        )}
                      </td>
                      <td className="text-xs">
                        {trip.driver_name || (
                          <span className="text-muted italic">Unassigned</span>
                        )}
                      </td>
                      <td>
                        {renderTripStatus(trip.status)}
                      </td>
                      <td className="text-right">
                        <button
                          className="btn btn-outline text-xs py-1 px-2.5"
                          onClick={() => navigate('/trips')}
                          title="Open in Trip Dispatcher"
                        >
                          Dispatch
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Fleet Distribution & Quick Status Card */}
        <div className="card flex flex-col justify-between">
          <div>
            <h2 className="heading text-base font-semibold mb-1">Fleet Status</h2>
            <p className="text-xs text-muted mb-5">Vehicle readiness across {totalVehicles} registered units</p>
            
            <div className="flex flex-col gap-4">
              
              {/* Available */}
              <div className="status-progress-block">
                <div className="flex justify-between text-xs font-medium mb-1.5">
                  <span className="flex items-center gap-1.5 text-[var(--green)]">
                    <span className="w-2 h-2 rounded-full bg-[var(--green)]"></span>
                    Available for Dispatch
                  </span>
                  <span className="mono font-semibold">{availableVehicles}</span>
                </div>
                <div className="w-full bg-[var(--green-bg)] rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-[var(--green)] h-2 rounded-full transition-all duration-500"
                    style={{ width: `${totalVehicles > 0 ? (availableVehicles / totalVehicles) * 100 : 0}%` }}
                  ></div>
                </div>
              </div>

              {/* On Trip */}
              <div className="status-progress-block">
                <div className="flex justify-between text-xs font-medium mb-1.5">
                  <span className="flex items-center gap-1.5 text-[var(--blue)]">
                    <span className="w-2 h-2 rounded-full bg-[var(--blue)]"></span>
                    En Route / On Trip
                  </span>
                  <span className="mono font-semibold">{onTripVehicles}</span>
                </div>
                <div className="w-full bg-[var(--blue-bg)] rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-[var(--blue)] h-2 rounded-full transition-all duration-500"
                    style={{ width: `${totalVehicles > 0 ? (onTripVehicles / totalVehicles) * 100 : 0}%` }}
                  ></div>
                </div>
              </div>

              {/* In Shop */}
              <div className="status-progress-block">
                <div className="flex justify-between text-xs font-medium mb-1.5">
                  <span className="flex items-center gap-1.5 text-[var(--amber)]">
                    <span className="w-2 h-2 rounded-full bg-[var(--amber)]"></span>
                    Maintenance / In Shop
                  </span>
                  <span className="mono font-semibold">{inShopVehicles}</span>
                </div>
                <div className="w-full bg-[var(--amber-bg)] rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-[var(--amber)] h-2 rounded-full transition-all duration-500"
                    style={{ width: `${totalVehicles > 0 ? (inShopVehicles / totalVehicles) * 100 : 0}%` }}
                  ></div>
                </div>
              </div>

            </div>
          </div>

          {/* Quick Fleet Health Banner */}
          <div className="mt-6 pt-4 border-t border-[var(--line)]">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted">Completed Trips:</span>
              <strong className="mono font-semibold">{completedTrips.length}</strong>
            </div>
            <div className="flex items-center justify-between text-xs mt-2">
              <span className="text-muted">Drivers Ready:</span>
              <strong className="mono font-semibold text-[var(--green)]">{driversAvailable}</strong>
            </div>
          </div>
        </div>

      </div>

      {/* Main Grid: Row 2 (Alerts & Compliance + Month-to-date Operating Costs) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Compliance & Document Alerts */}
        <div className="card">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="heading text-base font-semibold">Alerts & Compliance</h2>
              <p className="text-xs text-muted">Vehicle and driver document expiries</p>
            </div>
            {alerts.length > 0 ? (
              <span className="pill pill-red font-medium">{alerts.length} action required</span>
            ) : (
              <span className="pill pill-green flex items-center gap-1">
                <CheckCircle2 size={13} /> Compliant
              </span>
            )}
          </div>

          <div className="alerts-container flex flex-col gap-3 max-h-[290px] overflow-y-auto pr-1">
            {alerts.length === 0 ? (
              <div className="text-center py-8 text-muted">
                <ShieldCheck size={36} className="mx-auto mb-2 text-[var(--green)] opacity-80" />
                <p className="text-sm font-medium text-[var(--text)]">All documents are compliant</p>
                <p className="text-xs text-muted">No licenses, RC, insurance, or permits are expired or near expiry.</p>
              </div>
            ) : (
              alerts.map(alert => {
                const isExpired = alert.status === 'Expired';
                return (
                  <div
                    key={alert.id}
                    className={`alert-card-item border rounded-lg p-3 flex items-start gap-3 transition-colors ${
                      isExpired ? 'bg-red-50/50 border-[var(--red)]/40' : 'bg-amber-50/50 border-[var(--amber)]/40'
                    }`}
                  >
                    {isExpired ? (
                      <AlertCircle size={18} className="text-[var(--red)] shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle size={18} className="text-[var(--amber)] shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-[var(--text)] truncate">
                          {alert.document_type}
                        </span>
                        <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${
                          isExpired ? 'bg-[var(--red)] text-white' : 'bg-[var(--amber)] text-white'
                        }`}>
                          {alert.status}
                        </span>
                      </div>
                      <p className="text-xs text-muted mt-0.5">
                        {alert.entity_type === 'DRIVER' ? `Driver: ${alert.entity_name}` : `Vehicle: ${alert.entity_name}`}
                        {alert.expiry_date && ` · Due ${formatDate(alert.expiry_date)}`}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Operating Costs (Month to Date in ₹) */}
        <div className="card flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-1">
              <h2 className="heading text-base font-semibold">Operating Costs (MTD)</h2>
              <span className="text-xs font-medium text-muted flex items-center gap-1">
                <Calendar size={13} /> {monthLabel}
              </span>
            </div>
            <p className="text-xs text-muted mb-4">Actual fleet expense breakdown from the monthly ledger</p>

            <div className="flex flex-col sm:flex-row items-center gap-6">
              
              {/* Donut Chart */}
              <div className="donut-wrapper flex justify-center items-center relative" style={{ width: '160px', height: '160px' }}>
                {donutData.length > 0 ? (
                  <>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Tooltip
                          formatter={(value) => [formatINR(value), 'Total']}
                          contentStyle={{
                            background: 'var(--card)',
                            borderColor: 'var(--line)',
                            borderRadius: '8px',
                            fontSize: '12px'
                          }}
                        />
                        <Pie
                          data={donutData}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={72}
                          paddingAngle={3}
                          dataKey="value"
                          isAnimationActive={true}
                        >
                          {donutData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <span className="text-[10px] text-muted uppercase font-bold">Total</span>
                      <span className="text-xs font-bold mono">{formatINR(totalMonthlyExpense)}</span>
                    </div>
                  </>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center rounded-full border border-dashed border-[var(--line)] text-center p-3">
                    <IndianRupee size={22} className="text-muted opacity-40 mb-1" />
                    <span className="text-[11px] text-muted">No expenses</span>
                  </div>
                )}
              </div>

              {/* Legend & Breakdown List */}
              <div className="flex-1 w-full flex flex-col gap-2.5">
                {donutData.length > 0 ? (
                  donutData.map(item => (
                    <div key={item.category} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: item.color }}
                        ></span>
                        <span className="font-medium text-[var(--text)]">{item.name}</span>
                      </div>
                      <span className="mono font-semibold">{formatINR(item.value)}</span>
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-muted py-2">
                    No fuel or maintenance expenses recorded for {monthLabel} yet.
                  </div>
                )}

                <div className="pt-2.5 mt-1 border-t border-[var(--line)] flex justify-between items-center text-xs">
                  <span className="font-semibold text-[var(--text)]">Month Total</span>
                  <span className="mono font-bold text-sm text-[var(--plum-1)]">
                    {formatINR(totalMonthlyExpense)}
                  </span>
                </div>
              </div>

            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-[var(--line)] flex justify-between items-center text-xs">
            <span className="text-muted">Need to add expense receipts?</span>
            <Link to="/fuel" className="text-[var(--blue)] font-medium hover:underline flex items-center gap-1">
              Add Expense <ArrowRight size={11} />
            </Link>
          </div>
        </div>

      </div>

    </div>
  );
}
