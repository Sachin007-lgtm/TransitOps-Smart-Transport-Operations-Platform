import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  History,
  Search, MapPin, Navigation, X, Check, Activity, FileText,
  CheckCircle2, User, Truck, Info, FileWarning,
  ChevronDown, ChevronUp, Eye, EyeOff, AlertTriangle, RefreshCw, Trash2,
  DollarSign, Building2, ShieldAlert, Plus,
  ArrowRight, Route, Package, SlidersHorizontal, Map as MapIcon, Edit2,
  Phone, MessageSquare, ExternalLink, Calendar, Clock, BarChart2
} from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useNavigate } from 'react-router-dom';
import { tripCode } from '../utils/tripCode';
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
// Filter row matches what the list can actually show: 'Dispatched' was
// dropped because the status badge already renders it as IN TRANSIT
// (redundant with the In Transit tab), and 'Completed' because completed
// trips leave this list for Trip History, so that tab could only ever
// render an empty list. Cancelled stays: the backend supports cancelling
// and cancelled trips do show here, just not on any bill.
const STATUS_FILTERS = ['All', 'In Transit', 'Pending', 'Cancelled'];

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

/** Format a datetime string to a readable time (e.g. "02:45 PM") */
function formatTime(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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

// Saved-company combobox for the trip drawer: unlike a bare <datalist>, the
// full saved-customer list opens on focus (or the chevron) without typing —
// an obvious dropdown — while free text still works for one-time / individual
// trips (the value is whatever is typed; a company row is auto-created by the
// backend when a trip names a customer for the first time).
function CompanyField({ value, onChange, options, placeholder }) {
  const [isOpen, setIsOpen] = useState(false);
  // Chevron opens the FULL saved list regardless of what is typed (so a
  // selected company never hides the others); typing always filters.
  const [showAll, setShowAll] = useState(false);
  const query = (value || '').trim().toLowerCase();
  const matches = showAll || !query
    ? options
    : options.filter(o => o.toLowerCase().includes(query));

  return (
    <div className="field-wrap">
      <label className="field-label">Company (customer billed)</label>
      <div className="ac-wrap">
        <div className="ac-input-row">
          <Building2 size={13} className="ac-icon" />
          <input
            type="text"
            className="ac-input"
            value={value}
            onChange={e => { setShowAll(false); onChange(e.target.value); }}
            onFocus={() => setIsOpen(true)}
            onBlur={() => setTimeout(() => setIsOpen(false), 150)}
            placeholder={placeholder}
            autoComplete="off"
          />
          {options.length > 0 && (
            <button
              type="button"
              className="ac-clear"
              onMouseDown={e => e.preventDefault()}
              onClick={() => { setIsOpen(o => !o); setShowAll(true); }}
              title={isOpen ? 'Close saved customers' : 'Saved customers'}
            >
              {isOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            </button>
          )}
        </div>
        {isOpen && matches.length > 0 && (
          <div className="ac-menu" style={{ maxHeight: 180, overflowY: 'auto' }}>
            {matches.map(name => (
              <div
                key={name}
                className="ac-option"
                onMouseDown={e => { e.preventDefault(); onChange(name); setIsOpen(false); }}
              >
                <Building2 size={11} className="ac-opt-icon" />
                <span>{name}</span>
              </div>
            ))}
          </div>
        )}
        {isOpen && query && matches.length === 0 && (
          <div className="ac-menu">
            <div className="ac-opt-icon" style={{ padding: '8px 10px', opacity: 0.65, fontSize: 12 }}>
              One-time entry — "{value.trim()}" is not in saved customers yet
            </div>
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
  // View split: completed trips leave the tracking list and live in Trip
  // History, so the tracking list only ever shows work in progress.
  const [selectedTripId, setSelectedTripId] = useState(null);
  const [selectedTripLocation, setSelectedTripLocation] = useState(null);
  const [selectedTripHistory, setSelectedTripHistory] = useState([]);
  const [isRefreshingLocation, setIsRefreshingLocation] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);

  // ── Map References ──
  const mapContainerRef = useRef(null);
  const mapInstanceRef  = useRef(null);
  const prevSelectedTripIdRef = useRef(null);
  const truckMarkerRef  = useRef(null);
  const originMarkerRef = useRef(null);
  const destMarkerRef   = useRef(null);

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
  const navigate = useNavigate();

  // Completed trips do not belong in the tracking list — they move to Trip
  // History. Both views come from the same /trips fetch, so neither can
  // go stale against the other.
  // Completed trips live in Trip History (a page of their own); the tracking
  // list is work in progress only.
  const filteredTrips = trips.filter(t => t.status !== 'Completed').filter(t => {
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
      (t.vehicle?.registration_number || '').toLowerCase().includes(query) ||
      (t.driver?.name || '').toLowerCase().includes(query)
    );
  });

  // The map follows the tracking list.
  const selectedTrip = filteredTrips.find(t => t.id === selectedTripId) || filteredTrips[0] || null;
  const selectedGpsIsFresh = isFreshGps(selectedTripLocation);


  // Load data — useCallback so the polling interval gets a stable reference
  const loadData = useCallback(async (silent = false) => {
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
      setLastSyncedAt(new Date());
    } catch (err) {
      setGeneralError(err.message || 'Failed to connect to backend.');
    } finally { setIsLoading(false); setIsRefreshing(false); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadData();
    const now = new Date();
    setStartTime(new Date(now.getTime() + 30 * 60000).toISOString().slice(0, 16));
    setExpectedArrival(new Date(now.getTime() + 180 * 60000).toISOString().slice(0, 16));
  }, []);

  // Auto-poll trips list every 12 s so load/unload and status changes from the
  // mobile app appear without a page refresh.
  useEffect(() => {
    const interval = setInterval(() => loadData(true), 12000);
    return () => clearInterval(interval);
  }, [loadData]);

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
    // Live data: GPS telemetry auto-refreshes unconditionally, so there is
    // no pause/refresh toggle to get wrong.
    const interval = setInterval(loadSelectedTripTelemetry, 6000);

    return () => {
      isMounted = false;
      if (interval) clearInterval(interval);
    };
  }, [selectedTripId]);


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

    const resizeObserver = new ResizeObserver(() => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
      }
    });
    if (mapContainerRef.current) {
      resizeObserver.observe(mapContainerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
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

      const isNewTrip = prevSelectedTripIdRef.current !== selectedTrip.id;
      if (isNewTrip) {
        if (map._tripLayers) {
          map._tripLayers.forEach(layer => layer.remove());
        }
        map._tripLayers = [];
        if (truckMarkerRef.current) {
          truckMarkerRef.current.remove();
          truckMarkerRef.current = null;
        }
        if (originMarkerRef.current) {
          originMarkerRef.current.remove();
          originMarkerRef.current = null;
        }
        if (destMarkerRef.current) {
          destMarkerRef.current.remove();
          destMarkerRef.current = null;
        }
      } else {
        // Remove only polyline route layers, keeping markers alive to prevent flicker
        if (map._tripLayers) {
          map._tripLayers.forEach(layer => {
            if (layer !== truckMarkerRef.current && layer !== originMarkerRef.current && layer !== destMarkerRef.current) {
              layer.remove();
            }
          });
        }
        map._tripLayers = [
          ...(truckMarkerRef.current ? [truckMarkerRef.current] : []),
          ...(originMarkerRef.current ? [originMarkerRef.current] : []),
          ...(destMarkerRef.current ? [destMarkerRef.current] : [])
        ];
      }

      // Origin Circle Node (Google Maps start dot style with generous hit area)
      const originIcon = L.divIcon({
        className: 'leaflet-origin-dot-marker',
        html: `<div class="origin-circle-outer"><div class="origin-circle-inner"></div></div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18]
      });

      // Destination Pin Marker (Google Maps destination pin style with generous hit area)
      const destIcon = L.divIcon({
        className: 'leaflet-dest-pin-marker',
        html: `
          <div class="dest-pin-svg">
            <svg width="26" height="32" viewBox="0 0 24 30" fill="none">
              <path d="M12 0C5.37 0 0 5.37 0 12C0 21 12 30 12 30C12 30 24 21 24 12C24 5.37 18.63 0 12 0Z" fill="#7a4a63"/>
              <circle cx="12" cy="12" r="4.5" fill="#FFFFFF"/>
            </svg>
          </div>
        `,
        iconSize: [40, 44],
        iconAnchor: [20, 44]
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
      const hasRecordedLocation = Number.isFinite(liveLatitude) && Number.isFinite(liveLongitude);
      const hasLiveLocation = selectedGpsIsFresh && hasRecordedLocation;

      // Distance calculation in km between two lat/lng points
      const getDistKm = (p1, p2) => {
        const dLat = (p1[0] - p2[0]) * 111;
        const dLng = (p1[1] - p2[1]) * 111 * Math.cos(((p1[0] + p2[0]) / 2) * (Math.PI / 180));
        return Math.sqrt(dLat * dLat + dLng * dLng);
      };

      // Check if recorded GPS is close enough to the route (within 80km)
      let minDistanceToRoute = Infinity;
      if (hasRecordedLocation && routePath && routePath.length > 0) {
        for (const pt of routePath) {
          const d = getDistKm([liveLatitude, liveLongitude], pt);
          if (d < minDistanceToRoute) minDistanceToRoute = d;
        }
      }
      const isGpsOnRoute = minDistanceToRoute < 80;

      // Position vehicle:
      // 1. If GPS is within reasonable distance to route (< 80km), use real GPS position
      // 2. If GPS is stale or far away (e.g. test GPS in another state), place along the trip route according to status!
      let truckPos = null;
      let displayStatus = 'AT ORIGIN';

      if (hasRecordedLocation && isGpsOnRoute) {
        truckPos = [liveLatitude, liveLongitude];
        displayStatus = hasLiveLocation ? 'LIVE' : 'LAST SEEN';
      } else if (selectedTrip.status === 'Dispatched') {
        // Dispatched (In Transit): place vehicle at 45% along the actual road route
        const midIdx = Math.max(0, Math.floor(routePath.length * 0.45));
        truckPos = routePath[midIdx] || originCoords;
        displayStatus = hasLiveLocation ? 'LIVE' : hasRecordedLocation ? 'LAST SEEN' : 'IN TRANSIT';
      } else if (selectedTrip.status === 'Completed') {
        truckPos = destCoords;
        displayStatus = 'COMPLETED';
      } else {
        // Draft, Planned, Assigned
        truckPos = originCoords;
        displayStatus = 'AT ORIGIN';
      }

      const statusTag = ` · ${displayStatus}`;

      const truckIdx = truckPos
        ? routePath.reduce((closestIndex, point, index) => {
            const closestPoint = routePath[closestIndex];
            const currentDistance = (point[0] - truckPos[0]) ** 2 + (point[1] - truckPos[1]) ** 2;
            const closestDistance = (closestPoint[0] - truckPos[0]) ** 2 + (closestPoint[1] - truckPos[1]) ** 2;
            return currentDistance < closestDistance ? index : closestIndex;
          }, 0)
        : -1;

      const breadcrumbPath = selectedTripHistory
        .map(point => [Number(point.latitude), Number(point.longitude)])
        .filter(([latitude, longitude]) => Number.isFinite(latitude) && Number.isFinite(longitude));

      const truckIcon = L.divIcon({
        className: 'map-truck-marker leaflet-truck-marker',
        html: `
          <div class="marker-badge">${selectedTrip.vehicle?.registration_number || selectedTrip.vehicle_registration || 'Vehicle'}${statusTag}</div>
          <div class="marker-icon-pulse ${hasLiveLocation && isGpsOnRoute ? '' : 'secondary'}">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="1" y="3" width="15" height="13"></rect>
              <polygon points="16 8 20 8 23 11 23 16 16 16 8"></polygon>
              <circle cx="5.5" cy="18.5" r="2.5"></circle>
              <circle cx="18.5" cy="18.5" r="2.5"></circle>
            </svg>
          </div>
        `,
        iconSize: [140, 68],
        iconAnchor: [70, 56]
      });

      // Refined Route Polylines
      const hasProgress = truckIdx > 0 || selectedTrip.status === 'Dispatched';
      const activeIdx = truckIdx >= 0 ? truckIdx : Math.floor(routePath.length * 0.45);
      const activePath = hasProgress ? routePath.slice(0, Math.max(activeIdx + 1, 2)) : [];
      const remainingPath = hasProgress ? routePath.slice(Math.max(activeIdx, 0)) : routePath;

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
      const activeLineOuter = hasProgress ? L.polyline(activePath, {
        color: '#7a4a63',
        weight: 5,
        opacity: 0.9,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(map) : null;

      const activeLineInner = hasProgress ? L.polyline(activePath, {
        color: '#f9f9f9',
        weight: 2.5,
        opacity: 1,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(map) : null;

      const breadcrumbLine = breadcrumbPath.length > 1 ? L.polyline(breadcrumbPath, {
        color: '#e08a1e',
        weight: 4,
        opacity: 0.9,
        dashArray: '8, 7',
        lineJoin: 'round'
      }).addTo(map) : null;

      // Telemetry metric values
      const speedVal = (selectedGpsIsFresh && isGpsOnRoute) ? formatVehicleSpeed(selectedTripLocation?.speed) : '--';
      const statusVal = !(selectedGpsIsFresh && isGpsOnRoute)
        ? (selectedTrip.status === 'Dispatched' ? 'In Transit' : selectedTrip.status || 'Waiting')
        : (Number(selectedTripLocation?.speed || 0) < STATIONARY_SPEED_MS ? 'Stalled' : 'Moving');
      const statusClass = (selectedGpsIsFresh && isGpsOnRoute) ? 'is-live' : 'is-waiting';
      const accVal = (selectedGpsIsFresh && isGpsOnRoute && selectedTripLocation?.accuracy != null)
        ? `${Number(selectedTripLocation.accuracy).toFixed(0)} m`
        : '--';
      const signalVal = selectedTripLocation?.captured_at
        ? formatTime(selectedTripLocation.captured_at)
        : 'Never';

      const driverName = selectedTrip.driver?.name || selectedTrip.driver_name || 'Assigned Driver';
      const vehicleReg = selectedTrip.vehicle?.registration_number || selectedTrip.vehicle_registration || 'Vehicle';
      const vehicleType = selectedTrip.vehicle?.type || selectedTrip.vehicle_type || 'Vehicle';

      // ── Popups for Origin and Destination Location Markers ──
      const originPopupHtml = `
        <div class="dark-truck-popup location-pin-popup">
          <div class="dtp-driver-header">
            <div class="dtp-avatar origin-avatar">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <circle cx="12" cy="12" r="10"></circle>
                <circle cx="12" cy="12" r="3" fill="currentColor"></circle>
              </svg>
            </div>
            <div class="dtp-driver-info">
              <h4 class="dtp-driver-name">Trip Origin</h4>
              <span class="dtp-driver-sub">${selectedTrip.origin}</span>
            </div>
            <div class="dtp-actions">
              <button class="dtp-icon-btn close-origin-popup-btn" title="Close">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
          </div>
          <div class="dtp-time-bar">
            <div class="dtp-time-item">
              <span class="dtp-time-label">DEPARTURE</span>
              <span class="dtp-time-val">${formatTime(selectedTrip.start_time)}</span>
            </div>
            <div class="dtp-time-item">
              <span class="dtp-time-label">ASSIGNED VEHICLE</span>
              <span class="dtp-time-val highlight">${vehicleReg}</span>
            </div>
          </div>
          <div class="dtp-actions-row">
            <button class="dtp-view-vehicle-btn" id="open-truck-from-origin">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg>
              <span>View Vehicle Live Card</span>
            </button>
          </div>
        </div>
      `;

      if (originMarkerRef.current) {
        originMarkerRef.current.setLatLng(originCoords);
        if (originMarkerRef.current.isPopupOpen()) {
          originMarkerRef.current.getPopup().setContent(originPopupHtml);
        } else {
          originMarkerRef.current.setPopupContent(originPopupHtml);
        }
      } else {
        const mOrigin = L.marker(originCoords, { icon: originIcon, zIndexOffset: 500, riseOnHover: true }).addTo(map);
        mOrigin.bindPopup(originPopupHtml, {
          className: 'custom-leaflet-driver-popup theme-popup',
          closeButton: false,
          maxWidth: 320,
          minWidth: 280,
          autoPan: true
        });
        mOrigin.on('popupopen', (e) => {
          const el = e.popup.getElement();
          const btn = el?.querySelector('#open-truck-from-origin');
          const closeBtn = el?.querySelector('.close-origin-popup-btn');
          if (btn) {
            btn.onclick = (ev) => {
              ev.stopPropagation();
              mOrigin.closePopup();
              truckMarkerRef.current?.openPopup();
            };
          }
          if (closeBtn) {
            closeBtn.onclick = (ev) => {
              ev.stopPropagation();
              mOrigin.closePopup();
            };
          }
        });
        originMarkerRef.current = mOrigin;
      }

      const destPopupHtml = `
        <div class="dark-truck-popup location-pin-popup">
          <div class="dtp-driver-header">
            <div class="dtp-avatar dest-avatar">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                <circle cx="12" cy="10" r="3"></circle>
              </svg>
            </div>
            <div class="dtp-driver-info">
              <h4 class="dtp-driver-name">Trip Destination</h4>
              <span class="dtp-driver-sub">${selectedTrip.destination}</span>
            </div>
            <div class="dtp-actions">
              <button class="dtp-icon-btn close-dest-popup-btn" title="Close">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
          </div>
          <div class="dtp-time-bar">
            <div class="dtp-time-item">
              <span class="dtp-time-label">EST. ARRIVAL</span>
              <span class="dtp-time-val highlight">${formatTime(selectedTrip.expected_arrival)}</span>
            </div>
            <div class="dtp-time-item">
              <span class="dtp-time-label">STATUS</span>
              <span class="dtp-time-val">${selectedTrip.status || 'In Transit'}</span>
            </div>
          </div>
          <div class="dtp-actions-row">
            <button class="dtp-view-vehicle-btn" id="open-truck-from-dest">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg>
              <span>View Vehicle Live Card</span>
            </button>
          </div>
        </div>
      `;

      if (destMarkerRef.current) {
        destMarkerRef.current.setLatLng(destCoords);
        if (destMarkerRef.current.isPopupOpen()) {
          destMarkerRef.current.getPopup().setContent(destPopupHtml);
        } else {
          destMarkerRef.current.setPopupContent(destPopupHtml);
        }
      } else {
        const mDest = L.marker(destCoords, { icon: destIcon, zIndexOffset: 500, riseOnHover: true }).addTo(map);
        mDest.bindPopup(destPopupHtml, {
          className: 'custom-leaflet-driver-popup theme-popup',
          closeButton: false,
          maxWidth: 320,
          minWidth: 280,
          autoPan: true
        });
        mDest.on('popupopen', (e) => {
          const el = e.popup.getElement();
          const btn = el?.querySelector('#open-truck-from-dest');
          const closeBtn = el?.querySelector('.close-dest-popup-btn');
          if (btn) {
            btn.onclick = (ev) => {
              ev.stopPropagation();
              mDest.closePopup();
              truckMarkerRef.current?.openPopup();
            };
          }
          if (closeBtn) {
            closeBtn.onclick = (ev) => {
              ev.stopPropagation();
              mDest.closePopup();
            };
          }
        });
        destMarkerRef.current = mDest;
      }

      // Interactive Marker Popup with Real Time Metrics & The 4 Telemetry Cards
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
              <h4 class="dtp-driver-name">${driverName}</h4>
              <span class="dtp-driver-sub">${vehicleReg} · ${vehicleType}</span>
            </div>
            <div class="dtp-actions">
              <button class="dtp-icon-btn view-driver-btn" title="View Profile" data-driver="${selectedTrip.driver_id || ''}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
              </button>
              <button class="dtp-icon-btn edit-trip-btn" title="Edit Trip" data-trip="${selectedTrip.id}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
              </button>
              <button class="dtp-icon-btn close-truck-popup-btn" title="Close Card">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
          </div>
          
          <div class="dtp-route-summary">
            <div class="dtp-route-text">${selectedTrip.origin} <span>→</span> ${selectedTrip.destination}</div>
            <div class="dtp-status-pill ${hasLiveLocation && isGpsOnRoute ? 'live' : 'waiting'}">● ${displayStatus}</div>
          </div>

          <!-- Real Time Metrics Section -->
          <div class="dtp-time-bar">
            <div class="dtp-time-item">
              <span class="dtp-time-label">TRIP STARTED</span>
              <span class="dtp-time-val">${formatTime(selectedTrip.start_time)}</span>
            </div>
            <div class="dtp-time-item">
              <span class="dtp-time-label">ELAPSED</span>
              <span class="dtp-time-val highlight">${formatElapsed(selectedTrip.start_time)}</span>
            </div>
            <div class="dtp-time-item">
              <span class="dtp-time-label">EST. ARRIVAL</span>
              <span class="dtp-time-val">${formatTime(selectedTrip.expected_arrival)}</span>
            </div>
          </div>

          <!-- The 4 Telemetry Metrics Grid (Moved from upper cards to vehicle popup) -->
          <div class="dtp-telemetry-grid">
            <div class="dtp-tele-box">
              <span class="dtp-tele-label">SPEED</span>
              <strong class="dtp-tele-value">${speedVal}</strong>
            </div>
            <div class="dtp-tele-box">
              <span class="dtp-tele-label">STATUS</span>
              <strong class="dtp-tele-value ${statusClass}">${statusVal}</strong>
            </div>
            <div class="dtp-tele-box">
              <span class="dtp-tele-label">ACCURACY</span>
              <strong class="dtp-tele-value">${accVal}</strong>
            </div>
            <div class="dtp-tele-box">
              <span class="dtp-tele-label">LAST SIGNAL</span>
              <strong class="dtp-tele-value">${signalVal}</strong>
            </div>
          </div>

          <div class="dtp-footer-meta">
            <span>#TRK-${selectedTrip.id}</span>
            ${breadcrumbPath.length > 0 ? `<span>${breadcrumbPath.length} GPS updates logged</span>` : ''}
          </div>
        </div>
      `;

      const attachTruckPopupListeners = (popupElement) => {
        if (!popupElement) return;
        const driverBtn = popupElement.querySelector('.view-driver-btn');
        const editBtn = popupElement.querySelector('.edit-trip-btn');
        const closeBtn = popupElement.querySelector('.close-truck-popup-btn');
        if (driverBtn) {
          driverBtn.onclick = (ev) => {
            ev.stopPropagation();
            const dId = driverBtn.getAttribute('data-driver');
            if (dId && dId !== 'null') setDriverViewId(dId);
          };
        }
        if (editBtn) {
          editBtn.onclick = (ev) => {
            ev.stopPropagation();
            setEditingTrip(selectedTrip);
          };
        }
        if (closeBtn) {
          closeBtn.onclick = (ev) => {
            ev.stopPropagation();
            truckMarkerRef.current?.closePopup();
          };
        }
      };

      if (truckPos) {
        if (truckMarkerRef.current) {
          // Marker already exists: smoothly update position and content without DOM reconstruction
          truckMarkerRef.current.setLatLng(truckPos);
          if (truckMarkerRef.current._currentStatusTag !== statusTag) {
            truckMarkerRef.current.setIcon(truckIcon);
            truckMarkerRef.current._currentStatusTag = statusTag;
          }
          if (truckMarkerRef.current.isPopupOpen()) {
            truckMarkerRef.current.getPopup().setContent(popupHtml);
            attachTruckPopupListeners(truckMarkerRef.current.getPopup().getElement());
          } else {
            truckMarkerRef.current.setPopupContent(popupHtml);
          }
        } else {
          // First time creation: create single marker instance
          const truckMarker = L.marker(truckPos, {
            icon: truckIcon,
            zIndexOffset: 1000,
            riseOnHover: true
          }).addTo(map);

          truckMarker._currentStatusTag = statusTag;

          truckMarker.bindPopup(popupHtml, {
            className: 'custom-leaflet-driver-popup theme-popup',
            closeButton: false,
            maxWidth: 320,
            minWidth: 280,
            autoPan: true,
            autoPanPadding: [50, 50]
          });

          truckMarker.on('popupopen', (e) => {
            attachTruckPopupListeners(e.popup._contentNode || e.popup.getElement());
          });

          truckMarkerRef.current = truckMarker;

          // Auto-open on initial load so the card is open and visible
          if (isNewTrip) {
            setTimeout(() => {
              if (truckMarkerRef.current) truckMarkerRef.current.openPopup();
            }, 350);
          }
        }
      }

      map._tripLayers.push(
        glowLine,
        ...(activeLineOuter ? [activeLineOuter] : []),
        ...(activeLineInner ? [activeLineInner] : []),
        remainingLine,
        ...(breadcrumbLine ? [breadcrumbLine] : [])
      );
      if (originMarkerRef.current && !map._tripLayers.includes(originMarkerRef.current)) {
        map._tripLayers.push(originMarkerRef.current);
      }
      if (destMarkerRef.current && !map._tripLayers.includes(destMarkerRef.current)) {
        map._tripLayers.push(destMarkerRef.current);
      }
      if (truckMarkerRef.current && !map._tripLayers.includes(truckMarkerRef.current)) {
        map._tripLayers.push(truckMarkerRef.current);
      }

      // Fit map view bounds ONLY if we switched to a new trip (don't auto-pan continuously as GPS updates)
      if (prevSelectedTripIdRef.current !== selectedTrip.id) {
        map.invalidateSize();
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
    mapInstanceRef.current.invalidateSize();
    const originCoords = selectedTrip.origin_coords || await resolveCoordsAsync(selectedTrip.origin, true);
    const destCoords   = selectedTrip.dest_coords   || await resolveCoordsAsync(selectedTrip.destination, false);
    mapInstanceRef.current.fitBounds(L.latLngBounds([originCoords, destCoords]), { padding: [70, 70], animate: true });
  };

  const showToast = (msg) => window.dispatchEvent(new CustomEvent('app-toast', { detail: msg }));


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
          <div className="tl-toolbar">
            <button className="tl-history-btn" onClick={() => navigate('/trip-history')} title="Open Trip History">
              <History size={14} />
              <span>Trip History</span>
              <ArrowRight size={13} className="tl-history-arrow" />
            </button>
            <div className="tl-toolbar-right">
              <button
                className={`tl-sync-btn ${isRefreshing ? 'syncing' : ''}`}
                onClick={() => loadData(true)}
                disabled={isRefreshing}
                title="Sync trips now"
              >
                <RefreshCw size={13} className={isRefreshing ? 'spin-icon' : ''} />
                <span>{isRefreshing ? 'Syncing…' : 'Sync'}</span>
              </button>
              <button className="tl-new-btn" onClick={() => setDrawerOpen(true)} title="Create New Trip">
                <Plus size={16} />
                <span>New</span>
              </button>
            </div>
          </div>
          <div className="tl-title-row">
            <h2 className="tl-title">Tracking list</h2>
            <span className="tl-live-badge">
              <span className="pulse-dot" />
              LIVE · {lastSyncedAt ? lastSyncedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'syncing…'}
            </span>
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
                      <span className="tc-code">{tripCode(t.id)}</span>
                      <span className="tc-hash">{t.external_party_name || t.planned_route}</span>
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
                    <span className="tc-date-item"><em>Depart</em>{t.start_time ? new Date(t.start_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '--'}</span>
                    <span className="tc-date-item"><em>Arrive</em>{t.expected_arrival ? new Date(t.expected_arrival).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '--'}</span>
                  </div>

                  {/* Billing line: who this trip is billed to, the fare, and
                      whether it has already been put on a bill. */}
                  {(t.external_party_name || parseFloat(t.revenue) > 0) && (
                    <div className="tc-billing-row" title="Customer / fare / billing status">
                      <span className="tc-billing-company">{t.external_party_name || <span className="tc-no-customer">No customer</span>}</span>
                      <span className="tc-billing-fare">
                        {parseFloat(t.revenue) > 0 ? `₹${Number(t.revenue).toLocaleString('en-IN')}` : '--'}
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
            {selectedTrip ? <div className="eta-code">Trip {tripCode(selectedTrip.id)}</div> : null}
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
                <CompanyField
                  value={company}
                  onChange={setCompany}
                  options={companyOptions}
                  placeholder="e.g. Sharma Logistics"
                />
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

