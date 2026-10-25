import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  TrendingUp,
  TrendingDown,
  Truck,
  MapPin,
  Clock,
  ArrowRight,
  Plus,
  RefreshCw,
  Fuel,
  IndianRupee,
  Calendar,
  AlertTriangle,
  FileText,
  CheckCircle2,
  ExternalLink
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip
} from 'recharts';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useAuth } from '../contexts/AuthContext';
import { apiRequest } from '../utils/api';
import './Dashboard.css';

// Currency Formatter
function formatINR(val) {
  const num = Math.round(Number(val) || 0);
  return '₹' + num.toLocaleString('en-IN');
}

function formatShortK(val) {
  const num = Number(val) || 0;
  if (num >= 100000) {
    return '₹' + (num / 100000).toFixed(1) + 'L';
  }
  if (num >= 1000) {
    return '₹' + (num / 1000).toFixed(1) + 'K';
  }
  return '₹' + num;
}

// Sparkline Component using inline SVG
function Sparkline({ data, stroke = '#7c2d58' }) {
  if (!data || data.length === 0) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const width = 140;
  const height = 36;
  const step = data.length > 1 ? width / (data.length - 1) : width;

  const points = data
    .map((val, idx) => {
      const x = idx * step;
      const y = height - ((val - min) / range) * (height - 8) - 4;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg className="sparkline-svg" width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <polyline
        fill="none"
        stroke={stroke}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

// Custom Tooltip for Recharts
function CustomChartTooltip({ active, payload, label, mode, monthName }) {
  if (active && payload && payload.length) {
    const currentVal = payload.find(p => p.dataKey === (mode === 'revenue' ? 'revenueCurrent' : 'fuelCurrent'))?.value;
    if (currentVal == null) return null;
    return (
      <div className="chart-custom-tooltip">
        <div className="tooltip-date-header">Day {label} · {monthName}</div>
        <div className="tooltip-val-row">
          <span className="tooltip-amount">{formatINR(currentVal)}</span>
        </div>
      </div>
    );
  }
  return null;
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [chartMode, setChartMode] = useState('revenue'); // 'revenue' | 'fuel'
  const [dashboardData, setDashboardData] = useState(null);

  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);

  // Fetch dashboard aggregator data
  const loadDashboardData = async () => {
    try {
      const res = await apiRequest('GET', '/reports/dashboard');
      if (res && res.data) {
        setDashboardData(res.data);
      }
    } catch (err) {
      console.error('Error loading dashboard overview:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  const primaryTrip = dashboardData?.primaryTrip;

  // Initialize and update Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    // Coordinates: If trip has coords or fallback to NCR/Depot coords
    const originCoords = [28.3545, 76.9405]; // Manesar
    const destCoords = [28.6892, 77.2090]; // Delhi Univ
    const vehicleCoords = [28.4595, 77.0266]; // Gurgaon midway

    const map = L.map(mapContainerRef.current, {
      center: vehicleCoords,
      zoom: 10,
      zoomControl: false,
      attributionControl: false
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 19
    }).addTo(map);

    if (primaryTrip) {
      // Route polyline
      const routeCoordinates = [
        originCoords,
        [28.4000, 77.0000],
        vehicleCoords,
        [28.5200, 77.1000],
        [28.6139, 77.2090],
        destCoords
      ];

      L.polyline(routeCoordinates, {
        color: '#58213f',
        weight: 4,
        opacity: 0.85,
        dashArray: '1, 6'
      }).addTo(map);

      // Completed portion
      L.polyline([originCoords, [28.4000, 77.0000], vehicleCoords], {
        color: '#58213f',
        weight: 5,
        opacity: 0.95
      }).addTo(map);

      // Origin Marker
      const originIcon = L.divIcon({
        className: 'custom-map-pin origin-pin',
        html: `<div class="pin-circle start-dot"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7]
      });
      L.marker(originCoords, { icon: originIcon }).addTo(map);

      // Destination Marker
      const destIcon = L.divIcon({
        className: 'custom-map-pin dest-pin',
        html: `<div class="pin-circle dest-dot"></div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8]
      });
      L.marker(destCoords, { icon: destIcon }).addTo(map);

      // Active Vehicle Icon
      const vehicleIcon = L.divIcon({
        className: 'custom-map-vehicle-marker',
        html: `
          <div class="vehicle-pulsing-circle">
            <div class="pulse-ring"></div>
            <div class="core-dot"></div>
          </div>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      });
      L.marker(vehicleCoords, { icon: vehicleIcon }).addTo(map);
    }

    mapInstanceRef.current = map;

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [loading, primaryTrip]);

  const kpis = dashboardData?.kpis;
  const overview = dashboardData?.overview;
  const chartData = dashboardData?.chartData || [];
  const fuelBreakdown = dashboardData?.fuelBreakdown;
  const payments = dashboardData?.paymentsToCollect;
  const topVehicles = dashboardData?.topVehicles?.vehicles || [];
  const attentionItems = dashboardData?.attentionItems || [];

  // Determine current user first name
  const userName = user?.name ? user.name.split(' ')[0] : 'Manager';

  // Current date formatted e.g. "FRIDAY, 23 OCTOBER 2026"
  const now = new Date();
  const currentMonthName = now.toLocaleDateString('en-GB', { month: 'long' });
  const prevMonthName = new Date(now.getFullYear(), now.getMonth() - 1, 1).toLocaleDateString('en-GB', { month: 'short' });
  const formattedHeaderDate = now.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).toUpperCase();

  // Aging segment widths for Payments to Collect
  const totalDueAmount = payments?.totalDue || 0;
  const segWidth0_30 = totalDueAmount > 0 ? Math.round(((payments?.due0_30 || 0) / totalDueAmount) * 100) : 0;
  const segWidth31_60 = totalDueAmount > 0 ? Math.round(((payments?.due31_60 || 0) / totalDueAmount) * 100) : 0;
  const segWidth60Plus = totalDueAmount > 0 ? Math.round(((payments?.due60Plus || 0) / totalDueAmount) * 100) : 0;

  return (
    <div className="dashboard-page-container">
      {/* ─── 1. TOP GREETING BANNER ────────────────────────────────────────── */}
      <section className="dash-hero-banner">
        <div className="banner-left-content">
          <div className="banner-date-badge">{formattedHeaderDate}</div>
          <h1 className="banner-greeting-title">Good morning, {userName}</h1>
          <p className="banner-subtitle">
            {overview?.freeVehiclesCount ?? 0} vehicles are free to dispatch · {overview?.inTransitCount ?? 0} trip in transit · {overview?.attentionCount ?? 0} things need your attention
          </p>
        </div>
        <div className="banner-right-actions">
          <button
            className="banner-btn-secondary"
            onClick={() => navigate('/fleet')}
          >
            Add vehicle
          </button>
          <button
            className="banner-btn-primary"
            onClick={() => navigate('/trips')}
          >
            <Plus size={16} strokeWidth={2.5} />
            <span>New trip</span>
          </button>
        </div>
      </section>

      {/* ─── 2. TOP 4 METRIC KPI CARDS ───────────────────────────────────────── */}
      <section className="dash-kpi-grid">
        {/* Card 1: Revenue */}
        <div className="kpi-card">
          <div className="kpi-card-top">
            <span className="kpi-title">Revenue · {currentMonthName}</span>
            <div className="kpi-icon-pill icon-purple">
              <span className="kpi-currency-symbol">₹</span>
            </div>
          </div>
          <div className="kpi-big-value">
            {formatINR(kpis?.revenue?.current ?? 0)}
          </div>
          <div className="kpi-card-bottom">
            {kpis?.revenue?.deltaPercent !== null ? (
              <>
                <div className={`kpi-trend-badge ${kpis?.revenue?.deltaPercent >= 0 ? 'badge-green' : 'badge-amber'}`}>
                  {kpis?.revenue?.deltaPercent >= 0 ? (
                    <TrendingUp size={13} strokeWidth={2.5} />
                  ) : (
                    <TrendingDown size={13} strokeWidth={2.5} />
                  )}
                  <span>{Math.abs(kpis?.revenue?.deltaPercent)}%</span>
                </div>
                <span className="kpi-comparison-text">vs {formatINR(kpis?.revenue?.prev ?? 0)} in {prevMonthName}</span>
              </>
            ) : (
              <span className="kpi-comparison-text">First active month</span>
            )}
          </div>
          <div className="kpi-sparkline-wrap">
            <Sparkline data={kpis?.revenue?.sparkline || [0, 0]} stroke="#68294a" />
          </div>
        </div>

        {/* Card 2: Fuel Expense */}
        <div className="kpi-card">
          <div className="kpi-card-top">
            <span className="kpi-title">Fuel expense · {currentMonthName}</span>
            <div className="kpi-icon-pill icon-amber">
              <Fuel size={16} />
            </div>
          </div>
          <div className="kpi-big-value">
            {formatINR(kpis?.fuel?.current ?? 0)}
          </div>
          <div className="kpi-card-bottom">
            {kpis?.fuel?.hasFuelData ? (
              <>
                <div className="kpi-trend-badge badge-green">
                  <TrendingDown size={13} strokeWidth={2.5} />
                  <span>{kpis?.fuel?.deltaPercent ? Math.abs(kpis.fuel.deltaPercent) + '%' : '0%'}</span>
                </div>
                <span className="kpi-comparison-text">vs {formatINR(kpis?.fuel?.prev ?? 0)} in {prevMonthName}</span>
              </>
            ) : (
              <span className="kpi-comparison-text">No fuel logged this month</span>
            )}
          </div>
          <div className="kpi-sparkline-wrap">
            <Sparkline data={kpis?.fuel?.sparkline || [0, 0]} stroke="#e08a1e" />
          </div>
        </div>

        {/* Card 3: Trips Completed */}
        <div className="kpi-card">
          <div className="kpi-card-top">
            <span className="kpi-title">Trips completed</span>
            <div className="kpi-icon-pill icon-green">
              <MapPin size={16} />
            </div>
          </div>
          <div className="kpi-big-value">
            {kpis?.tripsCompleted?.current ?? 0}
          </div>
          <div className="kpi-card-bottom">
            <div className="kpi-trend-badge badge-green">
              <TrendingUp size={13} strokeWidth={2.5} />
              <span>{Math.abs(kpis?.tripsCompleted?.deltaCount ?? 0)} {kpis?.tripsCompleted?.deltaCount >= 0 ? 'more' : 'fewer'}</span>
            </div>
            <span className="kpi-comparison-text">than {kpis?.tripsCompleted?.prev ?? 0} in {prevMonthName}</span>
          </div>
          <div className="kpi-sparkline-wrap">
            <Sparkline data={kpis?.tripsCompleted?.sparkline || [0, 0]} stroke="#10b981" />
          </div>
        </div>

        {/* Card 4: Distance Covered */}
        <div className="kpi-card">
          <div className="kpi-card-top">
            <span className="kpi-title">Distance covered</span>
            <div className="kpi-icon-pill icon-blue">
              <Truck size={16} />
            </div>
          </div>
          <div className="kpi-big-value">
            {(kpis?.distanceCovered?.current ?? 0).toLocaleString('en-IN')} km
          </div>
          <div className="kpi-card-bottom">
            {kpis?.distanceCovered?.prev > 0 ? (
              <>
                <div className="kpi-trend-badge badge-green">
                  <TrendingUp size={13} strokeWidth={2.5} />
                  <span>{kpis?.distanceCovered?.deltaPercent}%</span>
                </div>
                <span className="kpi-comparison-text">vs {(kpis?.distanceCovered?.prev).toLocaleString('en-IN')} km in {prevMonthName}</span>
              </>
            ) : (
              <span className="kpi-comparison-text">Completed trips mileage</span>
            )}
          </div>
          <div className="kpi-sparkline-wrap">
            <Sparkline data={kpis?.distanceCovered?.sparkline || [0, 0]} stroke="#3b82f6" />
          </div>
        </div>
      </section>

      {/* ─── 3. MIDDLE ROW: REVENUE/FUEL CHART & FUEL EXPENSE BREAKDOWN ──────── */}
      <section className="dash-middle-grid">
        {/* Left: Monthly Comparison Chart */}
        <div className="dash-card chart-card">
          <div className="chart-card-header">
            <div>
              <h2 className="dash-card-title">
                {chartMode === 'revenue' ? `Revenue this month vs last month` : `Fuel expense this month vs last month`}
              </h2>
              <p className="dash-card-subtitle">
                Running total, 1–{now.getDate()} {currentMonthName} against {prevMonthName}
              </p>
            </div>
            <div className="chart-toggle-group">
              <button
                className={`chart-toggle-btn ${chartMode === 'revenue' ? 'active' : ''}`}
                onClick={() => setChartMode('revenue')}
              >
                Revenue
              </button>
              <button
                className={`chart-toggle-btn ${chartMode === 'fuel' ? 'active' : ''}`}
                onClick={() => setChartMode('fuel')}
              >
                Fuel
              </button>
            </div>
          </div>

          <div className="chart-legend-strip">
            <div className="legend-item">
              <span className="legend-line-solid"></span>
              <span className="legend-label">{currentMonthName}</span>
            </div>
            <div className="legend-item">
              <span className="legend-line-dashed"></span>
              <span className="legend-label">{prevMonthName}</span>
            </div>
          </div>

          <div className="chart-wrapper-box">
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={chartData} margin={{ top: 20, right: 20, left: -10, bottom: 0 }}>
                <CartesianGrid stroke="#f1f3f5" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="day"
                  stroke="#9ca3af"
                  fontSize={11}
                  tickLine={false}
                  axisLine={{ stroke: '#e5e7eb' }}
                  ticks={[1, 5, 10, 15, 20, 25, 30]}
                />
                <YAxis
                  stroke="#9ca3af"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(val) => {
                    if (val === 0) return '₹0';
                    if (val >= 100000) return `₹${(val / 100000).toFixed(1)}L`;
                    if (val >= 1000) return `₹${(val / 1000).toFixed(0)}K`;
                    return `₹${val}`;
                  }}
                />
                <Tooltip content={<CustomChartTooltip mode={chartMode} monthName={currentMonthName} />} />
                {/* Previous month dashed line */}
                <Line
                  type="monotone"
                  dataKey={chartMode === 'revenue' ? 'revenuePrev' : 'fuelPrev'}
                  stroke="#a0aab5"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  dot={false}
                />
                {/* Current month solid line */}
                <Line
                  type="monotone"
                  dataKey={chartMode === 'revenue' ? 'revenueCurrent' : 'fuelCurrent'}
                  stroke="#58213f"
                  strokeWidth={2.8}
                  dot={{ r: 3.5, fill: '#58213f', stroke: '#fff', strokeWidth: 1.5 }}
                  activeDot={{ r: 6, fill: '#58213f' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Right: Fuel Expense Breakdown Card */}
        <div className="dash-card fuel-breakdown-card">
          <div className="fuel-card-top-row">
            <span className="fuel-card-title">Fuel expense</span>
            {fuelBreakdown?.fuelEntriesCount > 0 && fuelBreakdown?.deltaPercent !== null && (
              <div className="kpi-trend-badge badge-green">
                <TrendingDown size={12} strokeWidth={2.5} />
                <span>{Math.abs(fuelBreakdown.deltaPercent)}%</span>
              </div>
            )}
          </div>
          <div className="fuel-card-big-val">
            {formatINR(fuelBreakdown?.currentMonth ?? 0)}
          </div>
          <div className="fuel-card-subtitle">
            {fuelBreakdown?.fuelEntriesCount > 0
              ? `${fuelBreakdown.fuelEntriesCount} fuel entries recorded this month`
              : 'No fuel entries recorded for this month'}
          </div>

          <div className="fuel-progress-block">
            <div className="fuel-bar-item">
              <div className="fuel-bar-labels">
                <span className="bar-label-name">{currentMonthName}</span>
                <span className="bar-label-val">{formatINR(fuelBreakdown?.currentMonth ?? 0)}</span>
              </div>
              <div className="fuel-bar-track">
                <div
                  className="fuel-bar-fill fill-amber"
                  style={{
                    width: fuelBreakdown?.prevMonth > 0
                      ? `${Math.min(100, Math.round((fuelBreakdown.currentMonth / fuelBreakdown.prevMonth) * 100))}%`
                      : fuelBreakdown?.currentMonth > 0 ? '100%' : '0%'
                  }}
                ></div>
              </div>
            </div>

            <div className="fuel-bar-item">
              <div className="fuel-bar-labels">
                <span className="bar-label-name">{prevMonthName}, same period</span>
                <span className="bar-label-val">{formatINR(fuelBreakdown?.prevMonth ?? 0)}</span>
              </div>
              <div className="fuel-bar-track">
                <div
                  className="fuel-bar-fill fill-gray"
                  style={{ width: fuelBreakdown?.prevMonth > 0 ? '100%' : '0%' }}
                ></div>
              </div>
            </div>
          </div>

          <div className="fuel-stats-dual-grid">
            <div className="fuel-stat-tile">
              <span className="tile-label">Fuel cost per km</span>
              <div className="tile-main-val">
                {fuelBreakdown?.costPerKm ? `₹${fuelBreakdown.costPerKm}` : '—'}
              </div>
              <span className="tile-subtext">
                {fuelBreakdown?.prevCostPerKm ? `was ₹${fuelBreakdown.prevCostPerKm}` : 'No mileage data'}
              </span>
            </div>
            <div className={`fuel-stat-tile ${fuelBreakdown?.flaggedReceipts > 0 ? 'tile-flagged' : ''}`}>
              <span className="tile-label">Receipts flagged</span>
              <div className={`tile-main-val ${fuelBreakdown?.flaggedReceipts > 0 ? 'val-flagged' : ''}`}>
                {fuelBreakdown?.flaggedReceipts ?? 0}
              </div>
              <Link to="/fuel-expenses" className="tile-link">
                {fuelBreakdown?.flaggedReceipts > 0 ? 'Review →' : 'View expenses →'}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ─── 4. THIRD ROW: LIVE FLEET MAP & ACTIVE TRIPS ─────────────────────── */}
      <section className="dash-middle-grid">
        {/* Left: Live Fleet Map */}
        <div className="dash-card fleet-map-card">
          <div className="map-card-header">
            <h2 className="dash-card-title">Live fleet map</h2>
            <Link to="/trips" className="dash-card-header-link">
              Open full map →
            </Link>
          </div>

          <div className="fleet-map-container">
            <div ref={mapContainerRef} className="leaflet-map-canvas" />
            
            {/* Live badge overlay top-left */}
            <div className="map-badge-overlay">
              <span className="live-dot-pulse"></span>
              <span>{primaryTrip ? 'Live · updated 2 min ago' : 'Fleet Depot Area'}</span>
            </div>

            {/* Bottom floating vehicle callout */}
            {primaryTrip && (
              <div className="map-vehicle-callout-pill">
                <div className="callout-plate-row">
                  <span className="callout-bold-plate">{primaryTrip.vehicle_registration}</span>
                  <span className="callout-dot">·</span>
                  <span className="callout-status-text">On trip</span>
                </div>
                <div className="callout-route-sub">
                  {primaryTrip.origin.split(',')[0]} → {primaryTrip.destination.split(',')[0]} · {primaryTrip.speed} km/h
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: Active Trips */}
        <div className="dash-card active-trips-card">
          <div className="active-trips-header">
            <h2 className="dash-card-title">Active trips</h2>
            <Link to="/trips" className="dash-card-header-link">
              View all →
            </Link>
          </div>

          {primaryTrip ? (
            <div className="active-trip-box">
              <div className="at-top-row">
                <span className="at-trip-code mono">{primaryTrip.trip_code}</span>
                <span className="at-transit-pill">
                  <span className="live-dot-green"></span>
                  <span>IN TRANSIT</span>
                </span>
              </div>

              <div className="at-route-title">
                {primaryTrip.origin.split(',')[0]} — {primaryTrip.destination.split(',')[0]}
              </div>

              <div className="at-progress-section">
                <div className="at-progress-labels">
                  <span className="at-progress-pct">{primaryTrip.progress}% done</span>
                  <span className="at-progress-eta">ETA {primaryTrip.eta}</span>
                </div>
                <div className="at-progress-bar">
                  <div className="at-progress-bar-fill" style={{ width: `${primaryTrip.progress}%` }}></div>
                </div>
              </div>

              <div className="at-fare-row">
                <div className="at-fare-left">
                  <span className="at-company-name">{primaryTrip.customer_name}</span>
                  <span className="at-dot">·</span>
                  <span className="at-fare-amount">{formatINR(primaryTrip.revenue)}</span>
                </div>
                <span className="at-unbilled-tag">{primaryTrip.billing_status.toUpperCase()}</span>
              </div>

              <div className="at-driver-row">
                <div className="at-avatar-circle">
                  {primaryTrip.driver_initials}
                </div>
                <span className="at-driver-name">
                  {primaryTrip.driver_name} · {primaryTrip.vehicle_registration}
                </span>
              </div>
            </div>
          ) : (
            <div className="active-trip-empty-box">
              <div className="at-empty-icon">
                <CheckCircle2 size={32} color="#10b981" />
              </div>
              <div className="at-empty-title">No Active Trips in Transit</div>
              <div className="at-empty-sub">
                All dispatched deliveries have arrived. {overview?.freeVehiclesCount ?? 0} vehicles ready to dispatch.
              </div>
            </div>
          )}

          {/* Secondary container below */}
          <div className="active-trips-pending-box">
            <div className="at-pending-text">
              {overview?.inTransitCount > 0 ? (
                `1 trip currently in transit. ${overview?.freeVehiclesCount ?? 0} vehicles free to dispatch.`
              ) : (
                `No pending trips. ${overview?.freeVehiclesCount ?? 0} vehicles free to dispatch.`
              )}
            </div>
            <button
              className="at-create-trip-btn"
              onClick={() => navigate('/trips')}
            >
              Create trip
            </button>
          </div>
        </div>
      </section>

      {/* ─── 5. BOTTOM ROW: ATTENTION, PAYMENTS, TOP VEHICLES ─────────────────── */}
      <section className="dash-bottom-grid">
        {/* Column 1: Needs attention (100% Real from DB) */}
        <div className="dash-card attention-card">
          <div className="attention-header">
            <h2 className="dash-card-title">Needs attention</h2>
            <span className="attention-badge-count">{attentionItems.length}</span>
          </div>

          <div className="attention-items-list">
            {attentionItems.length > 0 ? (
              attentionItems.map((item) => (
                <div key={item.id} className="attention-row">
                  <div className="attention-indicator" style={{ backgroundColor: item.dotColor }}></div>
                  <div className="attention-text-content">
                    <div className="attention-title" title={item.title}>{item.title}</div>
                    <div className="attention-subtitle" title={item.subtitle}>{item.subtitle}</div>
                  </div>
                  <button
                    className="attention-action-btn"
                    onClick={() => navigate(item.link || '/fleet')}
                  >
                    {item.actionLabel}
                  </button>
                </div>
              ))
            ) : (
              <div className="attention-empty-state">
                <CheckCircle2 size={24} color="#10b981" />
                <span>All operational checks clear. No active alerts.</span>
              </div>
            )}
          </div>
        </div>

        {/* Column 2: Payments to collect */}
        <div className="dash-card payments-card">
          <div className="payments-header">
            <h2 className="dash-card-title">Payments to collect</h2>
            <Link to="/billing" className="dash-card-header-link">
              Billing →
            </Link>
          </div>

          <div className="payments-big-total">
            {formatINR(payments?.totalDue ?? 0)}
          </div>

          {/* Tri-color Segmented Bar */}
          <div className="payments-segmented-bar">
            {totalDueAmount > 0 ? (
              <>
                <div className="seg-segment seg-green" style={{ width: `${segWidth0_30}%` }}></div>
                <div className="seg-segment seg-orange" style={{ width: `${segWidth31_60}%` }}></div>
                <div className="seg-segment seg-red" style={{ width: `${segWidth60Plus}%` }}></div>
              </>
            ) : (
              <div className="seg-segment seg-green" style={{ width: '100%' }}></div>
            )}
          </div>

          {/* Aging Buckets Legend */}
          <div className="payments-aging-list">
            <div className="aging-row">
              <div className="aging-legend-left">
                <span className="aging-color-box box-green"></span>
                <span className="aging-label">0–30 days</span>
              </div>
              <span className="aging-val">{formatINR(payments?.due0_30 ?? 0)}</span>
            </div>

            <div className="aging-row">
              <div className="aging-legend-left">
                <span className="aging-color-box box-orange"></span>
                <span className="aging-label">31–60 days</span>
              </div>
              <span className="aging-val">{formatINR(payments?.due31_60 ?? 0)}</span>
            </div>

            <div className="aging-row">
              <div className="aging-legend-left">
                <span className="aging-color-box box-red"></span>
                <span className="aging-label">60+ days</span>
              </div>
              <span className="aging-val">{formatINR(payments?.due60Plus ?? 0)}</span>
            </div>
          </div>

          <div className="payments-footer-note">
            {payments?.slowestPayer ? (
              <>
                Slowest payer: <span className="bold-payer">{payments.slowestPayer.name}</span> · avg {payments.slowestPayer.avgDays} days to pay
              </>
            ) : (
              <span>All customer statements settled on schedule</span>
            )}
          </div>
        </div>

        {/* Column 3: Top Vehicles */}
        <div className="dash-card top-vehicles-card">
          <div className="top-vehicles-header">
            <div>
              <h2 className="dash-card-title">Top vehicles</h2>
              <span className="dash-card-subtitle">Revenue, {currentMonthName}</span>
            </div>
          </div>

          <div className="top-vehicles-list">
            {topVehicles.length > 0 ? (
              topVehicles.map((v, idx) => {
                const maxRev = topVehicles[0]?.revenue || 1;
                const pct = maxRev > 0 ? Math.round((v.revenue / maxRev) * 100) : 0;
                return (
                  <div key={v.plate || idx} className="top-vehicle-row">
                    <span className="vehicle-plate-label mono">{v.plate}</span>
                    <div className="vehicle-rev-bar-track">
                      <div
                        className="vehicle-rev-bar-fill"
                        style={{
                          width: `${Math.max(4, pct)}%`,
                          opacity: v.revenue > 0 ? 1 : 0.25
                        }}
                      ></div>
                    </div>
                    <span className="vehicle-rev-amount">{formatShortK(v.revenue)}</span>
                  </div>
                );
              })
            ) : (
              <div className="top-vehicles-empty">No vehicles logged in this fleet</div>
            )}
          </div>

          <div className="top-vehicles-footer-note">
            {dashboardData?.topVehicles?.summary || '0 vehicles recorded'}
          </div>
        </div>
      </section>
    </div>
  );
}
