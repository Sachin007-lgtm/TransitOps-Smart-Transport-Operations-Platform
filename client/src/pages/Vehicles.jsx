import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Search, ChevronDown, Copy, Edit3, Info } from 'lucide-react';
import { useGlobalSearch } from '../contexts/GlobalSearchContext';
import { apiRequest } from '../utils/api';
import { formatIndianNumberPlate, validateIndianNumberPlate } from '../utils/numberPlate';

const DEFAULT_TYPES = ['Truck', 'Van', 'Mini'];
const DEFAULT_SIZES = ['Small (8ft)', 'Medium (14ft)', 'Heavy (24ft)', 'Extra Heavy (32ft)'];
const VEHICLE_STATUSES = ['All Statuses', 'Available', 'On trip', 'Maintenance'];

const INITIAL_VEHICLES = [
  {
    id: '01950000-0003-7000-8000-000000000001',
    number_plate: 'MH-01-AB-1234',
    type: 'Van',
    size: 'Medium (14ft)',
    trips_completed: 0,
    distance_covered: 12500,
    last_updated: 'Today, 02:15 PM',
    status: 'Available'
  },
  {
    id: '01950000-0003-7000-8000-000000000002',
    number_plate: 'MH-02-CD-5678',
    type: 'Truck',
    size: 'Heavy (24ft)',
    trips_completed: 0,
    distance_covered: 42000,
    last_updated: 'Yesterday',
    status: 'Available'
  },
  {
    id: '01950000-0003-7000-8000-000000000004',
    number_plate: 'DL-04-EF-9012',
    type: 'Truck',
    size: 'Heavy (24ft)',
    trips_completed: 0,
    distance_covered: 31200,
    last_updated: 'Sep 14, 2026',
    status: 'Available'
  },
  {
    id: '01950000-0003-7000-8000-000000000005',
    number_plate: 'MH-12-GH-3456',
    type: 'Mini',
    size: 'Small (8ft)',
    trips_completed: 0,
    distance_covered: 8400,
    last_updated: 'Sep 20, 2026',
    status: 'Available'
  }
];

export default function Vehicles() {
  const { globalSearch, setGlobalSearch } = useGlobalSearch();
  const [vehicles, setVehicles] = useState(INITIAL_VEHICLES);
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

      if (vehiclesRes.status === 'fulfilled' && vehiclesRes.value?.data?.length > 0) {
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
      } else if (tripsData.length > 0) {
        // If vehicles are local initial state, count completed trips for local vehicles too
        setVehicles(prev => prev.map(v => {
          const completedCount = tripsData.filter(t => 
            (t.vehicle_id === v.id || t.vehicle_reg === v.number_plate) && 
            t.status === 'Completed'
          ).length;
          return { ...v, trips_completed: completedCount };
        }));
      }
    } catch (err) {
      console.warn('Backend unavailable, using local vehicles:', err.message);
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
      name: finalPlate,
      type: resolvedType,
      max_load_capacity: 1000,
      region: resolvedSize,
      size: resolvedSize,
      sub_category: resolvedSize,
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

  return (
    <div className="fade-in">
      {/* Header Row */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl heading">Vehicle registry</h1>
        {error && <span className="text-xs text-status-red">{error}</span>}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-4 mb-6" style={{ position: 'relative', zIndex: 10, flexWrap: 'wrap' }}>
        
        {/* Search */}
        <div style={{ position: 'relative', width: '240px' }}>
          <Search size={16} className="text-muted" style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)' }} />
          <input 
            type="text" 
            placeholder="Search number plate..." 
            className="input" 
            style={{ width: '100%', paddingLeft: '2.5rem' }}
            value={globalSearch || ''}
            onChange={(e) => setGlobalSearch && setGlobalSearch(e.target.value)}
          />
        </div>

        {/* Type Filter Dropdown */}
        <div style={{ position: 'relative', width: '160px' }} ref={typeRef}>
          <div 
            className="input flex items-center justify-between" 
            style={{ cursor: 'pointer' }}
            onClick={() => setIsTypeOpen(!isTypeOpen)}
          >
            <span>{typeFilter}</span>
            <ChevronDown size={16} className="text-muted" style={{ transform: isTypeOpen ? 'rotate(180deg)' : 'none', transition: '0.2s' }} />
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

        {/* Size Filter Dropdown */}
        <div style={{ position: 'relative', width: '170px' }} ref={sizeRef}>
          <div 
            className="input flex items-center justify-between" 
            style={{ cursor: 'pointer' }}
            onClick={() => setIsSizeOpen(!isSizeOpen)}
          >
            <span>{sizeFilter}</span>
            <ChevronDown size={16} className="text-muted" style={{ transform: isSizeOpen ? 'rotate(180deg)' : 'none', transition: '0.2s' }} />
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

        {/* Status Filter Dropdown */}
        <div style={{ position: 'relative', width: '170px' }} ref={statusRef}>
          <div 
            className="input flex items-center justify-between" 
            style={{ cursor: 'pointer' }}
            onClick={() => setIsStatusOpen(!isStatusOpen)}
          >
            <span>{statusFilter}</span>
            <ChevronDown size={16} className="text-muted" style={{ transform: isStatusOpen ? 'rotate(180deg)' : 'none', transition: '0.2s' }} />
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

        <div className="flex-1"></div>

        <button className="btn btn-plum-glow" onClick={() => setIsModalOpen(true)}>
          <Plus size={16} /> Add vehicle
        </button>
      </div>

      {/* Table Area */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-container">
          <table>
            <thead style={{ backgroundColor: '#fafafa' }}>
              <tr>
                <th>Number Plate</th>
                <th>Type</th>
                <th>Size</th>
                <th style={{ textAlign: 'center' }}>Trips Completed</th>
                <th>Distance Covered</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="6" className="text-center py-12 text-muted">Loading fleet registry...</td>
                </tr>
              ) : filteredVehicles.length === 0 ? (
                <tr>
                  <td colSpan="6" className="text-center py-12 text-muted">
                    No vehicles match these filters.
                  </td>
                </tr>
              ) : (
                filteredVehicles.map((v, idx) => (
                  <tr 
                    key={v.id} 
                    className="table-row-animate" 
                    style={{ 
                      animationDelay: `${idx * 70}ms`,
                      borderLeft: `4px solid ${getLeftBorderColor(v.status)}`,
                      opacity: v.status === 'Maintenance' ? 0.8 : 1
                    }}
                  >
                    {/* Number Plate */}
                    <td className="mono font-medium group relative" style={{ cursor: 'pointer' }}>
                      <div className="flex items-center gap-2" onClick={() => copyToClipboard(v.number_plate)} title="Click to copy">
                        {v.number_plate}
                        <Copy size={14} className="text-muted opacity-0 hover:opacity-100 transition-opacity" style={{ opacity: 0.5 }} />
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

                    {/* Trips Completed (Dynamic count, no manual button) */}
                    <td className="mono font-medium" style={{ fontSize: '0.95rem', textAlign: 'center' }}>
                      {v.trips_completed ?? 0}
                    </td>

                    {/* Distance Covered with Last Updated block */}
                    <td className="mono">
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <div className="flex items-center gap-2">
                          <span style={{ fontWeight: 600, fontSize: '0.92rem' }}>
                            {Number(v.distance_covered || 0).toLocaleString()} km
                          </span>
                          <button
                            type="button"
                            className="btn btn-outline"
                            style={{ padding: '2px 6px', fontSize: '0.7rem', height: 'auto', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}
                            onClick={() => openDistanceModal(v)}
                            title="Manually update distance"
                          >
                            <Edit3 size={11} /> Update
                          </button>
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#888' }}>
                          Last updated: <span style={{ fontWeight: 500 }}>{v.last_updated || 'Recently'}</span>
                        </div>
                      </div>
                    </td>

                    {/* Status Dropdown inside the table */}
                    <td>
                      {(() => {
                        const isOnTrip = v.status === 'On trip' || v.status === 'On Trip';
                        return (
                          <select 
                            className="select" 
                            style={{ 
                              padding: '4px 10px', 
                              fontSize: '0.78rem', 
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
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Rules */}
      <div className="mt-4 flex items-center gap-6">
        <div className="text-xs text-status-red font-medium flex items-center gap-1">
          <Info size={14} /> Number plate must be unique
        </div>
        <div className="text-xs text-muted font-medium flex items-center gap-1">
          <Info size={14} /> Vehicles marked On Trip 🔒 are dispatched and locked automatically
        </div>
        <div className="text-xs text-muted font-medium flex items-center gap-1">
          <Info size={14} /> Custom types and sizes automatically appear in sort filters
        </div>
      </div>

      {/* Add Vehicle Modal (NO status field here) */}
      {isModalOpen && createPortal(
        <div className="modal-overlay" onMouseDown={() => setIsModalOpen(false)}>
          <div className="modal-content" onMouseDown={e => e.stopPropagation()}>
            <h2 className="text-xl heading mb-6">Add Vehicle</h2>
            
            <form onSubmit={handleAddVehicle}>
              {/* Number Plate */}
              <div className="input-group">
                <label>Number Plate</label>
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
                  Format: SS-RR-XX-NNNN (e.g. MH-01-AB-1234)
                </span>
                {formErrors.numberPlate && (
                  <span style={{ color: '#ef4444', fontSize: '0.78rem', marginTop: '4px', display: 'block', fontWeight: 500 }}>
                    ⚠️ {formErrors.numberPlate}
                  </span>
                )}
              </div>

              {/* Type with Predefined + Custom Option */}
              <div className="input-group">
                <label>Type</label>
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

              {/* Size with Predefined + Custom Option (Same as Type) */}
              <div className="input-group">
                <label>Size</label>
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
              <div className="input-group mb-6">
                <label>Distance Covered (km)</label>
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
                  <span style={{ color: '#ef4444', fontSize: '0.78rem', marginTop: '4px', display: 'block', fontWeight: 500 }}>
                    ⚠️ {formErrors.distanceCovered}
                  </span>
                )}
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button type="button" className="btn btn-outline" onClick={() => setIsModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Vehicle</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Manual Distance Update Modal */}
      {distanceModalVehicle && createPortal(
        <div className="modal-overlay" onMouseDown={() => setDistanceModalVehicle(null)}>
          <div className="modal-content" onMouseDown={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
            <h2 className="text-lg heading mb-3">Update Distance Covered</h2>
            <p className="text-xs text-muted mb-4">
              Vehicle: <strong>{distanceModalVehicle.number_plate}</strong> ({distanceModalVehicle.type})
            </p>

            <form onSubmit={handleSaveDistance}>
              <div className="input-group mb-4">
                <label>Current Distance (km)</label>
                <input 
                  required 
                  type="text" 
                  inputMode="decimal"
                  className="input" 
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

              <div className="flex justify-end gap-3">
                <button type="button" className="btn btn-outline" onClick={() => setDistanceModalVehicle(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Update Reading</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

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
