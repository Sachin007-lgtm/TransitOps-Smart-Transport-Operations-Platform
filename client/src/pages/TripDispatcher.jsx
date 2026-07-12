import React, { useState, useEffect, useRef } from 'react';
import { Search, MapPin, Navigation, X, Check, Activity, FileText, CheckCircle2, User, Truck, Info, Settings, FileWarning, ChevronDown } from 'lucide-react';
import { useGlobalSearch } from '../contexts/GlobalSearchContext';
import './TripDispatcher.css';

// Seed Data
const initialVehicles = [
  { id: 'VAN-05', type: 'Van', capacity: 500, label: 'VAN-05 — 500 kg capacity' },
  { id: 'TRK-04', type: 'Truck', capacity: 2000, label: 'TRK-04 — 2000 kg capacity' },
  { id: 'MINI-08', type: 'Mini', capacity: 300, label: 'MINI-08 — 300 kg capacity' },
  { id: 'TRK-12', type: 'Truck', capacity: 2000, label: 'TRK-12 — 2000 kg capacity' }
];

const initialDrivers = [
  { id: 'D01', name: 'Alex' },
  { id: 'D02', name: 'Suresh' },
  { id: 'D03', name: 'Priya' },
  { id: 'D04', name: 'John' }
];

const initialTrips = [
  { id: 'TR001', status: 'Dispatched', source: 'Gandhinagar Depot', dest: 'Ahmedabad Hub', vehicleId: 'VAN-05', driverName: 'Alex', eta: '45 min' },
  { id: 'TR004', status: 'Draft', source: 'Vatva Industrial Area', dest: 'Sanand Warehouse', vehicleId: 'TRK-04', driverName: 'Suresh', eta: 'Awaiting driver' },
  { id: 'TR006', status: 'Cancelled', source: 'Mansa', dest: 'Kalol Depot', vehicleId: null, driverName: null, eta: 'Vehicle went to shop' }
];

export default function TripDispatcher() {
  const { globalSearch } = useGlobalSearch();

  // Shared Pools State
  const [trips, setTrips] = useState(initialTrips);
  // Vehicles and drivers are removed from available pool if they are in a Dispatched trip
  const dispatchedTripVehicles = trips.filter(t => t.status === 'Dispatched').map(t => t.vehicleId);
  const dispatchedTripDrivers = trips.filter(t => t.status === 'Dispatched').map(t => t.driverName);
  
  const availableVehicles = initialVehicles.filter(v => !dispatchedTripVehicles.includes(v.id));
  const availableDrivers = initialDrivers.filter(d => !dispatchedTripDrivers.includes(d.name));

  // Form State
  const [source, setSource] = useState('');
  const [dest, setDest] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [driverName, setDriverName] = useState('');
  const [weight, setWeight] = useState('');
  const [distance, setDistance] = useState('');

  const [isDispatching, setIsDispatching] = useState(false);
  const [workflowActiveId, setWorkflowActiveId] = useState(null); // Trip ID currently running through completion workflow
  const [workflowStep, setWorkflowStep] = useState(0); // 0 = idle, 1,2,3,4 = steps

  // Derived Validation
  const selectedVehicle = initialVehicles.find(v => v.id === vehicleId);
  const weightNum = parseFloat(weight);
  const distanceNum = parseFloat(distance);
  
  const isOverCapacity = selectedVehicle && !isNaN(weightNum) && weightNum > selectedVehicle.capacity;
  const isWithinCapacity = selectedVehicle && !isNaN(weightNum) && weightNum <= selectedVehicle.capacity;
  const isFormValid = source && dest && vehicleId && driverName && weight && distance && isWithinCapacity;

  // Most recent trip status for Stepper
  const [latestStatus, setLatestStatus] = useState('Draft');

  const [isSourceDropdownOpen, setIsSourceDropdownOpen] = useState(false);
  const sourceDropdownRef = useRef(null);
  
  const [isDestDropdownOpen, setIsDestDropdownOpen] = useState(false);
  const destDropdownRef = useRef(null);

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

  // Handle Form Cancel
  const handleCancelForm = () => {
    setSource('');
    setDest('');
    setVehicleId('');
    setDriverName('');
    setWeight('');
    setDistance('');
    setLatestStatus('Cancelled');
    const evt = new CustomEvent('app-toast', { detail: 'Draft trip cancelled and cleared.' });
    window.dispatchEvent(evt);
  };

  // Handle Dispatch
  const handleDispatch = (e) => {
    e.preventDefault();
    if (!isFormValid || isDispatching) return;
    
    setIsDispatching(true);
    setTimeout(() => {
      // Calculate ETA
      const etaMinutes = Math.max(10, Math.round((distanceNum / 40) * 60)); // Assumes 40km/h avg speed
      
      const newTripId = `TR00${trips.length + 7}`; // Auto increment
      const newTrip = {
        id: newTripId,
        status: 'Dispatched',
        source,
        dest,
        vehicleId,
        driverName,
        eta: `${Math.floor(etaMinutes/60) > 0 ? Math.floor(etaMinutes/60) + 'h ' : ''}${etaMinutes%60}m`
      };

      setTrips([newTrip, ...trips]);
      setIsDispatching(false);
      setLatestStatus('Dispatched');

      // Reset form
      setSource(''); setDest(''); setVehicleId(''); setDriverName(''); setWeight(''); setDistance('');

      const evt = new CustomEvent('app-toast', { detail: `${newTripId} dispatched successfully.` });
      window.dispatchEvent(evt);
    }, 850);
  };

  // Quick Dispatch from Draft
  const handleQuickDispatch = (tripId) => {
    setTrips(trips.map(t => {
      if (t.id === tripId) {
        return { ...t, status: 'Dispatched', eta: '45 min' }; // Mock ETA for quick dispatch
      }
      return t;
    }));
    setLatestStatus('Dispatched');
  };

  // Mark Complete Workflow
  const handleMarkComplete = (tripId) => {
    if (workflowActiveId) return; // Prevent concurrent workflows
    setWorkflowActiveId(tripId);
    setWorkflowStep(1);

    // Sequence of steps
    setTimeout(() => setWorkflowStep(2), 480 * 1);
    setTimeout(() => setWorkflowStep(3), 480 * 2);
    setTimeout(() => setWorkflowStep(4), 480 * 3);
    setTimeout(() => {
      const trip = trips.find(t => t.id === tripId);
      setTrips(trips.map(t => t.id === tripId ? { ...t, status: 'Completed', eta: 'Arrived' } : t));
      setWorkflowActiveId(null);
      setWorkflowStep(0);
      setLatestStatus('Completed');

      const evt = new CustomEvent('app-toast', { detail: `${tripId} completed. ${trip.vehicleId} & ${trip.driverName} are now available.` });
      window.dispatchEvent(evt);
    }, 480 * 4 + 200);
  };

  // Filter logic
  const filteredTrips = trips.filter(t => {
    if (!globalSearch) return true;
    const searchLower = globalSearch.toLowerCase();
    return (
      t.id.toLowerCase().includes(searchLower) ||
      (t.source && t.source.toLowerCase().includes(searchLower)) ||
      (t.dest && t.dest.toLowerCase().includes(searchLower)) ||
      (t.vehicleId && t.vehicleId.toLowerCase().includes(searchLower)) ||
      (t.driverName && t.driverName.toLowerCase().includes(searchLower))
    );
  });

  return (
    <div className="trip-dispatcher fade-in">
      <div className="mb-6">
        <h1 className="text-2xl heading">Trip Dispatcher</h1>
        <p className="text-sm text-muted mt-1">Create a trip, validate capacity against the assigned vehicle, and dispatch it to the live board.</p>
      </div>

      <div className="layout-grid">
        {/* LEFT COLUMN - Trip Creation */}
        <div className="card left-panel">
          
          {/* Trip Lifecycle Stepper */}
          <div className="stepper-container mb-8">
            <div className="stepper-line-bg"></div>
            <div className={`stepper-line-fill step-${['Draft', 'Dispatched', 'Completed'].indexOf(latestStatus) !== -1 ? ['Draft', 'Dispatched', 'Completed'].indexOf(latestStatus) : 3} ${latestStatus === 'Cancelled' ? 'cancelled' : ''}`}></div>
            
            <div className="step-nodes">
              {['Draft', 'Dispatched', 'Completed', 'Cancelled'].map((stage, idx) => {
                let dotClass = 'step-dot';
                let labelColor = 'var(--sub)';
                
                const currentIdx = ['Draft', 'Dispatched', 'Completed'].indexOf(latestStatus);
                
                if (latestStatus === 'Cancelled') {
                  if (stage === 'Cancelled') {
                    dotClass += ' active-red';
                    labelColor = 'var(--red)';
                  }
                  else dotClass += ' default';
                } else {
                  if (idx < currentIdx) {
                    dotClass += ' completed';
                    labelColor = 'var(--green)';
                  }
                  else if (idx === currentIdx) {
                    dotClass += ' active-blue pulsing';
                    labelColor = 'var(--blue)';
                  }
                  else dotClass += ' pending';
                }

                return (
                  <div key={stage} className={`step-item`}>
                    <div className={dotClass}></div>
                    <span className="step-label" style={{ color: labelColor }}>{stage}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="section-label mb-4">
            <span>CREATE TRIP</span>
            <div className="section-divider"></div>
          </div>

          <form className="trip-form">
            <div className="form-row">
              <div className="input-group" ref={sourceDropdownRef}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--sub)' }}>SOURCE</label>
                <div className="custom-source-dropdown-wrapper">
                  <div 
                    className={`custom-source-input ${isSourceDropdownOpen ? 'active' : ''}`}
                    onClick={() => setIsSourceDropdownOpen(!isSourceDropdownOpen)}
                  >
                    <input 
                      type="text" 
                      value={source} 
                      onChange={e => setSource(e.target.value)} 
                      placeholder="e.g. Gandhinagar Depot" 
                      style={{ border: 'none', outline: 'none', background: 'transparent', width: '100%', pointerEvents: isSourceDropdownOpen ? 'auto' : 'none' }}
                      onClick={(e) => { if(isSourceDropdownOpen) e.stopPropagation(); }}
                    />
                    <ChevronDown size={16} className="text-muted" />
                  </div>
                  {isSourceDropdownOpen && (
                    <div className="custom-source-menu">
                      {['Gandhinagar Depot', 'Vatva Industrial Area', 'Mansa Yard'].map(opt => (
                        <div 
                          key={opt} 
                          className="custom-source-option"
                          onClick={() => { setSource(opt); setIsSourceDropdownOpen(false); }}
                        >
                          {opt}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="input-group" ref={destDropdownRef}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--sub)' }}>DESTINATION</label>
                <div className="custom-source-dropdown-wrapper">
                  <div 
                    className={`custom-source-input ${isDestDropdownOpen ? 'active' : ''}`}
                    onClick={() => setIsDestDropdownOpen(!isDestDropdownOpen)}
                  >
                    <input 
                      type="text" 
                      value={dest} 
                      onChange={e => setDest(e.target.value)} 
                      placeholder="e.g. Ahmedabad Hub" 
                      style={{ border: 'none', outline: 'none', background: 'transparent', width: '100%', pointerEvents: isDestDropdownOpen ? 'auto' : 'none' }}
                      onClick={(e) => { if(isDestDropdownOpen) e.stopPropagation(); }}
                    />
                    <ChevronDown size={16} className="text-muted" />
                  </div>
                  {isDestDropdownOpen && (
                    <div className="custom-source-menu">
                      {['Ahmedabad Hub', 'Sanand Warehouse', 'Kalol Depot'].map(opt => (
                        <div 
                          key={opt} 
                          className="custom-source-option"
                          onClick={() => { setDest(opt); setIsDestDropdownOpen(false); }}
                        >
                          {opt}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="form-row">
              <div className="input-group">
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--sub)' }}>VEHICLE (AVAILABLE ONLY)</label>
                <select className="select" value={vehicleId} onChange={e => setVehicleId(e.target.value)}>
                  <option value="">Select vehicle...</option>
                  {availableVehicles.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
                </select>
                {selectedVehicle && <div className="text-xs text-muted mt-1 font-mono">Rated capacity: {selectedVehicle.capacity} kg</div>}
              </div>
              <div className="input-group">
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--sub)' }}>DRIVER (AVAILABLE ONLY)</label>
                <select className="select" value={driverName} onChange={e => setDriverName(e.target.value)}>
                  <option value="">Select driver...</option>
                  {availableDrivers.map(d => <option key={d.id} value={d.name}>{d.name} ({d.id})</option>)}
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="input-group">
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--sub)' }}>CARGO WEIGHT (KG)</label>
                <input type="number" className="input" value={weight} onChange={e => setWeight(e.target.value)} placeholder="e.g. 700" />
              </div>
              <div className="input-group">
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--sub)' }}>PLANNED DISTANCE (KM)</label>
                <input type="number" className="input" value={distance} onChange={e => setDistance(e.target.value)} placeholder="e.g. 38" />
              </div>
            </div>

            {/* Live Capacity Validation Box */}
            <div className="validation-container mt-2">
              {isOverCapacity && (
                <div className="validation-box error shake">
                  <div className="val-header">
                    <FileWarning size={18} />
                    <span className="font-semibold">Capacity exceeded by {weightNum - selectedVehicle.capacity} kg — dispatch blocked.</span>
                  </div>
                  <div className="val-details mono">
                    <div>Vehicle Capacity: {selectedVehicle.capacity} kg</div>
                    <div>Cargo Weight: {weightNum} kg</div>
                  </div>
                </div>
              )}
              {isWithinCapacity && isFormValid && (
                <div className="validation-box success fade-in">
                  <div className="val-header">
                    <CheckCircle2 size={18} />
                    <span className="font-semibold">Capacity check passed — {selectedVehicle.capacity - weightNum} kg headroom remaining. Ready to dispatch.</span>
                  </div>
                </div>
              )}
            </div>

            {/* Form Actions */}
            <div className="form-actions mt-6">
              <button 
                type="button" 
                className="btn btn-outline" 
                onClick={handleCancelForm}
                style={{ color: 'var(--red)', borderColor: 'var(--line)' }}
              >
                <X size={16} /> Cancel
              </button>
              <button 
                type="submit" 
                className={`btn btn-primary flex-1 ${!isFormValid ? 'disabled' : ''}`}
                onClick={handleDispatch}
                disabled={!isFormValid || isDispatching}
              >
                {isDispatching ? (
                  <span className="spinner-border w-4 h-4 border-2 border-white rounded-full animate-spin"></span>
                ) : (
                  <><Navigation size={16} /> Dispatch Trip</>
                )}
              </button>
            </div>
          </form>

        </div>

        {/* RIGHT COLUMN - Live Board */}
        <div className="right-panel">
          
          <div className="flex justify-between items-center mb-4">
            <h2 className="heading text-lg">Live board</h2>
            <div className="pill pill-blue" style={{ textTransform: 'lowercase', padding: '0.2rem 0.5rem', opacity: 0.8 }}>
              <span className="pulsing-dot sm"></span> auto-updating
            </div>
          </div>

          <div className="cards-list">
            {filteredTrips.map(trip => (
              <div key={trip.id} className="card trip-card slide-down">
                
                <div className="flex justify-between items-start mb-3">
                  <span className="mono font-bold">{trip.id}</span>
                  <span className="text-xs text-muted">
                    {trip.vehicleId ? `${trip.vehicleId} / ${trip.driverName}` : 'Unassigned'}
                  </span>
                </div>

                <div className="route-line-small mb-4">
                  <MapPin size={14} className="text-muted" style={{ flexShrink: 0 }} />
                  <span className="text-sm font-medium truncate">{trip.source}</span>
                  <Navigation size={12} className="text-muted mx-1" style={{ transform: 'rotate(90deg)' }} />
                  <span className="text-sm font-medium truncate">{trip.dest}</span>
                </div>

                <div className="flex justify-between items-center mt-auto pt-2 border-t border-[var(--line)]">
                  <div>
                    {trip.status === 'Dispatched' && <span className="pill pill-blue"><span className="live-dot sm bg-blue-500"></span> Dispatched</span>}
                    {trip.status === 'Draft' && <span className="pill pill-gray">Draft</span>}
                    {trip.status === 'Cancelled' && <span className="pill pill-red">Cancelled</span>}
                    {trip.status === 'Completed' && <span className="pill pill-green"><Check size={12} className="mr-1" /> Completed</span>}
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <span className={`text-xs mono ${trip.status === 'Completed' ? 'text-status-green' : 'text-muted'}`}>{trip.eta}</span>
                    
                    {trip.status === 'Draft' && (
                      <button className="btn btn-outline text-xs py-1 px-2" onClick={() => handleQuickDispatch(trip.id)}>Quick dispatch</button>
                    )}
                    {trip.status === 'Dispatched' && (
                      <button className="btn btn-primary text-xs py-1 px-2" onClick={() => handleMarkComplete(trip.id)} disabled={workflowActiveId !== null}>
                        Mark complete
                      </button>
                    )}
                  </div>
                </div>

              </div>
            ))}
          </div>

          {/* Workflow Panel */}
          <div className="card workflow-panel mt-4">
            <div className="workflow-steps">
              <div className="workflow-track"></div>
              
              <div className="workflow-step">
                <div className={`workflow-badge ${workflowStep > 1 ? 'passed' : workflowStep === 1 ? 'active' : ''}`}>
                  <Activity size={14} className={workflowStep === 1 ? 'animate-spin' : ''} />
                </div>
                <div className="workflow-text">Odometer logged</div>
              </div>
              
              <div className="workflow-step">
                <div className={`workflow-badge ${workflowStep > 2 ? 'passed' : workflowStep === 2 ? 'active' : ''}`}>
                  <Info size={14} className={workflowStep === 2 ? 'animate-spin' : ''} />
                </div>
                <div className="workflow-text">Fuel log updated</div>
              </div>
              
              <div className="workflow-step">
                <div className={`workflow-badge ${workflowStep > 3 ? 'passed' : workflowStep === 3 ? 'active' : ''}`}>
                  <FileText size={14} className={workflowStep === 3 ? 'animate-spin' : ''} />
                </div>
                <div className="workflow-text">Expenses recorded</div>
              </div>
              
              <div className="workflow-step">
                <div className={`workflow-badge ${workflowStep > 4 ? 'passed' : workflowStep === 4 ? 'active' : ''}`}>
                  <Check size={14} />
                </div>
                <div className="workflow-text">Vehicle & driver available</div>
              </div>

            </div>
            
            <div className="text-xs text-muted text-center mt-4">
              {workflowStep === 0 && "Runs automatically when a dispatched trip is marked complete."}
              {workflowStep === 1 && "Logging odometer reading from telematics..."}
              {workflowStep === 2 && "Syncing fuel log records..."}
              {workflowStep === 3 && "Processing expense receipts..."}
              {workflowStep === 4 && "Finalizing trip and freeing assets..."}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
