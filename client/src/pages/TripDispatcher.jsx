import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, MapPin, Navigation, X, Check, Activity, FileText, 
  CheckCircle2, User, Truck, Info, Settings, FileWarning, 
  ChevronDown, AlertTriangle, RefreshCw, Trash2, ArrowRight, 
  Calendar, DollarSign, Building2, ShieldAlert
} from 'lucide-react';
import { useGlobalSearch } from '../contexts/GlobalSearchContext';
import { apiRequest } from '../utils/api';
import './TripDispatcher.css';

// Seeded Fleet Vehicles for org-1 (reflecting backend seed_vehicles.sql)
const SEEDED_VEHICLES = [
  { id: 1, name: 'Van-01', registration_number: 'REG-001', type: 'Van', max_load_capacity: 500, status: 'Available' },
  { id: 2, name: 'Van-02', registration_number: 'REG-002', type: 'Van', max_load_capacity: 500, status: 'In Shop' },
  { id: 3, name: 'Truck-01', registration_number: 'REG-003', type: 'Truck', max_load_capacity: 3000, status: 'Available' },
  { id: 4, name: 'Truck-02', registration_number: 'REG-004', type: 'Truck', max_load_capacity: 3500, status: 'On Trip' },
  { id: 5, name: 'Trailer-01', registration_number: 'REG-005', type: 'Trailer', max_load_capacity: 10000, status: 'Retired' }
];

const LIFECYCLE_STAGES = ['Draft', 'Planned', 'Assigned', 'Dispatched', 'Completed'];

export default function TripDispatcher() {
  const { globalSearch } = useGlobalSearch();

  // Trips & Drivers State from Backend API
  const [trips, setTrips] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [vehicles, setVehicles] = useState(SEEDED_VEHICLES);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Status and Conflict Alerts
  const [latestStatus, setLatestStatus] = useState('Draft');
  const [conflictError, setConflictError] = useState(null);
  const [generalError, setGeneralError] = useState(null);

  // Filter tabs for Live Board
  const [statusFilter, setStatusFilter] = useState('All');

  // Form State
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [plannedRoute, setPlannedRoute] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [driverId, setDriverId] = useState('');
  const [cargoWeight, setCargoWeight] = useState('');
  const [plannedDistance, setPlannedDistance] = useState('');
  const [revenue, setRevenue] = useState('');
  const [startTime, setStartTime] = useState('');
  const [expectedArrival, setExpectedArrival] = useState('');
  const [initialStatus, setInitialStatus] = useState('Draft'); // 'Draft' | 'Planned'
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Dropdown States for Source / Destination presets
  const [isSourceDropdownOpen, setIsSourceDropdownOpen] = useState(false);
  const sourceDropdownRef = useRef(null);
  const [isDestDropdownOpen, setIsDestDropdownOpen] = useState(false);
  const destDropdownRef = useRef(null);

  // Modal States
  const [assignModal, setAssignModal] = useState({ open: false, trip: null, vehicleId: '', driverId: '' });
  const [reassignModal, setReassignModal] = useState({ open: false, trip: null, vehicleId: '', driverId: '' });
  const [completeModal, setCompleteModal] = useState({ open: false, trip: null, actualDistance: '', actualArrival: '' });
  const [isModalSubmitting, setIsModalSubmitting] = useState(false);

  // Fetch Trips, Drivers & Vehicles from Backend
  const loadData = async (silent = false) => {
    if (!silent) setIsLoading(true);
    else setIsRefreshing(true);
    try {
      setGeneralError(null);
      const [tripsRes, driversRes, vehiclesRes] = await Promise.all([
        apiRequest('GET', '/trips'),
        apiRequest('GET', '/drivers').catch(() => ({ data: [] })),
        apiRequest('GET', '/vehicles').catch(() => ({ data: [] }))
      ]);

      const loadedTrips = tripsRes.data || [];
      setTrips(loadedTrips);

      if (driversRes && driversRes.data) {
        setDrivers(driversRes.data);
      }

      if (vehiclesRes && vehiclesRes.data && vehiclesRes.data.length > 0) {
        setVehicles(vehiclesRes.data);
      }

      if (loadedTrips.length > 0) {
        setLatestStatus(loadedTrips[0].status);
      }
    } catch (err) {
      console.error('Failed to load trips data:', err);
      setGeneralError(err.message || 'Failed to connect to backend.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
    // Set default departure to now + 30 min, and arrival to now + 3 hours
    const now = new Date();
    const depart = new Date(now.getTime() + 30 * 60000);
    const arrive = new Date(now.getTime() + 180 * 60000);
    setStartTime(depart.toISOString().slice(0, 16));
    setExpectedArrival(arrive.toISOString().slice(0, 16));
  }, []);

  // Click outside listener for custom dropdowns
  useEffect(() => {
    function handleClickOutside(event) {
      if (sourceDropdownRef.current && !sourceDropdownRef.current.contains(event.target)) {
        setIsSourceDropdownOpen(false);
      }
      if (destDropdownRef.current && !destDropdownRef.current.contains(event.target)) {
        setIsDestDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Helper Toast trigger
  const showToast = (message) => {
    window.dispatchEvent(new CustomEvent('app-toast', { detail: message }));
  };

  // Helper: Find vehicle & driver by ID
  const getVehicleById = (id) => {
    if (!id) return null;
    return vehicles.find(v => Number(v.id) === Number(id)) || SEEDED_VEHICLES.find(v => Number(v.id) === Number(id));
  };

  const getDriverById = (id) => {
    if (!id) return null;
    return drivers.find(d => Number(d.id) === Number(id));
  };

  const isLicenseExpired = (dateStr) => {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return d < today;
  };

  // Calculate actively assigned resources in frontend for quick feedback
  const activeTrips = trips.filter(t => ['Assigned', 'Dispatched'].includes(t.status));
  const activeVehicleIds = activeTrips.map(t => Number(t.vehicle_id)).filter(Boolean);
  const activeDriverIds = activeTrips.map(t => Number(t.driver_id)).filter(Boolean);

  // Form Capacity Validation
  const selectedVehicle = getVehicleById(vehicleId);
  const weightNum = parseFloat(cargoWeight);
  const distanceNum = parseFloat(plannedDistance);

  const isOverCapacity = selectedVehicle && !isNaN(weightNum) && weightNum > selectedVehicle.max_load_capacity;
  const isWithinCapacity = selectedVehicle && !isNaN(weightNum) && weightNum <= selectedVehicle.max_load_capacity;
  const isFormValid = origin.trim() && destination.trim() && !isOverCapacity;

  // Handle Form Cancel / Reset
  const handleCancelForm = () => {
    setOrigin('');
    setDestination('');
    setPlannedRoute('');
    setVehicleId('');
    setDriverId('');
    setCargoWeight('');
    setPlannedDistance('');
    setRevenue('');
    setConflictError(null);
    showToast('Trip form cleared.');
  };

  // Create Trip (Draft or Planned)
  const handleCreateTrip = async (e) => {
    e.preventDefault();
    if (!isFormValid || isSubmitting) return;

    setIsSubmitting(true);
    setConflictError(null);

    if (driverId) {
      const chosenDriver = getDriverById(driverId);
      if (chosenDriver && isLicenseExpired(chosenDriver.license_expiry_date)) {
        setIsSubmitting(false);
        showToast(`Cannot assign ${chosenDriver.name}: driver license is expired.`);
        return;
      }
      if (chosenDriver && chosenDriver.status !== 'Available') {
        setIsSubmitting(false);
        showToast(`Cannot assign ${chosenDriver.name}: driver is currently '${chosenDriver.status}'.`);
        return;
      }
    }

    const payload = {
      origin: origin.trim(),
      destination: destination.trim(),
      planned_route: plannedRoute.trim() || `${origin.trim()} -> ${destination.trim()}`,
      status: initialStatus, // strictly 'Draft' or 'Planned'
      start_time: startTime ? new Date(startTime).toISOString() : new Date().toISOString(),
      expected_arrival: expectedArrival ? new Date(expectedArrival).toISOString() : new Date(Date.now() + 7200000).toISOString(),
      vehicle_id: vehicleId ? Number(vehicleId) : null,
      driver_id: driverId ? Number(driverId) : null,
      cargo_weight: weightNum > 0 ? weightNum : null,
      planned_distance: distanceNum > 0 ? distanceNum : null,
      revenue: parseFloat(revenue) > 0 ? parseFloat(revenue) : null
    };

    try {
      const res = await apiRequest('POST', '/trips', payload);
      const createdTrip = res.data;
      setLatestStatus(createdTrip.status);
      showToast(`Trip #${createdTrip.id} created successfully (${createdTrip.status}).`);
      
      // Reset form
      setOrigin('');
      setDestination('');
      setPlannedRoute('');
      setVehicleId('');
      setDriverId('');
      setCargoWeight('');
      setPlannedDistance('');
      setRevenue('');

      await loadData(true);
    } catch (err) {
      console.error('Create trip failed:', err);
      if (err.message && (err.message.includes('already assigned') || err.message.includes('Conflict'))) {
        setConflictError({
          title: 'Resource Double-Booking Conflict (409)',
          message: err.message
        });
      } else {
        setGeneralError(err.message || 'Failed to create trip.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Advance to Planned
  const handleMoveToPlanned = async (tripId) => {
    try {
      setConflictError(null);
      await apiRequest('PATCH', `/trips/${tripId}/status`, { status: 'Planned' });
      setLatestStatus('Planned');
      showToast(`Trip #${tripId} status updated to 'Planned'.`);
      await loadData(true);
    } catch (err) {
      console.error('Update to Planned failed:', err);
      setGeneralError(err.message || 'Failed to plan trip.');
    }
  };

  // Open Assign Modal
  const openAssignModal = (trip) => {
    setAssignModal({
      open: true,
      trip,
      vehicleId: trip.vehicle_id ? String(trip.vehicle_id) : '',
      driverId: trip.driver_id ? String(trip.driver_id) : ''
    });
  };

  // Confirm Assign (Draft/Planned -> Assigned)
  const handleConfirmAssign = async () => {
    const { trip, vehicleId: vId, driverId: dId } = assignModal;
    if (!trip || !vId || !dId) {
      alert('Please select both a vehicle and a driver before assigning.');
      return;
    }

    const chosenDriver = getDriverById(dId);
    if (chosenDriver && isLicenseExpired(chosenDriver.license_expiry_date)) {
      alert(`Cannot assign ${chosenDriver.name}: driver license is expired.`);
      return;
    }
    if (chosenDriver && chosenDriver.status !== 'Available') {
      alert(`Cannot assign ${chosenDriver.name}: driver is currently '${chosenDriver.status}'.`);
      return;
    }

    setIsModalSubmitting(true);
    setConflictError(null);

    try {
      // Advance status with vehicle_id and driver_id
      await apiRequest('PATCH', `/trips/${trip.id}/status`, {
        status: 'Assigned',
        vehicle_id: Number(vId),
        driver_id: Number(dId)
      });

      setLatestStatus('Assigned');
      showToast(`Trip #${trip.id} assigned successfully.`);
      setAssignModal({ open: false, trip: null, vehicleId: '', driverId: '' });
      await loadData(true);
    } catch (err) {
      console.error('Assign failed:', err);
      setConflictError({
        title: 'Assignment Collision Detected',
        message: err.message
      });
      setAssignModal({ open: false, trip: null, vehicleId: '', driverId: '' });
    } finally {
      setIsModalSubmitting(false);
    }
  };

  // Dispatch Trip (Assigned -> Dispatched)
  const handleDispatchTrip = async (tripId) => {
    try {
      setConflictError(null);
      await apiRequest('PATCH', `/trips/${tripId}/status`, { status: 'Dispatched' });
      setLatestStatus('Dispatched');
      showToast(`Trip #${tripId} dispatched! Assigned assets transitioned to 'On Trip'.`);
      await loadData(true);
    } catch (err) {
      console.error('Dispatch failed:', err);
      if (err.message && (err.message.includes('already assigned') || err.message.includes('Conflict'))) {
        setConflictError({
          title: 'Dispatch Collision (409)',
          message: err.message
        });
      } else {
        setGeneralError(err.message || 'Failed to dispatch trip.');
      }
    }
  };

  // Open Reassign Modal (for Assigned or Dispatched trips)
  const openReassignModal = (trip) => {
    setReassignModal({
      open: true,
      trip,
      vehicleId: trip.vehicle_id ? String(trip.vehicle_id) : '',
      driverId: trip.driver_id ? String(trip.driver_id) : ''
    });
  };

  // Confirm Reassignment (PATCH /trips/:id)
  const handleConfirmReassign = async () => {
    const { trip, vehicleId: vId, driverId: dId } = reassignModal;
    if (!trip || !vId || !dId) {
      alert('Please select both a vehicle and a driver for reassignment.');
      return;
    }

    const chosenDriver = getDriverById(dId);
    if (chosenDriver && isLicenseExpired(chosenDriver.license_expiry_date)) {
      alert(`Cannot reassign to ${chosenDriver.name}: driver license is expired.`);
      return;
    }
    if (chosenDriver && chosenDriver.status !== 'Available') {
      alert(`Cannot reassign to ${chosenDriver.name}: driver is currently '${chosenDriver.status}'.`);
      return;
    }

    setIsModalSubmitting(true);
    setConflictError(null);

    try {
      await apiRequest('PATCH', `/trips/${trip.id}`, {
        vehicle_id: Number(vId),
        driver_id: Number(dId)
      });

      showToast(`Trip #${trip.id} reassigned successfully. Statuses updated.`);
      setReassignModal({ open: false, trip: null, vehicleId: '', driverId: '' });
      await loadData(true);
    } catch (err) {
      console.error('Reassign failed:', err);
      setConflictError({
        title: 'Reassignment Conflict (409)',
        message: err.message
      });
      setReassignModal({ open: false, trip: null, vehicleId: '', driverId: '' });
    } finally {
      setIsModalSubmitting(false);
    }
  };

  // Open Complete Modal
  const openCompleteModal = (trip) => {
    setCompleteModal({
      open: true,
      trip,
      actualDistance: trip.planned_distance ? String(trip.planned_distance) : '45',
      actualArrival: new Date().toISOString().slice(0, 16)
    });
  };

  // Confirm Complete (Dispatched -> Completed)
  const handleConfirmComplete = async () => {
    const { trip, actualDistance, actualArrival } = completeModal;
    if (!trip) return;

    setIsModalSubmitting(true);
    setConflictError(null);

    try {
      await apiRequest('PATCH', `/trips/${trip.id}/status`, {
        status: 'Completed',
        actual_distance: parseFloat(actualDistance) || Number(trip.planned_distance) || 0,
        actual_arrival: actualArrival ? new Date(actualArrival).toISOString() : new Date().toISOString()
      });

      setLatestStatus('Completed');
      showToast(`Trip #${trip.id} completed! Vehicle & driver released to 'Available'.`);
      setCompleteModal({ open: false, trip: null, actualDistance: '', actualArrival: '' });
      await loadData(true);
    } catch (err) {
      console.error('Complete trip failed:', err);
      setGeneralError(err.message || 'Failed to complete trip.');
      setCompleteModal({ open: false, trip: null, actualDistance: '', actualArrival: '' });
    } finally {
      setIsModalSubmitting(false);
    }
  };

  // Cancel Trip (any active state -> Cancelled)
  const handleCancelTrip = async (tripId) => {
    if (!window.confirm(`Are you sure you want to cancel Trip #${tripId}? Any engaged assets will be released.`)) return;

    try {
      setConflictError(null);
      await apiRequest('PATCH', `/trips/${tripId}/status`, { status: 'Cancelled' });
      setLatestStatus('Cancelled');
      showToast(`Trip #${tripId} cancelled. Engaged assets released to Available.`);
      await loadData(true);
    } catch (err) {
      console.error('Cancel trip failed:', err);
      setGeneralError(err.message || 'Failed to cancel trip.');
    }
  };

  // Delete Draft Trip (Draft -> Deleted)
  const handleDeleteDraft = async (tripId) => {
    if (!window.confirm(`Permanently delete Draft Trip #${tripId}?`)) return;

    try {
      await apiRequest('DELETE', `/trips/${tripId}`);
      showToast(`Trip #${tripId} deleted successfully.`);
      await loadData(true);
    } catch (err) {
      console.error('Delete trip failed:', err);
      setGeneralError(err.message || 'Failed to delete trip.');
    }
  };

  // Filtered trips for live board
  const filteredTrips = trips.filter(t => {
    if (statusFilter !== 'All' && t.status !== statusFilter) return false;
    if (!globalSearch) return true;
    const searchLower = globalSearch.toLowerCase();
    const tripIdStr = String(t.id).toLowerCase();
    const originStr = (t.origin || '').toLowerCase();
    const destStr = (t.destination || '').toLowerCase();
    const vehName = (t.vehicle?.name || t.vehicle?.registration_number || '').toLowerCase();
    const drvName = (t.driver?.name || '').toLowerCase();
    const orgName = (t.organization_name || '').toLowerCase();

    return (
      tripIdStr.includes(searchLower) ||
      originStr.includes(searchLower) ||
      destStr.includes(searchLower) ||
      vehName.includes(searchLower) ||
      drvName.includes(searchLower) ||
      orgName.includes(searchLower)
    );
  });

  // Calculate stepper fill stage
  const getStepperIndex = (status) => {
    if (status === 'Cancelled') return -1;
    const idx = LIFECYCLE_STAGES.indexOf(status);
    return idx !== -1 ? idx : 0;
  };

  const stepperIdx = getStepperIndex(latestStatus);

  return (
    <div className="trip-dispatcher fade-in">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-2xl heading">Trip Dispatcher</h1>
          <p className="text-sm text-muted mt-1">
            Manage end-to-end trip operations with anti-double-booking protection and asset lifecycle tracking.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            className="btn btn-outline text-xs flex items-center gap-2" 
            onClick={() => loadData(true)} 
            disabled={isRefreshing}
          >
            <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
            {isRefreshing ? 'Refreshing...' : 'Refresh Board'}
          </button>
        </div>
      </div>

      {/* Conflict Alert Banner (HTTP 409) */}
      {conflictError && (
        <div className="conflict-banner">
          <ShieldAlert size={20} className="conflict-icon" />
          <div className="conflict-content">
            <div className="conflict-title">
              <span>{conflictError.title || 'Assignment Conflict'}</span>
              <span className="conflict-badge">HTTP 409</span>
            </div>
            <div className="conflict-msg">
              {conflictError.message}
            </div>
          </div>
          <button 
            className="conflict-close" 
            onClick={() => setConflictError(null)}
            title="Dismiss conflict alert"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* General Error Banner */}
      {generalError && (
        <div className="validation-box error mb-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <AlertTriangle size={18} />
            <span className="text-sm font-semibold">{generalError}</span>
          </div>
          <button 
            onClick={() => setGeneralError(null)} 
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)' }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      <div className="layout-grid">
        {/* LEFT COLUMN - Trip Creation & Stepper */}
        <div className="card left-panel">
          
          {/* Trip Lifecycle Stepper */}
          <div className="stepper-container mb-8">
            <div className="stepper-line-bg"></div>
            <div 
              className={`stepper-line-fill ${latestStatus === 'Cancelled' ? 'cancelled' : `step-${stepperIdx}`}`}
            ></div>
            
            <div className="step-nodes">
              {LIFECYCLE_STAGES.map((stage, idx) => {
                let dotClass = 'step-dot';
                let labelColor = 'var(--sub)';
                
                if (latestStatus === 'Cancelled') {
                  dotClass += ' default';
                } else if (idx < stepperIdx) {
                  dotClass += ' completed';
                  labelColor = 'var(--green)';
                } else if (idx === stepperIdx) {
                  dotClass += ' active-blue pulsing';
                  labelColor = 'var(--blue)';
                } else {
                  dotClass += ' pending';
                }

                return (
                  <div key={stage} className="step-item">
                    <div className={dotClass}></div>
                    <span className="step-label" style={{ color: labelColor }}>{stage}</span>
                  </div>
                );
              })}
            </div>
            {latestStatus === 'Cancelled' && (
              <div className="text-center mt-3">
                <span className="pill pill-red text-xs">Latest Trip Cancelled (Assets Freed)</span>
              </div>
            )}
          </div>

          <div className="section-label mb-4">
            <span>CREATE DISPATCH ORDER</span>
            <div className="section-divider"></div>
          </div>

          <form className="trip-form" onSubmit={handleCreateTrip}>
            {/* Origin & Destination */}
            <div className="form-row">
              <div className="input-group" ref={sourceDropdownRef}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--sub)' }}>ORIGIN *</label>
                <div className="custom-source-dropdown-wrapper">
                  <div 
                    className={`custom-source-input ${isSourceDropdownOpen ? 'active' : ''}`}
                    onClick={() => setIsSourceDropdownOpen(!isSourceDropdownOpen)}
                  >
                    <input 
                      type="text" 
                      value={origin} 
                      onChange={e => setOrigin(e.target.value)} 
                      placeholder="e.g. Gandhinagar Depot" 
                      style={{ border: 'none', outline: 'none', background: 'transparent', width: '100%', pointerEvents: isSourceDropdownOpen ? 'auto' : 'none' }}
                      onClick={(e) => { if (isSourceDropdownOpen) e.stopPropagation(); }}
                    />
                    <ChevronDown size={16} className="text-muted" />
                  </div>
                  {isSourceDropdownOpen && (
                    <div className="custom-source-menu">
                      {['Gandhinagar Depot', 'Vatva Industrial Area', 'Mansa Yard', 'Ahmedabad Hub'].map(opt => (
                        <div 
                          key={opt} 
                          className="custom-source-option"
                          onClick={() => { setOrigin(opt); setIsSourceDropdownOpen(false); }}
                        >
                          {opt}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="input-group" ref={destDropdownRef}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--sub)' }}>DESTINATION *</label>
                <div className="custom-source-dropdown-wrapper">
                  <div 
                    className={`custom-source-input ${isDestDropdownOpen ? 'active' : ''}`}
                    onClick={() => setIsDestDropdownOpen(!isDestDropdownOpen)}
                  >
                    <input 
                      type="text" 
                      value={destination} 
                      onChange={e => setDestination(e.target.value)} 
                      placeholder="e.g. Ahmedabad Hub" 
                      style={{ border: 'none', outline: 'none', background: 'transparent', width: '100%', pointerEvents: isDestDropdownOpen ? 'auto' : 'none' }}
                      onClick={(e) => { if (isDestDropdownOpen) e.stopPropagation(); }}
                    />
                    <ChevronDown size={16} className="text-muted" />
                  </div>
                  {isDestDropdownOpen && (
                    <div className="custom-source-menu">
                      {['Ahmedabad Hub', 'Sanand Warehouse', 'Kalol Depot', 'Vadodara Terminal'].map(opt => (
                        <div 
                          key={opt} 
                          className="custom-source-option"
                          onClick={() => { setDestination(opt); setIsDestDropdownOpen(false); }}
                        >
                          {opt}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Vehicle & Driver Pre-selection (Optional in Draft/Planned) */}
            <div className="form-row">
              <div className="input-group">
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--sub)' }}>
                  VEHICLE (OPTIONAL FOR DRAFT)
                </label>
                <select 
                  className="select" 
                  value={vehicleId} 
                  onChange={e => setVehicleId(e.target.value)}
                >
                  <option value="">Unassigned</option>
                  {vehicles.map(v => {
                    const isActive = activeVehicleIds.includes(v.id);
                    return (
                      <option key={v.id} value={v.id}>
                        {v.name || v.registration_number} ({v.registration_number || v.number_plate}) — {v.max_load_capacity}kg [{v.status}{isActive ? ' / Assigned' : ''}]
                      </option>
                    );
                  })}
                </select>
                {selectedVehicle && (
                  <div className="text-xs text-muted mt-1 font-mono">
                    Rated capacity: {selectedVehicle.max_load_capacity} kg ({selectedVehicle.type})
                  </div>
                )}
              </div>

              <div className="input-group">
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--sub)' }}>
                  DRIVER (OPTIONAL FOR DRAFT)
                </label>
                <select 
                  className="select" 
                  value={driverId} 
                  onChange={e => setDriverId(e.target.value)}
                >
                  <option value="">Unassigned</option>
                  {drivers.map(d => {
                    const isActive = activeDriverIds.includes(d.id);
                    const expired = isLicenseExpired(d.license_expiry_date);
                    const isUnavailable = d.status !== 'Available' || expired;
                    return (
                      <option key={d.id} value={d.id} disabled={isUnavailable}>
                        {d.name} ({d.license_number}) [{d.status}{expired ? ' / EXPIRED' : ''}{isActive ? ' / Assigned' : ''}]
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>

            {/* Cargo Weight & Planned Distance */}
            <div className="form-row">
              <div className="input-group">
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--sub)' }}>CARGO WEIGHT (KG)</label>
                <input 
                  type="number" 
                  className="input" 
                  value={cargoWeight} 
                  onChange={e => setCargoWeight(e.target.value)} 
                  placeholder="e.g. 450" 
                />
              </div>
              <div className="input-group">
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--sub)' }}>PLANNED DISTANCE (KM)</label>
                <input 
                  type="number" 
                  className="input" 
                  value={plannedDistance} 
                  onChange={e => setPlannedDistance(e.target.value)} 
                  placeholder="e.g. 42" 
                />
              </div>
            </div>

            {/* Revenue & Initial Status */}
            <div className="form-row">
              <div className="input-group">
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--sub)' }}>ESTIMATED REVENUE ($)</label>
                <input 
                  type="number" 
                  className="input" 
                  value={revenue} 
                  onChange={e => setRevenue(e.target.value)} 
                  placeholder="e.g. 1200" 
                />
              </div>
              <div className="input-group">
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--sub)' }}>INITIAL STATE</label>
                <div className="flex gap-4 items-center mt-2">
                  <label className="flex items-center gap-2 cursor-pointer text-sm">
                    <input 
                      type="radio" 
                      name="initialStatus" 
                      value="Draft" 
                      checked={initialStatus === 'Draft'} 
                      onChange={() => setInitialStatus('Draft')} 
                    />
                    <span>Draft (Editable)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-sm">
                    <input 
                      type="radio" 
                      name="initialStatus" 
                      value="Planned" 
                      checked={initialStatus === 'Planned'} 
                      onChange={() => setInitialStatus('Planned')} 
                    />
                    <span>Planned (Queued)</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Live Capacity Validation Feedback */}
            <div className="validation-container mt-1">
              {isOverCapacity && (
                <div className="validation-box error shake">
                  <div className="val-header">
                    <FileWarning size={18} />
                    <span className="font-semibold">
                      Capacity exceeded by {weightNum - selectedVehicle.max_load_capacity} kg — dispatch blocked.
                    </span>
                  </div>
                  <div className="val-details mono">
                    <div>Vehicle Capacity: {selectedVehicle.max_load_capacity} kg</div>
                    <div>Cargo Weight: {weightNum} kg</div>
                  </div>
                </div>
              )}
              {isWithinCapacity && isFormValid && (
                <div className="validation-box success fade-in">
                  <div className="val-header">
                    <CheckCircle2 size={18} />
                    <span className="font-semibold">
                      Capacity check passed — {selectedVehicle.max_load_capacity - weightNum} kg headroom remaining.
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Form Actions */}
            <div className="form-actions mt-4">
              <button 
                type="button" 
                className="btn btn-outline" 
                onClick={handleCancelForm}
                style={{ color: 'var(--red)', borderColor: 'var(--line)' }}
              >
                <X size={16} /> Clear
              </button>
              <button 
                type="submit" 
                className={`btn btn-primary flex-1 ${!isFormValid || isSubmitting ? 'disabled' : ''}`}
                disabled={!isFormValid || isSubmitting}
              >
                {isSubmitting ? (
                  <span className="spinner-border w-4 h-4 border-2 border-white rounded-full animate-spin"></span>
                ) : (
                  <><Navigation size={16} /> Save & Create Trip ({initialStatus})</>
                )}
              </button>
            </div>
          </form>

        </div>

        {/* RIGHT COLUMN - Live Board */}
        <div className="right-panel">
          
          <div className="flex justify-between items-center mb-3">
            <h2 className="heading text-lg">Live Operations Board</h2>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted">Total: {filteredTrips.length}</span>
              <div className="pill pill-blue" style={{ textTransform: 'lowercase', padding: '0.2rem 0.5rem', opacity: 0.85 }}>
                <span className="pulsing-dot sm"></span> tenant live
              </div>
            </div>
          </div>

          {/* Filter Tabs */}
          <div className="filter-tabs">
            {['All', 'Draft', 'Planned', 'Assigned', 'Dispatched', 'Completed', 'Cancelled'].map(filter => (
              <button
                key={filter}
                className={`filter-tab ${statusFilter === filter ? 'active' : ''}`}
                onClick={() => setStatusFilter(filter)}
              >
                {filter} {filter === 'All' ? `(${trips.length})` : `(${trips.filter(t => t.status === filter).length})`}
              </button>
            ))}
          </div>

          {/* Trip Cards List */}
          {isLoading ? (
            <div className="card p-8 text-center text-muted">
              <RefreshCw size={24} className="animate-spin mx-auto mb-2" />
              Loading tenant trips...
            </div>
          ) : filteredTrips.length === 0 ? (
            <div className="card p-8 text-center text-muted">
              <Info size={24} className="mx-auto mb-2 text-muted" />
              No trips found matching the selected filter.
            </div>
          ) : (
            <div className="cards-list">
              {filteredTrips.map(trip => {
                const assignedVehicle = trip.vehicle || getVehicleById(trip.vehicle_id);
                const assignedDriver = trip.driver || getDriverById(trip.driver_id);

                return (
                  <div key={trip.id} className="card trip-card slide-down">
                    
                    {/* Top Row: Trip ID, Tenant Name, Assets */}
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-2">
                        <span className="mono font-bold text-base">Trip #{trip.id}</span>
                        {trip.organization_name && (
                          <span className="org-pill flex items-center gap-1">
                            <Building2 size={11} /> {trip.organization_name}
                          </span>
                        )}
                      </div>

                      {/* Status Pill */}
                      <div>
                        {trip.status === 'Draft' && <span className="pill pill-gray">Draft</span>}
                        {trip.status === 'Planned' && <span className="pill pill-amber">Planned</span>}
                        {trip.status === 'Assigned' && <span className="pill pill-purple">Assigned</span>}
                        {trip.status === 'Dispatched' && (
                          <span className="pill pill-blue">
                            <span className="live-dot sm bg-blue-500"></span> Dispatched
                          </span>
                        )}
                        {trip.status === 'Completed' && (
                          <span className="pill pill-green">
                            <Check size={12} className="mr-1" /> Completed
                          </span>
                        )}
                        {trip.status === 'Cancelled' && <span className="pill pill-red">Cancelled</span>}
                      </div>
                    </div>

                    {/* Route Line */}
                    <div className="route-line-small mb-3">
                      <MapPin size={14} className="text-muted" style={{ flexShrink: 0 }} />
                      <span className="text-sm font-medium truncate">{trip.origin}</span>
                      <Navigation size={12} className="text-muted mx-1" style={{ transform: 'rotate(90deg)' }} />
                      <span className="text-sm font-medium truncate">{trip.destination}</span>
                    </div>

                    {/* Asset & Metric Chips */}
                    <div className="flex flex-wrap gap-2 mb-3">
                      <div className="asset-chip">
                        <Truck size={13} className="text-muted" />
                        <span>
                          {assignedVehicle 
                            ? `${assignedVehicle.name || assignedVehicle.registration_number} (${assignedVehicle.type || 'Fleet'})`
                            : 'No Vehicle'}
                        </span>
                      </div>
                      <div className="asset-chip">
                        <User size={13} className="text-muted" />
                        <span>{assignedDriver ? assignedDriver.name : 'No Driver'}</span>
                      </div>
                      {trip.planned_distance && (
                        <div className="asset-chip">
                          <span className="text-muted">Dist:</span>
                          <span className="mono">{trip.actual_distance || trip.planned_distance} km</span>
                        </div>
                      )}
                      {trip.cargo_weight && (
                        <div className="asset-chip">
                          <span className="text-muted">Cargo:</span>
                          <span className="mono">{trip.cargo_weight} kg</span>
                        </div>
                      )}
                    </div>

                    {/* Card Actions Footer */}
                    <div className="flex justify-between items-center mt-auto pt-2 border-t border-[var(--line)]">
                      <div className="text-xs text-muted mono">
                        {trip.status === 'Completed' && trip.actual_arrival 
                          ? `Arrived: ${new Date(trip.actual_arrival).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                          : trip.expected_arrival
                            ? `ETA: ${new Date(trip.expected_arrival).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                            : ''}
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {/* Actions for Draft */}
                        {trip.status === 'Draft' && (
                          <>
                            <button 
                              className="btn btn-outline text-xs py-1 px-2" 
                              onClick={() => handleMoveToPlanned(trip.id)}
                              title="Advance to Planned queue"
                            >
                              Plan
                            </button>
                            <button 
                              className="btn btn-primary text-xs py-1 px-2" 
                              onClick={() => openAssignModal(trip)}
                            >
                              Assign
                            </button>
                            <button 
                              className="btn btn-outline text-xs py-1 px-2 text-red-500" 
                              onClick={() => handleDeleteDraft(trip.id)}
                              title="Delete Draft"
                            >
                              <Trash2 size={13} />
                            </button>
                          </>
                        )}

                        {/* Actions for Planned */}
                        {trip.status === 'Planned' && (
                          <>
                            <button 
                              className="btn btn-primary text-xs py-1 px-2" 
                              onClick={() => openAssignModal(trip)}
                            >
                              Assign Assets
                            </button>
                            <button 
                              className="btn btn-outline text-xs py-1 px-2" 
                              onClick={() => handleCancelTrip(trip.id)}
                            >
                              Cancel
                            </button>
                          </>
                        )}

                        {/* Actions for Assigned */}
                        {trip.status === 'Assigned' && (
                          <>
                            <button 
                              className="btn btn-outline text-xs py-1 px-2" 
                              onClick={() => openReassignModal(trip)}
                            >
                              Reassign
                            </button>
                            <button 
                              className="btn btn-primary text-xs py-1 px-2" 
                              onClick={() => handleDispatchTrip(trip.id)}
                            >
                              <Navigation size={13} className="mr-1" /> Dispatch
                            </button>
                            <button 
                              className="btn btn-outline text-xs py-1 px-2" 
                              onClick={() => handleCancelTrip(trip.id)}
                            >
                              Cancel
                            </button>
                          </>
                        )}

                        {/* Actions for Dispatched */}
                        {trip.status === 'Dispatched' && (
                          <>
                            <button 
                              className="btn btn-outline text-xs py-1 px-2" 
                              onClick={() => openReassignModal(trip)}
                            >
                              Reassign
                            </button>
                            <button 
                              className="btn btn-primary text-xs py-1 px-2" 
                              onClick={() => openCompleteModal(trip)}
                            >
                              <Check size={13} className="mr-1" /> Complete
                            </button>
                            <button 
                              className="btn btn-outline text-xs py-1 px-2" 
                              onClick={() => handleCancelTrip(trip.id)}
                            >
                              Cancel
                            </button>
                          </>
                        )}

                        {/* Actions for Completed / Cancelled */}
                        {['Completed', 'Cancelled'].includes(trip.status) && (
                          <span className="text-xs text-muted">Archived</span>
                        )}
                      </div>
                    </div>

                  </div>
                );
              })}
            </div>
          )}

          {/* Operational Workflow Summary */}
          <div className="card workflow-panel mt-4">
            <div className="workflow-steps">
              <div className="workflow-track"></div>
              
              <div className="workflow-step">
                <div className="workflow-badge passed">
                  <Check size={14} />
                </div>
                <div className="workflow-text">Anti Double-Booking</div>
              </div>
              
              <div className="workflow-step">
                <div className="workflow-badge passed">
                  <Check size={14} />
                </div>
                <div className="workflow-text">Tenant Isolation</div>
              </div>
              
              <div className="workflow-step">
                <div className="workflow-badge passed">
                  <Check size={14} />
                </div>
                <div className="workflow-text">Atomic Dispatch</div>
              </div>
              
              <div className="workflow-step">
                <div className="workflow-badge passed">
                  <Check size={14} />
                </div>
                <div className="workflow-text">Auto Release</div>
              </div>
            </div>
            
            <div className="text-xs text-muted text-center mt-4">
              All state transitions execute with transactional row-level pessimistic locking on PostgreSQL.
            </div>
          </div>

        </div>
      </div>

      {/* ASSIGN MODAL */}
      {assignModal.open && (
        <div className="modal-overlay">
          <div className="modal-dialog">
            <div className="modal-header">
              <div className="font-bold text-base">Assign Resources to Trip #{assignModal.trip?.id}</div>
              <button 
                className="modal-close-btn" 
                onClick={() => setAssignModal({ open: false, trip: null, vehicleId: '', driverId: '' })}
              >
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <p className="text-xs text-muted">
                Assigning resources advances this trip to <strong>Assigned</strong>. Both vehicle and driver will be locked for this trip.
              </p>

              <div className="input-group">
                <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>SELECT VEHICLE *</label>
                <select 
                  className="select" 
                  value={assignModal.vehicleId} 
                  onChange={e => setAssignModal({ ...assignModal, vehicleId: e.target.value })}
                >
                  <option value="">Choose vehicle...</option>
                  {vehicles.map(v => {
                    const isBusy = activeVehicleIds.includes(v.id);
                    return (
                      <option key={v.id} value={v.id}>
                        {v.name || v.registration_number} ({v.registration_number || v.number_plate}) — {v.max_load_capacity}kg [{v.status}{isBusy ? ' - ACTIVE' : ''}]
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="input-group">
                <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>SELECT DRIVER *</label>
                <select 
                  className="select" 
                  value={assignModal.driverId} 
                  onChange={e => setAssignModal({ ...assignModal, driverId: e.target.value })}
                >
                  <option value="">Choose driver...</option>
                  {drivers.map(d => {
                    const isBusy = activeDriverIds.includes(d.id);
                    const expired = isLicenseExpired(d.license_expiry_date);
                    const isUnavailable = d.status !== 'Available' || expired || isBusy;
                    return (
                      <option key={d.id} value={d.id} disabled={isUnavailable}>
                        {d.name} ({d.license_number}) [{d.status}{expired ? ' / EXPIRED' : ''}{isBusy ? ' - ACTIVE' : ''}]
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button 
                type="button" 
                className="btn btn-outline" 
                onClick={() => setAssignModal({ open: false, trip: null, vehicleId: '', driverId: '' })}
              >
                Cancel
              </button>
              <button 
                type="button" 
                className="btn btn-primary" 
                onClick={handleConfirmAssign}
                disabled={isModalSubmitting || !assignModal.vehicleId || !assignModal.driverId}
              >
                {isModalSubmitting ? 'Validating...' : 'Confirm Assignment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REASSIGN MODAL */}
      {reassignModal.open && (
        <div className="modal-overlay">
          <div className="modal-dialog">
            <div className="modal-header">
              <div className="font-bold text-base">Reassign Trip #{reassignModal.trip?.id}</div>
              <button 
                className="modal-close-btn" 
                onClick={() => setReassignModal({ open: false, trip: null, vehicleId: '', driverId: '' })}
              >
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <p className="text-xs text-muted">
                Reassigning resources will release the previous vehicle & driver (if not on another trip) and engage the newly selected assets.
              </p>

              <div className="input-group">
                <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>NEW VEHICLE *</label>
                <select 
                  className="select" 
                  value={reassignModal.vehicleId} 
                  onChange={e => setReassignModal({ ...reassignModal, vehicleId: e.target.value })}
                >
                  <option value="">Choose vehicle...</option>
                  {vehicles.map(v => (
                    <option key={v.id} value={v.id}>
                      {v.name || v.registration_number} ({v.registration_number || v.number_plate}) — {v.max_load_capacity}kg [{v.status}]
                    </option>
                  ))}
                </select>
              </div>

              <div className="input-group">
                <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>NEW DRIVER *</label>
                <select 
                  className="select" 
                  value={reassignModal.driverId} 
                  onChange={e => setReassignModal({ ...reassignModal, driverId: e.target.value })}
                >
                  <option value="">Choose driver...</option>
                  {drivers.map(d => {
                    const isBusy = activeDriverIds.includes(d.id);
                    const expired = isLicenseExpired(d.license_expiry_date);
                    const isUnavailable = d.status !== 'Available' || expired || isBusy;
                    return (
                      <option key={d.id} value={d.id} disabled={isUnavailable}>
                        {d.name} ({d.license_number}) [{d.status}{expired ? ' / EXPIRED' : ''}{isBusy ? ' - ACTIVE' : ''}]
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button 
                type="button" 
                className="btn btn-outline" 
                onClick={() => setReassignModal({ open: false, trip: null, vehicleId: '', driverId: '' })}
              >
                Cancel
              </button>
              <button 
                type="button" 
                className="btn btn-primary" 
                onClick={handleConfirmReassign}
                disabled={isModalSubmitting || !reassignModal.vehicleId || !reassignModal.driverId}
              >
                {isModalSubmitting ? 'Updating...' : 'Update Assignment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* COMPLETE TRIP MODAL */}
      {completeModal.open && (
        <div className="modal-overlay">
          <div className="modal-dialog">
            <div className="modal-header">
              <div className="font-bold text-base">Finalize Trip #{completeModal.trip?.id}</div>
              <button 
                className="modal-close-btn" 
                onClick={() => setCompleteModal({ open: false, trip: null, actualDistance: '', actualArrival: '' })}
              >
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <p className="text-xs text-muted">
                Enter completion metrics. Upon completion, the assigned vehicle and driver will be atomically released to <strong>Available</strong>.
              </p>

              <div className="input-group">
                <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>ACTUAL DISTANCE (KM) *</label>
                <input 
                  type="number" 
                  className="input" 
                  value={completeModal.actualDistance} 
                  onChange={e => setCompleteModal({ ...completeModal, actualDistance: e.target.value })}
                  placeholder="e.g. 46"
                />
              </div>

              <div className="input-group">
                <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>ACTUAL ARRIVAL TIME *</label>
                <input 
                  type="datetime-local" 
                  className="input" 
                  value={completeModal.actualArrival} 
                  onChange={e => setCompleteModal({ ...completeModal, actualArrival: e.target.value })}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button 
                type="button" 
                className="btn btn-outline" 
                onClick={() => setCompleteModal({ open: false, trip: null, actualDistance: '', actualArrival: '' })}
              >
                Cancel
              </button>
              <button 
                type="button" 
                className="btn btn-primary" 
                onClick={handleConfirmComplete}
                disabled={isModalSubmitting || !completeModal.actualDistance}
              >
                {isModalSubmitting ? 'Finalizing...' : 'Complete & Free Assets'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
