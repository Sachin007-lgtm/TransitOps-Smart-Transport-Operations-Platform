import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Navigation, RefreshCw, Truck, Radio, MapPin, Gauge,
  Clock, User, CheckCircle2, AlertCircle, Compass, Layers, Timer
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

/** Format elapsed time since a date string (e.g. "2h 14m" or "45m") */
function formatElapsed(dateStr) {
  if (!dateStr) return '—';
  const ms = Date.now() - new Date(dateStr).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const totalMinutes = Math.floor(ms / 60_000);
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** Format a datetime string to a readable time */
function formatTime(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function createLiveMapPopupHtml(trip) {
  const isStale = isLocationStale(trip);
  const isLive = trip.latitude != null && trip.longitude != null && !isStale;
  const hasLastKnown = trip.latitude != null && trip.longitude != null;
  const statusLabel = isLive ? '● LIVE GPS' : hasLastKnown ? '● LAST KNOWN' : 'AWAITING GPS';
  const statusClass = isLive ? 'live' : hasLastKnown ? 'warning' : 'awaiting';
  const driverName = trip.driver_name || 'Assigned Driver';
  const vehicleReg = trip.vehicle_registration || 'Vehicle';
  const vehicleType = trip.vehicle_name ? `${trip.vehicle_name} · ${trip.vehicle_type || 'Vehicle'}` : (trip.vehicle_type || 'Vehicle');
  const speedVal = trip.speed != null ? `${parseFloat(trip.speed).toFixed(0)} km/h` : '—';
  const coordsVal = hasLastKnown ? `${parseFloat(trip.latitude).toFixed(4)}, ${parseFloat(trip.longitude).toFixed(4)}` : '—';
  const lastSync = trip.captured_at ? formatTime(trip.captured_at) : 'Never';
  const batteryVal = trip.battery_level != null ? `${trip.battery_level}%` : '—';
  const geofenceTag = trip.geofence_status === 'ARRIVED_PICKUP'
    ? '🎯 At Pickup'
    : trip.geofence_status === 'ARRIVED_DESTINATION'
    ? '🏁 At Destination'
    : '🚛 In Transit';

  const punctualityRating = trip.driver_punctuality_score
    ? `⭐ ${trip.driver_punctuality_score} (${trip.driver_on_time_rate || '100'}% On-Time)`
    : '⭐ 5.0 (New)';

  return `
    <div class="live-marker-popup">
      <div class="lmp-header">
        <div class="lmp-avatar">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
            <circle cx="12" cy="7" r="4"></circle>
          </svg>
        </div>
        <div class="lmp-title-wrap">
          <h4 class="lmp-driver">${driverName}</h4>
          <span class="lmp-vehicle">${vehicleReg} · ${vehicleType}</span>
        </div>
      </div>

      <div class="lmp-route-row">
        <div class="lmp-route-text">${trip.origin || 'Origin'} <span>→</span> ${trip.destination || 'Destination'}</div>
        <div class="lmp-status-pill ${statusClass}">${statusLabel}</div>
      </div>

      <div style="display: flex; gap: 0.5rem; margin: 0.4rem 0 0.6rem 0; flex-wrap: wrap;">
        <span style="font-size: 0.72rem; font-weight: 700; padding: 0.2rem 0.5rem; border-radius: 6px; background: #EEF2FF; color: #4338CA;">
          ${geofenceTag}
        </span>
        <span style="font-size: 0.72rem; font-weight: 600; padding: 0.2rem 0.5rem; border-radius: 6px; background: #FEF3C7; color: #92400E;">
          🔋 ${batteryVal}
        </span>
        ${trip.is_offline_sync ? `
          <span style="font-size: 0.72rem; font-weight: 700; padding: 0.2rem 0.5rem; border-radius: 6px; background: #F3E8FF; color: #7E22CE;">
            📦 Offline Synced
          </span>
        ` : ''}
        <span style="font-size: 0.72rem; font-weight: 600; padding: 0.2rem 0.5rem; border-radius: 6px; background: #DCFCE7; color: #15803D;">
          ${punctualityRating}
        </span>
      </div>

      <!-- Real Time Metrics Section -->
      <div class="lmp-time-bar">
        <div class="lmp-time-item">
          <span class="lmp-time-label">TRIP STARTED</span>
          <span class="lmp-time-val">${formatTime(trip.start_time)}</span>
        </div>
        <div class="lmp-time-item">
          <span class="lmp-time-label">ELAPSED</span>
          <span class="lmp-time-val highlight">${formatElapsed(trip.start_time)}</span>
        </div>
      </div>

      <!-- 4 Telemetry Metrics Grid -->
      <div class="lmp-telemetry-grid">
        <div class="lmp-tele-box">
          <span class="lmp-tele-label">SPEED</span>
          <strong class="lmp-tele-value">${speedVal}</strong>
        </div>
        <div class="lmp-tele-box">
          <span class="lmp-tele-label">STATUS</span>
          <strong class="lmp-tele-value ${statusClass}">${isLive ? 'Moving' : hasLastKnown ? 'Stalled' : 'Waiting'}</strong>
        </div>
        <div class="lmp-tele-box">
          <span class="lmp-tele-label">COORDINATES</span>
          <strong class="lmp-tele-value mono">${coordsVal}</strong>
        </div>
        <div class="lmp-tele-box">
          <span class="lmp-tele-label">LAST SIGNAL</span>
          <strong class="lmp-tele-value">${lastSync}</strong>
        </div>
      </div>

      <div class="lmp-footer">
        <span>Trip #${trip.trip_id}</span>
        ${trip.cargo_weight ? `<span>Cargo: ${trip.cargo_weight} kg</span>` : ''}
      </div>
    </div>
  `;
}

// ─── Mapbox tile URL helper ───────────────────────────────────────────────────
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
  const hasGps = vehicle.latitude != null && vehicle.longitude != null;
  const bg = isSelected ? '#e08a1e' : hasGps && !isStale ? '#22a06b' : '#d97706';

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
        <svg width="20" height="20" viewBox="0 0 24 24" fill="white" stroke="none">
          <path d="M5 17H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v3m-4 12h8a2 2 0 0 0 2-2v-5a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2zm7-5a1 1 0 1 1-2 0 1 1 0 0 1 2 0z"/>
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
  // Keep a stable map of markerRefs so we can update icons without clearing all layers
  const markerMapRef = useRef({}); // tripId -> L.marker

  // ─── Initialize Map ─────────────────────────────────────────────────────────
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
      markerMapRef.current = {};
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Swap tile layer when theme changes ──────────────────────────────────────
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    if (tileLayerRef.current) map.removeLayer(tileLayerRef.current);
    const { url, options } = getMapboxTileLayer(mapTheme);
    tileLayerRef.current = L.tileLayer(url, options).addTo(map);
  }, [mapTheme]);

  // ─── Fetch active trips ──────────────────────────────────────────────────────
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

  // ─── Breadcrumb trail for selected trip ─────────────────────────────────────
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

          const polyline = L.polyline(latLngs, {
            color: '#e08a1e',
            weight: 4,
            opacity: 0.9,
            dashArray: '10, 8',
            lineJoin: 'round'
          }).addTo(trailLayerRef.current);

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

  // ─── Update markers without full clear (prevents flicker) ────────────────────
  useEffect(() => {
    const map = mapInstanceRef.current;
    const markersGroup = markersGroupRef.current;
    if (!map || !markersGroup) return;

    const currentMarkerMap = markerMapRef.current;
    const newTripIds = new Set(activeTrips.map(t => t.trip_id));
    const validBounds = [];

    // Remove markers for trips that are no longer active
    Object.keys(currentMarkerMap).forEach(tripId => {
      if (!newTripIds.has(Number(tripId))) {
        markersGroup.removeLayer(currentMarkerMap[tripId]);
        delete currentMarkerMap[tripId];
      }
    });

    // Add or update markers
    activeTrips.forEach((trip) => {
      if (trip.latitude == null || trip.longitude == null) {
        // No GPS yet: remove existing marker if any
        if (currentMarkerMap[trip.trip_id]) {
          markersGroup.removeLayer(currentMarkerMap[trip.trip_id]);
          delete currentMarkerMap[trip.trip_id];
        }
        return;
      }
      const lat = parseFloat(trip.latitude);
      const lng = parseFloat(trip.longitude);
      if (isNaN(lat) || isNaN(lng)) return;

      const isStale = isLocationStale(trip);
      const isSelected = trip.trip_id === selectedTripId;
      const icon = createVehicleIcon(trip, isSelected, isStale);

      const popupHtml = createLiveMapPopupHtml(trip);
      const iconKey = `${isSelected}-${isStale}-${trip.heading}`;

      if (currentMarkerMap[trip.trip_id]) {
        // Update existing marker position & icon only when changed (no flicker)
        currentMarkerMap[trip.trip_id].setLatLng([lat, lng]);
        if (currentMarkerMap[trip.trip_id]._iconKey !== iconKey) {
          currentMarkerMap[trip.trip_id].setIcon(icon);
          currentMarkerMap[trip.trip_id]._iconKey = iconKey;
        }
        if (currentMarkerMap[trip.trip_id].isPopupOpen()) {
          currentMarkerMap[trip.trip_id].getPopup().setContent(popupHtml);
        } else {
          currentMarkerMap[trip.trip_id].setPopupContent(popupHtml);
        }
      } else {
        // Create new marker with rich popup
        const marker = L.marker([lat, lng], { icon, riseOnHover: true, zIndexOffset: 500 });
        marker._iconKey = iconKey;
        marker.bindPopup(popupHtml, {
          className: 'custom-live-marker-popup',
          closeButton: false,
          maxWidth: 320,
          minWidth: 280,
          autoPan: true,
          autoPanPadding: [50, 50]
        });
        marker.on('click', (e) => {
          if (e.originalEvent) e.originalEvent.stopPropagation();
          setSelectedTripId(trip.trip_id);
          marker.openPopup();
        });
        markersGroup.addLayer(marker);
        currentMarkerMap[trip.trip_id] = marker;
      }

      validBounds.push([lat, lng]);
    });

    if (validBounds.length > 0 && !selectedTripId && !hasInitialFittedRef.current) {
      map.fitBounds(L.latLngBounds(validBounds), { padding: [60, 60], maxZoom: 14 });
      hasInitialFittedRef.current = true;
    }
  }, [activeTrips, selectedTripId]);

  const [simulating, setSimulating] = useState(false);

  const handleSimulateLivePing = async (targetTrip) => {
    if (!targetTrip) return;
    try {
      setSimulating(true);
      const baseLat = parseFloat(targetTrip.latitude) || 23.0225;
      const baseLng = parseFloat(targetTrip.longitude) || 72.5714;
      const nextLat = baseLat + (Math.random() * 0.006 - 0.001);
      const nextLng = baseLng + (Math.random() * 0.006 - 0.001);

      await apiRequest('POST', '/locations', {
        trip_id: targetTrip.trip_id,
        latitude: nextLat,
        longitude: nextLng,
        speed: Math.floor(45 + Math.random() * 20),
        heading: Math.floor(Math.random() * 360),
        accuracy: 6,
        battery_level: 82,
        is_offline_sync: false,
        captured_at: new Date().toISOString()
      });

      window.dispatchEvent(
        new CustomEvent('app-toast', {
          detail: `⚡ Simulated live telemetry ping for Trip #${targetTrip.trip_id} (${targetTrip.driver_name || 'Driver'})`,
          type: 'success'
        })
      );
      await fetchActiveLocations(true);
    } catch (err) {
      window.dispatchEvent(
        new CustomEvent('app-toast', {
          detail: err.message || 'Failed to simulate live ping',
          type: 'error'
        })
      );
    } finally {
      setSimulating(false);
    }
  };

  const handleSimulateOfflineBatchSync = async (targetTrip) => {
    if (!targetTrip) return;
    try {
      setSimulating(true);
      const baseLat = parseFloat(targetTrip.latitude) || 23.0225;
      const baseLng = parseFloat(targetTrip.longitude) || 72.5714;
      const now = Date.now();

      // 4 sequential pings simulating dead zone recovery
      const pings = [
        {
          latitude: baseLat + 0.003,
          longitude: baseLng + 0.003,
          speed: 48,
          heading: 80,
          accuracy: 10,
          battery_level: 84,
          captured_at: new Date(now - 18 * 60 * 1000).toISOString()
        },
        {
          latitude: baseLat + 0.007,
          longitude: baseLng + 0.008,
          speed: 55,
          heading: 85,
          accuracy: 8,
          battery_level: 82,
          captured_at: new Date(now - 12 * 60 * 1000).toISOString()
        },
        {
          latitude: baseLat + 0.012,
          longitude: baseLng + 0.014,
          speed: 58,
          heading: 90,
          accuracy: 7,
          battery_level: 80,
          captured_at: new Date(now - 6 * 60 * 1000).toISOString()
        },
        {
          latitude: baseLat + 0.018,
          longitude: baseLng + 0.021,
          speed: 50,
          heading: 95,
          accuracy: 6,
          battery_level: 79,
          captured_at: new Date(now).toISOString()
        }
      ];

      const res = await apiRequest('POST', '/locations/sync-batch', {
        trip_id: targetTrip.trip_id,
        pings
      });

      window.dispatchEvent(
        new CustomEvent('app-toast', {
          detail: `📦 ${res.message || 'Synced 4 offline buffered GPS pings!'}`,
          type: 'success'
        })
      );
      await fetchActiveLocations(true);
    } catch (err) {
      window.dispatchEvent(
        new CustomEvent('app-toast', {
          detail: err.message || 'Failed to simulate offline sync',
          type: 'error'
        })
      );
    } finally {
      setSimulating(false);
    }
  };

  // ─── Fly to selected trip location ───────────────────────────────────────────
  const handleSelectTrip = (trip) => {
    setSelectedTripId(trip.trip_id);
    if (trip.latitude != null && trip.longitude != null && mapInstanceRef.current) {
      const lat = parseFloat(trip.latitude);
      const lng = parseFloat(trip.longitude);
      if (!isNaN(lat) && !isNaN(lng)) {
        mapInstanceRef.current.flyTo(
          [lat, lng],
          15,
          { duration: 1.2, easeLinearity: 0.25 }
        );
        const marker = markerMapRef.current[trip.trip_id];
        if (marker) {
          setTimeout(() => marker.openPopup(), 350);
        }
      }
    }
  };

  const selectedTrip = activeTrips.find(t => t.trip_id === selectedTripId) || null;
  const liveCount     = activeTrips.filter(t => !isLocationStale(t)).length;
  const awaitingCount = activeTrips.length - liveCount;

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

      {/* Main Body Split: Sidebar + Map */}
      <div className="live-map-body">
        {/* Active Dispatched Vehicles Sidebar */}
        <div className="live-trips-sidebar">
          <div className="live-trips-sidebar-header">
            <span>
              Dispatched Vehicles ({activeTrips.length})
              {liveCount > 0 && (
                <span className="sidebar-live-badge">{liveCount} Live</span>
              )}
            </span>
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

          {/* Telemetry & Offline Sync Simulator Panel */}
          {activeTrips.length > 0 && (
            <div className="live-sim-panel">
              <div className="live-sim-header">
                <span>🧪 Telemetry &amp; Sync Simulator</span>
                <span className="live-sim-target">{selectedTrip ? `Trip #${selectedTrip.trip_id}` : `Target: Trip #${activeTrips[0]?.trip_id}`}</span>
              </div>
              <div className="live-sim-actions">
                <button
                  className="sim-action-btn ping"
                  onClick={() => handleSimulateLivePing(selectedTrip || activeTrips[0])}
                  disabled={simulating}
                  title="Send a real-time moving GPS ping"
                >
                  ⚡ Simulate Live Ping
                </button>
                <button
                  className="sim-action-btn offline"
                  onClick={() => handleSimulateOfflineBatchSync(selectedTrip || activeTrips[0])}
                  disabled={simulating}
                  title="Simulate driver recovering from dead-zone with 4 buffered pings"
                >
                  📦 Sync Offline (4 Pings)
                </button>
              </div>
            </div>
          )}

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
                const isLive = trip.latitude != null && trip.longitude != null && !isLocationStale(trip);
                const hasLastKnown = trip.latitude != null && trip.longitude != null;
                const geofenceTag = trip.geofence_status === 'ARRIVED_PICKUP'
                  ? '🎯 At Pickup'
                  : trip.geofence_status === 'ARRIVED_DESTINATION'
                  ? '🏁 At Destination'
                  : '🚛 In Transit';

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

                      <span className={`gps-status-pill ${isLive ? 'live' : hasLastKnown ? 'warning' : 'awaiting'}`}>
                        {isLive ? '● Live' : hasLastKnown ? '● Last Known' : 'Awaiting GPS'}
                      </span>
                    </div>

                    <div className="live-trip-route">
                      {trip.origin} → {trip.destination}
                    </div>

                    {/* Milestone & Telemetry Badges */}
                    <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.4rem', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '0.15rem 0.45rem', borderRadius: '4px', background: '#EEF2FF', color: '#4338CA' }}>
                        {geofenceTag}
                      </span>
                      {trip.battery_level != null && (
                        <span style={{ fontSize: '0.68rem', fontWeight: 600, padding: '0.15rem 0.45rem', borderRadius: '4px', background: '#FEF3C7', color: '#92400E' }}>
                          🔋 {trip.battery_level}%
                        </span>
                      )}
                      {trip.is_offline_sync && (
                        <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '0.15rem 0.45rem', borderRadius: '4px', background: '#F3E8FF', color: '#7E22CE' }}>
                          📦 Synced
                        </span>
                      )}
                      {trip.driver_punctuality_score && (
                        <span style={{ fontSize: '0.68rem', fontWeight: 600, padding: '0.15rem 0.45rem', borderRadius: '4px', background: '#DCFCE7', color: '#15803D' }}>
                          ⭐ {trip.driver_punctuality_score}
                        </span>
                      )}
                    </div>

                    <div className="live-trip-meta-row">
                      <span>
                        <User size={11} style={{ display: 'inline', marginRight: 3 }} />
                        {trip.driver_name || 'Assigned'}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        {trip.speed != null ? (
                          <span>{parseFloat(trip.speed).toFixed(0)} km/h</span>
                        ) : trip.start_time ? (
                          <span style={{ color: 'var(--sub)', fontSize: '0.7rem' }}>
                            <Timer size={10} style={{ display: 'inline' }} /> {formatElapsed(trip.start_time)}
                          </span>
                        ) : null}
                      </span>
                    </div>

                    {hasLastKnown && trip.captured_at ? (
                      <div style={{ fontSize: '0.7rem', color: 'var(--sub)', marginTop: '0.35rem' }}>
                        Last sync: {formatTime(trip.captured_at)}
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
