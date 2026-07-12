import React, { useState, useEffect } from 'react';
import { LineChart, Line, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis, AreaChart, Area } from 'recharts';
import { apiRequest } from '../utils/api';

// --- Sparkline default helper data ---
const sparklineData1 = [{ v: 45 }, { v: 48 }, { v: 50 }, { v: 49 }, { v: 51 }, { v: 52 }, { v: 53 }];
const sparklineData2 = [{ v: 35 }, { v: 38 }, { v: 40 }, { v: 43 }, { v: 41 }, { v: 42 }, { v: 42 }];
const fuelData = [
  { day: 'Mon', val: 8.5 }, { day: 'Tue', val: 8.7 }, { day: 'Wed', val: 9.1 },
  { day: 'Thu', val: 8.8 }, { day: 'Fri', val: 9.3 }, { day: 'Sat', val: 9.5 }, { day: 'Sun', val: 9.2 }
];

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [trips, setTrips] = useState([]);
  const [error, setError] = useState('');

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
        <div className="skeleton w-1/3 h-10 mb-4"></div>
        <div className="flex gap-4 mb-8">
          <div className="skeleton flex-1 h-32"></div>
          <div className="skeleton flex-1 h-32"></div>
          <div className="skeleton flex-1 h-32"></div>
          <div className="skeleton flex-1 h-32"></div>
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
  const netProfit = stats?.financials?.net_profit || 0;

  return (
    <div className="fade-in">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl heading">Control Tower</h1>
        {error && <span className="text-xs text-status-red">{error}</span>}
      </div>

      {/* KPI Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        
        {/* KPI 1 */}
        <div className="card kpi-card" style={{ paddingBottom: '0' }}>
          <div className="text-muted text-xs font-semibold uppercase tracking-wider mb-1">Active Vehicles</div>
          <div className="text-3xl font-bold mono kpi-value mb-2">{activeVehicles}</div>
          <div style={{ height: '40px', marginLeft: '-1.5rem', marginRight: '-1.5rem', width: 'calc(100% + 3rem)' }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sparklineData1}>
                <Line type="monotone" dataKey="v" stroke="var(--accent-purple)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* KPI 2 */}
        <div className="card kpi-card" style={{ borderLeft: '4px solid var(--status-green)', paddingBottom: '0' }}>
          <div className="text-muted text-xs font-semibold uppercase tracking-wider mb-1">Available</div>
          <div className="text-3xl font-bold mono kpi-value mb-2">{availableVehicles}</div>
          <div style={{ height: '40px', marginLeft: '-1.5rem', marginRight: '-1.5rem', width: 'calc(100% + 3rem)' }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sparklineData2}>
                <Line type="monotone" dataKey="v" stroke="var(--status-green)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* KPI 3 */}
        <div className="card kpi-card" style={{ borderLeft: '4px solid var(--status-orange)' }}>
          <div className="text-muted text-xs font-semibold uppercase tracking-wider mb-1">In Maintenance</div>
          <div className="text-3xl font-bold mono kpi-value">{maintVehicles}</div>
          <div className="text-xs text-status-orange mt-2 flex items-center gap-1 font-medium">
            🔒 Auto-locked from dispatch
          </div>
        </div>

        {/* KPI 4 */}
        <div className="card kpi-card" style={{ borderLeft: '4px solid var(--status-blue)' }}>
          <div className="text-muted text-xs font-semibold uppercase tracking-wider mb-1">Active Trips</div>
          <div className="text-3xl font-bold mono kpi-value">{activeTrips}</div>
          <div className="text-xs text-muted mt-2">Live updates streaming...</div>
        </div>
      </div>

      {/* Main Content Area */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem', marginBottom: '2rem' }}>
        
        {/* Left Column */}
        <div className="flex-col gap-6">
          {/* Live Route Map Signature Component */}
          <div className="card">
            <h2 className="heading text-lg mb-4">Live Route-Map</h2>
            <div className="route-map-panel">
              {trips.filter(t => t.status === 'Dispatched').slice(0, 3).map((trip, idx) => (
                <div className="route-row" key={trip.id}>
                  <div className="mono text-xs w-16">TR-{trip.id}</div>
                  <div className="route-visual">
                    <div className="route-node-start"></div>
                    <div className="route-dot" style={{ left: idx === 0 ? '40%' : idx === 1 ? '70%' : '15%' }}></div>
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
                  {trips.slice(0, 5).map(trip => (
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
                  {trips.length === 0 && (
                    <tr>
                      <td colSpan="6" className="text-center text-xs text-muted py-4">No trips found. Create a trip to get started.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div className="flex-col gap-6">
          
          {/* Net Profit Financials Widget */}
          <div className="card" style={{ borderLeft: '4px solid var(--status-green)' }}>
            <h2 className="heading text-sm uppercase text-muted tracking-wide mb-4">Net Profit</h2>
            <div className="flex items-end gap-2 mb-1">
              <span className="text-3xl font-bold mono text-status-green">
                ${netProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>
            <p className="text-xs text-muted font-mono bg-app p-2 rounded border border-gray-200 mt-2">
              Revenue - Total Operational Costs
            </p>
          </div>

          {/* Fuel Efficiency Trend */}
          <div className="card">
            <h2 className="heading text-sm uppercase text-muted tracking-wide mb-4">Fuel Efficiency (km/L)</h2>
            <div style={{ height: '120px', width: '100%', marginLeft: '-0.5rem' }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={fuelData}>
                  <defs>
                    <linearGradient id="colorVal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#20c997" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#20c997" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="day" hide />
                  <YAxis domain={['dataMin - 1', 'dataMax + 1']} hide />
                  <RechartsTooltip 
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: 'var(--shadow-sm)' }}
                    itemStyle={{ color: '#20c997', fontWeight: 'bold' }}
                    labelStyle={{ display: 'none' }}
                  />
                  <Area type="monotone" dataKey="val" stroke="#20c997" fillOpacity={1} fill="url(#colorVal)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
