import React, { useState, useEffect } from 'react';
import { LineChart, Line, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis, AreaChart, Area } from 'recharts';

// --- Helper: Count Up Hook ---
function useCountUp(end, duration = 1000, startDelay = 0) {
  const [count, setCount] = useState(0);

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

  return count;
}

// --- Mock Data ---
const sparklineData1 = [{ v: 45 }, { v: 48 }, { v: 50 }, { v: 49 }, { v: 51 }, { v: 52 }, { v: 53 }];
const sparklineData2 = [{ v: 35 }, { v: 38 }, { v: 40 }, { v: 43 }, { v: 41 }, { v: 42 }, { v: 42 }];
const fuelData = [
  { day: 'Mon', val: 8.5 }, { day: 'Tue', val: 8.7 }, { day: 'Wed', val: 9.1 },
  { day: 'Thu', val: 8.8 }, { day: 'Fri', val: 9.3 }, { day: 'Sat', val: 9.5 }, { day: 'Sun', val: 9.2 }
];

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [dispatchAnim, setDispatchAnim] = useState(false);

  // Staggered KPI counts
  const activeVehicles = useCountUp(53, 1000, 0);
  const availableVehicles = useCountUp(42, 1000, 200);
  const maintVehicles = useCountUp(5, 1000, 400);
  const activeTrips = useCountUp(18, 1000, 600);

  useEffect(() => {
    // Simulate async data fetching
    const timer = setTimeout(() => setLoading(false), 800);
    return () => clearTimeout(timer);
  }, []);

  // Simulate a status morphing dispatch event
  const triggerDispatch = () => {
    setDispatchAnim(true);
    setTimeout(() => setDispatchAnim(false), 2000);
  };

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

  return (
    <div className="fade-in">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl heading">Control Tower</h1>
        <div className="flex gap-4">
          <button className="btn btn-primary pulse-blue" onClick={triggerDispatch}>
            Simulate Dispatch
          </button>
        </div>
      </div>

      {/* KPI Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        
        {/* KPI 1 */}
        <div className="card kpi-card" style={{ paddingBottom: '0' }}>
          <div className="text-muted text-xs font-semibold uppercase tracking-wider mb-1">Active Vehicles</div>
          <div className="text-3xl font-bold mono kpi-value mb-2">{activeVehicles}</div>
          <div style={{ height: '40px', width: '100%', marginLeft: '-1.5rem', marginRight: '-1.5rem', width: 'calc(100% + 3rem)' }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sparklineData1}>
                <Line type="monotone" dataKey="v" stroke="var(--accent-purple)" strokeWidth={2} dot={false} isAnimationActive={true} />
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
            <span role="img" aria-label="lock">🔒</span> Auto-locked from dispatch
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
              {/* Route 1 */}
              <div className="route-row">
                <div className="mono text-xs w-16">TR001</div>
                <div className="route-visual">
                  <div className="route-node-start"></div>
                  <div className="route-dot" style={{ left: '40%' }}></div>
                  <div className="route-node-end"></div>
                </div>
                <div className="text-xs font-medium w-32 text-right">VAN-05 / Alex</div>
              </div>
              {/* Route 2 */}
              <div className="route-row">
                <div className="mono text-xs w-16">TR002</div>
                <div className="route-visual" style={{ opacity: 0.5 }}>
                  <div className="route-node-start" style={{ background: 'var(--status-green)' }}></div>
                  <div className="route-dot" style={{ left: '100%', background: 'var(--status-green)', boxShadow: 'none' }}></div>
                  <div className="route-node-end"></div>
                </div>
                <div className="text-xs font-medium w-32 text-right text-status-green">Completed</div>
              </div>
              {/* Route 3 */}
              <div className="route-row">
                <div className="mono text-xs w-16">TR003</div>
                <div className="route-visual">
                  <div className="route-node-start"></div>
                  <div className="route-dot" style={{ left: dispatchAnim ? '10%' : '0%', transition: 'left 2s ease' }}></div>
                  <div className="route-node-end"></div>
                </div>
                <div className="text-xs font-medium w-32 text-right">MINI-08 / Priya</div>
              </div>
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
                    <th>Vehicle</th>
                    <th>Driver</th>
                    <th>Status</th>
                    <th>ETA / Progress</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="mono font-medium">TR001</td>
                    <td>VAN-05</td>
                    <td>Alex</td>
                    <td><span className="pill pill-blue">On Trip</span></td>
                    <td style={{ width: '150px' }}>
                      <div className="flex justify-between text-xs mono mb-1">
                        <span>45m</span>
                        <span>40%</span>
                      </div>
                      <div className="eta-progress-container">
                        <div className="eta-progress-bar" style={{ width: '40%' }}></div>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td className="mono font-medium">TR002</td>
                    <td>TRK-12</td>
                    <td>John</td>
                    <td><span className="pill pill-green">Completed</span></td>
                    <td className="text-xs mono text-status-green">Arrived</td>
                  </tr>
                  <tr>
                    <td className="mono font-medium">TR003</td>
                    <td>MINI-08</td>
                    <td>Priya</td>
                    <td>
                      <span className={`pill ${dispatchAnim ? 'pill-blue morphing-to-blue' : 'pill-gray'}`}>
                        {dispatchAnim ? 'Dispatched' : 'Draft'}
                      </span>
                    </td>
                    <td style={{ width: '150px' }}>
                      {dispatchAnim ? (
                         <>
                           <div className="flex justify-between text-xs mono mb-1">
                             <span>1h 10m</span>
                             <span>10%</span>
                           </div>
                           <div className="eta-progress-container">
                             <div className="eta-progress-bar" style={{ width: '10%' }}></div>
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
        </div>

        {/* Right Column */}
        <div className="flex-col gap-6">
          
          {/* Vehicle ROI Widget */}
          <div className="card" style={{ borderLeft: '4px solid var(--status-green)' }}>
            <h2 className="heading text-sm uppercase text-muted tracking-wide mb-4">Fleet ROI</h2>
            <div className="flex items-end gap-2 mb-1">
              <span className="text-3xl font-bold mono text-status-green">+14.2%</span>
            </div>
            <p className="text-xs text-muted font-mono bg-app p-2 rounded border border-gray-200 mt-2">
              (Rev - (Maint + Fuel)) / Cost
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
