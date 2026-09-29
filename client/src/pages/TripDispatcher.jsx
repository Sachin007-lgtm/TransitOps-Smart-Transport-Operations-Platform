import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Search, MapPin, Navigation, X, Check, Activity, FileText,
  CheckCircle2, User, Truck, Info, FileWarning,
  ChevronDown, ChevronUp, Eye, EyeOff, AlertTriangle, RefreshCw, Trash2,
  DollarSign, Building2, ShieldAlert, Plus, Radio,
  ArrowRight, Route, Package, SlidersHorizontal, Map as MapIcon, Edit2,
  Phone, MessageSquare, ExternalLink, Calendar, Clock, BarChart2
} from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useGlobalSearch } from '../contexts/GlobalSearchContext';
import { apiRequest } from '../utils/api';
import './TripDispatcher.css';

// ─── Constants ─────────────────────────────────────────────────────────────
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || '';

const SEEDED_VEHICLES = [
  { id: 1, name: 'Van-01',     registration_number: 'REG-001', type: 'Van',     max_load_capacity: 500,   status: 'Available' },
  { id: 2, name: 'Van-02',     registration_number: 'REG-002', type: 'Van',     max_load_capacity: 500,   status: 'In Shop'   },
  { id: 3, name: 'Truck-01',   registration_number: 'REG-003', type: 'Truck',   max_load_capacity: 3000,  status: 'Available' },
  { id: 4, name: 'Truck-02',   registration_number: 'REG-004', type: 'Truck',   max_load_capacity: 3500,  status: 'On Trip'   },
  { id: 5, name: 'Trailer-01', registration_number: 'REG-005', type: 'Trailer', max_load_capacity: 10000, status: 'Retired'   }
];

const LIFECYCLE_STAGES = ['Draft', 'Planned', 'Assigned', 'Dispatched', 'Completed'];
const STATUS_FILTERS   = ['All', 'In Transit', 'Pending', 'Dispatched', 'Completed', 'Cancelled'];

// Default Location Coordinates Lookup
const LOCATION_COORDS = {
  'Gandhinagar Depot':      [23.2156, 72.6369],
  'Vatva Industrial Area':  [22.9567, 72.6289],
  'Mansa Yard':             [23.4284, 72.6616],
  'Ahmedabad Hub':          [23.0225, 72.5714],
  'Naroda Industrial Area': [23.0722, 72.6588],
  'Sanand Warehouse':       [22.9880, 72.3831],
  'Kalol Depot':            [23.2393, 72.4965],
  'Vadodara Terminal':      [22.3072, 73.1812],
  'Surat Freight Hub':      [21.1702, 72.8311],
  'Maruti Suzuki Manesar':  [28.3540, 76.9366],
};

const ORIGIN_PRESETS = Object.keys(LOCATION_COORDS).slice(0, 5);
const DEST_PRESETS   = Object.keys(LOCATION_COORDS).slice(3, 8);
const GPS_FRESHNESS_MS = 30000;
const STATIONARY_SPEED_MS = 2;

function isFreshGps(location) {
  if (location?.latitude == null || location?.longitude == null || !location.captured_at) return false;
  const capturedAt = new Date(location.captured_at).getTime();
  const age = Date.now() - capturedAt;
  return Number.isFinite(capturedAt) && age >= 0 && age <= GPS_FRESHNESS_MS;
}

function formatVehicleSpeed(speed) {
  if (speed == null || !Number.isFinite(Number(speed))) return '--';
  const value = Number(speed);
  const kilometersPerHour = Math.abs(value) < STATIONARY_SPEED_MS ? 0 : value * 3.6;
  return `${kilometersPerHour.toFixed(1)} km/h`;
}

// ─── MAPBOX SEARCH BOX / GEOCODING API HOOK ──────────────────────────────────
/**
 * Mapbox Geocoding & Search Autocomplete Hook
 * MAPBOX STORAGE TERMS NOTICE:
 * For Search Box API / Geocoding API session-based autocomplete, suggestions are for
 * temporary display. When saving location data to TransitOps DB, save lat/lng or use permanent endpoint.
 */
function useMapboxSearchBox(presets) {
  const [query, setQuery]             = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [isOpen, setIsOpen]           = useState(false);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const debounceRef = useRef(null);

  const handleInput = useCallback((value) => {
    setQuery(value);
    clearTimeout(debounceRef.current);
    if (!value.trim()) { setSuggestions([]); setIsOpen(false); return; }

    debounceRef.current = setTimeout(async () => {
      // 1. Try Mapbox Live Geocoding API first if token is available
      if (MAPBOX_TOKEN) {
        try {
          const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(value)}.json?access_token=${MAPBOX_TOKEN}&country=in&types=poi,address,place,locality&limit=5`;
          const res = await fetch(url);
          if (res.ok) {
            const data = await res.json();
            const results = (data.features || []).map(f => ({
              label: f.place_name,
              text: f.text,
              center: [f.center[1], f.center[0]] // Convert [lng, lat] -> [lat, lng]
            }));
            if (results.length > 0) {
              setSuggestions(results);
              setIsOpen(true);
              return;
            }
          }
        } catch (err) {
          console.warn('Mapbox Search API fallback to presets:', err);
        }
      }

      // 2. Preset Fallback
      const filtered = presets.filter(p => p.toLowerCase().includes(value.toLowerCase())).map(p => ({
        label: p,
        text: p,
        center: LOCATION_COORDS[p] || [23.0225, 72.5714]
      }));
      setSuggestions(filtered);
      setIsOpen(filtered.length > 0);
    }, 250);
  }, [presets]);

  const pick = useCallback((suggestion) => {
    const label = typeof suggestion === 'string' ? suggestion : suggestion.label;
    setQuery(label);
    setSelectedLocation(suggestion);
    setSuggestions([]);
    setIsOpen(false);
    return label;
  }, []);

  const clear = useCallback(() => { setQuery(''); setSuggestions([]); setIsOpen(false); setSelectedLocation(null); }, []);

  return { query, setQuery: handleInput, suggestions, isOpen, pick, clear, selectedLocation };
}

// ─── Module-level Helper Components ─────────────────────────────────────────
function ACField({ ac, label, required, placeholder }) {
  return (
    <div className="field-wrap">
      <label className="field-label">{label}{required && <span className="req"> *</span>}</label>
      <div className="ac-wrap">
        <div className="ac-input-row">
          <MapPin size={13} className="ac-icon" />
          <input
            type="text"
            className="ac-input"
            value={ac.query}
            onChange={e => ac.setQuery(e.target.value)}
            placeholder={placeholder}
            autoComplete="off"
          />
          {ac.query && (
            <button type="button" className="ac-clear" onClick={ac.clear}><X size={11} /></button>
          )}
        </div>
        {ac.isOpen && ac.suggestions.length > 0 && (
          <div className="ac-menu">
            {ac.suggestions.map((s, idx) => (
              <div key={idx} className="ac-option" onMouseDown={() => ac.pick(s)}>
                <MapPin size={11} className="ac-opt-icon" />
                <span>{s.label || s}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusTag({ status }) {
  const cls = {
    Draft: 'tag-draft',
    Planned: 'tag-planned',
    Assigned: 'tag-assigned',
    Dispatched: 'tag-dispatched',
    Completed: 'tag-completed',
    Cancelled: 'tag-cancelled'
  }[status] || 'tag-draft';

  const label = status === 'Dispatched' ? 'IN TRANSIT' : status === 'Draft' ? 'PENDING' : status.toUpperCase();

  return (
    <span className={`tracking-status-badge ${cls}`}>
      {status === 'Dispatched' && <span className="pulse-dot" />}
      {label}
    </span>
  );
}

function getCityCode(addressStr) {
  if (!addressStr) return 'DEP';
  const parts = addressStr.split(' ');
  if (parts.length > 0 && parts[0].length >= 3) return parts[0].substring(0, 3).toUpperCase();
  return addressStr.substring(0, 3).toUpperCase();
}

const geocodeCache = {};

async function resolveCoordsAsync(addressStr, isOrigin = true) {
  if (!addressStr) return isOrigin ? [23.2156, 72.6369] : [23.0225, 72.5714];

  // 1. Preset lookup
  if (LOCATION_COORDS[addressStr]) return LOCATION_COORDS[addressStr];
  
  // 2. Cache lookup
  if (geocodeCache[addressStr]) return geocodeCache[addressStr];

  // 3. Dynamic Mapbox Geocoding lookup for ANY custom location (e.g. Maruti Suzuki Manesar, Mumbai Port, Delhi Yard)
  if (MAPBOX_TOKEN) {
    try {
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(addressStr)}.json?access_token=${MAPBOX_TOKEN}&limit=1`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const center = data.features?.[0]?.center; // [lng, lat]
        if (center && Array.isArray(center) && center.length === 2) {
          const coords = [center[1], center[0]]; // convert [lng, lat] to Leaflet [lat, lng]
          geocodeCache[addressStr] = coords;
          return coords;
        }
      }
    } catch (err) {
      console.warn('Mapbox Geocoding lookup failed for:', addressStr, err);
    }
  }

  // Default fallback
  return isOrigin ? [23.2156, 72.6369] : [23.0225, 72.5714];
}

// ─── Main Component ───────────────────────────────────────────────────────
export default function TripDispatcher() {
  const { globalSearch } = useGlobalSearch();

  // ── Server data ──
  const [trips,    setTrips]    = useState([]);
  const [drivers,  setDrivers]  = useState([]);
  const [vehicles, setVehicles] = useState(SEEDED_VEHICLES);
  const [isLoading,    setIsLoading]    = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // ── Alerts ──
  const [conflictError, setConflictError] = useState(null);
  const [generalError,  setGeneralError]  = useState(null);

  // ── Filters & Selected Trip ──
  const [searchQuery,  setSearchQuery]  = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [selectedTripId, setSelectedTripId] = useState(null);
  const [selectedTripLocation, setSelectedTripLocation] = useState(null);
  const [selectedTripHistory, setSelectedTripHistory] = useState([]);
  const [autoSync, setAutoSync] = useState(true);
  const [isRefreshingLocation, setIsRefreshingLocation] = useState(false);

  // ── Map References ──
  const mapContainerRef = useRef(null);
  const mapInstanceRef  = useRef(null);
  const prevSelectedTripIdRef = useRef(null);

  // ── Drawer & Form State ──
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingTrip, setEditingTrip] = useState(null);
  const [driverViewId, setDriverViewId] = useState(null);
  const originAC      = useMapboxSearchBox(ORIGIN_PRESETS);
  const destAC        = useMapboxSearchBox(DEST_PRESETS);
  const [vehicleId,       setVehicleId]       = useState('');
  const [driverId,        setDriverId]        = useState('');
  const [cargoWeight,     setCargoWeight]      = useState('');
  const [revenue,         setRevenue]         = useState('');
  // Billing fields: which customer this trip is billed to and the fare
  // already received up front.
  const [company,         setCompany]         = useState('');
  const [advanceReceived, setAdvanceReceived] = useState('');
  const [companyOptions,  setCompanyOptions]  = useState([]);
  const [startTime,       setStartTime]        = useState('');
  const [expectedArrival, setExpectedArrival]  = useState('');
  const [initialStatus,   setInitialStatus]    = useState('Draft');
  const [isSubmitting,    setIsSubmitting]     = useState(false);

  // ── Modals, Map Theme & Overlay Toggle ──
  const [mapTheme, setMapTheme] = useState('streets'); // Default style: Standard Streets
  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const [isDriverOverlayOpen, setIsDriverOverlayOpen] = useState(true);
  const [assignModal,   setAssignModal]   = useState({ open: false, trip: null, vehicleId: '', driverId: '' });

  const selectedTrip = trips.find(t => t.id === selectedTripId) || trips[0] || null;
  const selectedGpsIsFresh = isFreshGps(selectedTripLocation);

  // Load data
  const loadData = async (silent = false) => {
    if (!silent) setIsLoading(true); else setIsRefreshing(true);
    try {
      setGeneralError(null);
      const [tripsRes, driversRes, vehiclesRes, companiesRes] = await Promise.all([
        apiRequest('GET', '/trips'),
        apiRequest('GET', '/drivers').catch(() => ({ data: [] })),
        apiRequest('GET', '/vehicles').catch(() => ({ data: [] })),
        // Customers registered for billing — used to suggest names so the same
        // company is not entered twice under different spellings. Absence is
        // tolerated: the field stays free text.
        apiRequest('GET', '/billing/companies').catch(() => ({ data: [] }))
      ]);
      const loaded = tripsRes.data || [];
      setTrips(loaded);
      if (driversRes?.data)              setDrivers(driversRes.data);
      if (vehiclesRes?.data?.length > 0) setVehicles(vehiclesRes.data);
      if (companiesRes?.data?.length > 0) setCompanyOptions(companiesRes.data.map(c => c.name));
      if (loaded.length > 0 && !selectedTripId) {
        setSelectedTripId(loaded[0].id);
      }
    } catch (err) {
      setGeneralError(err.message || 'Failed to connect to backend.');
    } finally { setIsLoading(false); setIsRefreshing(false); }
  };

  useEffect(() => {
    loadData();
    const now = new Date();
    setStartTime(new Date(now.getTime() + 30 * 60000).toISOString().slice(0, 16));
    setExpectedArrival(new Date(now.getTime() + 180 * 60000).toISOString().slice(0, 16));
  }, []);

  // Keep the selected trip's marker tied to the latest authenticated GPS point.
  useEffect(() => {
    if (!selectedTripId) {
      setSelectedTripLocation(null);
      setSelectedTripHistory([]);
      return undefined;
    }

    let isMounted = true;

    const loadSelectedTripTelemetry = async (manual = false) => {
      try {
        if (manual) setIsRefreshingLocation(true);
        const [activeResponse, historyResponse] = await Promise.all([
          apiRequest('GET', '/locations/active'),
          apiRequest('GET', `/locations/trip/${selectedTripId}`).catch(() => ({ data: [] }))
        ]);
        if (!isMounted) return;
        const activeTrip = (activeResponse.data || []).find(
          location => String(location.trip_id) === String(selectedTripId)
        );
        setSelectedTripLocation(activeTrip || null);
        setSelectedTripHistory(historyResponse.data || []);
      } catch (error) {
        if (isMounted) {
          setSelectedTripLocation(null);
          setSelectedTripHistory([]);
        }
      } finally {
        if (manual && isMounted) setIsRefreshingLocation(false);
      }
    };

    loadSelectedTripTelemetry();
    const interval = autoSync ? setInterval(loadSelectedTripTelemetry, 6000) : null;

    return () => {
      isMounted = false;
      if (interval) clearInterval(interval);
    };
  }, [selectedTripId, autoSync]);

  const refreshSelectedTripTelemetry = async () => {
    if (!selectedTripId) return;
    setIsRefreshingLocation(true);
    try {
      const [activeResponse, historyResponse] = await Promise.all([
        apiRequest('GET', '/locations/active'),
        apiRequest('GET', `/locations/trip/${selectedTripId}`).catch(() => ({ data: [] }))
      ]);
      const activeTrip = (activeResponse.data || []).find(
        location => String(location.trip_id) === String(selectedTripId)
      );
      setSelectedTripLocation(activeTrip || null);
      setSelectedTripHistory(historyResponse.data || []);
    } catch (error) {
      setGeneralError(error.message || 'Unable to refresh selected trip telemetry.');
    } finally {
      setIsRefreshingLocation(false);
    }
  };

  // ── Initialize Map Container ──────────────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [23.0225, 72.5714],
      zoom: 10,
      zoomControl: false,
      attributionControl: false
    });

    mapInstanceRef.current = map;

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // ── Dynamic Map Tile Theme Switcher ──────────────────────────────────────
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (map._currentTileLayer) {
      map.removeLayer(map._currentTileLayer);
    }

    // Default Initial Tile: Standard Streets
    let tileUrl = MAPBOX_TOKEN 
      ? `https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/512/{z}/{x}/{y}@2x?access_token=${MAPBOX_TOKEN}`
      : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
    let tileSize = MAPBOX_TOKEN ? 512 : 256;
    let zoomOffset = MAPBOX_TOKEN ? -1 : 0;

    if (mapTheme === 'outdoors' && MAPBOX_TOKEN) {
      tileUrl = `https://api.mapbox.com/styles/v1/mapbox/outdoors-v12/tiles/512/{z}/{x}/{y}@2x?access_token=${MAPBOX_TOKEN}`;
    } else if (mapTheme === 'navigation' && MAPBOX_TOKEN) {
      tileUrl = `https://api.mapbox.com/styles/v1/mapbox/navigation-day-v1/tiles/512/{z}/{x}/{y}@2x?access_token=${MAPBOX_TOKEN}`;
    } else if (mapTheme === 'light' && MAPBOX_TOKEN) {
      tileUrl = `https://api.mapbox.com/styles/v1/mapbox/light-v11/tiles/512/{z}/{x}/{y}@2x?access_token=${MAPBOX_TOKEN}`;
    } else if (mapTheme === 'osm') {
      tileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
      tileSize = 256; zoomOffset = 0;
    }

    const newLayer = L.tileLayer(tileUrl, { maxZoom: 19, tileSize, zoomOffset }).addTo(map);
    map._currentTileLayer = newLayer;
  }, [mapTheme]);

  // ── Mapbox Directions API Routing & Markers ──────────────────────────────
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !selectedTrip) return;

    let isMounted = true;

    const updateRoute = async () => {
      // Dynamically resolve real-world coordinates for origin & destination
      const originCoords = selectedTrip.origin_coords || await resolveCoordsAsync(selectedTrip.origin, true);
      const destCoords   = selectedTrip.dest_coords   || await resolveCoordsAsync(selectedTrip.destination, false);

      if (!isMounted || !mapInstanceRef.current) return;

      if (map._tripLayers) {
        map._tripLayers.forEach(layer => layer.remove());
      }
      map._tripLayers = [];

      // Origin Circle Node (Google Maps start dot style)
      const originIcon = L.divIcon({
        className: 'leaflet-origin-dot-marker',
        html: `<div class="origin-circle-outer"><div class="origin-circle-inner"></div></div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10]
      });

      // Destination Pin Marker (Google Maps destination pin style)
      const destIcon = L.divIcon({
        className: 'leaflet-dest-pin-marker',
        html: `
          <div class="dest-pin-svg">
            <svg width="24" height="30" viewBox="0 0 24 30" fill="none">
              <path d="M12 0C5.37 0 0 5.37 0 12C0 21 12 30 12 30C12 30 24 21 24 12C24 5.37 18.63 0 12 0Z" fill="#7a4a63"/>
              <circle cx="12" cy="12" r="4.5" fill="#FFFFFF"/>
            </svg>
          </div>
        `,
        iconSize: [24, 30],
        iconAnchor: [12, 30]
      });

      let routePath = [originCoords, destCoords];

      // Fetch Mapbox Directions API for real road driving geometry between origin & destination
      if (MAPBOX_TOKEN) {
        try {
          const directionsUrl = `https://api.mapbox.com/directions/v5/mapbox/driving/${originCoords[1]},${originCoords[0]};${destCoords[1]},${destCoords[0]}?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`;
          const res = await fetch(directionsUrl);
          if (res.ok) {
            const data = await res.json();
            const route = data.routes?.[0];
            if (route?.geometry?.coordinates && route.geometry.coordinates.length > 0) {
              routePath = route.geometry.coordinates.map(c => [c[1], c[0]]);
            }
          }
        } catch (e) {
          console.warn('Mapbox Directions API fallback to polyline:', e);
        }
      }

      if (!isMounted) return;

      const liveLatitude = Number(selectedTripLocation?.latitude);
      const liveLongitude = Number(selectedTripLocation?.longitude);
      const hasLiveLocation = selectedGpsIsFresh && Number.isFinite(liveLatitude) && Number.isFinite(liveLongitude);
      const truckIdx = hasLiveLocation
        ? routePath.reduce((closestIndex, point, index) => {
            const closestPoint = routePath[closestIndex];
            const currentDistance = (point[0] - liveLatitude) ** 2 + (point[1] - liveLongitude) ** 2;
            const closestDistance = (closestPoint[0] - liveLatitude) ** 2 + (closestPoint[1] - liveLongitude) ** 2;
            return currentDistance < closestDistance ? index : closestIndex;
          }, 0)
        : -1;
      const truckPos = hasLiveLocation ? [liveLatitude, liveLongitude] : null;
      const breadcrumbPath = selectedTripHistory
        .map(point => [Number(point.latitude), Number(point.longitude)])
        .filter(([latitude, longitude]) => Number.isFinite(latitude) && Number.isFinite(longitude));

      const truckIcon = L.divIcon({
        className: 'leaflet-truck-marker',
        html: `
          <div class="marker-badge">${selectedTrip.vehicle?.registration_number || 'REG-004'}${hasLiveLocation ? ' · LIVE' : ''}</div>
          <div class="marker-icon-pulse">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="1" y="3" width="15" height="13"></rect>
              <polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon>
              <circle cx="5.5" cy="18.5" r="2.5"></circle>
              <circle cx="18.5" cy="18.5" r="2.5"></circle>
            </svg>
          </div>
        `,
        iconSize: [60, 50],
        iconAnchor: [30, 45]
      });

      // Refined Thin Route Line (Theme Color #7a4a63 with subtle halo)
      const activePath = hasLiveLocation ? routePath.slice(0, Math.max(truckIdx + 1, 2)) : [];
      const remainingPath = hasLiveLocation ? routePath.slice(Math.max(truckIdx, 0)) : routePath;

      // 1. Remaining Segment: Soft Outer Halo
      const glowLine = L.polyline(remainingPath, {
        color: '#7a4a63',
        weight: 7,
        opacity: 0.25,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(map);

      // 2. Remaining Segment: Bold Core Line (Weight 3.5px)
      const remainingLine = L.polyline(remainingPath, {
        color: '#7a4a63',
        weight: 3.5,
        opacity: 0.95,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(map);

      // 3. Active Segment (Covered): Bordered Solid Line (Google Maps style past route)
      const activeLineOuter = hasLiveLocation ? L.polyline(activePath, {
        color: '#7a4a63',
        weight: 5,
        opacity: 0.9,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(map) : null;

      const activeLineInner = hasLiveLocation ? L.polyline(activePath, {
        color: '#f9f9f9',
        weight: 2.5,
        opacity: 1,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(map) : null;

      const mOrigin = L.marker(originCoords, { icon: originIcon }).addTo(map);
      const mDest   = L.marker(destCoords,   { icon: destIcon }).addTo(map);
      const mTruck  = hasLiveLocation ? L.marker(truckPos, { icon: truckIcon }).addTo(map) : null;
      const breadcrumbLine = breadcrumbPath.length > 1 ? L.polyline(breadcrumbPath, {
        color: '#e08a1e',
        weight: 4,
        opacity: 0.9,
        dashArray: '8, 7',
        lineJoin: 'round'
      }).addTo(map) : null;

      // Interactive Marker Popup for Driver & Shipment details on click / selection
      const popupHtml = `
        <div class="dark-truck-popup">
          <div class="dtp-driver-header">
            <div class="dtp-avatar">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
            </div>
            <div class="dtp-driver-info">
              <h4 class="dtp-driver-name">${selectedTrip.driver?.name || selectedTrip.driver_name || 'Unassigned driver'}</h4>
              <span class="dtp-driver-sub">${selectedTrip.vehicle?.name || selectedTrip.vehicle_name || 'Unassigned vehicle'}</span>
            </div>
            <div class="dtp-actions">
              <button class="dtp-icon-btn view-driver-btn" title="View Profile" data-driver="${selectedTrip.driver_id}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
              </button>
            </div>
          </div>
          
          <div class="dtp-shipment-row">
            <span class="dtp-ship-label">SHIPMENT ID</span>
            <div class="dtp-ship-id-wrap">
              <strong class="dtp-ship-id">#TRK-${selectedTrip.id}</strong>
              <svg class="dtp-link-icon edit-trip-btn" title="Edit Trip" style="cursor:pointer;" data-trip="${selectedTrip.id}" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            </div>
          </div>

          <div class="dtp-timeline">
            <div class="dtp-step">
              <div class="dtp-node-line">
                <div class="dtp-node pending"></div>
                <div class="dtp-line dashed"></div>
              </div>
              <div class="dtp-content">
                <div class="dtp-step-header">
                  <span>Estimated 28 Aug 2025</span>
                  <span class="dtp-step-time">10:20 AM</span>
                </div>
                <div class="dtp-step-desc">Delivered</div>
              </div>
            </div>
            
            <div class="dtp-step">
              <div class="dtp-node-line">
                <div class="dtp-node active"></div>
                <div class="dtp-line solid active"></div>
              </div>
              <div class="dtp-content">
                <div class="dtp-step-header">
                  <span class="active-text">27 Aug 2025</span>
                  <span class="dtp-step-time">09:15 AM</span>
                </div>
                <div class="dtp-step-desc">In Transit</div>
              </div>
            </div>

            <div class="dtp-step">
              <div class="dtp-node-line">
                <div class="dtp-node active"></div>
                <div class="dtp-line solid active"></div>
              </div>
              <div class="dtp-content">
                <div class="dtp-step-header">
                  <span class="active-text">26 Aug 2025</span>
                  <span class="dtp-step-time">06:21 AM</span>
                </div>
                <div class="dtp-step-desc">In Sorting Centre</div>
              </div>
            </div>

            <div class="dtp-step">
              <div class="dtp-node-line">
                <div class="dtp-node active"></div>
              </div>
              <div class="dtp-content">
                <div class="dtp-step-header">
                  <span class="active-text">25 Aug 2025</span>
                  <span class="dtp-step-time">06:21 AM</span>
                </div>
                <div class="dtp-step-desc">Order Confirmed</div>
              </div>
            </div>
          </div>
        </div>
      `;

      if (mTruck) {
        mTruck.bindPopup(popupHtml, {
          className: 'custom-leaflet-driver-popup theme-popup',
          closeButton: false,
          maxWidth: 260,
          autoPan: true,
          autoPanPadding: [50, 50]
        });

        mTruck.on('popupopen', function (e) {
          const popupNode = e.popup._contentNode;
          const driverBtn = popupNode.querySelector('.view-driver-btn');
          const editBtn = popupNode.querySelector('.edit-trip-btn');
          if (driverBtn) {
            driverBtn.onclick = () => {
              const dId = driverBtn.getAttribute('data-driver');
              if (dId && dId !== 'null') setDriverViewId(dId);
            };
          }
          if (editBtn) {
            editBtn.onclick = () => {
              setEditingTrip(selectedTrip);
            };
          }
        });
      }

      map._tripLayers.push(
        glowLine,
        ...(activeLineOuter ? [activeLineOuter] : []),
        ...(activeLineInner ? [activeLineInner] : []),
        remainingLine,
        ...(breadcrumbLine ? [breadcrumbLine] : []),
        mOrigin,
        mDest,
        ...(mTruck ? [mTruck] : [])
      );

      // Fit map view bounds ONLY if we switched to a new trip (don't auto-pan continuously as GPS updates)
      if (prevSelectedTripIdRef.current !== selectedTrip.id) {
        const bounds = L.latLngBounds(routePath);
        map.fitBounds(bounds, { padding: [70, 70], maxZoom: 14, animate: true });
        prevSelectedTripIdRef.current = selectedTrip.id;
      }
    };

    updateRoute();

    return () => { isMounted = false; };
  }, [selectedTrip, selectedTripLocation, selectedTripHistory, selectedGpsIsFresh]);

  const handleZoomIn  = () => mapInstanceRef.current?.zoomIn();
  const handleZoomOut = () => mapInstanceRef.current?.zoomOut();
  const handleRecenter = async () => {
    if (!selectedTrip || !mapInstanceRef.current) return;
    const originCoords = selectedTrip.origin_coords || await resolveCoordsAsync(selectedTrip.origin, true);
    const destCoords   = selectedTrip.dest_coords   || await resolveCoordsAsync(selectedTrip.destination, false);
    mapInstanceRef.current.fitBounds(L.latLngBounds([originCoords, destCoords]), { padding: [70, 70], animate: true });
  };

  const showToast = (msg) => window.dispatchEvent(new CustomEvent('app-toast', { detail: msg }));

  const filteredTrips = trips.filter(t => {
    if (statusFilter !== 'All') {
      if (statusFilter === 'In Transit' && t.status !== 'Dispatched') return false;
      if (statusFilter === 'Pending' && !['Draft', 'Planned'].includes(t.status)) return false;
      if (statusFilter !== 'In Transit' && statusFilter !== 'Pending' && t.status !== statusFilter) return false;
    }
    const query = (searchQuery || globalSearch || '').toLowerCase();
    if (!query) return true;
    return (
      String(t.id).includes(query) ||
      (t.origin || '').toLowerCase().includes(query) ||
      (t.destination || '').toLowerCase().includes(query) ||
      (t.vehicle?.name || '').toLowerCase().includes(query) ||
      (t.driver?.name || '').toLowerCase().includes(query)
    );
  });

  useEffect(() => {
    if (editingTrip) {
      originAC.setQuery(editingTrip.origin || '');
      destAC.setQuery(editingTrip.destination || '');
      setVehicleId(editingTrip.vehicle_id || '');
      setDriverId(editingTrip.driver_id || '');
      setCargoWeight(editingTrip.cargo_weight || '');
      setRevenue(editingTrip.revenue || '');
      setCompany(editingTrip.external_party_name || '');
      setAdvanceReceived(editingTrip.advance_received || '');
      setInitialStatus(editingTrip.status || 'Draft');
    }
  }, [editingTrip]);

  const resetForm = () => {
    originAC.clear(); destAC.clear();
    setVehicleId(''); setDriverId(''); setCargoWeight('');
    setRevenue(''); setInitialStatus('Draft');
    setCompany(''); setAdvanceReceived('');
    setConflictError(null);
    setEditingTrip(null);
    setDrawerOpen(false);
  };

  // Create or Update trip
  const handleSaveTrip = async (e) => {
    e?.preventDefault();
    if (!originAC.query.trim() || !destAC.query.trim() || isSubmitting) return;
    setIsSubmitting(true); setConflictError(null);

    const weightNum   = parseFloat(cargoWeight);
    const hasVehicleAndDriver = vehicleId && driverId;

    // Backend only accepts Draft or Planned on creation.
    // If driver+vehicle are set we still create as Draft/Planned,
    // then immediately advance to Assigned via the lifecycle PATCH.
    const creationStatus = initialStatus === 'Planned' ? 'Planned' : 'Draft';

    const payload = {
      origin:          originAC.query.trim(),
      destination:     destAC.query.trim(),
      origin_coords:   originAC.selectedLocation?.center || await resolveCoordsAsync(originAC.query.trim(), true),
      dest_coords:     destAC.selectedLocation?.center   || await resolveCoordsAsync(destAC.query.trim(), false),
      planned_route:   `${originAC.query.trim()} -> ${destAC.query.trim()}`,
      status:          editingTrip ? initialStatus : creationStatus,
      start_time:      startTime ? new Date(startTime).toISOString() : new Date().toISOString(),
      expected_arrival: expectedArrival ? new Date(expectedArrival).toISOString() : new Date(Date.now() + 7200000).toISOString(),
      vehicle_id:      vehicleId ? String(vehicleId) : null,
      driver_id:       driverId  ? String(driverId)  : null,
      cargo_weight:    weightNum  > 0 ? weightNum  : null,
      revenue:          parseFloat(revenue) > 0 ? parseFloat(revenue) : null,
      external_party_name: company.trim() || undefined,
      external_party_type: company.trim() ? 'CUSTOMER' : undefined,
      advance_received: parseFloat(advanceReceived) > 0 ? parseFloat(advanceReceived) : 0
    };

    try {
      if (editingTrip) {
        await apiRequest('PATCH', `/trips/${editingTrip.id}`, payload);
        showToast(`Trip #${editingTrip.id} updated successfully.`);
      } else {
        const res = await apiRequest('POST', '/trips', payload);
        const newTripId = res.data?.id || res.id;
        // If driver+vehicle were assigned, advance status via the lifecycle endpoint
        if (newTripId && hasVehicleAndDriver && creationStatus !== 'Assigned') {
          try {
            await apiRequest('PATCH', `/trips/${newTripId}/status`, { status: 'Assigned' });
            showToast(`Trip #${newTripId} created and assigned.`);
          } catch {
            showToast(`Trip #${newTripId} created as ${creationStatus}.`, 'info');
          }
        } else {
          showToast(`Trip #${newTripId} created (${res.data?.status || creationStatus}).`);
        }
        if (newTripId) setSelectedTripId(newTripId);
      }
      resetForm(); await loadData(true);
    } catch (err) {
      setConflictError(err.message || 'Error saving trip');
    } finally { setIsSubmitting(false); }
  };

  const handleAdvanceStatus = async (trip, nextStatus) => {
    try {
      await apiRequest('PATCH', `/trips/${trip.id}/status`, { status: nextStatus });
      showToast(`Trip #${trip.id} status updated to ${nextStatus}`);
      await loadData(true);
    } catch (err) {
      showToast(`Error: ${err.message}`);
    }
  };

  return (
    <div className="trip-dispatcher-container fade-in">

      {/* ══════════════════════════════════════════════════════════════════════
          LEFT PANEL — TRACKING LIST
          ══════════════════════════════════════════════════════════════════════ */}
      <aside className="td-left-panel">
        <div className="tl-header">
          <div className="tl-title-row">
            <div>
              <span className="tl-sub-label">Your Order</span>
              <h2 className="tl-title">Tracking list</h2>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                className="tl-new-btn"
                style={{ background: autoSync ? '#e6f7ef' : 'var(--surface)', color: autoSync ? '#168454' : 'var(--sub)', borderColor: autoSync ? 'rgba(34, 160, 107, 0.3)' : 'var(--line)' }}
                onClick={() => setAutoSync(value => !value)}
                title={autoSync ? 'Pause selected-trip GPS updates' : 'Resume selected-trip GPS updates'}
                aria-label={autoSync ? 'Pause GPS auto-sync' : 'Resume GPS auto-sync'}
              >
                <Radio size={14} />
              </button>
              <button
                className="tl-new-btn"
                onClick={refreshSelectedTripTelemetry}
                disabled={!selectedTripId || isRefreshingLocation}
                title="Refresh selected trip GPS and breadcrumb data"
                aria-label="Refresh selected trip GPS and breadcrumb data"
              >
                <RefreshCw size={14} className={isRefreshingLocation ? 'spin-icon' : ''} />
              </button>
              <button className="tl-new-btn" onClick={() => setDrawerOpen(true)} title="Create New Trip">
                <Plus size={16} />
                <span>New</span>
              </button>
            </div>
          </div>

          <div className="tl-search-wrap">
            <Search size={14} className="tl-search-icon" />
            <input
              type="text"
              className="tl-search-input"
              placeholder="Search trip ID, origin, destination..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button className="tl-search-clear" onClick={() => setSearchQuery('')}>
                <X size={12} />
              </button>
            )}
          </div>

          <div className="tl-filter-tabs">
            {STATUS_FILTERS.map(f => (
              <button
                key={f}
                className={`tl-tab ${statusFilter === f ? 'active' : ''}`}
                onClick={() => setStatusFilter(f)}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        <div className="tl-cards-scroll">
          {isLoading ? (
            <div className="tl-loading-state">
              <RefreshCw size={20} className="spin-icon" />
              <span>Loading trips data...</span>
            </div>
          ) : filteredTrips.length === 0 ? (
            <div className="tl-empty-state">
              <Package size={24} />
              <p>No trips found matching filter</p>
            </div>
          ) : (
            filteredTrips.map(t => {
              const isSelected = selectedTrip && selectedTrip.id === t.id;

              const progressPct = t.status === 'Completed' ? 100
                : t.status === 'Dispatched' ? 65
                : t.status === 'Assigned' ? 35 : 15;

              return (
                <div
                  key={t.id}
                  className={`tracking-card ${isSelected ? 'selected' : ''}`}
                  onClick={() => setSelectedTripId(t.id)}
                >
                  <div className="tc-top-row">
                    <div className="tc-id-wrap">
                      <span className="tc-code">2026 - FASLOG - TRIP-{t.id}</span>
                      <span className="tc-hash">#TRK-{t.id}845</span>
                    </div>
                    <div className="tc-top-right" onClick={e => e.stopPropagation()}>
                      <StatusTag status={t.status} />
                      <button className="tc-small-edit" onClick={() => setEditingTrip(t)} title="Edit Trip">
                        <Edit2 size={13} />
                      </button>
                    </div>
                  </div>

                  {/* Route Origin Circle Dot & Destination Map Pin */}
                  <div className="tc-route-row">
                    <div className="tc-loc">
                      <div className="tc-loc-item">
                        <span className="tc-origin-dot" />
                        <span className="tc-loc-name" title={t.origin}>{t.origin}</span>
                      </div>
                    </div>
                    <div className="tc-route-arrow">
                      <ArrowRight size={14} />
                    </div>
                    <div className="tc-loc align-right">
                      <div className="tc-loc-item">
                        <MapPin size={13} className="tc-dest-icon" />
                        <span className="tc-loc-name" title={t.destination}>{t.destination}</span>
                      </div>
                    </div>
                  </div>

                  <div className="tc-dates-row">
                    <span>{t.start_time ? new Date(t.start_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Start Pending'}</span>
                    <span>{t.expected_arrival ? new Date(t.expected_arrival).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'ETA Pending'}</span>
                  </div>

                  {/* Billing line: who this trip is billed to, the fare, and
                      whether it has already been put on a bill. */}
                  {(t.external_party_name || parseFloat(t.revenue) > 0) && (
                    <div className="tc-billing-row" title="Customer / fare / billing status">
                      <span className="tc-billing-company">{t.external_party_name || 'No customer set'}</span>
                      <span className="tc-billing-fare">
                        {parseFloat(t.revenue) > 0 ? `₹${Number(t.revenue).toLocaleString('en-IN')}` : 'No fare'}
                      </span>
                      <span className={`tc-billing-tag ${t.billing_status === 'Billed' ? 'billed' : ''}`}>
                        {t.billing_status === 'Billed' ? 'Billed' : 'Unbilled'}
                      </span>
                    </div>
                  )}

                  {/* Lifecycle actions. A trip only becomes billable once it
                      is Completed, so the path to Completed has to be
                      reachable from here — these were missing entirely and
                      trips could never leave 'Assigned'. */}
                  <div className="tc-actions-row" onClick={e => e.stopPropagation()}>
                    {(t.status === 'Draft' || t.status === 'Planned') && (
                      <button
                        className="tc-act"
                        onClick={() => setAssignModal({
                          open: true,
                          trip: t,
                          vehicleId: t.vehicle_id || '',
                          driverId: t.driver_id || ''
                        })}
                      >
                        <Truck size={12} /> Assign vehicle &amp; driver
                      </button>
                    )}

                    {t.status === 'Assigned' && (
                      <button className="tc-act" onClick={() => handleAdvanceStatus(t, 'Dispatched')}>
                        <Navigation size={12} /> Dispatch
                      </button>
                    )}

                    {t.status === 'Dispatched' && (
                      <>
                        <div className="tc-checkpoint-status">
                          <span>Loading <strong>{t.loaded_at ? 'Loaded' : 'Waiting to load'}</strong></span>
                          {t.loaded_at ? (
                            <span>Unloading <strong>{t.unloaded_at ? 'Unloaded' : 'Waiting to unload'}</strong></span>
                          ) : null}
                        </div>
                        {t.loaded_at && t.unloaded_at && (
                          <span className="tc-checkpoint-awaiting">Awaiting driver to end trip in the mobile app</span>
                        )}
                      </>
                    )}
                  </div>

                  <div className="tc-progress-wrap">
                    <span className="tc-start-dot" />
                    <div className="tc-progress-track">
                      <div className="tc-progress-fill" style={{ width: `${progressPct}%` }} />
                      <div className="tc-truck-node" style={{ left: `${Math.min(progressPct, 92)}%` }}>
                        <Truck size={12} />
                      </div>
                    </div>
                    <MapPin size={14} className="tc-pin-icon" />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* ══════════════════════════════════════════════════════════════════════
          RIGHT PANEL — FULL HEIGHT MAP CONTAINER (DRIVER STATS REMOVED)
          ══════════════════════════════════════════════════════════════════════ */}
      <main className="td-right-panel">
        {selectedTrip ? (
          <section className="trip-telemetry-panel" aria-label="Selected trip live telemetry">
            <div className="trip-telemetry-block">
              <span>Speed</span>
              <strong>{selectedGpsIsFresh ? formatVehicleSpeed(selectedTripLocation?.speed) : '--'}</strong>
            </div>
            <div className="trip-telemetry-block">
              <span>Status</span>
              <strong className={selectedGpsIsFresh ? 'is-live' : 'is-waiting'}>
                {!selectedGpsIsFresh
                  ? selectedTripLocation ? 'No signal' : 'Waiting for signal'
                  : Number(selectedTripLocation?.speed || 0) < STATIONARY_SPEED_MS
                    ? 'Stalled'
                    : 'Moving'}
              </strong>
            </div>
            <div className="trip-telemetry-block">
              <span>Accuracy</span>
              <strong>{selectedGpsIsFresh && selectedTripLocation?.accuracy != null
                ? `${Number(selectedTripLocation.accuracy).toFixed(0)} m`
                : '--'}</strong>
            </div>
            <div className="trip-telemetry-block">
              <span>Last signal</span>
              <strong>{selectedTripLocation?.captured_at
                ? new Date(selectedTripLocation.captured_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                : 'Never received'}</strong>
            </div>
          </section>
        ) : null}

        <section className="td-map-container full-height">
          <div className="td-dark-map-canvas" ref={mapContainerRef} />

          <div className="map-eta-callout">
            <div className="eta-title">
              <span>Drop - off ETA:</span>
              <strong>
                {selectedTrip?.expected_arrival 
                  ? new Date(selectedTrip.expected_arrival).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  : 'ETA pending'}
              </strong>
            </div>
            <div className="eta-sub">{selectedTrip?.destination || 'Select a trip'}</div>
            {selectedTrip ? <div className="eta-code">Trip #{selectedTrip.id}</div> : null}
          </div>

          <div className="map-zoom-controls">
            <button onClick={handleZoomIn} title="Zoom In">+</button>
            <button onClick={handleZoomOut} title="Zoom Out">−</button>
            <button onClick={handleRecenter} title="Recenter Route"><Navigation size={14} /></button>
            <div className="map-theme-wrap">
              <button onClick={() => setShowThemeMenu(!showThemeMenu)} title="Map Theme / Style">
                <MapIcon size={14} />
              </button>
              {showThemeMenu && (
                <div className="map-theme-popover">
                  <button className={`map-theme-opt ${mapTheme === 'outdoors' ? 'active' : ''}`} onClick={() => { setMapTheme('outdoors'); setShowThemeMenu(false); }}>
                    🌿 Vibrant HD Outdoors
                  </button>
                  <button className={`map-theme-opt ${mapTheme === 'navigation' ? 'active' : ''}`} onClick={() => { setMapTheme('navigation'); setShowThemeMenu(false); }}>
                    🧭 Navigation Day
                  </button>
                  <button className={`map-theme-opt ${mapTheme === 'streets' ? 'active' : ''}`} onClick={() => { setMapTheme('streets'); setShowThemeMenu(false); }}>
                    🗺️ Standard Streets
                  </button>
                  <button className={`map-theme-opt ${mapTheme === 'osm' ? 'active' : ''}`} onClick={() => { setMapTheme('osm'); setShowThemeMenu(false); }}>
                    🌐 OpenStreetMap
                  </button>
                  <button className={`map-theme-opt ${mapTheme === 'light' ? 'active' : ''}`} onClick={() => { setMapTheme('light'); setShowThemeMenu(false); }}>
                    ☀️ Minimal Light Gray
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Map Controls */}
        </section>
      </main>

      {/* CREATE / EDIT TRIP DRAWER WITH MAPBOX SEARCH */}
      {(drawerOpen || editingTrip) && (
        <div className="drawer-overlay" onClick={resetForm}>
          <div className="drawer-content" onClick={e => e.stopPropagation()}>
            <div className="drawer-header">
              <h3>{editingTrip ? `Edit Trip #${editingTrip.id}` : 'Create New Trip'}</h3>
              <button className="drawer-close" onClick={resetForm}><X size={16} /></button>
            </div>

            <form onSubmit={handleSaveTrip} className="drawer-form">
              {conflictError && <div className="drawer-alert-error"><AlertTriangle size={14} />{conflictError}</div>}

              <ACField ac={originAC} label="Origin (Pickup Address)" required placeholder="Search location e.g. Maruti Suzuki Manesar" />
              <ACField ac={destAC} label="Destination (Dropoff Address)" required placeholder="Search location e.g. Ahmedabad Hub" />

              <div className="form-row-2">
                <div className="field-wrap">
                  <label className="field-label">Vehicle</label>
                  <select className="field-select" value={vehicleId} onChange={e => setVehicleId(e.target.value)}>
                    <option value="">Select vehicle...</option>
                    {vehicles.map(v => (
                      <option key={v.id} value={v.id}>{v.name} ({v.type} - {v.max_load_capacity}kg)</option>
                    ))}
                  </select>
                </div>

                <div className="field-wrap">
                  <label className="field-label">Driver</label>
                  <select className="field-select" value={driverId} onChange={e => setDriverId(e.target.value)}>
                    <option value="">Select driver...</option>
                    {drivers.map(d => (
                      <option key={d.id} value={d.id}>{d.name} ({d.status})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-row-2">
                <div className="field-wrap">
                  <label className="field-label">Cargo Weight (kg)</label>
                  <input type="number" className="field-input" value={cargoWeight} onChange={e => setCargoWeight(e.target.value)} placeholder="500" />
                </div>
              </div>

              {/* Billing details: the customer named here decides which bill
                  this trip lands on, and the fare is what that bill charges. */}
              <div className="form-row-2">
                <div className="field-wrap">
                  <label className="field-label">Company (customer billed)</label>
                  <input
                    className="field-input"
                    list="trip-company-options"
                    value={company}
                    onChange={e => setCompany(e.target.value)}
                    placeholder="e.g. Sharma Logistics"
                  />
                  <datalist id="trip-company-options">
                    {companyOptions.map(name => <option key={name} value={name} />)}
                  </datalist>
                </div>
                <div className="field-wrap">
                  <label className="field-label">Fare (₹)</label>
                  <input type="number" className="field-input" value={revenue} onChange={e => setRevenue(e.target.value)} placeholder="25000" />
                </div>
              </div>

              <div className="field-wrap">
                <label className="field-label">Advance received (₹)</label>
                <input type="number" className="field-input" value={advanceReceived} onChange={e => setAdvanceReceived(e.target.value)} placeholder="0" />
              </div>

              <div className="drawer-actions">
                <button type="button" className="btn-cancel" onClick={resetForm}>Cancel</button>
                <button type="submit" className="btn-submit" disabled={isSubmitting || !originAC.query.trim() || !destAC.query.trim()}>
                  {isSubmitting ? 'Saving...' : (editingTrip ? 'Save Changes' : 'Create Trip')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODALS */}
      {assignModal.open && (
        <div className="modal-overlay" onClick={() => setAssignModal({ open: false, trip: null, vehicleId: '', driverId: '' })}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Assign Trip #{assignModal.trip?.id}</h3>
              <button className="modal-close" onClick={() => setAssignModal({ open: false, trip: null, vehicleId: '', driverId: '' })}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <div className="field-wrap">
                <label className="field-label">Select Vehicle</label>
                <select className="field-select" value={assignModal.vehicleId} onChange={e => setAssignModal({ ...assignModal, vehicleId: e.target.value })}>
                  <option value="">Select vehicle...</option>
                  {vehicles.filter(v => v.status === 'Available').map(v => (
                    <option key={v.id} value={v.id}>{v.name} ({v.type})</option>
                  ))}
                </select>
              </div>
              <div className="field-wrap">
                <label className="field-label">Select Driver</label>
                <select className="field-select" value={assignModal.driverId} onChange={e => setAssignModal({ ...assignModal, driverId: e.target.value })}>
                  <option value="">Select driver...</option>
                  {drivers.filter(d => d.status === 'Available').map(d => (
                    <option key={d.id} value={d.id}>{d.name} ({d.status})</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-cancel" onClick={() => setAssignModal({ open: false, trip: null, vehicleId: '', driverId: '' })}>Cancel</button>
              <button className="btn-submit" onClick={async () => {
                if (!assignModal.vehicleId || !assignModal.driverId) return;
                try {
                  const tripId = assignModal.trip.id;
                  await apiRequest('PATCH', `/trips/${tripId}`, {
                    vehicle_id: String(assignModal.vehicleId),
                    driver_id: String(assignModal.driverId)
                  });
                  if (assignModal.trip.status === 'Draft' || assignModal.trip.status === 'Planned') {
                    await apiRequest('PATCH', `/trips/${tripId}/status`, { status: 'Assigned' });
                  }
                  showToast(`Trip #${tripId} assigned!`);
                  setAssignModal({ open: false, trip: null, vehicleId: '', driverId: '' });
                  await loadData(true);
                } catch(e) { showToast(`Error: ${e.message}`); }
              }}>Save Assignment</button>
            </div>
          </div>
        </div>
      )}

      {/* DRIVER QUICK VIEW DRAWER */}
      {driverViewId && (
        <div className="drawer-overlay" onClick={() => setDriverViewId(null)}>
          <div className="drawer-content driver-drawer" onClick={e => e.stopPropagation()}>
            <div className="drawer-header">
              <h3>Driver Profile</h3>
              <button className="drawer-close" onClick={() => setDriverViewId(null)}><X size={16} /></button>
            </div>
            <div className="driver-drawer-body">
              {(() => {
                const d = drivers.find(drv => String(drv.id) === String(driverViewId));
                if (!d) return <p>Driver not found.</p>;
                return (
                  <div className="driver-qv-card">
                    <div className="dq-avatar">{d.name.charAt(0)}</div>
                    <div className="dq-info">
                      <h2>{d.name}</h2>
                      <span className={`dq-status ${d.status === 'Available' ? 'tag-planned' : 'tag-assigned'}`}>{d.status}</span>
                    </div>
                    <div className="dq-details">
                      <div className="dq-row"><span>License:</span> <strong>{d.license_no}</strong></div>
                      <div className="dq-row"><span>Phone:</span> <strong>{d.phone}</strong></div>
                      <div className="dq-row"><span>Trips Completed:</span> <strong>{d.trips_completed || 0}</strong></div>
                    </div>
                    <button className="btn-submit dq-full-btn" style={{marginTop: '20px', width: '100%'}} onClick={() => window.open(`/drivers`, '_blank')}>View Full Profile</button>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

