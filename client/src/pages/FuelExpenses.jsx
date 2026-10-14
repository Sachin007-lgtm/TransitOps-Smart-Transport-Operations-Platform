import React, { useState, useEffect, useCallback } from 'react';
import { Plus, RefreshCw, FileText, ChevronDown } from 'lucide-react';
import { createPortal } from 'react-dom';
import { apiRequest, apiOpenDocument, apiDownloadFile } from '../utils/api';
import { tripCode } from '../utils/tripCode';
import PageToolbar from '../components/common/PageToolbar';
import StatStrip from '../components/common/StatStrip';
import SideDrawer from '../components/common/SideDrawer';
import './FuelExpenses.css';

const PRIMARY_CATEGORIES = ['All', 'FUEL', 'MAINTENANCE', 'TOLL', 'OTHER'];
const MORE_CATEGORIES = ['TYRES', 'INSURANCE', 'PERMIT', 'EMI', 'SALARY', 'GARAGE'];
const ALL_CATEGORIES = ['FUEL', 'MAINTENANCE', 'TYRES', 'TOLL', 'INSURANCE', 'PERMIT', 'EMI', 'SALARY', 'GARAGE', 'OTHER'];

const CATEGORY_LABELS = {
  FUEL: 'Fuel',
  MAINTENANCE: 'Maintenance',
  TYRES: 'Tyres',
  TOLL: 'Toll',
  INSURANCE: 'Insurance',
  PERMIT: 'Permit',
  EMI: 'EMI',
  SALARY: 'Salary',
  GARAGE: 'Garage',
  OTHER: 'Other'
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

  // Drawer / Modal states
  const [isFuelDrawerOpen, setIsFuelDrawerOpen] = useState(false);
  const [isExpenseDrawerOpen, setIsExpenseDrawerOpen] = useState(false);
  const [isBillModalOpen, setIsBillModalOpen] = useState(false);

  // Monthly bill state
  const currentMonth = () => new Date().toISOString().slice(0, 7);
  const [billMonth, setBillMonth] = useState(currentMonth());
  const [billData, setBillData] = useState(null);
  const [billLoading, setBillLoading] = useState(false);

  // Animation state (id of newly added row)
  const [newId, setNewId] = useState(null);

  // Form states
  const [fuelForm, setFuelForm] = useState({
    vehicle_id: '',
    date: today(),
    liters: '',
    cost: '',
    odometer: '',
    vendor: '',
    trip_id: ''
  });

  const [expenseForm, setExpenseForm] = useState({
    category: 'MAINTENANCE',
    vehicle_id: '',
    trip_id: '',
    date: today(),
    amount: '',
    description: '',
    vendor: '',
    payment_mode: 'Cash'
  });

  const formatCurrency = (val) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(
      Number(val) || 0
    );

  const fetchExpenses = useCallback(async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    try {
      const res = await apiRequest('GET', '/expenses');
      setExpenses((res.data && res.data.expenses) || []);
      setError(null);
    } catch (err) {
      if (!isBackground) setError(err.message || 'Could not load expenses.');
    } finally {
      if (!isBackground) setLoading(false);
    }
  }, []);

  const fetchPickups = useCallback(async () => {
    try {
      const vRes = await apiRequest('GET', '/vehicles');
      setVehicles((vRes.data && (Array.isArray(vRes.data) ? vRes.data : vRes.data.vehicles)) || []);
    } catch {
      /* pickup gracefully falls back */
    }
    try {
      const tRes = await apiRequest('GET', '/trips');
      const tData = tRes.data && (Array.isArray(tRes.data) ? tRes.data : tRes.data.trips);
      setTrips(Array.isArray(tData) ? tData : (tData && tData.trips) || []);
    } catch {
      /* pickup gracefully falls back */
    }
  }, []);

  useEffect(() => {
    fetchExpenses();
    fetchPickups();
    const timer = setInterval(() => fetchExpenses(true), 15000);
    return () => clearInterval(timer);
  }, [fetchExpenses, fetchPickups]);

  // Filtered dataset
  const visible = categoryFilter === 'All' ? expenses : expenses.filter((e) => e.category === categoryFilter);

  // Calculated totals
  const totalCost = visible.reduce((acc, e) => acc + (Number(e.amount) || 0), 0);
  const fuelCost = expenses
    .filter((e) => e.category === 'FUEL')
    .reduce((acc, e) => acc + (Number(e.amount) || 0), 0);
  const maintCost = expenses
    .filter((e) => ['MAINTENANCE', 'TYRES', 'GARAGE'].includes(e.category))
    .reduce((acc, e) => acc + (Number(e.amount) || 0), 0);
  const otherCost = expenses
    .filter((e) => !['FUEL', 'MAINTENANCE', 'TYRES', 'GARAGE'].includes(e.category))
    .reduce((acc, e) => acc + (Number(e.amount) || 0), 0);
  const totalLitres = expenses
    .filter((e) => e.category === 'FUEL')
    .reduce((acc, e) => acc + (Number(e.quantity || e.litres || e.liters) || 0), 0);

  // Smart column visibility:
  // Show Odometer & Mileage only under FUEL filter or when rows contain odometer data
  const hasOdometerData = visible.some((e) => e.odometer != null);
  const showMileageCols = categoryFilter === 'FUEL' || hasOdometerData;
  const showVendorCol = visible.some((e) => Boolean(e.vendor)) || ['FUEL', 'MAINTENANCE'].includes(categoryFilter);

  // Column count for colspan
  let colCount = 5; // Date, Category, Description, Vehicle, Trip, Amount
  if (showMileageCols) colCount += 2; // Odometer, Mileage
  if (showVendorCol) colCount += 1; // Vendor

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
        trip_id: fuelForm.trip_id || undefined,
        vendor: fuelForm.vendor || undefined,
        payment_mode: 'Cash'
      });
      setIsFuelDrawerOpen(false);
      setFuelForm({ vehicle_id: '', date: today(), liters: '', cost: '', odometer: '', vendor: '', trip_id: '' });
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
      setIsExpenseDrawerOpen(false);
      setExpenseForm({
        category: 'MAINTENANCE',
        vehicle_id: '',
        trip_id: '',
        date: today(),
        amount: '',
        description: '',
        vendor: '',
        payment_mode: 'Cash'
      });
      setNewId(res.data.id);
      setTimeout(() => setNewId(null), 1000);
      await fetchExpenses(true);
    } catch (err) {
      setError(err.message || 'Could not log the expense.');
    } finally {
      setBusy(false);
    }
  };

  const fetchMonthlyBill = useCallback(async (month) => {
    if (!month) return;
    setBillLoading(true);
    try {
      const res = await apiRequest('GET', `/expenses/monthly-bill?month=${encodeURIComponent(month)}`);
      setBillData(res.data);
      setError(null);
    } catch (err) {
      setBillData(null);
      setError(err.message || 'Could not build the monthly bill.');
    } finally {
      setBillLoading(false);
    }
  }, []);

  const openBillModal = () => {
    setIsBillModalOpen(true);
    fetchMonthlyBill(billMonth);
  };

  const monthLabel = (ym) => {
    if (!ym) return '';
    const [y, m] = ym.split('-');
    const names = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return `${names[Number(m) - 1]} ${y}`;
  };

  const isMoreActive = MORE_CATEGORIES.includes(categoryFilter);

  return (
    <div className="fuel-page fade-in">
      {/* 1. Page Toolbar */}
      <PageToolbar
        title="Fuel & Expenses"
        tooltip="Consolidated operating-cost ledger: fuel fills, maintenance, tolls and company expenses."
        actions={
          <>
            <button
              className="btn btn-outline"
              onClick={openBillModal}
              title="Open monthly summary bill"
              style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem' }}
            >
              <FileText size={14} /> Monthly Bill
            </button>
            <button
              className="btn btn-outline"
              onClick={() => setIsExpenseDrawerOpen(true)}
              style={{ padding: '0.4rem 0.85rem', fontSize: '0.8rem' }}
            >
              <Plus size={14} /> Add Expense
            </button>
            <button
              className="btn btn-primary"
              onClick={() => setIsFuelDrawerOpen(true)}
              style={{ padding: '0.4rem 0.85rem', fontSize: '0.8rem' }}
            >
              <Plus size={14} /> Log Fuel
            </button>
          </>
        }
      >
        {/* Category Chips Bar (Single Line) */}
        <div className="category-filter-bar">
          {PRIMARY_CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              className={`filter-chip ${categoryFilter === cat ? 'active' : ''}`}
              onClick={() => setCategoryFilter(cat)}
            >
              {cat === 'All' ? 'All' : CATEGORY_LABELS[cat] || cat}
            </button>
          ))}

          {/* More Categories Dropdown */}
          <select
            className={`category-more-select ${isMoreActive ? 'active' : ''}`}
            value={isMoreActive ? categoryFilter : ''}
            onChange={(e) => {
              if (e.target.value) setCategoryFilter(e.target.value);
            }}
          >
            <option value="" disabled={!isMoreActive}>
              {isMoreActive ? `More: ${CATEGORY_LABELS[categoryFilter] || categoryFilter}` : 'More ▾'}
            </option>
            {MORE_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {CATEGORY_LABELS[cat]}
              </option>
            ))}
          </select>
        </div>
      </PageToolbar>

      {/* 2. Slim StatStrip */}
      <StatStrip
        items={[
          { label: 'Total', value: formatCurrency(totalCost), isDimmed: totalCost === 0 },
          {
            label: 'Fuel',
            value: `${formatCurrency(fuelCost)}${totalLitres > 0 ? ` (${Number(totalLitres).toLocaleString('en-IN')} L)` : ''}`,
            color: fuelCost > 0 ? '#c97514' : undefined,
            isDimmed: fuelCost === 0
          },
          {
            label: 'Maintenance',
            value: formatCurrency(maintCost),
            color: maintCost > 0 ? '#2563eb' : undefined,
            isDimmed: maintCost === 0
          },
          {
            label: 'Other',
            value: formatCurrency(otherCost),
            color: otherCost > 0 ? '#5c3a4c' : undefined,
            isDimmed: otherCost === 0
          }
        ]}
      />

      {error && (
        <div className="fe-error" role="alert">
          {error}
        </div>
      )}

      {/* 3. Dense Ledger Table (Starts immediately at y≈170) */}
      <div className="dense-table-wrapper">
        <div className="dense-table-scroll">
          <table className="dense-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Category</th>
                <th>Description</th>
                <th>Vehicle</th>
                <th>Trip</th>
                {showMileageCols && <th>Odometer</th>}
                {showMileageCols && <th>Mileage</th>}
                {showVendorCol && <th>Vendor</th>}
                <th className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={colCount} style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--sub)' }}>
                    Loading expense ledger…
                  </td>
                </tr>
              )}
              {!loading && visible.length === 0 && (
                <tr>
                  <td colSpan={colCount} style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--sub)' }}>
                    No expenses logged yet under current filter.
                  </td>
                </tr>
              )}
              {!loading &&
                visible.map((exp) => (
                  <tr key={exp.id} className={exp.id === newId ? 'fe-row-enter' : ''}>
                    <td className="mono">{exp.expense_date}</td>
                    <td>
                      <span
                        className={`fe-pill ${
                          exp.category === 'FUEL'
                            ? 'fe-pill-fuel'
                            : ['MAINTENANCE', 'TYRES', 'GARAGE'].includes(exp.category)
                            ? 'fe-pill-maint'
                            : 'fe-pill-other'
                        }`}
                      >
                        {CATEGORY_LABELS[exp.category] || exp.category}
                      </span>
                    </td>
                    <td style={{ fontWeight: 500 }}>{exp.description}</td>
                    <td className="mono" style={{ fontWeight: 600 }}>{exp.vehicle_registration}</td>
                    <td className="mono">{exp.trip_id ? tripCode(exp.trip_id) : '—'}</td>
                    {showMileageCols && (
                      <td className="mono">
                        {exp.odometer != null ? `${Number(exp.odometer).toLocaleString('en-IN')} km` : '—'}
                      </td>
                    )}
                    {showMileageCols && (
                      <td className="mono">
                        {exp.km_per_litre != null
                          ? `${exp.distance_since_prev != null ? `${Number(exp.distance_since_prev).toLocaleString('en-IN')} km · ` : ''}${exp.km_per_litre} km/l`
                          : '—'}
                      </td>
                    )}
                    {showVendorCol && <td>{exp.vendor || '—'}</td>}
                    <td className="num" style={{ fontWeight: 700 }}>
                      {formatCurrency(exp.amount)}
                    </td>
                  </tr>
                ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={colCount - 1} style={{ textAlign: 'right' }}>
                  Filtered Total:
                </td>
                <td className="num">{formatCurrency(totalCost)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* 4. SideDrawer: Log Fuel Fill */}
      <SideDrawer
        isOpen={isFuelDrawerOpen}
        onClose={() => setIsFuelDrawerOpen(false)}
        title="Log Fuel Fill"
        subtitle="From the pump bill: litres, amount, and odometer reading"
      >
        <form onSubmit={handleFuelSubmit}>
          <div className="input-group mb-4">
            <label>Vehicle *</label>
            <select
              required
              className="select w-full"
              value={fuelForm.vehicle_id}
              onChange={(e) => setFuelForm({ ...fuelForm, vehicle_id: e.target.value })}
            >
              <option value="">Select vehicle…</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.registration_number} ({v.type})
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
            <div className="input-group">
              <label>Date *</label>
              <input
                required
                type="date"
                className="input w-full"
                value={fuelForm.date}
                onChange={(e) => setFuelForm({ ...fuelForm, date: e.target.value })}
              />
            </div>
            <div className="input-group">
              <label>Odometer (km) *</label>
              <input
                required
                type="number"
                min="1"
                step="0.1"
                className="input w-full"
                placeholder="45200"
                value={fuelForm.odometer}
                onChange={(e) => setFuelForm({ ...fuelForm, odometer: e.target.value })}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
            <div className="input-group">
              <label>Litres *</label>
              <input
                required
                type="number"
                min="0.1"
                step="0.01"
                className="input w-full"
                placeholder="40"
                value={fuelForm.liters}
                onChange={(e) => setFuelForm({ ...fuelForm, liters: e.target.value })}
              />
            </div>
            <div className="input-group">
              <label>Amount (₹) *</label>
              <input
                required
                type="number"
                min="1"
                step="0.01"
                className="input w-full"
                placeholder="3000"
                value={fuelForm.cost}
                onChange={(e) => setFuelForm({ ...fuelForm, cost: e.target.value })}
              />
            </div>
          </div>

          <div className="input-group mb-4">
            <label>Pump / Vendor (optional)</label>
            <input
              type="text"
              className="input w-full"
              placeholder="e.g. HP Petrol Pump, Ajmer Road"
              value={fuelForm.vendor}
              onChange={(e) => setFuelForm({ ...fuelForm, vendor: e.target.value })}
            />
          </div>

          <div className="input-group mb-6">
            <label>Trip (optional — auto-detected if during one)</label>
            <select
              className="select w-full"
              value={fuelForm.trip_id}
              onChange={(e) => setFuelForm({ ...fuelForm, trip_id: e.target.value })}
            >
              <option value="">Detect automatically</option>
              {trips
                .filter((t) => !fuelForm.vehicle_id || t.vehicle_id === fuelForm.vehicle_id)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {tripCode(t.id)} · {t.origin} → {t.destination} · {t.status}
                  </option>
                ))}
            </select>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', paddingTop: '1rem', borderTop: '1px solid var(--line)' }}>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setIsFuelDrawerOpen(false)}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Saving…' : 'Log Fuel'}
            </button>
          </div>
        </form>
      </SideDrawer>

      {/* 5. SideDrawer: Add General Expense */}
      <SideDrawer
        isOpen={isExpenseDrawerOpen}
        onClose={() => setIsExpenseDrawerOpen(false)}
        title="Add Expense"
        subtitle="Record tolls, maintenance, insurance, permits, salary, garage, etc."
      >
        <form onSubmit={handleExpenseSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
            <div className="input-group">
              <label>Category *</label>
              <select
                className="select w-full"
                value={expenseForm.category}
                onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}
              >
                {ALL_CATEGORIES.filter((c) => c !== 'FUEL').map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </div>
            <div className="input-group">
              <label>Vehicle *</label>
              <select
                required
                className="select w-full"
                value={expenseForm.vehicle_id}
                onChange={(e) => setExpenseForm({ ...expenseForm, vehicle_id: e.target.value })}
              >
                <option value="">Select vehicle…</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.registration_number} ({v.type})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="input-group mb-4">
            <label>Description *</label>
            <input
              required
              type="text"
              className="input w-full"
              placeholder="e.g. Brake pads + labour / Toll plaza fee"
              value={expenseForm.description}
              onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
            <div className="input-group">
              <label>Date *</label>
              <input
                required
                type="date"
                className="input w-full"
                value={expenseForm.date}
                onChange={(e) => setExpenseForm({ ...expenseForm, date: e.target.value })}
              />
            </div>
            <div className="input-group">
              <label>Amount (₹) *</label>
              <input
                required
                type="number"
                min="1"
                step="0.01"
                className="input w-full"
                placeholder="6500"
                value={expenseForm.amount}
                onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.25rem' }}>
            <div className="input-group">
              <label>Vendor (optional)</label>
              <input
                type="text"
                className="input w-full"
                placeholder="e.g. Sharma Auto Works"
                value={expenseForm.vendor}
                onChange={(e) => setExpenseForm({ ...expenseForm, vendor: e.target.value })}
              />
            </div>
            <div className="input-group">
              <label>Payment Mode</label>
              <select
                className="select w-full"
                value={expenseForm.payment_mode}
                onChange={(e) => setExpenseForm({ ...expenseForm, payment_mode: e.target.value })}
              >
                {['Cash', 'UPI', 'NEFT', 'IMPS', 'RTGS', 'Cheque', 'Bank Transfer', 'Fuel Card', 'Other'].map(
                  (m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  )
                )}
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', paddingTop: '1rem', borderTop: '1px solid var(--line)' }}>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setIsExpenseDrawerOpen(false)}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Saving…' : 'Save Expense'}
            </button>
          </div>
        </form>
      </SideDrawer>

      {/* 6. Monthly Bill Modal */}
      {isBillModalOpen &&
        createPortal(
          <div
            className="modal-overlay"
            style={{ backdropFilter: 'blur(4px)', backgroundColor: 'rgba(30, 20, 28, 0.45)' }}
            onClick={() => setIsBillModalOpen(false)}
          >
            <div
              className="modal-content"
              style={{ maxWidth: '680px', borderRadius: '12px' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 className="heading text-xl">Monthly Bill</h3>
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => setIsBillModalOpen(false)}
                >
                  ✕
                </button>
              </div>
              <p className="text-xs text-muted mb-4">
                Full operating ledger breakdown for {monthLabel(billMonth)}. Export or download printable HTML document.
              </p>

              <div className="flex gap-3 mb-4 items-end">
                <div className="input-group flex-1">
                  <label>Select Month</label>
                  <input
                    type="month"
                    className="input w-full"
                    value={billMonth}
                    onChange={(e) => {
                      setBillMonth(e.target.value);
                      fetchMonthlyBill(e.target.value);
                    }}
                  />
                </div>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => apiOpenDocument(`/expenses/monthly-bill/${billMonth}/download`)}
                  disabled={billLoading}
                >
                  Print / Preview
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() =>
                    apiDownloadFile(`/expenses/monthly-bill/${billMonth}/download`, `expense-bill-${billMonth}.html`)
                  }
                  disabled={billLoading}
                >
                  Download
                </button>
              </div>

              {billLoading && <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--sub)' }}>Building {monthLabel(billMonth)}…</div>}
              {!billLoading && !billData && (
                <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--sub)' }}>No data for {monthLabel(billMonth)}.</div>
              )}

              {!billLoading && billData && (
                <>
                  <div style={{ maxHeight: '240px', overflowY: 'auto', border: '1px solid var(--line)', borderRadius: '6px', marginBottom: '1rem' }}>
                    <table className="dense-table">
                      <thead>
                        <tr>
                          <th>Category</th>
                          <th>Entries</th>
                          <th>Litres</th>
                          <th>Odometer Span</th>
                          <th className="num">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {billData.breakdown.length === 0 && (
                          <tr>
                            <td colSpan={5} style={{ textAlign: 'center', padding: '1rem', color: 'var(--sub)' }}>
                              No expenses logged in {monthLabel(billMonth)}.
                            </td>
                          </tr>
                        )}
                        {billData.breakdown.map((b) => (
                          <tr key={b.category}>
                            <td>
                              <span className="fe-pill fe-pill-maint">
                                {CATEGORY_LABELS[b.category] || b.category}
                              </span>
                            </td>
                            <td className="mono">{b.entry_count}</td>
                            <td className="mono">
                              {Number(b.litres) > 0 ? `${Number(b.litres).toLocaleString('en-IN')} L` : '—'}
                            </td>
                            <td className="mono">
                              {Number(b.first_odometer) > 0
                                ? `${Number(b.first_odometer).toLocaleString('en-IN')} – ${Number(b.last_odometer).toLocaleString('en-IN')}`
                                : '—'}
                            </td>
                            <td className="num" style={{ fontWeight: 600 }}>{formatCurrency(b.total_amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', background: 'var(--bg)', borderRadius: '6px' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--sub)' }}>
                      {billData.entries.length} line items ({billData.from_date} to {billData.to_date})
                    </div>
                    <div style={{ fontSize: '1.15rem', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                      Total: {formatCurrency(billData.total)}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
