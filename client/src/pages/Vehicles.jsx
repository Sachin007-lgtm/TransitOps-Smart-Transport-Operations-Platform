import React, { useState, useEffect } from 'react';
import { Plus, Download, Lock } from 'lucide-react';
import { apiRequest } from '../utils/api';

export default function Vehicles() {
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Form state for adding vehicle
  const [showAddForm, setShowAddForm] = useState(false);
  const [regNo, setRegNo] = useState('');
  const [modelName, setModelName] = useState('');
  const [type, setType] = useState('Van');
  const [capacity, setCapacity] = useState('');
  const [odometer, setOdometer] = useState('');
  const [acqCost, setAcqCost] = useState('');

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
  }, []);

  const handleAddVehicle = async (e) => {
    e.preventDefault();
    setError('');

    try {
      await apiRequest('POST', '/vehicles', {
        registration_number: regNo,
        name: modelName,
        type,
        max_load_capacity: Number(capacity),
        odometer: odometer ? Number(odometer) : 0,
        acquisition_cost: acqCost ? Number(acqCost) : 0
      });
      
      // Reset form & reload
      setRegNo('');
      setModelName('');
      setCapacity('');
      setOdometer('');
      setAcqCost('');
      setShowAddForm(false);
      loadVehicles();
    } catch (err) {
      setError(err.message || 'Failed to add vehicle.');
    }
  };

  return (
    <div className="fade-in">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl heading">Fleet Registry</h1>
        <div className="flex gap-4">
          <button 
            className="btn btn-primary"
            onClick={() => setShowAddForm(!showAddForm)}
          >
            <Plus size={16} /> {showAddForm ? 'Close Form' : 'Add Vehicle'}
          </button>
        </div>
      </div>

      {error && <div className="error-message mb-4" style={{ color: 'var(--status-red)', fontSize: '0.875rem' }}>{error}</div>}

      {showAddForm && (
        <div className="card mb-6" style={{ maxWidth: '600px' }}>
          <h2 className="heading text-lg mb-4">Register New Vehicle</h2>
          <form onSubmit={handleAddVehicle} style={{ display: 'grid', gap: '1rem' }}>
            <div className="input-group">
              <label>Registration Number (Unique)</label>
              <input type="text" className="input" value={regNo} onChange={e => setRegNo(e.target.value)} required placeholder="e.g. GJ01AB452" />
            </div>
            <div className="input-group">
              <label>Model Name / Description</label>
              <input type="text" className="input" value={modelName} onChange={e => setModelName(e.target.value)} required placeholder="e.g. VAN-05" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="input-group">
                <label>Vehicle Type</label>
                <select className="select" value={type} onChange={e => setType(e.target.value)}>
                  <option>Van</option>
                  <option>Truck</option>
                  <option>Mini</option>
                </select>
              </div>
              <div className="input-group">
                <label>Max Load Capacity (kg)</label>
                <input type="number" className="input" value={capacity} onChange={e => setCapacity(e.target.value)} required placeholder="500" />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="input-group">
                <label>Odometer Reading (km)</label>
                <input type="number" className="input" value={odometer} onChange={e => setOdometer(e.target.value)} placeholder="0" />
              </div>
              <div className="input-group">
                <label>Acquisition Cost ($)</label>
                <input type="number" className="input" value={acqCost} onChange={e => setAcqCost(e.target.value)} placeholder="0" />
              </div>
            </div>
            <button type="submit" className="btn btn-primary" style={{ justifySelf: 'start', padding: '0.5rem 1.5rem' }}>
              Submit
            </button>
          </form>
        </div>
      )}

      <div className="card">
        <div className="table-container">
          <table>
            <thead>
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
                  <td colSpan="7" className="text-center py-4 text-xs text-muted">Loading fleet...</td>
                </tr>
              ) : vehicles.map(veh => (
                <tr key={veh.id} className={`border-indicator ${
                  veh.status === 'Available' ? 'border-green' : 
                  veh.status === 'On Trip' ? 'border-blue' : 'border-orange'
                }`}>
                  <td className="mono font-medium flex items-center gap-2">
                    {veh.registration_number}
                    {veh.status === 'In Shop' && <Lock size={14} className="text-status-orange" title="Locked out of dispatch" />}
                  </td>
                  <td>{veh.name}</td>
                  <td>{veh.type}</td>
                  <td>{veh.max_load_capacity} kg</td>
                  <td className="mono">{Number(veh.odometer).toLocaleString()} km</td>
                  <td className="mono">${Number(veh.acquisition_cost).toLocaleString()}</td>
                  <td>
                    <span className={`pill ${
                      veh.status === 'Available' ? 'pill-green' : 
                      veh.status === 'On Trip' ? 'pill-blue' : 
                      veh.status === 'Retired' ? 'pill-red' : 'pill-orange'
                    }`}>
                      {veh.status}
                    </span>
                  </td>
                </tr>
              ))}
              {!loading && vehicles.length === 0 && (
                <tr>
                  <td colSpan="7" className="text-center py-4 text-xs text-muted">No vehicles registered yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="text-xs text-status-orange mt-4 font-medium">
          Rule: Registration No. must be unique • Retired/In Shop vehicles are hidden from Trip Dispatcher
        </div>
      </div>
    </div>
  );
}
