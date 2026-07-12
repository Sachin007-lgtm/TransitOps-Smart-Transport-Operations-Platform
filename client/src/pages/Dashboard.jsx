import React, { useState, useEffect, useRef } from 'react';
import { LineChart, Line, ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell } from 'recharts';
import { Zap, ChevronDown, Lock, Search, AlertCircle, Clock, CheckCircle2, Navigation, AlertTriangle, User, Wrench } from 'lucide-react';
import './Dashboard.css';

// --- Helpers ---
function useCountUp(end, duration = 1000, startDelay = 0, suffix = '') {
  const [count, setCount] = useState(0);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    let startTime;
    let animationFrame;
    let timeout;

    const updateCount = (timestamp) => {
      if (!startTime) startTime = timestamp;
      const progress = timestamp - startTime;
      
      if (progress < duration) {
        setCount(Math.min(end, Math.floor((progress / duration) * end)));
        animationFrame = requestAnimationFrame(updateCount);
      } else {
        setCount(end);
        setFinished(true);
      }
    };

    timeout = setTimeout(() => {
      animationFrame = requestAnimationFrame(updateCount);
    }, startDelay);

    return () => {
      clearTimeout(timeout);
      if (animationFrame) cancelAnimationFrame(animationFrame);
    };
  }, [end, duration, startDelay]);

  return finished ? count + suffix : count;
}

const sparklineData1 = [{v:45},{v:48},{v:50},{v:49},{v:51},{v:52},{v:53}];
const sparklineData2 = [{v:35},{v:38},{v:40},{v:43},{v:41},{v:42},{v:42}];
const fuelData = [
  { day: 'Mon', val: 8.5 }, { day: 'Tue', val: 8.7 }, { day: 'Wed', val: 9.1 },
  { day: 'Thu', val: 8.8 }, { day: 'Fri', val: 9.3 }, { day: 'Sat', val: 9.5 }, { day: 'Sun', val: 9.2 }
];
const donutData = [
  { name: 'Fuel', value: 45000, color: '#1fa88f' },
  { name: 'Maintenance', value: 25000, color: '#e08a1e' },
  { name: 'Tolls & Other', value: 12000, color: '#8a8794' }
];

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  
  // State for Simulate Dispatch
  const [dispatchStatus, setDispatchStatus] = useState('idle'); // idle | loading | dispatched

  // Filter States
  const [typeFilter, setTypeFilter] = useState('All types');
  const [statusFilter, setStatusFilter] = useState('All statuses');
  const [regionFilter, setRegionFilter] = useState('All regions');

  const [openFilter, setOpenFilter] = useState(null); // 'type' | 'status' | 'region'

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 800);
    return () => clearTimeout(timer);
  }, []);

  // KPIs
  const activeVehicles = useCountUp(53, 1000, 0);
  const availableVehicles = useCountUp(42, 1000, 150);
  const maintVehicles = useCountUp(5, 1000, 300);
  
  // Dynamic KPIs based on dispatch
  const baseActiveTrips = 18;
  const basePendingTrips = 9;
  const activeTripsRaw = useCountUp(baseActiveTrips + (dispatchStatus === 'dispatched' ? 1 : 0), 1000, 450);
  const pendingTripsRaw = useCountUp(basePendingTrips - (dispatchStatus === 'dispatched' ? 1 : 0), 1000, 600);
  
  const driversOnDuty = useCountUp(26, 1000, 750);
  const fleetUtil = useCountUp(81, 1000, 900, '%');

  // Handle Dispatch
  const handleDispatch = () => {
    if (dispatchStatus !== 'idle') return;
    setDispatchStatus('loading');
    setTimeout(() => {
      setDispatchStatus('dispatched');
      // Fire Toast
      const evt = new CustomEvent('app-toast', { detail: 'TR003 dispatched successfully!' });
      window.dispatchEvent(evt);
    }, 900);
  };

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

  return (
    <div className="fade-in pb-8">
      
      {/* Page Header */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl heading">Control Tower</h1>
        
        <button 
          className={`btn ${dispatchStatus === 'dispatched' ? 'btn-outline disabled' : 'btn-primary pulse-amber'}`} 
          style={dispatchStatus !== 'dispatched' ? { background: 'linear-gradient(90deg, var(--amber) 0%, #e59d20 100%)', border: 'none', color: 'white' } : {}}
          onClick={handleDispatch}
          disabled={dispatchStatus !== 'idle'}
        >
          {dispatchStatus === 'idle' && <><Zap size={16} /> Simulate dispatch</>}
          {dispatchStatus === 'loading' && <span className="spinner-border w-4 h-4 border-2 border-white rounded-full animate-spin"></span>}
          {dispatchStatus === 'dispatched' && <><CheckCircle2 size={16} /> Dispatched</>}
        </button>
      </div>

      {/* Filter Bar */}
      <div className="flex gap-3 mb-6 relative">
        {/* Type Filter */}
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

        {/* Status Filter */}
        <div className="relative">
          <button className="filter-pill" onClick={() => setOpenFilter(openFilter === 'status' ? null : 'status')}>
            {statusFilter} <ChevronDown size={14} className="text-muted" />
          </button>
          {openFilter === 'status' && (
            <div className="filter-dropdown">
              {['All statuses', 'On trip', 'Completed', 'Draft'].map(opt => (
                <div key={opt} className="filter-item" onClick={() => { setStatusFilter(opt); setOpenFilter(null); }}>{opt}</div>
              ))}
            </div>
          )}
        </div>

        {/* Region Filter */}
        <div className="relative">
          <button className="filter-pill" onClick={() => setOpenFilter(openFilter === 'region' ? null : 'region')}>
            {regionFilter} <ChevronDown size={14} className="text-muted" />
          </button>
          {openFilter === 'region' && (
            <div className="filter-dropdown">
              {['All regions', 'North', 'South'].map(opt => (
                <div key={opt} className="filter-item" onClick={() => { setRegionFilter(opt); setOpenFilter(null); }}>{opt}</div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* KPI Strip */}
      <div className="kpi-strip mb-6">
        <div className="card kpi-card">
          <div className="kpi-label">Active Vehicles</div>
          <div className="text-3xl font-bold mono kpi-value mb-2">{activeVehicles}</div>
          <div className="kpi-chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sparklineData1}>
                <Line type="monotone" dataKey="v" stroke="var(--plum-1)" strokeWidth={2} dot={false} isAnimationActive={true} />
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
          <div className="text-xs text-[var(--amber)] mt-2 flex items-center gap-1 font-medium">
            <Lock size={12} /> Auto-locked from dispatch
          </div>
        </div>

        <div className="card kpi-card border-l-blue">
          <div className="kpi-label">Active Trips</div>
          <div className="text-3xl font-bold mono kpi-value flex items-center gap-2">
            {activeTripsRaw}
            <span className="live-dot bg-blue-500"></span>
          </div>
          <div className="text-xs text-muted mt-2">Live updates streaming</div>
        </div>

        <div className="card kpi-card">
          <div className="kpi-label">Pending Trips</div>
          <div className="text-3xl font-bold mono kpi-value">{pendingTripsRaw}</div>
        </div>

        <div className="card kpi-card">
          <div className="kpi-label">Drivers on Duty</div>
          <div className="text-3xl font-bold mono kpi-value">{driversOnDuty}</div>
        </div>

        <div className="card kpi-card border-l-teal">
          <div className="kpi-label">Fleet Utilization</div>
          <div className="text-3xl font-bold mono kpi-value">{fleetUtil}</div>
        </div>
      </div>

      {/* Row 1: Map & ROI */}
      <div className="content-row-1 mb-6">
        
        {/* Live Route Map */}
        <div className="card">
          <h2 className="heading text-lg mb-4">Live Route-Map</h2>
          <div className="route-map-panel">
            {/* Active Trip */}
            <div className="route-row">
              <div className="mono text-xs w-16">TR001</div>
              <div className="route-visual">
                <div className="route-node-start"></div>
                <div className="route-dot travel-anim"></div>
                <div className="route-node-end"></div>
              </div>
              <div className="text-xs font-medium w-32 text-right">VAN-05 / Alex</div>
            </div>
            
            {/* Completed Trip */}
            <div className="route-row">
              <div className="mono text-xs w-16 text-muted">TR002</div>
              <div className="route-visual opacity-50">
                <div className="route-node-start bg-green"></div>
                <div className="route-dot" style={{ left: '100%', background: 'var(--green)', boxShadow: 'none' }}></div>
                <div className="route-node-end"></div>
              </div>
              <div className="text-xs font-medium w-32 text-right text-[var(--green)]">Completed</div>
            </div>

            {/* Pending / Dispatched Trip */}
            <div className="route-row">
              <div className="mono text-xs w-16">TR003</div>
              <div className="route-visual">
                <div className="route-node-start"></div>
                {dispatchStatus === 'dispatched' ? (
                  <div className="route-dot travel-anim" style={{ animationDuration: '4s' }}></div>
                ) : (
                  <div className="route-dot ghost" style={{ left: '100%' }}></div>
                )}
                <div className="route-node-end"></div>
              </div>
              <div className="text-xs font-medium w-32 text-right">MINI-08 / Priya</div>
            </div>
          </div>
        </div>

        {/* Side Stack 1 */}
        <div className="flex-col gap-6">
          <div className="card border-l-green">
            <h2 className="kpi-label">Fleet ROI</h2>
            <div className="text-3xl font-bold mono text-[var(--green)] mb-1">+14.2%</div>
            <p className="text-xs text-muted font-mono bg-[var(--bg)] p-2 rounded border border-[var(--line)]">
              (Rev - (Maint + Fuel)) / Cost
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
                  <Area type="monotone" dataKey="val" stroke="var(--teal)" fillOpacity={1} fill="url(#colorTeal)" isAnimationActive={true} />
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
                  <th>Vehicle</th>
                  <th>Driver</th>
                  <th>Status</th>
                  <th>ETA / Progress</th>
                </tr>
              </thead>
              <tbody>
                <tr className={typeFilter !== 'All types' && typeFilter !== 'Van' ? 'hidden' : ''}>
                  <td className="mono font-medium">TR001</td>
                  <td>VAN-05</td>
                  <td>Alex</td>
                  <td><span className="pill pill-blue"><span className="live-dot sm bg-blue-500"></span> On Trip</span></td>
                  <td style={{ width: '150px' }}>
                    <div className="flex justify-between text-xs mono mb-1">
                      <span>45m</span>
                      <span>40%</span>
                    </div>
                    <div className="eta-progress-container">
                      <div className="eta-progress-bar bg-blue" style={{ width: '40%' }}></div>
                    </div>
                  </td>
                </tr>
                
                <tr className={typeFilter !== 'All types' && typeFilter !== 'Truck' ? 'hidden' : ''}>
                  <td className="mono font-medium">TR002</td>
                  <td>TRK-12</td>
                  <td>John</td>
                  <td><span className="pill pill-green">Completed</span></td>
                  <td className="text-xs mono text-[var(--green)]">Arrived</td>
                </tr>
                
                <tr className={typeFilter !== 'All types' && typeFilter !== 'Mini' ? 'hidden' : ''}>
                  <td className="mono font-medium">TR003</td>
                  <td>MINI-08</td>
                  <td>Priya</td>
                  <td>
                    {dispatchStatus === 'dispatched' ? (
                      <span className="pill pill-blue"><span className="live-dot sm bg-blue-500"></span> Dispatched</span>
                    ) : (
                      <span className="pill pill-gray">Draft</span>
                    )}
                  </td>
                  <td style={{ width: '150px' }}>
                    {dispatchStatus === 'dispatched' ? (
                       <>
                         <div className="flex justify-between text-xs mono mb-1">
                           <span>1h 10m</span>
                           <span>10%</span>
                         </div>
                         <div className="eta-progress-container">
                           <div className="eta-progress-bar bg-blue" style={{ width: '10%' }}></div>
                         </div>
                       </>
                    ) : (
                      <span className="text-xs text-muted">Awaiting vehicle</span>
                    )}
                  </td>
                </tr>
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
                <span className="mono">42</span>
              </div>
              <div className="eta-progress-container bg-green-bg">
                <div className="eta-progress-bar bg-green" style={{ width: '70%' }}></div>
              </div>
            </div>

            <div className="status-bar-row">
              <div className="flex justify-between text-sm mb-1">
                <span className="font-medium text-text">On trip</span>
                <span className="mono">18</span>
              </div>
              <div className="eta-progress-container bg-blue-bg">
                <div className="eta-progress-bar bg-blue" style={{ width: '25%' }}></div>
              </div>
            </div>

            <div className="status-bar-row">
              <div className="flex justify-between text-sm mb-1">
                <span className="font-medium text-text">In shop</span>
                <span className="mono">5</span>
              </div>
              <div className="eta-progress-container bg-amber-bg">
                <div className="eta-progress-bar bg-amber" style={{ width: '8%' }}></div>
              </div>
            </div>

            <div className="status-bar-row">
              <div className="flex justify-between text-sm mb-1">
                <span className="font-medium text-text">Retired</span>
                <span className="mono">1</span>
              </div>
              <div className="eta-progress-container bg-red-bg">
                <div className="eta-progress-bar bg-red" style={{ width: '2%' }}></div>
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
            <span className="pill pill-red">3 action required</span>
          </div>
          
          <div className="flex flex-col gap-3">
            <div className="alert-card bg-red-bg border border-[var(--red)] rounded-md p-3 flex gap-3">
              <AlertCircle size={18} className="text-[var(--red)] mt-0.5" />
              <div>
                <div className="text-sm font-medium text-text">License Expiry</div>
                <div className="text-xs text-muted">Driver Priya's license expires in 3 days.</div>
              </div>
            </div>
            
            <div className="alert-card bg-amber-bg border border-[var(--amber)] rounded-md p-3 flex gap-3">
              <AlertTriangle size={18} className="text-[var(--amber)] mt-0.5" />
              <div>
                <div className="text-sm font-medium text-text">Vehicle Locked</div>
                <div className="text-xs text-muted">MINI-03 requires safety inspection.</div>
              </div>
            </div>

            <div className="alert-card bg-gray-bg border border-[var(--line)] rounded-md p-3 flex gap-3">
              <Wrench size={18} className="text-muted mt-0.5" />
              <div>
                <div className="text-sm font-medium text-text">Service Due</div>
                <div className="text-xs text-muted">VAN-05 odometer reached 50,000 km.</div>
              </div>
            </div>
          </div>
        </div>

        {/* Cost Breakdown Donut */}
        <div className="card flex items-center">
          <div className="flex-1">
            <h2 className="heading text-lg mb-1">Operating Costs</h2>
            <p className="text-xs text-muted mb-6">Month to date breakdown</p>
            
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: 'var(--teal)' }}></span> Fuel
                </div>
                <span className="mono font-medium">$45,000</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: 'var(--amber)' }}></span> Maintenance
                </div>
                <span className="mono font-medium">$25,000</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: 'var(--sub)' }}></span> Tolls & Other
                </div>
                <span className="mono font-medium">$12,000</span>
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
                  animationEasing="ease-out"
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
