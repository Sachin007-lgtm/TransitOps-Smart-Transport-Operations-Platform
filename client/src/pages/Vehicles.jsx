import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Search, ChevronDown, Copy, Lock, Info } from 'lucide-react';
import { useGlobalSearch } from '../contexts/GlobalSearchContext';

// Sample Data
const initialVehicles = [
  { id: '1', regNo: 'GJ01AB452', name: 'VAN-05', type: 'Van', capacity: '500 kg', odometer: 74000, cost: '6,20,000', status: 'Available' },
  { id: '2', regNo: 'GJ01AB998', name: 'TRUCK-11', type: 'Truck', capacity: '5 Ton', odometer: 182000, cost: '24,50,000', status: 'On trip' },
  { id: '3', regNo: 'GJ01AB1120', name: 'MINI-03', type: 'Mini', capacity: '1 Ton', odometer: 66000, cost: '4,10,000', status: 'In shop' },
  { id: '4', regNo: 'GJ01AB008', name: 'VAN-09', type: 'Van', capacity: '750 kg', odometer: 241900, cost: '5,90,000', status: 'Retired' }
];

const vehicleTypes = ['All Types', 'Van', 'Truck', 'Mini'];
const vehicleStatuses = ['All Statuses', 'Available', 'On trip', 'In shop', 'Retired'];

export default function Vehicles() {
  const { globalSearch, setGlobalSearch } = useGlobalSearch();
  const [vehicles, setVehicles] = useState(initialVehicles);
  
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

  useEffect(() => {
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

  const handleAddVehicle = (e) => {
    e.preventDefault();
    if (!newVehicle.regNo || !newVehicle.name) {
      addToast("Reg No and Name are required", true);
      return;
    }
    
    // Uniqueness check
    if (vehicles.some(v => v.regNo.toLowerCase() === newVehicle.regNo.toLowerCase())) {
      addToast("Registration number must be unique", true);
      return;
    }

    const created = { ...newVehicle, id: Date.now().toString(), odometer: 0 };
    setVehicles([created, ...vehicles]);
    setIsModalOpen(false);
    setNewVehicle({ regNo: '', name: '', type: 'Van', capacity: '', cost: '', status: 'Available' });
    addToast("Vehicle added successfully");
  };

  // Filter Logic
  const filteredVehicles = vehicles.filter(v => {
    const matchesSearch = v.regNo.toLowerCase().includes(globalSearch.toLowerCase()) || 
                          v.name.toLowerCase().includes(globalSearch.toLowerCase());
    const matchesType = typeFilter === 'All Types' || v.type === typeFilter;
    const matchesStatus = statusFilter === 'All Statuses' || v.status === statusFilter;
    
    return matchesSearch && matchesType && matchesStatus;
  });

  const getStatusPill = (status) => {
    switch(status) {
      case 'Available': return <span className="pill pill-green">Available</span>;
      case 'On trip': return <span className="pill pill-blue"><span className="pulsing-dot"></span>On trip</span>;
      case 'In shop': return <span className="pill pill-orange">In shop</span>;
      case 'Retired': return <span className="pill pill-red">Retired</span>;
      default: return <span className="pill pill-gray">{status}</span>;
    }
  };

  const getLeftBorderColor = (status) => {
    switch(status) {
      case 'Available': return 'var(--status-green)';
      case 'On trip': return 'var(--status-blue)';
      case 'In shop': return 'var(--status-orange)';
      case 'Retired': return 'var(--status-red)';
      default: return 'transparent';
    }
  };

  return (
    <div className="fade-in">
      {/* Header Row */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl heading">Vehicle registry</h1>
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
                <th>Reg. No. (Unique)</th>
                <th>Name/Model</th>
                <th>Type</th>
                <th>Capacity</th>
                <th>Odometer</th>
                <th>Acq. Cost</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredVehicles.length === 0 ? (
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
                      opacity: (v.status === 'Retired' || v.status === 'In shop') ? 0.7 : 1
                    }}
                  >
                    <td className="mono font-medium group relative" style={{ cursor: 'pointer' }}>
                      <div className="flex items-center gap-2" onClick={() => copyToClipboard(v.regNo)} title="Click to copy">
                        {v.regNo}
                        <Copy size={14} className="text-muted opacity-0 hover:opacity-100 transition-opacity" style={{ opacity: 0.5 }} />
                      </div>
                    </td>
                    <td>{v.name}</td>
                    <td>{v.type}</td>
                    <td className="mono">{v.capacity}</td>
                    <td className="mono">
                      <div className="odometer-wrapper" style={{ width: '80px' }}>
                        <span>{v.odometer.toLocaleString()}</span>
                        <div className="odometer-bg">
                          <div className="odometer-fill" style={{ animationDelay: `${(idx * 70) + 300}ms` }}></div>
                        </div>
                      </div>
                    </td>
                    <td className="mono">{v.cost}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        {getStatusPill(v.status)}
                        {(v.status === 'Retired' || v.status === 'In shop') && (
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
