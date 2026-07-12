import React, { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { createPortal } from 'react-dom';
import { apiRequest } from '../utils/api';
import './FuelExpenses.css';

export default function FuelExpenses() {
  const [vehicles, setVehicles] = useState([]);
  const [trips, setTrips] = useState([]);
  const [fuelLogs, setFuelLogs] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Modal states
  const [isFuelModalOpen, setIsFuelModalOpen] = useState(false);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  
  // Animation states
  const [newFuelId, setNewFuelId] = useState(null);
  const [newExpenseId, setNewExpenseId] = useState(null);

  // Form states
  const [fuelForm, setFuelForm] = useState({ vehicleId: '', date: '', liters: '', cost: '' });
  const [expenseForm, setExpenseForm] = useState({ tripId: '', vehicleId: '', description: 'Tolls & Other', amount: '', date: '' });

  const loadData = async () => {
    try {
      setError('');
      const [vehRes, tripsRes, fuelRes, expRes] = await Promise.all([
        apiRequest('GET', '/vehicles'),
        apiRequest('GET', '/trips'),
        apiRequest('GET', '/fuel'),
        apiRequest('GET', '/expenses')
      ]);
      setVehicles(vehRes.data || []);
      setTrips(tripsRes.data || []);
      setFuelLogs(fuelRes.data || []);
      setExpenses(expRes.data || []);
    } catch (err) {
      console.error(err);
      setError('Failed to load operational logs.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Calculate totals
  const totalFuelCost = fuelLogs.reduce((acc, log) => acc + (Number(log.cost) || 0), 0);
  const totalExpenseCost = expenses.reduce((acc, exp) => acc + (Number(exp.amount) || 0), 0);
  const totalOperationalCost = totalFuelCost + totalExpenseCost;

  // Format currency
  const formatCurrency = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);

  const handleFuelSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await apiRequest('POST', '/fuel', {
        vehicle_id: Number(fuelForm.vehicleId),
        liters: Number(fuelForm.liters),
        cost: Number(fuelForm.cost),
        date: fuelForm.date ? new Date(fuelForm.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]
      });

      setNewFuelId(res.data.id);
      setIsFuelModalOpen(false);
      setFuelForm({ vehicleId: '', date: '', liters: '', cost: '' });
      loadData();
      
      setTimeout(() => setNewFuelId(null), 1000);
    } catch (err) {
      const evt = new CustomEvent('app-toast', { detail: err.message || 'Failed to log fuel', type: 'error' });
      window.dispatchEvent(evt);
    }
  };

  const handleExpenseSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await apiRequest('POST', '/expenses', {
        vehicle_id: Number(expenseForm.vehicleId),
        trip_id: expenseForm.tripId ? Number(expenseForm.tripId) : null,
        description: expenseForm.description,
        amount: Number(expenseForm.amount),
        date: expenseForm.date ? new Date(expenseForm.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]
      });

      setNewExpenseId(res.data.id);
      setIsExpenseModalOpen(false);
      setExpenseForm({ tripId: '', vehicleId: '', description: 'Tolls & Other', amount: '', date: '' });
      loadData();
      
      setTimeout(() => setNewExpenseId(null), 1000);
    } catch (err) {
      const evt = new CustomEvent('app-toast', { detail: err.message || 'Failed to save expense', type: 'error' });
      window.dispatchEvent(evt);
    }
  };

  if (loading) {
    return (
      <div className="flex-col gap-6 w-full h-full p-4">
        <div className="skeleton w-1/4 h-10 mb-4"></div>
        <div className="flex gap-4">
          <div className="skeleton flex-1 h-96"></div>
          <div className="skeleton flex-1 h-96"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="fuel-page">
      <h1 className="fuel-title">Fuel & Expense Management</h1>
      {error && <div className="text-xs text-status-red mb-2">{error}</div>}

      <div className="fe-grid">
        {/* Panel 1: Fuel Log */}
        <div className="fe-card">
          <div className="fe-card-header">
            <div className="fe-card-title">
              Fuel Logs
              <span className="fe-badge">{fuelLogs.length} Entries</span>
            </div>
            <button className="fe-btn-amber" onClick={() => setIsFuelModalOpen(true)}>
              <Plus size={16} /> Log Fuel
            </button>
          </div>
          
          <div className="table-container">
            <table className="fe-table">
              <thead>
                <tr>
                  <th>Vehicle</th>
                  <th>Date</th>
                  <th>Liters</th>
                  <th>Fuel Cost</th>
                </tr>
              </thead>
              <tbody>
                {fuelLogs.map(log => (
                  <tr key={log.id} className={log.id === newFuelId ? 'fe-row-enter' : ''}>
                    <td className="fe-mono text-text-primary font-medium">{log.vehicle_registration || `Veh #${log.vehicle_id}`}</td>
                    <td>{new Date(log.date).toLocaleDateString()}</td>
                    <td className="fe-mono">{log.liters} L</td>
                    <td className="fe-mono font-medium">{formatCurrency(log.cost)}</td>
                  </tr>
                ))}
                {fuelLogs.length === 0 && (
                  <tr>
                    <td colSpan="4" className="text-center py-4 text-xs text-muted">No fuel entries logged yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Panel 2: Other Expenses */}
        <div className="fe-card">
          <div className="fe-card-header">
            <div className="fe-card-title">
              Operational Expenses
              <span className="fe-badge">{expenses.length} Entries</span>
            </div>
            <button className="fe-btn-ghost" onClick={() => setIsExpenseModalOpen(true)}>
              <Plus size={16} /> Add Expense
            </button>
          </div>

          <div className="table-container">
            <table className="fe-table">
              <thead>
                <tr>
                  <th>Trip ID</th>
                  <th>Vehicle</th>
                  <th>Description</th>
                  <th>Date</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map(exp => (
                  <tr key={exp.id} className={exp.id === newExpenseId ? 'fe-row-enter' : ''}>
                    <td className="fe-mono">{exp.trip_id ? `TR-${exp.trip_id}` : 'General'}</td>
                    <td className="fe-mono font-medium">{exp.vehicle_registration || `Veh #${exp.vehicle_id}`}</td>
                    <td>{exp.description}</td>
                    <td>{new Date(exp.date).toLocaleDateString()}</td>
                    <td className="fe-mono font-medium" style={{ color: 'var(--fe-violet)' }}>
                      {formatCurrency(exp.amount)}
                    </td>
                  </tr>
                ))}
                {expenses.length === 0 && (
                  <tr>
                    <td colSpan="5" className="text-center py-4 text-xs text-muted">No general expenses logged yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Bottom Total Bar */}
      <div className="fe-total-bar">
        <div>
          <div className="fe-total-label">Total Operational Cost</div>
          <div className="fe-total-subtext">Fuel + General Expenses</div>
        </div>
        <div className="fe-total-value">
          {formatCurrency(totalOperationalCost)}
        </div>
      </div>

      {/* Fuel Modal */}
      {isFuelModalOpen && createPortal(
        <div className="modal-overlay" style={{ backdropFilter: 'blur(5px)', backgroundColor: 'rgba(67, 43, 56, 0.4)' }} onClick={() => setIsFuelModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2 className="sora-font text-xl mb-4 font-bold">Log Fuel</h2>
            <form onSubmit={handleFuelSubmit}>
              <div className="input-group mb-4">
                <label>Vehicle</label>
                <select required className="select w-full" value={fuelForm.vehicleId} onChange={e => setFuelForm({...fuelForm, vehicleId: e.target.value})}>
                  <option value="" disabled>Select vehicle...</option>
                  {vehicles.map(v => (
                    <option key={v.id} value={v.id}>{v.registration_number} ({v.name})</option>
                  ))}
                </select>
              </div>
              <div className="input-group mb-4">
                <label>Date</label>
                <input required type="date" className="input w-full" value={fuelForm.date} onChange={e => setFuelForm({...fuelForm, date: e.target.value})} />
              </div>
              <div className="flex gap-4 mb-6">
                <div className="input-group flex-1">
                  <label>Liters</label>
                  <input required type="number" className="input w-full" placeholder="40" value={fuelForm.liters} onChange={e => setFuelForm({...fuelForm, liters: e.target.value})} />
                </div>
                <div className="input-group flex-1">
                  <label>Fuel Cost ($)</label>
                  <input required type="number" className="input w-full" placeholder="50" value={fuelForm.cost} onChange={e => setFuelForm({...fuelForm, cost: e.target.value})} />
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <button type="button" className="btn btn-outline" onClick={() => setIsFuelModalOpen(false)}>Cancel</button>
                <button type="submit" className="fe-btn-amber">Log Fuel</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Expense Modal */}
      {isExpenseModalOpen && createPortal(
        <div className="modal-overlay" style={{ backdropFilter: 'blur(5px)', backgroundColor: 'rgba(67, 43, 56, 0.4)' }} onClick={() => setIsExpenseModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2 className="sora-font text-xl mb-4 font-bold">Add Expense</h2>
            <form onSubmit={handleExpenseSubmit}>
              <div className="flex gap-4 mb-4">
                <div className="input-group flex-1">
                  <label>Vehicle</label>
                  <select required className="select w-full" value={expenseForm.vehicleId} onChange={e => setExpenseForm({...expenseForm, vehicleId: e.target.value})}>
                    <option value="" disabled>Select vehicle...</option>
                    {vehicles.map(v => (
                      <option key={v.id} value={v.id}>{v.registration_number} ({v.name})</option>
                    ))}
                  </select>
                </div>
                <div className="input-group flex-1">
                  <label>Linked Trip ID (Optional)</label>
                  <select className="select w-full" value={expenseForm.tripId} onChange={e => setExpenseForm({...expenseForm, tripId: e.target.value})}>
                    <option value="">None (General)</option>
                    {trips.map(t => (
                      <option key={t.id} value={t.id}>TR-{t.id} ({t.source} → {t.destination})</option>
                    ))}
                  </select>
                </div>
              </div>
              
              <div className="input-group mb-4">
                <label>Description</label>
                <input required type="text" className="input w-full" placeholder="e.g. Tolls / Permits / Repairs" value={expenseForm.description} onChange={e => setExpenseForm({...expenseForm, description: e.target.value})} />
              </div>

              <div className="flex gap-4 mb-6">
                <div className="input-group flex-1">
                  <label>Amount ($)</label>
                  <input required type="number" className="input w-full" placeholder="100" value={expenseForm.amount} onChange={e => setExpenseForm({...expenseForm, amount: e.target.value})} />
                </div>
                <div className="input-group flex-1">
                  <label>Date</label>
                  <input required type="date" className="input w-full" value={expenseForm.date} onChange={e => setExpenseForm({...expenseForm, date: e.target.value})} />
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <button type="button" className="btn btn-outline" onClick={() => setIsExpenseModalOpen(false)}>Cancel</button>
                <button type="submit" className="fe-btn-ghost" style={{ backgroundColor: 'var(--fe-violet)', color: 'white' }}>Save Expense</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
