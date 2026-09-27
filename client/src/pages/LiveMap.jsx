import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Navigation, RefreshCw, Truck, Radio, MapPin, Gauge,
  Clock, User, CheckCircle2, AlertCircle, Compass, Layers
} from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { apiRequest } from '../utils/api';
import './LiveMap.css';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || '';
const LOCATION_STALE_MS = 30_000;

function isLocationStale(trip) {
  if (trip.latitude == null || trip.longitude == null || !trip.captured_at) return true;
  const capturedAt = new Date(trip.captured_at).getTime();
  const age = Date.now() - capturedAt;
  return !Number.isFinite(capturedAt) || age < 0 || age > LOCATION_STALE_MS;
}

// ─── Mapbox tile URL helper (same logic as TripDispatcher) ───────────────────
function getMapboxTileLayer(theme = 'streets') {
  if (!MAPBOX_TOKEN) {
    return {
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      options: { attribution: '© OpenStreetMap contributors', maxZoom: 19, tileSize: 256, zoomOffset: 0 }
    };
  }
  const styles = {
    streets:    'mapbox/streets-v12',
    light:      'mapbox/light-v11',
    navigation: 'mapbox/navigation-day-v1',
    outdoors:   'mapbox/outdoors-v12',
    satellite:  'mapbox/satellite-streets-v12',
  };
  const style = styles[theme] || styles.streets;
  return {
    url: `https://api.mapbox.com/styles/v1/${style}/tiles/512/{z}/{x}/{y}@2x?access_token=${MAPBOX_TOKEN}`,
    options: {
      attribution: '© <a href="https://www.mapbox.com/">Mapbox</a> © <a href="https://www.openstreetmap.org/">OpenStreetMap</a>',
      tileSize: 512,
      zoomOffset: -1,
      maxZoom: 20,
    }
  };
}

// ─── Custom vehicle marker ────────────────────────────────────────────────────
function createVehicleIcon(vehicle, isSelected, isStale) {
  const heading = vehicle.heading != null ? vehicle.heading : 0;
  const isLive = vehicle.latitude != null && vehicle.longitude != null;
  const bg = isSelected ? '#e08a1e' : isLive && !isStale ? '#22a06b' : '#d97706';

  return L.divIcon({
    className: 'custom-vehicle-marker-wrapper',
    html: `
      <div style="
        background: ${bg};
        color: white;
        border: 2.5px solid white;
        border-radius: 50%;
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 16px rgba(0,0,0,0.28);
        cursor: pointer;
        position: relative;
        transform: rotate(${heading}deg);
        transition: background 0.3s ease;
      ">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none">
          <polygon points="12 2 19 21 12 17 5 21 12 2"></polygon>
        </svg>
      </div>
      <div style="
        background: rgba(43, 37, 48, 0.92);
        color: white;
        font-family: Inter, sans-serif;
        font-size: 10px;
        font-weight: 700;
        padding: 2px 7px;
        border-radius: 4px;
        white-space: nowrap;
        position: absolute;
        bottom: -22px;
        left: 50%;
        transform: translateX(-50%);
        pointer-events: none;
        border: 1px solid rgba(255,255,255,0.15);
        letter-spacing: 0.3px;
      ">
        ${vehicle.vehicle_registration || 'Vehicle'}
      </div>
    `,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -24]
  });
}

const MAP_THEMES = ['streets', 'light', 'navigation', 'outdoors', 'satellite'];

export default function LiveMap() {
  const [activeTrips, setActiveTrips] = useState([]);
  const [selectedTripId, setSelectedTripId] = useState(null);
  const [breadcrumbs, setBreadcrumbs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState(new Date());
  const [autoPoll, setAutoPoll] = useState(true);
  const [mapTheme, setMapTheme] = useState('streets');

  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const tileLayerRef = useRef(null);
  const markersGroupRef = useRef(null);
  const trailLayerRef = useRef(null);

  // ─── Initialize Mapbox Map ─────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const defaultCenter = [23.0225, 72.5714]; // Ahmedabad
    const map = L.map(mapContainerRef.current, {
      center: defaultCenter,
      zoom: 11,
      zoomControl: true,
    });

    const { url, options } = getMapboxTileLayer(mapTheme);
    tileLayerRef.current = L.tileLayer(url, options).addTo(map);

    markersGroupRef.current = L.layerGroup().addTo(map);
    trailLayerRef.current = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      tileLayerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Swap tile layer when theme changes ────────────────────────────────────
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }
    const { url, options } = getMapboxTileLayer(mapTheme);
    tileLayerRef.current = L.tileLayer(url, options).addTo(map);
  }, [mapTheme]);

  // ─── Fetch active trips ────────────────────────────────────────────────────
  const fetchActiveLocations = useCallback(async (isManual = false) => {
    try {
      if (isManual) setIsRefreshing(true);
      const res = await apiRequest('GET', '/locations/active');
      if (res && res.data) {
        setActiveTrips(res.data);
        setLastRefreshedAt(new Date());
      }
    } catch (err) {
      console.warn('Failed to load active vehicle locations:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchActiveLocations(); }, [fetchActiveLocations]);

  // Polling every 6 s
  useEffect(() => {
    if (!autoPoll) return;
    const interval = setInterval(() => fetchActiveLocations(), 6000);
    return () => clearInterval(interval);
  }, [autoPoll, fetchActiveLocations]);

  // ─── Breadcrumb trail for selected trip ───────────────────────────────────
  useEffect(() => {
    if (!selectedTripId) {
      setBreadcrumbs([]);
      if (trailLayerRef.current) trailLayerRef.current.clearLayers();
      return;
    }

    let isMounted = true;
    apiRequest('GET', `/locations/trip/${selectedTripId}`)
      .then((res) => {
        if (!isMounted) return;
        const points = res.data || [];
        setBreadcrumbs(points);

        if (trailLayerRef.current && mapInstanceRef.current && points.length > 1) {
          trailLayerRef.current.clearLayers();
          const latLngs = points.map(p => [parseFloat(p.latitude), parseFloat(p.longitude)]);

          // Dashed amber polyline for the breadcrumb trail
          const polyline = L.polyline(latLngs, {
            color: '#e08a1e',
            weight: 4,
            opacity: 0.9,
            dashArray: '10, 8',
            lineJoin: 'round'
          }).addTo(trailLayerRef.current);

          // Small dot at every recorded point
          latLngs.forEach((pt, i) => {
            if (i === 0 || i === latLngs.length - 1) return;
            L.circleMarker(pt, {
              radius: 3,
              color: '#e08a1e',
              fillColor: '#fff',
              fillOpacity: 1,
              weight: 2,
            }).addTo(trailLayerRef.current);
          });

          mapInstanceRef.current.fitBounds(polyline.getBounds(), { padding: [60, 60] });
        }
      })
      .catch((err) => console.warn('Failed to load breadcrumbs:', err));

    return () => { isMounted = false; };
  }, [selectedTripId]);

  const hasInitialFittedRef = useRef(false);

  // ─── Update markers when activeTrips change ───────────────────────────────
  useEffect(() => {
    const map = mapInstanceRef.current;
    const markersGroup = markersGroupRef.current;
    if (!map || !markersGroup) return;

    markersGroup.clearLayers();
    const validMarkers = [];

    activeTrips.forEach((trip) => {
      if (trip.latitude == null || trip.longitude == null) return;
      const lat = parseFloat(trip.latitude);
      const lng = parseFloat(trip.longitude);
      if (isNaN(lat) || isNaN(lng)) return;

      const isSelected = trip.trip_id === selectedTripId;
      const stale = isLocationStale(trip);
      const icon = createVehicleIcon(trip, isSelected, stale);

      const popup = `
        <div style="font-family: Inter, sans-serif; padding: 4px; min-width: 200px;">
          <h4 style="margin: 0 0 6px 0; font-size: 14px; font-weight: 800; color: #2b2530;">
            ${trip.vehicle_registration || 'Vehicle'} · ${trip.vehicle_name || ''}
          </h4>
          <p style="margin: 0 0 4px 0; font-size: 12px; color: #555;">
            <strong>Driver:</strong> ${trip.driver_name || 'Assigned Driver'}
          </p>
          <p style="margin: 0 0 4px 0; font-size: 12px; color: #555;">
            <strong>Route:</strong> ${trip.origin} → ${trip.destination}
          </p>
          <p style="margin: 0 0 4px 0; font-size: 12px; color: #555;">
            <strong>Speed:</strong> ${trip.speed != null ? `${trip.speed} km/h` : '—'}
          </p>
          <p style="margin: 0; font-size: 11px; color: ${stale ? '#d97706' : '#22a06b'}; font-weight: 700;">
            ${stale ? '⚠ Stale location' : '● Live GPS'}
            &nbsp;·&nbsp;${trip.captured_at ? new Date(trip.captured_at).toLocaleTimeString() : 'No update'}
          </p>
        </div>
      `;

      const marker = L.marker([lat, lng], { icon }).bindPopup(popup);
      marker.on('click', () => setSelectedTripId(trip.trip_id));
      markersGroup.addLayer(marker);
      validMarkers.push([lat, lng]);
    });

    if (validMarkers.length > 0 && !selectedTripId && !hasInitialFittedRef.current) {
      map.fitBounds(L.latLngBounds(validMarkers), { padding: [60, 60], maxZoom: 14 });
      hasInitialFittedRef.current = true;
    }
  }, [activeTrips, selectedTripId]);

  // ─── Fly to selected trip location ───────────────────────────────────────
  const handleSelectTrip = (trip) => {
    setSelectedTripId(trip.trip_id);
    if (trip.latitude != null && trip.longitude != null && mapInstanceRef.current) {
      mapInstanceRef.current.flyTo(
        [parseFloat(trip.latitude), parseFloat(trip.longitude)],
        15,
        { duration: 1.2, easeLinearity: 0.25 }
      );
    }
  };

  const liveCount     = activeTrips.filter(t => !isLocationStale(t)).length;
  const staleCount    = activeTrips.filter(t => t.latitude != null && isLocationStale(t)).length;
  const awaitingCount = activeTrips.length - liveCount - staleCount;
  const avgSpeed      = activeTrips.length > 0
    ? Math.round(activeTrips.reduce((acc, t) => acc + (parseFloat(t.speed) || 0), 0) / activeTrips.length)
    : 0;

  return (
    <div className="live-map-container">
      {/* Top Header */}
      <div className="live-map-header">
        <div className="live-map-title-group">
          <h1>
            <Radio size={24} color="var(--amber)" />
            Live Fleet Operations &amp; GPS Tracking
            <span className="live-pulse-badge">
              <span className="pulse-dot" />
              {autoPoll ? 'LIVE TELEMETRY' : 'PAUSED'}
            </span>
          </h1>
          <p className="live-map-subtitle">
            Real-time telemetry stream from authenticated driver mobile apps on dispatched trips.
          </p>
        </div>

        <div className="live-map-controls">
          {/* Map theme picker */}
          <div className="map-theme-switcher">
            {MAP_THEMES.map(t => (
              <button
                key={t}
                className={`theme-btn ${mapTheme === t ? 'active' : ''}`}
                onClick={() => setMapTheme(t)}
                title={t.charAt(0).toUpperCase() + t.slice(1)}
              >
                {t === 'streets' ? '🗺' : t === 'light' ? '☀' : t === 'navigation' ? '🧭' : t === 'outdoors' ? '🏔' : '🛰'}
              </button>
            ))}
          </div>

          <button
            className="refresh-button"
            onClick={() => setAutoPoll(!autoPoll)}
            title="Toggle live streaming"
          >
            <Radio size={16} color={autoPoll ? '#22a06b' : '#8a8794'} />
            {autoPoll ? 'Auto-Sync On (6s)' : 'Resume Auto-Sync'}
          </button>

          <button
            className="refresh-button"
            onClick={() => fetchActiveLocations(true)}
            disabled={isRefreshing}
          >
            <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
            Refresh Now
          </button>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="live-stats-bar">
        <div className="live-stat-card">
          <div className="live-stat-icon" style={{ background: '#fdf1e0', color: '#e08a1e' }}>
            <Truck size={22} />
          </div>
          <div>
            <div className="live-stat-label">Dispatched Trips</div>
            <div className="live-stat-val">{activeTrips.length}</div>
          </div>
        </div>

        <div className="live-stat-card">
          <div className="live-stat-icon" style={{ background: '#e6f7ef', color: '#22a06b' }}>
            <Radio size={22} />
          </div>
          <div>
            <div className="live-stat-label">Active GPS Signals</div>
            <div className="live-stat-val">{liveCount}</div>
          </div>
        </div>

        <div className="live-stat-card">
          <div className="live-stat-icon" style={{ background: '#eeedf1', color: '#7a4a63' }}>
            <Clock size={22} />
          </div>
          <div>
            <div className="live-stat-label">Stale GPS Signals</div>
            <div className="live-stat-val">{staleCount}</div>
          </div>
        </div>

        <div className="live-stat-card">
          <div className="live-stat-icon" style={{ background: '#f7eadc', color: '#d97706' }}>
            <AlertCircle size={22} />
          </div>
          <div>
            <div className="live-stat-label">Awaiting Driver GPS</div>
            <div className="live-stat-val">{awaitingCount}</div>
          </div>
        </div>

        <div className="live-stat-card">
          <div className="live-stat-icon" style={{ background: '#e8f0fe', color: '#2f6fed' }}>
            <Gauge size={22} />
          </div>
          <div>
            <div className="live-stat-label">Average Fleet Speed</div>
            <div className="live-stat-val">{avgSpeed} km/h</div>
          </div>
        </div>
      </div>

      {/* Main Body Split: Sidebar + Map */}
      <div className="live-map-body">
        {/* Active Dispatched Vehicles Sidebar */}
        <div className="live-trips-sidebar">
          <div className="live-trips-sidebar-header">
            <span>Dispatched Vehicles ({activeTrips.length})</span>
            {selectedTripId ? (
              <button
                onClick={() => setSelectedTripId(null)}
                style={{
                  background: 'none', border: 'none', color: 'var(--amber)',
                  fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer'
                }}
              >
                Clear Selection
              </button>
            ) : null}
          </div>

          <div className="live-trips-list">
            {isLoading ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--sub)' }}>
                Loading fleet telemetry...
              </div>
            ) : activeTrips.length === 0 ? (
              <div className="empty-trips-state">
                <Truck size={36} color="var(--sub)" style={{ opacity: 0.6 }} />
                <h4 style={{ margin: '0.75rem 0 0 0', color: 'var(--text)' }}>No Trips In Transit</h4>
                <p>
                  When a driver starts an assigned trip from the mobile app, their live GPS
                  coordinates and speed will broadcast here.
                </p>
              </div>
            ) : (
              activeTrips.map((trip) => {
                const isSelected  = trip.trip_id === selectedTripId;
                const hasLocation = trip.latitude != null && trip.longitude != null;
                const stale       = isLocationStale(trip);

                return (
                  <div
                    key={trip.trip_id}
                    className={`live-trip-card ${isSelected ? 'selected' : ''}`}
                    onClick={() => handleSelectTrip(trip)}
                  >
                    <div className="live-trip-card-header">
                      <div>
                        <div className="vehicle-reg-tag">
                          {trip.vehicle_registration || 'Vehicle Unregistered'}
                        </div>
                        <div className="vehicle-type-tag">
                          {trip.vehicle_name ? `${trip.vehicle_name} · ` : ''}{trip.vehicle_type || 'Vehicle'}
                        </div>
                      </div>

                      <span className={`gps-status-pill ${!hasLocation ? 'awaiting' : stale ? 'stale' : 'live'}`}>
                        {!hasLocation ? 'Awaiting GPS' : stale ? 'Stale' : '● Live'}
                      </span>
                    </div>

                    <div className="live-trip-route">
                      {trip.origin} → {trip.destination}
                    </div>

                    <div className="live-trip-meta-row">
                      <span>Driver: {trip.driver_name || 'Assigned'}</span>
                      {hasLocation && trip.speed != null ? (
                        <span>{trip.speed} km/h</span>
                      ) : null}
                    </div>

                    {hasLocation && trip.captured_at ? (
                      <div style={{ fontSize: '0.7rem', color: 'var(--sub)', marginTop: '0.35rem' }}>
                        Last sync: {new Date(trip.captured_at).toLocaleTimeString()}
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Mapbox Map Surface */}
        <div className="live-map-view-wrapper">
          <div ref={mapContainerRef} className="map-container-element" />

          {selectedTripId ? (
            <div className="map-floating-overlay">
              <div style={{ fontWeight: 800, color: 'var(--amber)', marginBottom: '0.25rem' }}>
                Trip #{selectedTripId} Selected
              </div>
              <div>Showing live position &amp; GPS breadcrumb trail ({breadcrumbs.length} points)</div>
            </div>
          ) : null}

          {/* Last refresh timestamp */}
          <div style={{
            position: 'absolute', bottom: '0.75rem', right: '0.75rem',
            background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(4px)',
            borderRadius: '6px', padding: '4px 10px',
            fontSize: '0.7rem', color: '#555', fontFamily: 'Inter, sans-serif',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)', zIndex: 1000,
            pointerEvents: 'none',
          }}>
            Last updated: {lastRefreshedAt.toLocaleTimeString()}
          </div>
        </div>
      </div>
    </div>
  );
}
