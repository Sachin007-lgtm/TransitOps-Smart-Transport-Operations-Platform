import React, { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { createPortal } from 'react-dom';
import './FuelExpenses.css';

const initialFuelLogs = [
  { id: '1', vehicle: 'VAN-05', date: '05 Jul 2026', liters: 42, cost: 3150 },
  { id: '2', vehicle: 'TRUCK-11', date: '06 Jul 2026', liters: 110, cost: 8400 },
  { id: '3', vehicle: 'MINI-08', date: '06 Jul 2026', liters: 28, cost: 2050 }
];

const initialOtherExpenses = [
  { id: '101', trip: 'TR001', vehicle: 'VAN-05', toll: 120, other: 0, maintLinked: 0, status: 'Available' },
  { id: '102', trip: 'TR002', vehicle: 'TRK-12', toll: 340, other: 150, maintLinked: 15000, status: 'Completed' }
];

export default function FuelExpenses() {
  const [fuelLogs, setFuelLogs] = useState(initialFuelLogs);
  const [otherExpenses, setOtherExpenses] = useState(initialOtherExpenses);
  
  // Modal states
  const [isFuelModalOpen, setIsFuelModalOpen] = useState(false);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  
  // Animation states (IDs of newly added rows)
  const [newFuelId, setNewFuelId] = useState(null);
  const [newExpenseId, setNewExpenseId] = useState(null);

  // Form states
  const [fuelForm, setFuelForm] = useState({ vehicle: '', date: '', liters: '', cost: '' });
  const [expenseForm, setExpenseForm] = useState({ trip: '', vehicle: '', toll: '', other: '', maintLinked: '', status: 'Available' });

  // Calculate totals
  const totalFuelCost = fuelLogs.reduce((acc, log) => acc + (Number(log.cost) || 0), 0);
  const totalMaintCost = otherExpenses.reduce((acc, exp) => acc + (Number(exp.maintLinked) || 0), 0);
  const totalOperationalCost = totalFuelCost + totalMaintCost;

  // Format currency
  const formatCurrency = (val) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val);

  // Layout check for sidebar width to adjust total bar
  const [sidebarWidth, setSidebarWidth] = useState(216);
  useEffect(() => {
    // A bit of a hack to sync bottom bar with sidebar state without global context
    const checkSidebar = () => {
      const sidebar = document.querySelector('.sidebar');
      if (sidebar) {
        setSidebarWidth(sidebar.classList.contains('collapsed') ? 72 : 216);
      }
    };
    const observer = new MutationObserver(checkSidebar);
    const sidebarNode = document.querySelector('.sidebar');
    if (sidebarNode) {
      observer.observe(sidebarNode, { attributes: true, attributeFilter: ['class'] });
      checkSidebar();
    }
    return () => observer.disconnect();
  }, []);

  const handleFuelSubmit = (e) => {
    e.preventDefault();
    const newEntry = {
      id: Date.now().toString(),
      vehicle: fuelForm.vehicle,
      date: fuelForm.date,
      liters: Number(fuelForm.liters),
      cost: Number(fuelForm.cost)
    };
    setFuelLogs([newEntry, ...fuelLogs]);
    setNewFuelId(newEntry.id);
    setIsFuelModalOpen(false);
    setFuelForm({ vehicle: '', date: '', liters: '', cost: '' });
    
    // Clear animation class after delay
    setTimeout(() => setNewFuelId(null), 1000);
  };

  const handleExpenseSubmit = (e) => {
    e.preventDefault();
    const newEntry = {
      id: Date.now().toString(),
      trip: expenseForm.trip,
      vehicle: expenseForm.vehicle,
      toll: Number(expenseForm.toll) || 0,
      other: Number(expenseForm.other) || 0,
      maintLinked: Number(expenseForm.maintLinked) || 0,
      status: expenseForm.status
    };
    setOtherExpenses([newEntry, ...otherExpenses]);
    setNewExpenseId(newEntry.id);
    setIsExpenseModalOpen(false);
    setExpenseForm({ trip: '', vehicle: '', toll: '', other: '', maintLinked: '', status: 'Available' });
    
    setTimeout(() => setNewExpenseId(null), 1000);
  };

  return (
    <div className="fuel-page">
      <h1 className="fuel-title">Fuel & Expense Management</h1>

      <div className="fe-grid">
        {/* Panel 1: Fuel Loss */}
        <div className="fe-card">
          <div className="fe-card-header">
            <div className="fe-card-title">
              Fuel Loss
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
                    <td className="fe-mono text-text-primary font-medium">{log.vehicle}</td>
                    <td>{log.date}</td>
                    <td className="fe-mono">{log.liters} L</td>
                    <td className="fe-mono font-medium">{formatCurrency(log.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Panel 2: Other Expenses */}
        <div className="fe-card">
          <div className="fe-card-header">
            <div className="fe-card-title">
              Other Expenses <span style={{fontSize: '0.9rem', opacity: 0.6, fontWeight: 400}}>— toll / misc</span>
              <span className="fe-badge">{otherExpenses.length} Entries</span>
            </div>
            <button className="fe-btn-ghost" onClick={() => setIsExpenseModalOpen(true)}>
              <Plus size={16} /> Add Expense
            </button>
          </div>

          <div className="table-container">
            <table className="fe-table">
              <thead>
                <tr>
                  <th>Trip</th>
                  <th>Vehicle</th>
                  <th>Toll</th>
                  <th>Other</th>
                  <th>Maint. (Linked)</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {otherExpenses.map(exp => (
                  <tr key={exp.id} className={exp.id === newExpenseId ? 'fe-row-enter' : ''}>
                    <td className="fe-mono">{exp.trip}</td>
                    <td className="fe-mono font-medium">{exp.vehicle}</td>
                    <td className="fe-mono">{formatCurrency(exp.toll)}</td>
                    <td className="fe-mono">{formatCurrency(exp.other)}</td>
                    <td className="fe-mono font-medium" style={{ color: exp.maintLinked > 0 ? 'var(--fe-violet)' : 'inherit' }}>
                      {formatCurrency(exp.maintLinked)}
                    </td>
                    <td>
                      {exp.status === 'Completed' ? (
                        <span className="fe-pill fe-pill-green">Completed</span>
                      ) : (
                        <span className="fe-pill fe-pill-blue">Available</span>
                      )}
                    </td>
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
          <div className="fe-total-label">Total Operational Cost</div>
          <div className="fe-total-subtext">Fuel + Maintenance (linked)</div>
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
                <input required type="text" className="input w-full" placeholder="e.g. VAN-05" value={fuelForm.vehicle} onChange={e => setFuelForm({...fuelForm, vehicle: e.target.value})} />
              </div>
              <div className="input-group mb-4">
                <label>Date</label>
                <input required type="text" className="input w-full" placeholder="e.g. 07 Jul 2026" value={fuelForm.date} onChange={e => setFuelForm({...fuelForm, date: e.target.value})} />
              </div>
              <div className="flex gap-4 mb-6">
                <div className="input-group flex-1">
                  <label>Liters</label>
                  <input required type="number" className="input w-full" placeholder="40" value={fuelForm.liters} onChange={e => setFuelForm({...fuelForm, liters: e.target.value})} />
                </div>
                <div className="input-group flex-1">
                  <label>Fuel Cost (₹)</label>
                  <input required type="number" className="input w-full" placeholder="3000" value={fuelForm.cost} onChange={e => setFuelForm({...fuelForm, cost: e.target.value})} />
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
                  <label>Trip ID</label>
                  <input required type="text" className="input w-full" placeholder="e.g. TR003" value={expenseForm.trip} onChange={e => setExpenseForm({...expenseForm, trip: e.target.value})} />
                </div>
                <div className="input-group flex-1">
                  <label>Vehicle</label>
                  <input required type="text" className="input w-full" placeholder="e.g. TRK-12" value={expenseForm.vehicle} onChange={e => setExpenseForm({...expenseForm, vehicle: e.target.value})} />
                </div>
              </div>
              
              <div className="flex gap-4 mb-4">
                <div className="input-group flex-1">
                  <label>Toll (₹)</label>
                  <input type="number" className="input w-full" placeholder="0" value={expenseForm.toll} onChange={e => setExpenseForm({...expenseForm, toll: e.target.value})} />
                </div>
                <div className="input-group flex-1">
                  <label>Other (₹)</label>
                  <input type="number" className="input w-full" placeholder="0" value={expenseForm.other} onChange={e => setExpenseForm({...expenseForm, other: e.target.value})} />
                </div>
              </div>

              <div className="flex gap-4 mb-6">
                <div className="input-group flex-1">
                  <label>Maint. Linked (₹)</label>
                  <input type="number" className="input w-full" placeholder="0" value={expenseForm.maintLinked} onChange={e => setExpenseForm({...expenseForm, maintLinked: e.target.value})} />
                </div>
                <div className="input-group flex-1">
                  <label>Status</label>
                  <select className="select w-full" value={expenseForm.status} onChange={e => setExpenseForm({...expenseForm, status: e.target.value})}>
                    <option value="Available">Available</option>
                    <option value="Completed">Completed</option>
                  </select>
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
