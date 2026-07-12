import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Search, ChevronDown, Copy, Lock, Info } from 'lucide-react';
import { useGlobalSearch } from '../contexts/GlobalSearchContext';
import { apiRequest } from '../utils/api';

const vehicleTypes = ['All Types', 'Van', 'Truck', 'Mini'];
const vehicleStatuses = ['All Statuses', 'Available', 'On trip', 'In shop', 'Retired'];

export default function Vehicles() {
  const { globalSearch } = useGlobalSearch();
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Filters
  const [typeFilter, setTypeFilter] = useState('All Types');
  const [statusFilter, setStatusFilter] = useState('All Statuses');
  
  // Dropdown UI states
  const [isTypeOpen, setIsTypeOpen] = useState(false);
  const [isStatusOpen, setIsStatusOpen] = useState(false);
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newVehicle, setNewVehicle] = useState({ regNo: '', name: '', type: 'Van', capacity: '', cost: '', status: 'Available' });
  
  // Toast State
  const [toasts, setToasts] = useState([]);

  // Refs for click outside
  const typeRef = useRef(null);
  const statusRef = useRef(null);

  const loadVehicles = async () => {
    try {
      setError('');
      const data = await apiRequest('GET', '/vehicles');
      setVehicles(data.data || []);
    } catch (err) {
      console.error(err);
      setError('Failed to load fleet registry.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadVehicles();

    function handleClickOutside(e) {
      if (typeRef.current && !typeRef.current.contains(e.target)) setIsTypeOpen(false);
      if (statusRef.current && !statusRef.current.contains(e.target)) setIsStatusOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);

    // Check for quick action from header
    const params = new URLSearchParams(window.location.search);
    if (params.get('action') === 'add') {
      setIsModalOpen(true);
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const addToast = (msg, isError = false) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, msg, isError }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 2000);
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    addToast(`Copied ${text} to clipboard`);
  };

  const handleAddVehicle = async (e) => {
    e.preventDefault();
    if (!newVehicle.regNo || !newVehicle.name) {
      addToast("Reg No and Name are required", true);
      return;
    }
    
    // Uniqueness check
    if (vehicles.some(v => v.registration_number.toLowerCase() === newVehicle.regNo.toLowerCase())) {
      addToast("Registration number must be unique", true);
      return;
    }

    // Clean inputs for database types
    const parsedCapacity = parseInt(newVehicle.capacity.replace(/\D/g, '')) || 0;
    const parsedCost = parseFloat(newVehicle.cost.replace(/[^0-9.]/g, '')) || 0;

    try {
      await apiRequest('POST', '/vehicles', {
        registration_number: newVehicle.regNo,
        name: newVehicle.name,
        type: newVehicle.type,
        max_load_capacity: parsedCapacity,
        odometer: 0,
        acquisition_cost: parsedCost,
        status: newVehicle.status === 'On trip' ? 'On Trip' : newVehicle.status === 'In shop' ? 'In Shop' : newVehicle.status
      });

      setIsModalOpen(false);
      setNewVehicle({ regNo: '', name: '', type: 'Van', capacity: '', cost: '', status: 'Available' });
      addToast("Vehicle added successfully");
      loadVehicles();
    } catch (err) {
      addToast(err.message || "Failed to add vehicle", true);
    }
  };

  // Filter Logic
  const filteredVehicles = vehicles.filter(v => {
    const matchesSearch = v.registration_number.toLowerCase().includes(globalSearch.toLowerCase()) || 
                          v.name.toLowerCase().includes(globalSearch.toLowerCase());
    const matchesType = typeFilter === 'All Types' || v.type === typeFilter;
    
    // Handle state mapping differences
    const mappedStatus = v.status === 'On Trip' ? 'On trip' : v.status === 'In Shop' ? 'In shop' : v.status;
    const matchesStatus = statusFilter === 'All Statuses' || mappedStatus === statusFilter;
    
    return matchesSearch && matchesType && matchesStatus;
  });

  const getStatusPill = (status) => {
    switch(status) {
      case 'Available': return <span className="pill pill-green">Available</span>;
      case 'On Trip': 
      case 'On trip': 
        return <span className="pill pill-blue"><span className="pulsing-dot"></span>On trip</span>;
      case 'In Shop':
      case 'In shop': 
        return <span className="pill pill-orange">In shop</span>;
      case 'Retired': return <span className="pill pill-red">Retired</span>;
      default: return <span className="pill pill-gray">{status}</span>;
    }
  };

  const getLeftBorderColor = (status) => {
    switch(status) {
      case 'Available': return 'var(--status-green)';
      case 'On Trip':
      case 'On trip': 
        return 'var(--status-blue)';
      case 'In Shop':
      case 'In shop': 
        return 'var(--status-orange)';
      case 'Retired': return 'var(--status-red)';
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
      <div className="flex items-center gap-4 mb-6" style={{ position: 'relative', zIndex: 10 }}>
        
        {/* Global/Local Search */}
        <div style={{ position: 'relative', width: '250px' }}>
          <Search size={16} className="text-muted" style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)' }} />
          <input 
            type="text" 
            placeholder="Search reg. no..." 
            className="input" 
            style={{ width: '100%', paddingLeft: '2.5rem' }}
            value={globalSearch}
            onChange={(e) => setGlobalSearch(e.target.value)}
          />
        </div>

        {/* Custom Type Filter Dropdown */}
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
              {vehicleTypes.map(t => (
                <div key={t} className="custom-dropdown-item" onClick={() => { setTypeFilter(t); setIsTypeOpen(false); }}>
                  {t}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Custom Status Filter Dropdown */}
        <div style={{ position: 'relative', width: '180px' }} ref={statusRef}>
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
              {vehicleStatuses.map(s => (
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
                <th>Reg. No.</th>
                <th>Name/Model</th>
                <th>Type</th>
                <th>Capacity</th>
                <th>Odometer</th>
                <th>Acq. Cost</th>
                <th>Status</th>
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
                      opacity: (v.status === 'Retired' || v.status === 'In shop' || v.status === 'In Shop') ? 0.7 : 1
                    }}
                  >
                    <td className="mono font-medium group relative" style={{ cursor: 'pointer' }}>
                      <div className="flex items-center gap-2" onClick={() => copyToClipboard(v.registration_number)} title="Click to copy">
                        {v.registration_number}
                        <Copy size={14} className="text-muted opacity-0 hover:opacity-100 transition-opacity" style={{ opacity: 0.5 }} />
                      </div>
                    </td>
                    <td>{v.name}</td>
                    <td>{v.type}</td>
                    <td className="mono">{v.max_load_capacity} kg</td>
                    <td className="mono">
                      <div className="odometer-wrapper" style={{ width: '80px' }}>
                        <span>{Number(v.odometer).toLocaleString()} km</span>
                        <div className="odometer-bg">
                          <div className="odometer-fill" style={{ animationDelay: `${(idx * 70) + 300}ms` }}></div>
                        </div>
                      </div>
                    </td>
                    <td className="mono">${Number(v.acquisition_cost).toLocaleString()}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        {getStatusPill(v.status)}
                        {(v.status === 'Retired' || v.status === 'In shop' || v.status === 'In Shop') && (
                          <div className="flex items-center gap-1 text-status-orange text-xs">
                            <Lock size={12} />
                            <span style={{ fontSize: '0.65rem', textTransform: 'uppercase' }}>Hidden</span>
                          </div>
                        )}
                      </div>
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
          <Info size={14} /> Registration no. must be unique
        </div>
        <div className="text-xs text-status-red font-medium flex items-center gap-1">
          <Info size={14} /> Retired/in shop vehicles are hidden from trip dispatch
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && createPortal(
        <div className="modal-overlay" onMouseDown={() => setIsModalOpen(false)}>
          <div className="modal-content" onMouseDown={e => e.stopPropagation()}>
            <h2 className="text-xl heading mb-6">Add Vehicle</h2>
            
            <form onSubmit={handleAddVehicle}>
              <div className="input-group">
                <label>Registration No.</label>
                <input required type="text" className="input" placeholder="e.g. GJ01AB1234" value={newVehicle.regNo} onChange={e => setNewVehicle({...newVehicle, regNo: e.target.value})} />
              </div>

              <div className="input-group">
                <label>Name / Model</label>
                <input required type="text" className="input" placeholder="e.g. VAN-10" value={newVehicle.name} onChange={e => setNewVehicle({...newVehicle, name: e.target.value})} />
              </div>

              <div className="flex gap-4 mb-4">
                <div className="input-group flex-1">
                  <label>Type</label>
                  <select className="select w-full" value={newVehicle.type} onChange={e => setNewVehicle({...newVehicle, type: e.target.value})}>
                    <option value="Van">Van</option>
                    <option value="Truck">Truck</option>
                    <option value="Mini">Mini</option>
                  </select>
                </div>
                <div className="input-group flex-1">
                  <label>Status</label>
                  <select className="select w-full" value={newVehicle.status} onChange={e => setNewVehicle({...newVehicle, status: e.target.value})}>
                    <option value="Available">Available</option>
                    <option value="On trip">On trip</option>
                    <option value="In shop">In shop</option>
                    <option value="Retired">Retired</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-4 mb-8">
                <div className="input-group flex-1">
                  <label>Capacity</label>
                  <input required type="text" className="input" placeholder="e.g. 500 kg" value={newVehicle.capacity} onChange={e => setNewVehicle({...newVehicle, capacity: e.target.value})} />
                </div>
                <div className="input-group flex-1">
                  <label>Acq. Cost</label>
                  <input required type="text" className="input" placeholder="e.g. 5,00,000" value={newVehicle.cost} onChange={e => setNewVehicle({...newVehicle, cost: e.target.value})} />
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <button type="button" className="btn btn-outline" onClick={() => setIsModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Vehicle</button>
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
