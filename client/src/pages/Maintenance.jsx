import React, { useState, useEffect } from 'react';
import { Plus, Check, Search, Info } from 'lucide-react';
import { useGlobalSearch } from '../contexts/GlobalSearchContext';
import { apiRequest } from '../utils/api';
import './Maintenance.css';

export default function Maintenance() {
  const { globalSearch } = useGlobalSearch();
  const [vehicles, setVehicles] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Form State
  const [selectedVehicle, setSelectedVehicle] = useState('');
  const [serviceType, setServiceType] = useState('');
  const [cost, setCost] = useState('');
  const [date, setDate] = useState('');
  const [status, setStatus] = useState('Active'); // Active or Closed
  const [isSaving, setIsSaving] = useState(false);
  
  // Animation State
  const [flashType, setFlashType] = useState(null); // 'in' | 'out'
  const [newLogId, setNewLogId] = useState(null);

  // Form Validation
  const isValid = selectedVehicle && serviceType && cost && date;

  const loadData = async () => {
    try {
      setError('');
      const [vehRes, logsRes] = await Promise.all([
        apiRequest('GET', '/vehicles'),
        apiRequest('GET', '/maintenance')
      ]);
      setVehicles(vehRes.data || []);
      setLogs(logsRes.data || []);
    } catch (err) {
      console.error(err);
      setError('Failed to load maintenance records.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);
  
  // Filter available vehicles for dropdown
  const availableVehicles = vehicles.filter(v => v.status === 'Available');

  // Filter logs for table (with global search)
  const filteredLogs = logs.filter(log => {
    const regNo = log.vehicle_registration || '';
    const desc = log.description || '';
    return regNo.toLowerCase().includes(globalSearch.toLowerCase()) ||
           desc.toLowerCase().includes(globalSearch.toLowerCase());
  });

  const showToast = (message) => {
    const evt = new CustomEvent('app-toast', { detail: message });
    window.dispatchEvent(evt);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!isValid) return;

    setIsSaving(true);
    const parsedCost = parseFloat(cost.replace(/[^0-9.]/g, '')) || 0;
    
    try {
      const res = await apiRequest('POST', '/maintenance', {
        vehicle_id: Number(selectedVehicle),
        description: serviceType,
        cost: parsedCost,
        start_date: new Date(date).toISOString().split('T')[0],
        status: status === 'Completed' ? 'Closed' : 'Active'
      });

      setNewLogId(res.data.id);
      
      if (status === 'Active') {
        setFlashType('in');
        const vehicleReg = vehicles.find(v => v.id === Number(selectedVehicle))?.registration_number || '';
        showToast(`Vehicle ${vehicleReg} moved to In Shop.`);
      } else {
        showToast('Service record completed.');
      }

      // Reset form
      setSelectedVehicle('');
      setServiceType('');
      setCost('');
      setDate('');
      setStatus('Active');
      
      loadData();

      setTimeout(() => {
        setFlashType(null);
        setNewLogId(null);
      }, 1500);
    } catch (err) {
      showToast(err.message || 'Failed to save maintenance record.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCompleteService = async (logId, vehicleId, regNo) => {
    try {
      await apiRequest('PUT', `/maintenance/${logId}`, {
        status: 'Closed',
        end_date: new Date().toISOString().split('T')[0]
      });

      setFlashType('out');
      showToast(`Vehicle ${regNo} marked available.`);
      loadData();
      
      setTimeout(() => {
        setFlashType(null);
      }, 1500);
    } catch (err) {
      showToast(err.message || 'Failed to complete service.');
    }
  };

  if (loading) {
    return (
      <div className="flex-col gap-6 w-full h-full p-4">
        <div className="skeleton w-1/4 h-10 mb-4"></div>
        <div className="flex gap-4">
          <div className="skeleton flex-1 h-96"></div>
          <div className="skeleton flex-2 h-96"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="maintenance-page fade-in">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl heading">Maintenance</h1>
        <p className="text-sm text-muted mt-1">Log a service record and track every vehicle's shop status in real time.</p>
        {error && <div className="text-xs text-status-red mt-1">{error}</div>}
      </div>

      <div className="maintenance-grid">
        {/* Left Column: Form */}
        <div className="card">
          <h2 className="heading text-lg mb-2">Log service record</h2>
          <p className="text-xs text-muted mb-6">Only vehicles currently available for dispatch can be logged for service.</p>
          
          <form onSubmit={handleSave}>
            <div className="input-group mb-4">
              <label>Vehicle</label>
              {availableVehicles.length === 0 ? (
                <div className="text-sm text-status-orange flex items-center gap-1 p-2 bg-status-orange" style={{ background: 'var(--amber-bg)', borderRadius: '4px' }}>
                  <Info size={14} /> No available vehicles
                </div>
              ) : (
                <select className="select w-full" value={selectedVehicle} onChange={e => setSelectedVehicle(e.target.value)}>
                  <option value="" disabled>Select vehicle...</option>
                  {availableVehicles.map(v => (
                    <option key={v.id} value={v.id}>{v.registration_number} ({v.name})</option>
                  ))}
                </select>
              )}
            </div>

            <div className="input-group mb-4">
              <label>Service Type</label>
              <input 
                type="text" 
                className="input w-full" 
                placeholder="e.g. Oil Change" 
                list="service-types"
                value={serviceType}
                onChange={e => setServiceType(e.target.value)}
              />
              <datalist id="service-types">
                <option value="Oil Change" />
                <option value="Engine Repair" />
                <option value="Tyre Replace" />
                <option value="Brake Service" />
                <option value="Battery Replace" />
              </datalist>
            </div>

            <div className="flex gap-4 mb-4">
              <div className="input-group flex-1">
                <label>Cost</label>
                <div className="currency-input-wrapper">
                  <span className="currency-symbol">$</span>
                  <input 
                    type="text" 
                    className="input" 
                    placeholder="0.00" 
                    value={cost}
                    onChange={e => setCost(e.target.value)}
                  />
                </div>
              </div>
              <div className="input-group flex-1">
                <label>Date</label>
                <input 
                  type="date" 
                  className="input w-full" 
                  value={date}
                  onChange={e => setDate(e.target.value)}
                />
              </div>
            </div>

            <div className="input-group mb-6">
              <label>Status</label>
              <div className="toggle-group">
                <div 
                  className={`toggle-btn ${status === 'Active' ? 'active active-amber' : ''}`}
                  onClick={() => setStatus('Active')}
                >
                  Active
                </div>
                <div 
                  className={`toggle-btn ${status === 'Completed' ? 'active active-green' : ''}`}
                  onClick={() => setStatus('Completed')}
                >
                  Completed
                </div>
              </div>
            </div>

            <button 
              type="submit" 
              className={`btn btn-amber-gradient w-full ${isSaving ? 'btn-loading' : ''}`}
              disabled={!isValid || isSaving}
            >
              {isSaving ? 'Saving...' : 'Save record'}
            </button>
          </form>
        </div>

        {/* Right Column: Table */}
        <div className="flex flex-col gap-6">
          <div className="card p-0 overflow-hidden">
            <div className="table-container">
              <table className="maintenance-table w-full">
                <thead>
                  <tr>
                    <th>Vehicle</th>
                    <th>Service</th>
                    <th>Cost</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.length === 0 ? (
                    <tr>
                      <td colSpan="4" className="text-center py-8 text-muted">No service records found.</td>
                    </tr>
                  ) : (
                    filteredLogs.map(log => (
                      <tr key={log.id} className={log.id === newLogId ? 'row-bounce' : ''}>
                        <td>
                          <span className="vehicle-chip">{log.vehicle_registration}</span>
                        </td>
                        <td className="font-medium text-text-primary">{log.description}</td>
                        <td className="mono">${Number(log.cost).toLocaleString()}</td>
                        <td>
                          {log.status === 'Active' ? (
                            <span 
                              className="pill pill-orange status-interactive flex items-center gap-2"
                              onClick={() => handleCompleteService(log.id, log.vehicle_id, log.vehicle_registration)}
                              title="Click to complete service"
                            >
                              Active (Complete)
                            </span>
                          ) : (
                            <span className="pill pill-green">Closed</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
