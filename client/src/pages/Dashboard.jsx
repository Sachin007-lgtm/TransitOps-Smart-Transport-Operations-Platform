import React, { useState, useEffect } from 'react';
import { LineChart, Line, ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell } from 'recharts';
import { Zap, ChevronDown, Lock, AlertCircle, Clock, CheckCircle2, Navigation, AlertTriangle, User, Wrench } from 'lucide-react';
import { apiRequest } from '../utils/api';
import './Dashboard.css';

// Sparklines helper data
const sparklineData1 = [{v:45},{v:48},{v:50},{v:49},{v:51},{v:52},{v:53}];
const sparklineData2 = [{v:35},{v:38},{v:40},{v:43},{v:41},{v:42},{v:42}];
const fuelData = [
  { day: 'Mon', val: 8.5 }, { day: 'Tue', val: 8.7 }, { day: 'Wed', val: 9.1 },
  { day: 'Thu', val: 8.8 }, { day: 'Fri', val: 9.3 }, { day: 'Sat', val: 9.5 }, { day: 'Sun', val: 9.2 }
];

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [trips, setTrips] = useState([]);
  const [error, setError] = useState('');

  // Filter States
  const [typeFilter, setTypeFilter] = useState('All types');
  const [statusFilter, setStatusFilter] = useState('All statuses');
  const [regionFilter, setRegionFilter] = useState('All regions');
  const [openFilter, setOpenFilter] = useState(null);

  useEffect(() => {
    async function loadDashboardData() {
      try {
        const statsRes = await apiRequest('GET', '/reports/dashboard');
        setStats(statsRes.data);
        
        const tripsRes = await apiRequest('GET', '/trips');
        setTrips(tripsRes.data || []);
      } catch (err) {
        console.error('Failed to load dashboard data:', err);
        setError('Failed to fetch real-time dashboard data.');
      } finally {
        setLoading(false);
      }
    }
    loadDashboardData();
  }, []);

  if (loading) {
    return (
      <div className="flex-col gap-6 w-full h-full p-4">
        <div className="skeleton w-1/4 h-10 mb-4"></div>
        <div className="flex gap-4 mb-8 overflow-hidden">
          {Array(7).fill(0).map((_, i) => <div key={i} className="skeleton h-24" style={{ flex: '1 0 150px' }}></div>)}
        </div>
        <div className="flex gap-4">
          <div className="skeleton flex-2 h-64"></div>
          <div className="skeleton flex-1 h-64"></div>
        </div>
      </div>
    );
  }

  // Extracted metrics
  const activeVehicles = stats?.vehicles?.vehicles_on_trip || 0;
  const availableVehicles = stats?.vehicles?.available_vehicles || 0;
  const maintVehicles = stats?.vehicles?.vehicles_in_shop || 0;
  const activeTrips = stats?.trips?.active_trips || 0;
  const totalVehicles = stats?.vehicles?.total_vehicles || 0;
  const totalDrivers = stats?.drivers?.total_drivers || 0;
  const availableDrivers = stats?.drivers?.available_drivers || 0;
  const driversOnTrip = stats?.drivers?.drivers_on_trip || 0;
  const netProfit = stats?.financials?.net_profit || 0;

  // Compute fleet utilization
  const activeFleet = activeVehicles + availableVehicles + maintVehicles;
  const fleetUtilPercentage = activeFleet > 0 ? Math.round((activeVehicles / activeFleet) * 100) : 0;

  // Donut chart operating costs data
  const fuelCost = stats?.financials?.breakdown?.fuel || 0;
  const maintenanceCost = stats?.financials?.breakdown?.maintenance || 0;
  const otherCost = stats?.financials?.breakdown?.other || 0;

  const donutData = [
    { name: 'Fuel', value: fuelCost, color: '#1fa88f' },
    { name: 'Maintenance', value: maintenanceCost, color: '#e08a1e' },
    { name: 'Tolls & Other', value: otherCost, color: '#8a8794' }
  ];

  // Filtering trips
  const filteredTrips = trips.filter(t => {
    let matchesType = true;
    if (typeFilter !== 'All types') {
      matchesType = t.vehicle_type === typeFilter;
    }
    let matchesStatus = true;
    if (statusFilter !== 'All statuses') {
      matchesStatus = t.status === statusFilter;
    }
    return matchesType && matchesStatus;
  });

  return (
    <div className="fade-in pb-8">
      
      {/* Page Header */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl heading">Control Tower</h1>
        {error && <span className="text-xs text-status-red">{error}</span>}
      </div>

      {/* Filter Bar */}
      <div className="flex gap-3 mb-6 relative">
        <div className="relative">
          <button className="filter-pill" onClick={() => setOpenFilter(openFilter === 'type' ? null : 'type')}>
            {typeFilter} <ChevronDown size={14} className="text-muted" />
          </button>
          {openFilter === 'type' && (
            <div className="filter-dropdown">
              {['All types', 'Van', 'Truck', 'Mini'].map(opt => (
                <div key={opt} className="filter-item" onClick={() => { setTypeFilter(opt); setOpenFilter(null); }}>{opt}</div>
              ))}
            </div>
          )}
        </div>

        <div className="relative">
          <button className="filter-pill" onClick={() => setOpenFilter(openFilter === 'status' ? null : 'status')}>
            {statusFilter} <ChevronDown size={14} className="text-muted" />
          </button>
          {openFilter === 'status' && (
            <div className="filter-dropdown">
              {['All statuses', 'Dispatched', 'Completed', 'Draft'].map(opt => (
                <div key={opt} className="filter-item" onClick={() => { setStatusFilter(opt); setOpenFilter(null); }}>{opt}</div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* KPI Strip */}
      <div className="kpi-strip mb-6">
        <div className="card kpi-card border-l-plum">
          <div className="kpi-label">Active Vehicles</div>
          <div className="text-3xl font-bold mono kpi-value mb-2">{activeVehicles}</div>
          <div className="kpi-chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sparklineData1}>
                <Line type="monotone" dataKey="v" stroke="var(--plum-1)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card kpi-card border-l-green">
          <div className="kpi-label">Available</div>
          <div className="text-3xl font-bold mono kpi-value mb-2">{availableVehicles}</div>
          <div className="kpi-chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sparklineData2}>
                <Line type="monotone" dataKey="v" stroke="var(--green)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card kpi-card border-l-amber">
          <div className="kpi-label">In Maintenance</div>
          <div className="text-3xl font-bold mono kpi-value">{maintVehicles}</div>
          <div className="text-xs text-[var(--amber)] mt-auto pt-2 flex items-center gap-1 font-medium">
            <Lock size={12} /> Auto-locked from dispatch
          </div>
        </div>

        <div className="card kpi-card border-l-blue">
          <div className="kpi-label">Active Trips</div>
          <div className="text-3xl font-bold mono kpi-value flex items-center gap-2">
            {activeTrips}
            <span className="live-dot bg-blue-500"></span>
          </div>
          <div className="text-xs text-muted mt-auto pt-2">Live updates streaming</div>
        </div>

        <div className="card kpi-card border-l-gray">
          <div className="kpi-label">Total Fleet</div>
          <div className="text-3xl font-bold mono kpi-value">{totalVehicles}</div>
        </div>

        <div className="card kpi-card border-l-gray">
          <div className="kpi-label">Drivers on Duty</div>
          <div className="text-3xl font-bold mono kpi-value">{totalDrivers}</div>
        </div>

        <div className="card kpi-card border-l-teal">
          <div className="kpi-label">Fleet Utilization</div>
          <div className="text-3xl font-bold mono kpi-value">{fleetUtilPercentage}%</div>
        </div>
      </div>

      {/* Row 1: Map & ROI */}
      <div className="content-row-1 mb-6">
        
        {/* Live Route Map */}
        <div className="card">
          <h2 className="heading text-lg mb-4">Live Route-Map</h2>
          <div className="route-map-panel">
            {trips.filter(t => t.status === 'Dispatched').slice(0, 3).map((trip, idx) => (
              <div className="route-row" key={trip.id}>
                <div className="mono text-xs w-16">TR-{trip.id}</div>
                <div className="route-visual">
                  <div className="route-node-start"></div>
                  <div className="route-dot travel-anim" style={{ animationDuration: idx === 0 ? '3s' : '5s' }}></div>
                  <div className="route-node-end"></div>
                </div>
                <div className="text-xs font-medium w-32 text-right">{trip.vehicle_name} / {trip.driver_name}</div>
              </div>
            ))}
            {trips.filter(t => t.status === 'Dispatched').length === 0 && (
              <div className="text-xs text-muted py-4 text-center">No dispatched trips currently active.</div>
            )}
          </div>
        </div>

        {/* Side Stack */}
        <div className="flex-col gap-6">
          <div className="card border-l-green">
            <h2 className="kpi-label">Net Earnings</h2>
            <div className="text-3xl font-bold mono text-[var(--green)] mb-1">
              ${netProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-muted font-mono bg-[var(--bg)] p-2 rounded border border-[var(--line)]">
              Revenue - Total Operational Costs
            </p>
          </div>
          
          <div className="card flex-1 flex flex-col">
            <h2 className="kpi-label mb-2">Fuel Efficiency (km/L)</h2>
            <div className="flex-1 -ml-2 -mb-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={fuelData}>
                  <defs>
                    <linearGradient id="colorTeal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--teal)" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="var(--teal)" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="val" stroke="var(--teal)" fillOpacity={1} fill="url(#colorTeal)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      {/* Row 2: Trips & Status */}
      <div className="content-row-2 mb-6">
        
        {/* Recent Trips Table */}
        <div className="card">
          <h2 className="heading text-lg mb-4">Recent Trips</h2>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Trip ID</th>
                  <th>Source</th>
                  <th>Destination</th>
                  <th>Vehicle</th>
                  <th>Driver</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredTrips.slice(0, 5).map(trip => (
                  <tr key={trip.id}>
                    <td className="mono font-medium">TR-{trip.id}</td>
                    <td>{trip.source}</td>
                    <td>{trip.destination}</td>
                    <td>{trip.vehicle_name}</td>
                    <td>{trip.driver_name}</td>
                    <td>
                      <span className={`pill ${
                        trip.status === 'Completed' ? 'pill-green' : 
                        trip.status === 'Dispatched' ? 'pill-blue' : 
                        trip.status === 'Cancelled' ? 'pill-red' : 'pill-gray'
                      }`}>
                        {trip.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {filteredTrips.length === 0 && (
                  <tr>
                    <td colSpan="6" className="text-center py-4 text-xs text-muted">No trips match current filters.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Vehicle Status Panel */}
        <div className="card">
          <h2 className="heading text-lg mb-4">Vehicle Status</h2>
          <div className="flex flex-col gap-4">
            
            <div className="status-bar-row">
              <div className="flex justify-between text-sm mb-1">
                <span className="font-medium text-text">Available</span>
                <span className="mono">{availableVehicles}</span>
              </div>
              <div className="eta-progress-container bg-green-bg">
                <div className="eta-progress-bar bg-green" style={{ width: `${totalVehicles > 0 ? (availableVehicles / totalVehicles) * 100 : 0}%` }}></div>
              </div>
            </div>

            <div className="status-bar-row">
              <div className="flex justify-between text-sm mb-1">
                <span className="font-medium text-text">On trip</span>
                <span className="mono">{activeVehicles}</span>
              </div>
              <div className="eta-progress-container bg-blue-bg">
                <div className="eta-progress-bar bg-blue" style={{ width: `${totalVehicles > 0 ? (activeVehicles / totalVehicles) * 100 : 0}%` }}></div>
              </div>
            </div>

            <div className="status-bar-row">
              <div className="flex justify-between text-sm mb-1">
                <span className="font-medium text-text">In shop</span>
                <span className="mono">{maintVehicles}</span>
              </div>
              <div className="eta-progress-container bg-amber-bg">
                <div className="eta-progress-bar bg-amber" style={{ width: `${totalVehicles > 0 ? (maintVehicles / totalVehicles) * 100 : 0}%` }}></div>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Row 3: Alerts & Costs */}
      <div className="content-row-3">
        
        {/* Compliance Alerts */}
        <div className="card">
          <div className="flex justify-between items-center mb-4">
            <h2 className="heading text-lg">Alerts & Compliance</h2>
            <span className="pill pill-red">Notification Panel</span>
          </div>
          
          <div className="flex flex-col gap-3">
            <div className="alert-card bg-red-bg border border-[var(--red)] rounded-md p-3 flex gap-3">
              <AlertCircle size={18} className="text-[var(--red)] mt-0.5" />
              <div>
                <div className="text-sm font-medium text-text">License Expiry</div>
                <div className="text-xs text-muted">Licensing rules block expired drivers from trip assignments.</div>
              </div>
            </div>
            
            <div className="alert-card bg-amber-bg border border-[var(--amber)] rounded-md p-3 flex gap-3">
              <AlertTriangle size={18} className="text-[var(--amber)] mt-0.5" />
              <div>
                <div className="text-sm font-medium text-text">Vehicle Locked</div>
                <div className="text-xs text-muted">Maintenance logs auto-lock vehicles placed In Shop.</div>
              </div>
            </div>
          </div>
        </div>

        {/* Cost Breakdown Donut */}
        <div className="card flex items-center">
          <div className="flex-1">
            <h2 className="heading text-lg mb-1">Operating Costs</h2>
            <p className="text-xs text-muted mb-6">Total operational breakdown</p>
            
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: 'var(--teal)' }}></span> Fuel
                </div>
                <span className="mono font-medium">${fuelCost.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: 'var(--amber)' }}></span> Maintenance
                </div>
                <span className="mono font-medium">${maintenanceCost.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: 'var(--sub)' }}></span> Tolls & Other
                </div>
                <span className="mono font-medium">${otherCost.toLocaleString()}</span>
              </div>
            </div>
          </div>
          
          <div style={{ width: '180px', height: '180px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={donutData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                  isAnimationActive={true}
                  animationDuration={1500}
                >
                  {donutData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

    </div>
  );
}
