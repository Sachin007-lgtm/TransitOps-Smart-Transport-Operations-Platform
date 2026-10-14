import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, ChevronDown, Copy, Edit3, Info, FileText, RefreshCw } from 'lucide-react';
import { useGlobalSearch } from '../contexts/GlobalSearchContext';
import { apiRequest } from '../utils/api';
import { formatIndianNumberPlate, validateIndianNumberPlate } from '../utils/numberPlate';
import PageToolbar from '../components/common/PageToolbar';
import StatStrip from '../components/common/StatStrip';
import SideDrawer from '../components/common/SideDrawer';
import '../components/common/common.css';

const DEFAULT_TYPES = ['Truck', 'Van', 'Mini'];
const DEFAULT_SIZES = ['Small (8ft)', 'Medium (14ft)', 'Heavy (24ft)', 'Extra Heavy (32ft)'];
const VEHICLE_STATUSES = ['All Statuses', 'Available', 'On trip', 'Maintenance'];

export default function Vehicles() {
  const navigate = useNavigate();
  const { globalSearch, setGlobalSearch } = useGlobalSearch();
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Custom type & custom size storage
  const [customTypes, setCustomTypes] = useState([]);
  const [customSizes, setCustomSizes] = useState([]);
  
  // Filters
  const [typeFilter, setTypeFilter] = useState('All Types');
  const [sizeFilter, setSizeFilter] = useState('All Sizes');
  const [statusFilter, setStatusFilter] = useState('All Statuses');
  
  // Dropdown UI states
  const [isTypeOpen, setIsTypeOpen] = useState(false);
  const [isSizeOpen, setIsSizeOpen] = useState(false);
  const [isStatusOpen, setIsStatusOpen] = useState(false);
  
  // Add Modal State (status is NOT in the form, defaults to 'Available')
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newVehicle, setNewVehicle] = useState({
    numberPlate: '',
    type: 'Truck',
    customType: '',
    size: 'Medium (14ft)',
    customSize: '',
    distanceCovered: ''
  });
  const [isCustomTypeSelected, setIsCustomTypeSelected] = useState(false);
  const [isCustomSizeSelected, setIsCustomSizeSelected] = useState(false);
  const [formErrors, setFormErrors] = useState({});

  // Edit Vehicle Modal State
  const [editingVehicle, setEditingVehicle] = useState(null);

  // Update Distance Modal State
  const [distanceModalVehicle, setDistanceModalVehicle] = useState(null);
  const [newDistanceInput, setNewDistanceInput] = useState('');

  // Toast State
  const [toasts, setToasts] = useState([]);

  // Refs for click outside
  const typeRef = useRef(null);
  const sizeRef = useRef(null);
  const statusRef = useRef(null);

  const loadVehicles = async () => {
    try {
      setLoading(true);
      setError('');
      const [vehiclesRes, tripsRes] = await Promise.allSettled([
        apiRequest('GET', '/vehicles'),
        apiRequest('GET', '/trips')
      ]);

      const tripsData = (tripsRes.status === 'fulfilled' && tripsRes.value?.data) ? tripsRes.value.data : [];

      if (vehiclesRes.status === 'fulfilled' && Array.isArray(vehiclesRes.value?.data)) {
        const mapped = vehiclesRes.value.data.map(v => {
          // Dynamic calculation of completed trips assigned to this vehicle
          const completedCount = tripsData.filter(t => 
            (t.vehicle_id === v.id || t.vehicle_reg === v.registration_number || t.vehicle_reg === v.number_plate) && 
            t.status === 'Completed'
          ).length;

          let uiStatus = v.status || 'Available';
          if (v.status === 'In Shop' || v.status === 'In shop') uiStatus = 'Maintenance';
          else if (v.status === 'On Trip' || v.status === 'On trip') uiStatus = 'On trip';

          return {
            id: v.id,
            number_plate: v.number_plate || v.registration_number || v.name || 'UNKNOWN',
            type: v.type || 'Truck',
            size: v.size || v.sub_category || v.region || 'Standard',
            trips_completed: v.trips_completed ?? v.trips_count ?? completedCount,
            distance_covered: Number(v.distance_covered ?? v.odometer) || 0,
            last_updated: v.updated_at ? new Date(v.updated_at).toLocaleDateString() : 'Recently',
            status: uiStatus
          };
        });
        setVehicles(mapped);
      } else {
        setVehicles([]);
      }
    } catch (err) {
      console.warn('Failed to load vehicles from backend:', err.message);
      setVehicles([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadVehicles();

    // Listen to trip completed toast event from TripDispatcher to dynamically increase trip count
    const handleTripToast = (e) => {
      if (e && e.detail && String(e.detail).toLowerCase().includes('completed')) {
        loadVehicles();
      }
    };
    window.addEventListener('app-toast', handleTripToast);

    function handleClickOutside(e) {
      if (typeRef.current && !typeRef.current.contains(e.target)) setIsTypeOpen(false);
      if (sizeRef.current && !sizeRef.current.contains(e.target)) setIsSizeOpen(false);
      if (statusRef.current && !statusRef.current.contains(e.target)) setIsStatusOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);

    const params = new URLSearchParams(window.location.search);
    if (params.get('action') === 'add') {
      setIsModalOpen(true);
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    return () => {
      window.removeEventListener('app-toast', handleTripToast);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const addToast = (msg, isError = false) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, msg, isError }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 2500);
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    addToast(`Copied ${text} to clipboard`);
  };

  // Dynamic filter lists
  const dynamicTypes = [
    'All Types',
    ...Array.from(new Set([...DEFAULT_TYPES, ...customTypes, ...vehicles.map(v => v.type).filter(Boolean)]))
  ];

  const dynamicSizes = [
    'All Sizes',
    ...Array.from(new Set([...DEFAULT_SIZES, ...customSizes, ...vehicles.map(v => v.size).filter(Boolean)]))
  ];

  // Handle status selection directly from the table dropdown
  const handleStatusChange = async (vehicleId, newStatus) => {
    if (newStatus === 'On trip' || newStatus === 'On Trip') {
      addToast('Cannot manually set status to On Trip. Status is assigned automatically by trip dispatch.', true);
      return;
    }

    let backendStatus = 'Available';
    if (newStatus === 'Maintenance' || newStatus === 'In shop' || newStatus === 'In Shop') backendStatus = 'In Shop';

    setVehicles(prev => prev.map(v => {
      if (v.id === vehicleId) {
        return { ...v, status: newStatus };
      }
      return v;
    }));

    try {
      await apiRequest('PUT', `/vehicles/${vehicleId}`, { status: backendStatus });
      addToast(`Status updated to ${newStatus}`);
      await loadVehicles();
    } catch (err) {
      console.error('Failed to update status in DB:', err);
      addToast(err.message || 'Failed to update status', true);
    }
  };

  const handleAddVehicle = async (e) => {
    e.preventDefault();
    setFormErrors({});
    
    const rawPlate = newVehicle.numberPlate.trim().toUpperCase();
    if (!rawPlate) {
      setFormErrors(prev => ({ ...prev, numberPlate: "Number plate is required" }));
      addToast("Number plate is required", true);
      return;
    }
    
    // Indian number plate validation (e.g. MH-01-AB-1234)
    const plateErr = validateIndianNumberPlate(rawPlate);
    if (plateErr) {
      setFormErrors(prev => ({ ...prev, numberPlate: plateErr }));
      addToast(plateErr, true);
      return;
    }

    const finalPlate = formatIndianNumberPlate(rawPlate);

    // Uniqueness check
    if (vehicles.some(v => (v.number_plate || '').replace(/-/g, '').toUpperCase() === finalPlate.replace(/-/g, ''))) {
      const msg = "Number plate must be unique";
      setFormErrors(prev => ({ ...prev, numberPlate: msg }));
      addToast(msg, true);
      return;
    }

    const resolvedType = isCustomTypeSelected ? newVehicle.customType.trim() : newVehicle.type;
    if (!resolvedType) {
      addToast("Please specify a vehicle type", true);
      return;
    }

    const resolvedSize = (isCustomSizeSelected ? newVehicle.customSize.trim() : newVehicle.size) || 'Standard';
    if (!resolvedSize) {
      addToast("Please specify a vehicle size", true);
      return;
    }

    // Distance covered must always be a number only
    const rawDistance = String(newVehicle.distanceCovered).trim();
    if (rawDistance === '' || !/^\d+(\.\d+)?$/.test(rawDistance)) {
      const msg = "Distance covered must be a valid number";
      setFormErrors(prev => ({ ...prev, distanceCovered: msg }));
      addToast(msg, true);
      return;
    }
    const parsedDistance = parseFloat(rawDistance);
    if (isNaN(parsedDistance) || parsedDistance < 0) {
      const msg = "Distance covered must be 0 or a positive number";
      setFormErrors(prev => ({ ...prev, distanceCovered: msg }));
      addToast(msg, true);
      return;
    }

    // Payload configured strictly for backend validator
    const payload = {
      registration_number: finalPlate,
      number_plate: finalPlate,
      type: resolvedType,
      max_load_capacity: 1000,
      size: resolvedSize,
      status: 'Available'
    };
    if (parsedDistance > 0) {
      payload.odometer = parsedDistance;
    }

    // If custom type added, register it locally
    if (isCustomTypeSelected && !DEFAULT_TYPES.includes(resolvedType)) {
      setCustomTypes(prev => Array.from(new Set([...prev, resolvedType])));
    }

    // If custom size added, register it locally
    if (isCustomSizeSelected && !DEFAULT_SIZES.includes(resolvedSize)) {
      setCustomSizes(prev => Array.from(new Set([...prev, resolvedSize])));
    }

    try {
      await apiRequest('POST', '/vehicles', payload);
      setIsModalOpen(false);
      setNewVehicle({
        numberPlate: '',
        type: 'Truck',
        customType: '',
        size: 'Medium (14ft)',
        customSize: '',
        distanceCovered: ''
      });
      setIsCustomTypeSelected(false);
      setIsCustomSizeSelected(false);
      addToast("Vehicle added and saved to database!");
      await loadVehicles();
    } catch (err) {
      console.error("Backend error adding vehicle:", err);
      addToast(err.message || "Failed to add vehicle", true);
    }
  };

  const handleEditVehicle = async (updatedVehicle) => {
    try {
      let backendStatus = updatedVehicle.status;
      if (backendStatus === 'Maintenance') backendStatus = 'In Shop';
      
      const payload = {
        registration_number: updatedVehicle.numberPlate,
        type: updatedVehicle.type,
        size: updatedVehicle.size,
        odometer: updatedVehicle.distanceCovered,
        status: backendStatus
      };

      await apiRequest('PATCH', `/vehicles/${editingVehicle.id}`, payload);
      addToast(`Vehicle ${updatedVehicle.numberPlate} updated`);
      setEditingVehicle(null);
      await loadVehicles();
    } catch (err) {
      console.error('Failed to update vehicle:', err);
      addToast(err.message || 'Failed to update vehicle', true);
    }
  };

  // Update distance modal open
  const openDistanceModal = (v) => {
    setDistanceModalVehicle(v);
    setNewDistanceInput(v.distance_covered || '');
  };

  // Update distance save
  const handleSaveDistance = async (e) => {
    e.preventDefault();
    if (!distanceModalVehicle) return;

    const raw = String(newDistanceInput).trim();
    if (raw === '' || !/^\d+(\.\d+)?$/.test(raw)) {
      addToast("Distance covered must be a valid number", true);
      return;
    }

    const parsed = parseFloat(raw);
    if (isNaN(parsed) || parsed < 0) {
      addToast("Distance covered cannot be negative", true);
      return;
    }

    try {
      const payload = {
        odometer: parsed,
        distance_covered: parsed
      };
      await apiRequest('PUT', `/vehicles/${distanceModalVehicle.id}`, payload);
      addToast(`Updated distance for ${distanceModalVehicle.number_plate}`);
      setDistanceModalVehicle(null);
      await loadVehicles();
    } catch (err) {
      console.error("Failed to update distance:", err);
      addToast(err.message || "Failed to update distance", true);
    }
  };

  // Filter Logic
  const filteredVehicles = vehicles.filter(v => {
    const plate = v.number_plate || '';
    const matchesSearch = plate.toLowerCase().includes((globalSearch || '').toLowerCase()) || 
                          (v.type || '').toLowerCase().includes((globalSearch || '').toLowerCase());
    const matchesType = typeFilter === 'All Types' || v.type === typeFilter;
    const matchesSize = sizeFilter === 'All Sizes' || v.size === sizeFilter;
    const matchesStatus = statusFilter === 'All Statuses' || v.status === statusFilter;
    
    return matchesSearch && matchesType && matchesSize && matchesStatus;
  });

  const getLeftBorderColor = (status) => {
    switch (status) {
      case 'Available': return 'var(--status-green)';
      case 'On trip':
      case 'On Trip': return 'var(--status-blue)';
      case 'Maintenance':
      case 'In shop':
      case 'In Shop': return 'var(--status-orange)';
      default: return 'transparent';
    }
  };

  // Stat strip calculations
  const availableCount = vehicles.filter(v => v.status === 'Available').length;
  const onTripCount = vehicles.filter(v => v.status === 'On trip' || v.status === 'On Trip').length;
  const inShopCount = vehicles.filter(v => v.status === 'Maintenance' || v.status === 'In shop' || v.status === 'In Shop').length;
  const totalDistance = vehicles.reduce((sum, v) => sum + (Number(v.distance_covered) || 0), 0);

  const statItems = [
    { label: 'Total Fleet', value: vehicles.length },
    { label: 'Available', value: availableCount },
    { label: 'On Trip', value: onTripCount },
    { label: 'In Shop', value: inShopCount },
    { label: 'Total Distance', value: `${totalDistance.toLocaleString()} km` }
  ];

  return (
    <div className="fade-in">
      {/* Single-Row Toolbar */}
      <PageToolbar
        title="Fleet Registry"
        tooltip="Live vehicle inventory, duty status, and odometer telemetry. Vehicles on trip are locked automatically."
        filters={
          <>
            {/* Search */}
            <div style={{ position: 'relative', width: '210px' }}>
              <Search size={14} className="text-muted" style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)' }} />
              <input 
                type="text" 
                placeholder="Search number plate..." 
                className="input" 
                style={{ width: '100%', paddingLeft: '2.2rem', height: '34px', fontSize: '0.82rem' }}
                value={globalSearch || ''}
                onChange={(e) => setGlobalSearch && setGlobalSearch(e.target.value)}
              />
            </div>

            {/* Type Filter */}
            <div style={{ position: 'relative', width: '130px' }} ref={typeRef}>
              <div 
                className="input flex items-center justify-between" 
                style={{ cursor: 'pointer', height: '34px', fontSize: '0.82rem', padding: '0 0.65rem' }}
                onClick={() => setIsTypeOpen(!isTypeOpen)}
              >
                <span className="truncate">{typeFilter}</span>
                <ChevronDown size={14} className="text-muted" style={{ transform: isTypeOpen ? 'rotate(180deg)' : 'none', transition: '0.2s', flexShrink: 0 }} />
              </div>
              {isTypeOpen && (
                <div className="custom-dropdown-menu">
                  {dynamicTypes.map(t => (
                    <div key={t} className="custom-dropdown-item" onClick={() => { setTypeFilter(t); setIsTypeOpen(false); }}>
                      {t}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Size Filter */}
            <div style={{ position: 'relative', width: '140px' }} ref={sizeRef}>
              <div 
                className="input flex items-center justify-between" 
                style={{ cursor: 'pointer', height: '34px', fontSize: '0.82rem', padding: '0 0.65rem' }}
                onClick={() => setIsSizeOpen(!isSizeOpen)}
              >
                <span className="truncate">{sizeFilter}</span>
                <ChevronDown size={14} className="text-muted" style={{ transform: isSizeOpen ? 'rotate(180deg)' : 'none', transition: '0.2s', flexShrink: 0 }} />
              </div>
              {isSizeOpen && (
                <div className="custom-dropdown-menu">
                  {dynamicSizes.map(s => (
                    <div key={s} className="custom-dropdown-item" onClick={() => { setSizeFilter(s); setIsSizeOpen(false); }}>
                      {s}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Status Filter */}
            <div style={{ position: 'relative', width: '130px' }} ref={statusRef}>
              <div 
                className="input flex items-center justify-between" 
                style={{ cursor: 'pointer', height: '34px', fontSize: '0.82rem', padding: '0 0.65rem' }}
                onClick={() => setIsStatusOpen(!isStatusOpen)}
              >
                <span className="truncate">{statusFilter}</span>
                <ChevronDown size={14} className="text-muted" style={{ transform: isStatusOpen ? 'rotate(180deg)' : 'none', transition: '0.2s', flexShrink: 0 }} />
              </div>
              {isStatusOpen && (
                <div className="custom-dropdown-menu">
                  {VEHICLE_STATUSES.map(s => (
                    <div key={s} className="custom-dropdown-item" onClick={() => { setStatusFilter(s); setIsStatusOpen(false); }}>
                      {s}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        }
        actions={
          <>
            <button 
              type="button" 
              className="btn btn-outline" 
              style={{ height: '34px', fontSize: '0.82rem', padding: '0 0.85rem' }} 
              onClick={loadVehicles} 
              title="Refresh fleet"
            >
              <RefreshCw size={14} className={loading ? 'spin-icon' : ''} />
              <span>Refresh</span>
            </button>
            <button 
              type="button" 
              className="btn btn-plum-glow" 
              style={{ height: '34px', fontSize: '0.82rem' }} 
              onClick={() => setIsModalOpen(true)}
            >
              <Plus size={15} /> Add vehicle
            </button>
          </>
        }
      />

      {/* Slim 40px Stat Strip */}
      <StatStrip items={statItems} />

      {/* Dense Table Area */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-container" style={{ maxHeight: 'calc(100vh - 220px)', overflowY: 'auto' }}>
          <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 5, backgroundColor: '#fafafa' }}>
              <tr style={{ height: '38px' }}>
                <th style={{ padding: '0.5rem 1rem' }}>Number Plate</th>
                <th style={{ padding: '0.5rem 0.75rem' }}>Type</th>
                <th style={{ padding: '0.5rem 0.75rem' }}>Size</th>
                <th style={{ textAlign: 'center', padding: '0.5rem 0.75rem' }}>Trips Completed</th>
                <th style={{ textAlign: 'right', padding: '0.5rem 1rem' }}>Distance Covered</th>
                <th style={{ padding: '0.5rem 0.75rem' }}>Status</th>
                <th style={{ textAlign: 'right', padding: '0.5rem 1.5rem' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="7" className="text-center py-12 text-muted">Loading fleet registry...</td>
                </tr>
              ) : filteredVehicles.length === 0 ? (
                <tr>
                  <td colSpan="7" className="text-center py-12 text-muted">
                    {vehicles.length === 0 
                      ? 'No vehicles registered in your fleet yet. Click "+ Add vehicle" above to register your first vehicle.' 
                      : 'No vehicles match these filters.'}
                  </td>
                </tr>
              ) : (
                filteredVehicles.map((v, idx) => (
                  <tr 
                    key={v.id} 
                    className="table-row-animate hover:bg-[#fcfcfc]" 
                    style={{ 
                      animationDelay: `${idx * 70}ms`,
                      borderLeft: `4px solid ${getLeftBorderColor(v.status)}`,
                      opacity: v.status === 'Maintenance' ? 0.8 : 1
                    }}
                  >
                    {/* Number Plate — click icon or name to open profile */}
                    <td className="mono font-medium group relative">
                      <div className="flex items-center gap-2">
                        {/* Clickable vehicle icon/logo */}
                        <div
                          onClick={(e) => { e.stopPropagation(); navigate(`/vehicles/${v.id}`); }}
                          title="View vehicle details"
                          style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '8px',
                            background: v.status === 'Available' ? '#DFF5E6' : v.status === 'On trip' || v.status === 'On Trip' ? '#DBEAFE' : '#FFEDD5',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            flexShrink: 0,
                            transition: 'transform 0.15s, box-shadow 0.15s',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.1)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.12)'; }}
                          onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = 'none'; }}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={v.status === 'Available' ? '#1F9254' : v.status === 'On trip' || v.status === 'On Trip' ? '#2563eb' : '#ea580c'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="1" y="3" width="15" height="13" rx="1"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>
                          </svg>
                        </div>
                        <span
                          style={{ cursor: 'pointer', color: 'var(--plum-1, #3F1A32)', fontWeight: 600, transition: 'text-decoration 0.1s' }}
                          title="View vehicle profile"
                          onClick={(e) => { e.stopPropagation(); navigate(`/vehicles/${v.id}`); }}
                          onMouseEnter={e => { e.currentTarget.style.textDecoration = 'underline'; }}
                          onMouseLeave={e => { e.currentTarget.style.textDecoration = 'none'; }}
                        >
                          {v.number_plate}
                        </span>
                        <Copy
                          size={13}
                          className="text-muted"
                          style={{ opacity: 0.4, cursor: 'pointer', flexShrink: 0 }}
                          title="Copy plate"
                          onClick={(e) => { e.stopPropagation(); copyToClipboard(v.number_plate); }}
                          onMouseEnter={e => { e.currentTarget.style.opacity = '1'; }}
                          onMouseLeave={e => { e.currentTarget.style.opacity = '0.4'; }}
                        />
                      </div>
                    </td>

                    {/* Type */}
                    <td>{v.type}</td>

                    {/* Size */}
                    <td>
                      <span className="pill pill-gray" style={{ fontSize: '0.78rem' }}>
                        {v.size || 'Standard'}
                      </span>
                    </td>

                    {/* Trips Completed */}
                    <td className="mono font-medium" style={{ fontSize: '0.88rem', textAlign: 'center', padding: '0.4rem 0.75rem' }}>
                      {v.trips_completed ?? 0}
                    </td>

                    {/* Distance Covered */}
                    <td className="mono" style={{ textAlign: 'right', padding: '0.4rem 1rem' }}>
                      <div className="flex items-center justify-end gap-2">
                        <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                          {Number(v.distance_covered || 0).toLocaleString()} km
                        </span>
                        <button
                          type="button"
                          className="btn btn-outline"
                          style={{ padding: '2px 6px', fontSize: '0.68rem', height: '22px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '3px' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            openDistanceModal(v);
                          }}
                          title="Update odometer distance"
                        >
                          <Edit3 size={10} /> Update
                        </button>
                      </div>
                    </td>

                    {/* Status Dropdown inside the table */}
                    <td style={{ padding: '0.4rem 0.75rem' }}>
                      {(() => {
                        const isOnTrip = v.status === 'On trip' || v.status === 'On Trip';
                        return (
                          <select 
                            className="select" 
                            style={{ 
                              padding: '2px 8px', 
                              fontSize: '0.74rem', 
                              fontWeight: 600, 
                              borderRadius: '20px',
                              cursor: isOnTrip ? 'not-allowed' : 'pointer',
                              border: '1px solid var(--border-color, #e5e7eb)',
                              backgroundColor: 
                                v.status === 'Available' ? 'rgba(74, 222, 128, 0.15)' :
                                isOnTrip ? 'rgba(96, 165, 250, 0.15)' :
                                'rgba(251, 146, 60, 0.15)',
                              color: 
                                v.status === 'Available' ? '#16a34a' :
                                isOnTrip ? '#2563eb' :
                                '#ea580c'
                            }}
                            value={isOnTrip ? 'On trip' : (v.status === 'In shop' || v.status === 'In Shop' ? 'Maintenance' : v.status)}
                            disabled={isOnTrip}
                            onClick={(e) => e.stopPropagation()}
                            title={
                              isOnTrip 
                                ? 'Vehicle is currently On Trip — managed automatically by trip dispatch' 
                                : 'Change status'
                            }
                            onChange={(e) => handleStatusChange(v.id, e.target.value)}
                          >
                            {isOnTrip && <option value="On trip">On trip 🔒</option>}
                            <option value="Available">Available</option>
                            <option value="Maintenance">Maintenance</option>
                          </select>
                        );
                      })()}
                    </td>

                    {/* Dedicated Actions Column with Documents Button */}
                    <td style={{ textAlign: 'right', padding: '0.4rem 1.5rem' }}>
                      <button
                        type="button"
                        className="btn btn-outline"
                        style={{
                          padding: '3px 10px',
                          fontSize: '0.74rem',
                          fontWeight: 600,
                          borderRadius: '6px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          color: '#475569',
                          borderColor: '#e2e8f0',
                          cursor: 'pointer'
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/vehicles/${v.id}`);
                        }}
                        title="View Vehicle Documents & Profile"
                      >
                        <FileText size={12} className="text-muted" />
                        <span>Documents</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {/* Sticky Table Footer Summary */}
            {filteredVehicles.length > 0 && (
              <tfoot style={{ position: 'sticky', bottom: 0, backgroundColor: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
                <tr style={{ height: '36px' }}>
                  <td colSpan="4" style={{ padding: '0.4rem 1rem', fontSize: '0.78rem', color: '#64748b' }}>
                    Showing {filteredVehicles.length} of {vehicles.length} vehicles
                  </td>
                  <td style={{ textAlign: 'right', padding: '0.4rem 1rem', fontSize: '0.82rem', fontWeight: 600, color: 'var(--plum-1, #3F1A32)' }}>
                    Total: {filteredVehicles.reduce((s, v) => s + (Number(v.distance_covered) || 0), 0).toLocaleString()} km
                  </td>
                  <td colSpan="2"></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Side Drawer: Add Vehicle */}
      <SideDrawer
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Register New Vehicle"
        subtitle="Add a vehicle to your fleet registry with initial odometer reading."
        width="460px"
      >
        <form onSubmit={handleAddVehicle}>
          {/* Number Plate */}
          <div className="input-group">
            <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>Number Plate</label>
            <input 
              required 
              type="text" 
              className="input mono text-sm" 
              placeholder="e.g. MH-01-AB-1234" 
              value={newVehicle.numberPlate} 
              style={{ 
                textTransform: 'uppercase',
                borderColor: formErrors.numberPlate ? '#ef4444' : undefined 
              }}
              onChange={e => {
                const val = e.target.value.toUpperCase();
                setNewVehicle({...newVehicle, numberPlate: val});
                if (formErrors.numberPlate) {
                  const err = validateIndianNumberPlate(val);
                  if (!err) {
                    setFormErrors(prev => ({ ...prev, numberPlate: '' }));
                  }
                }
              }} 
            />
            <span className="text-muted text-xs mt-1">
              Standard Indian format: SS-RR-XX-NNNN (e.g. MH-01-AB-1234)
            </span>
            {formErrors.numberPlate && (
              <span style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '4px', display: 'block', fontWeight: 500 }}>
                ⚠️ {formErrors.numberPlate}
              </span>
            )}
          </div>

          {/* Type with Predefined + Custom Option */}
          <div className="input-group mt-4">
            <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>Vehicle Type</label>
            <select 
              className="select w-full" 
              value={isCustomTypeSelected ? '__custom__' : newVehicle.type} 
              onChange={e => {
                if (e.target.value === '__custom__') {
                  setIsCustomTypeSelected(true);
                } else {
                  setIsCustomTypeSelected(false);
                  setNewVehicle({...newVehicle, type: e.target.value});
                }
              }}
            >
              {DEFAULT_TYPES.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
              {customTypes.map(ct => (
                <option key={ct} value={ct}>{ct}</option>
              ))}
              <option value="__custom__">+ Write custom type...</option>
            </select>

            {isCustomTypeSelected && (
              <input 
                required
                type="text" 
                className="input mt-2" 
                placeholder="Type custom vehicle type (e.g. Trailer, Pickup)..." 
                value={newVehicle.customType} 
                onChange={e => setNewVehicle({...newVehicle, customType: e.target.value})} 
              />
            )}
          </div>

          {/* Size with Predefined + Custom Option */}
          <div className="input-group mt-4">
            <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>Vehicle Size / Capacity</label>
            <select 
              className="select w-full" 
              value={isCustomSizeSelected ? '__custom__' : newVehicle.size} 
              onChange={e => {
                if (e.target.value === '__custom__') {
                  setIsCustomSizeSelected(true);
                } else {
                  setIsCustomSizeSelected(false);
                  setNewVehicle({...newVehicle, size: e.target.value});
                }
              }}
            >
              {DEFAULT_SIZES.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
              {customSizes.map(cs => (
                <option key={cs} value={cs}>{cs}</option>
              ))}
              <option value="__custom__">+ Write custom size...</option>
            </select>

            {isCustomSizeSelected && (
              <input 
                required
                type="text" 
                className="input mt-2" 
                placeholder="Type custom vehicle size (e.g. 20 Ton, 16ft Container)..." 
                value={newVehicle.customSize} 
                onChange={e => setNewVehicle({...newVehicle, customSize: e.target.value})} 
              />
            )}
          </div>

          {/* Distance Covered */}
          <div className="input-group mt-4 mb-6">
            <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>Initial Distance Covered (km)</label>
            <input 
              required 
              type="text" 
              inputMode="decimal"
              className="input" 
              placeholder="e.g. 15000" 
              value={newVehicle.distanceCovered} 
              style={{ borderColor: formErrors.distanceCovered ? '#ef4444' : undefined }}
              onChange={e => {
                const val = e.target.value;
                if (val === '' || /^\d*\.?\d*$/.test(val)) {
                  setNewVehicle({...newVehicle, distanceCovered: val});
                  if (formErrors.distanceCovered) {
                    setFormErrors(prev => ({ ...prev, distanceCovered: '' }));
                  }
                }
              }} 
            />
            {formErrors.distanceCovered && (
              <span style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '4px', display: 'block', fontWeight: 500 }}>
                ⚠️ {formErrors.distanceCovered}
              </span>
            )}
          </div>

          <div className="flex justify-end gap-3 mt-6 pt-4" style={{ borderTop: '1px solid #f1f5f9' }}>
            <button type="button" className="btn btn-outline" onClick={() => setIsModalOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-plum-glow">Save Vehicle</button>
          </div>
        </form>
      </SideDrawer>

      {/* Side Drawer: Update Distance */}
      <SideDrawer
        isOpen={Boolean(distanceModalVehicle)}
        onClose={() => setDistanceModalVehicle(null)}
        title="Update Distance Covered"
        subtitle={distanceModalVehicle ? `Vehicle ${distanceModalVehicle.number_plate} (${distanceModalVehicle.type})` : ''}
        width="400px"
      >
        <form onSubmit={handleSaveDistance}>
          <div className="input-group mb-6">
            <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>Updated Odometer Reading (km)</label>
            <input 
              required 
              type="text" 
              inputMode="decimal"
              className="input mono" 
              placeholder="Enter updated odometer reading in km" 
              value={newDistanceInput} 
              onChange={e => {
                const val = e.target.value;
                if (val === '' || /^\d*\.?\d*$/.test(val)) {
                  setNewDistanceInput(val);
                }
              }} 
            />
          </div>

          <div className="flex justify-end gap-3 mt-6 pt-4" style={{ borderTop: '1px solid #f1f5f9' }}>
            <button type="button" className="btn btn-outline" onClick={() => setDistanceModalVehicle(null)}>Cancel</button>
            <button type="submit" className="btn btn-plum-glow">Update Reading</button>
          </div>
        </form>
      </SideDrawer>

      {/* Toasts */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className="toast" style={{ backgroundColor: t.isError ? 'var(--status-red)' : 'var(--text-primary)' }}>
            {t.msg}
          </div>
        ))}
      </div>
    </div>
  );
}
