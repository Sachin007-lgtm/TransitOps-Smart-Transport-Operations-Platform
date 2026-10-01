import React, { useState, useEffect, useCallback } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { createPortal } from 'react-dom';
import { apiRequest } from '../utils/api';
import './FuelExpenses.css';

// The consolidated expense ledger (migration 021): one table for every
// operating cost. Fuel = category FUEL with litres + odometer; the km/l on
// each fill comes from the server. This page is the office-side entry point
// — the manager types what the bill image says.

const CATEGORIES = ['FUEL', 'MAINTENANCE', 'TYRES', 'TOLL', 'INSURANCE', 'PERMIT', 'EMI', 'SALARY', 'GARAGE', 'OTHER'];
const CATEGORY_LABELS = {
  FUEL: 'Fuel', MAINTENANCE: 'Maintenance', TYRES: 'Tyres', TOLL: 'Toll',
  INSURANCE: 'Insurance', PERMIT: 'Permit', EMI: 'EMI', SALARY: 'Salary',
  GARAGE: 'Garage', OTHER: 'Other'
};

const today = () => new Date().toISOString().slice(0, 10);

export default function FuelExpenses() {
  const [expenses, setExpenses] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [trips, setTrips] = useState([]);
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  // Modal states
  const [isFuelModalOpen, setIsFuelModalOpen] = useState(false);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);

  // Animation state (id of newly added row)
  const [newId, setNewId] = useState(null);

  // Form states
  const [fuelForm, setFuelForm] = useState({ vehicle_id: '', date: today(), liters: '', cost: '', odometer: '', vendor: '' });
  const [expenseForm, setExpenseForm] = useState({ category: 'MAINTENANCE', vehicle_id: '', trip_id: '', date: today(), amount: '', vendor: '', payment_mode: 'Cash' });

  const formatCurrency = (val) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(val) || 0);

  const fetchExpenses = useCallback(async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    try {
      const res = await apiRequest('GET', '/expenses');
      // apiRequest returns the whole envelope; data carries { expenses, total, categories }.
      setExpenses((res.data && res.data.expenses) || []);
      setError(null);
    } catch (err) {
      // A background refresh hiccup keeps the last good data; only a first
      // load failure surfaces an error.
      if (!isBackground) setError(err.message || 'Could not load expenses.');
    } finally {
      if (!isBackground) setLoading(false);
    }
  }, []);

  // Pickups for the forms: vehicles for the dropdown.
  const fetchPickups = useCallback(async () => {
    try {
      const vRes = await apiRequest('GET', '/vehicles');
      setVehicles((vRes.data && (Array.isArray(vRes.data) ? vRes.data : vRes.data.vehicles)) || []);
    } catch { /* vehicles list is a pickup; the form degrades gracefully */ }
  }, []);

  useEffect(() => {
    fetchExpenses();
    fetchPickups();
    // Auto-refresh like the tracking list: silent merges, no skeleton flash.
    const timer = setInterval(() => fetchExpenses(true), 6000);
    return () => clearInterval(timer);
  }, [fetchExpenses, fetchPickups]);

  const visible = categoryFilter === 'All' ? expenses : expenses.filter((e) => e.category === categoryFilter);
  const totalCost = visible.reduce((acc, e) => acc + (Number(e.amount) || 0), 0);
  const fuelCost = expenses.filter((e) => e.category === 'FUEL').reduce((acc, e) => acc + (Number(e.amount) || 0), 0);
  const maintCost = expenses.filter((e) => e.category === 'MAINTENANCE' || e.category === 'TYRES' || e.category === 'GARAGE').reduce((acc, e) => acc + (Number(e.amount) || 0), 0);

  // Layout check for sidebar width to adjust total bar

  const handleFuelSubmit = async (e) => {
    e.preventDefault();
    if (!fuelForm.vehicle_id || !fuelForm.liters || !fuelForm.cost || !fuelForm.odometer) return;
    setBusy(true);
    try {
      const res = await apiRequest('POST', '/fuel', {
        vehicle_id: fuelForm.vehicle_id,
        description: fuelForm.vendor ? `Diesel — ${fuelForm.vendor}` : 'Diesel fill',
        amount: parseFloat(fuelForm.cost),
        quantity: parseFloat(fuelForm.liters),
        odometer: parseFloat(fuelForm.odometer),
        expense_date: fuelForm.date || undefined,
        vendor: fuelForm.vendor || undefined,
        payment_mode: 'Cash'
      });
      setIsFuelModalOpen(false);
      setFuelForm({ vehicle_id: '', date: today(), liters: '', cost: '', odometer: '', vendor: '' });
      setNewId(res.data.id);
      setTimeout(() => setNewId(null), 1000);
      await fetchExpenses(true);
    } catch (err) {
      setError(err.message || 'Could not log the fuel entry.');
    } finally {
      setBusy(false);
    }
  };

  const handleExpenseSubmit = async (e) => {
    e.preventDefault();
    if (!expenseForm.vehicle_id || !expenseForm.description.trim() || !expenseForm.amount) return;
    setBusy(true);
    try {
      const res = await apiRequest('POST', '/expenses', {
        vehicle_id: expenseForm.vehicle_id,
        category: expenseForm.category,
        description: expenseForm.description.trim(),
        amount: parseFloat(expenseForm.amount),
        expense_date: expenseForm.date || undefined,
        trip_id: expenseForm.trip_id || undefined,
        vendor: expenseForm.vendor || undefined,
        payment_mode: expenseForm.payment_mode
      });
      setIsExpenseModalOpen(false);
      setExpenseForm({ category: 'MAINTENANCE', vehicle_id: '', trip_id: '', date: today(), amount: '', vendor: '', payment_mode: 'Cash' });
      setNewId(res.data.id);
      setTimeout(() => setNewId(null), 1000);
      await fetchExpenses(true);
    } catch (err) {
      setError(err.message || 'Could not log the expense.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fuel-page">
      <h1 className="fuel-title">Fuel & Expense Management</h1>

      {error && <div className="fe-error" role="alert">{error}</div>}

      <div className="fe-toolbar">
        <div className="fe-filter-group">
          <label className="fe-filter-label">Category</label>
          <select className="select" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="All">All categories</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
          </select>
        </div>
        <div className="fe-toolbar-actions">
          <button className="fe-btn-ghost" onClick={() => setIsExpenseModalOpen(true)}>
            <Plus size={16} /> Add Expense
          </button>
          <button className="fe-btn-amber" onClick={() => setIsFuelModalOpen(true)}>
            <Plus size={16} /> Log Fuel
          </button>
        </div>
      </div>

      <div className="fe-grid">
        {/* The ledger: every cost, newest first */}
        <div className="fe-card" style={{ gridColumn: '1 / -1' }}>
          <div className="fe-card-header">
            <div className="fe-card-title">
              Expense Ledger
              <span className="fe-badge">{loading ? '…' : `${visible.length} Entries`}</span>
            </div>
            <button className="fe-btn-ghost" onClick={() => fetchExpenses(true)} title="Refresh">
              <RefreshCw size={15} />
            </button>
          </div>

          <div className="table-container">
            <table className="fe-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Category</th>
                  <th>Description</th>
                  <th>Vehicle</th>
                  <th>Trip</th>
                  <th>Odometer</th>
                  <th>km/l</th>
                  <th>Vendor</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={9} className="fe-empty">Loading…</td></tr>
                )}
                {!loading && visible.length === 0 && (
                  <tr><td colSpan={9} className="fe-empty">No expenses logged yet — use Log Fuel or Add Expense.</td></tr>
                )}
                {!loading && visible.map((exp) => (
                  <tr key={exp.id} className={exp.id === newId ? 'fe-row-enter' : ''}>
                    <td className="fe-mono">{exp.expense_date}</td>
                    <td>
                      <span className="fe-pill fe-pill-blue">{CATEGORY_LABELS[exp.category] || exp.category}</span>
                    </td>
                    <td>{exp.description}</td>
                    <td className="fe-mono font-medium">{exp.vehicle_registration}</td>
                    <td className="fe-mono">{exp.trip_id ? `${String(exp.trip_id).slice(0, 8)}` : '—'}</td>
                    <td className="fe-mono">{exp.odometer != null ? `${Number(exp.odometer).toLocaleString('en-IN')} km` : '—'}</td>
                    <td className="fe-mono">{exp.km_per_litre != null ? exp.km_per_litre : '—'}</td>
                    <td>{exp.vendor || '—'}</td>
                    <td className="fe-mono font-medium">{formatCurrency(exp.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Bottom Total Bar */}
      <div className="fe-total-bar">
        <div>
          <div className="fe-total-label">Total Cost (filtered)</div>
          <div className="fe-total-subtext">Fuel {formatCurrency(fuelCost)} · Maintenance/Tyres/Garage {formatCurrency(maintCost)}</div>
        </div>
        <div className="fe-total-value">
          {formatCurrency(totalCost)}
        </div>
      </div>

      {/* Fuel Modal — the pump bill, typed in */}
      {isFuelModalOpen && createPortal(
        <div className="modal-overlay" style={{ backdropFilter: 'blur(5px)', backgroundColor: 'rgba(67, 43, 56, 0.4)' }} onClick={() => setIsFuelModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 className="sora-font text-xl mb-4 font-bold">Log Fuel</h2>
            <p className="fe-modal-hint">From the pump bill: litres, amount, and the odometer reading.</p>
            <form onSubmit={handleFuelSubmit}>
              <div className="input-group mb-4">
                <label>Vehicle</label>
                <select required className="select w-full" value={fuelForm.vehicle_id} onChange={(e) => setFuelForm({ ...fuelForm, vehicle_id: e.target.value })}>
                  <option value="">Select vehicle…</option>
                  {vehicles.map((v) => <option key={v.id} value={v.id}>{v.registration_number} ({v.type})</option>)}
                </select>
              </div>
              <div className="flex gap-4 mb-4">
                <div className="input-group flex-1">
                  <label>Date</label>
                  <input required type="date" className="input w-full" value={fuelForm.date} onChange={(e) => setFuelForm({ ...fuelForm, date: e.target.value })} />
                </div>
                <div className="input-group flex-1">
                  <label>Odometer (km)</label>
                  <input required type="number" min="1" step="0.1" className="input w-full" placeholder="45200" value={fuelForm.odometer} onChange={(e) => setFuelForm({ ...fuelForm, odometer: e.target.value })} />
                </div>
              </div>
              <div className="flex gap-4 mb-4">
                <div className="input-group flex-1">
                  <label>Litres</label>
                  <input required type="number" min="1" step="0.1" className="input w-full" placeholder="40" value={fuelForm.liters} onChange={(e) => setFuelForm({ ...fuelForm, liters: e.target.value })} />
                </div>
                <div className="input-group flex-1">
                  <label>Amount (₹)</label>
                  <input required type="number" min="1" step="0.01" className="input w-full" placeholder="3000" value={fuelForm.cost} onChange={(e) => setFuelForm({ ...fuelForm, cost: e.target.value })} />
                </div>
              </div>
              <div className="input-group mb-6">
                <label>Pump / vendor (optional)</label>
                <input type="text" className="input w-full" placeholder="e.g. HP Petrol Pump, Ajmer Road" value={fuelForm.vendor} onChange={(e) => setFuelForm({ ...fuelForm, vendor: e.target.value })} />
              </div>
              <div className="flex justify-end gap-3">
                <button type="button" className="btn btn-outline" onClick={() => setIsFuelModalOpen(false)}>Cancel</button>
                <button type="submit" className="fe-btn-amber" disabled={busy}>{busy ? 'Saving…' : 'Log Fuel'}</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Expense Modal — every other cost */}
      {isExpenseModalOpen && createPortal(
        <div className="modal-overlay" style={{ backdropFilter: 'blur(5px)', backgroundColor: 'rgba(67, 43, 56, 0.4)' }} onClick={() => setIsExpenseModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 className="sora-font text-xl mb-4 font-bold">Add Expense</h2>
            <form onSubmit={handleExpenseSubmit}>
              <div className="flex gap-4 mb-4">
                <div className="input-group flex-1">
                  <label>Category</label>
                  <select className="select w-full" value={expenseForm.category} onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}>
                    {CATEGORIES.filter((c) => c !== 'FUEL').map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                  </select>
                </div>
                <div className="input-group flex-1">
                  <label>Vehicle</label>
                  <select required className="select w-full" value={expenseForm.vehicle_id} onChange={(e) => setExpenseForm({ ...expenseForm, vehicle_id: e.target.value })}>
                    <option value="">Select vehicle…</option>
                    {vehicles.map((v) => <option key={v.id} value={v.id}>{v.registration_number} ({v.type})</option>)}
                  </select>
                </div>
              </div>

              <div className="input-group mb-4">
                <label>Description</label>
                <input required type="text" className="input w-full" placeholder="e.g. Brake pads + labour" value={expenseForm.description} onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })} />
              </div>

              <div className="flex gap-4 mb-4">
                <div className="input-group flex-1">
                  <label>Date</label>
                  <input required type="date" className="input w-full" value={expenseForm.date} onChange={(e) => setExpenseForm({ ...expenseForm, date: e.target.value })} />
                </div>
                <div className="input-group flex-1">
                  <label>Amount (₹)</label>
                  <input required type="number" min="1" step="0.01" className="input w-full" placeholder="6500" value={expenseForm.amount} onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })} />
                </div>
              </div>

              <div className="flex gap-4 mb-6">
                <div className="input-group flex-1">
                  <label>Vendor (optional)</label>
                  <input type="text" className="input w-full" placeholder="e.g. Sharma Auto Works" value={expenseForm.vendor} onChange={(e) => setExpenseForm({ ...expenseForm, vendor: e.target.value })} />
                </div>
                <div className="input-group flex-1">
                  <label>Paid by</label>
                  <select className="select w-full" value={expenseForm.payment_mode} onChange={(e) => setExpenseForm({ ...expenseForm, payment_mode: e.target.value })}>
                    {['Cash', 'UPI', 'NEFT', 'IMPS', 'RTGS', 'Cheque', 'Bank Transfer', 'Fuel Card', 'Other'].map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <button type="button" className="btn btn-outline" onClick={() => setIsExpenseModalOpen(false)}>Cancel</button>
                <button type="submit" className="fe-btn-ghost" style={{ backgroundColor: 'var(--fe-violet)', color: 'white' }} disabled={busy}>{busy ? 'Saving…' : 'Save Expense'}</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
