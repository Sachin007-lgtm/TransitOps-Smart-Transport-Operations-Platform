import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Shield, Check } from 'lucide-react';
import './Settings.css';

const INITIAL_RBAC_DATA = [
  { id: 'manager', role: 'Fleet Manager', dotClass: 'manager', permissions: { fleet: 'full', drivers: 'full', trips: 'none', fuel: 'none', analytics: 'full' } },
  { id: 'dispatcher', role: 'Dispatcher', dotClass: 'dispatcher', permissions: { fleet: 'view', drivers: 'none', trips: 'full', fuel: 'none', analytics: 'none' } },
  { id: 'safety', role: 'Safety Officer', dotClass: 'safety', permissions: { fleet: 'none', drivers: 'full', trips: 'view', fuel: 'none', analytics: 'none' } },
  { id: 'finance', role: 'Financial Analyst', dotClass: 'finance', permissions: { fleet: 'view', drivers: 'none', trips: 'none', fuel: 'full', analytics: 'full' } },
];

const PERMISSION_CYCLE = {
  'full': 'view',
  'view': 'none',
  'none': 'full'
};

const PERMISSION_LABELS = {
  'full': '✓',
  'view': 'view',
  'none': '–'
};

export default function Settings() {
  const [depotName, setDepotName] = useState(() => localStorage.getItem('depotName') || 'Gandhinagar Depot GJ4');
  const [currency, setCurrency] = useState(() => localStorage.getItem('currency') || 'USD');
  const [distanceUnit, setDistanceUnit] = useState(() => localStorage.getItem('distanceUnit') || 'km');

  const [isSaved, setIsSaved] = useState(false);
  const [rbacData, setRbacData] = useState(() => {
    const stored = localStorage.getItem('rbacData');
    return stored ? JSON.parse(stored) : INITIAL_RBAC_DATA;
  });
  const [popState, setPopState] = useState({ roleId: null, module: null, ts: 0 });

  const handleSave = () => {
    if (isSaved) return;
    localStorage.setItem('depotName', depotName);
    localStorage.setItem('currency', currency);
    localStorage.setItem('distanceUnit', distanceUnit);
    localStorage.setItem('rbacData', JSON.stringify(rbacData));

    setIsSaved(true);
    setTimeout(() => {
      setIsSaved(false);
    }, 1800);
  };

  const handleCyclePermission = (roleId, module) => {
    setRbacData(prev => {
      const updated = prev.map(row => {
        if (row.id === roleId) {
          return {
            ...row,
            permissions: {
              ...row.permissions,
              [module]: PERMISSION_CYCLE[row.permissions[module]]
            }
          };
        }
        return row;
      });
      localStorage.setItem('rbacData', JSON.stringify(updated));
      return updated;
    });
    setPopState({ roleId, module, ts: Date.now() });
  };

  const renderPill = (roleId, module, val) => {
    const isPopping = popState.roleId === roleId && popState.module === module && (Date.now() - popState.ts < 300);
    return (
      <span 
        className={`st-pill ${val} ${isPopping ? 'pop' : ''}`}
        onClick={() => handleCyclePermission(roleId, module)}
      >
        {PERMISSION_LABELS[val]}
      </span>
    );
  };

  return (
    <div className="settings-page fade-in">
      <div className="st-grid">
        
        {/* Panel 1: General */}
        <div className="st-card panel-1">
          <div className="st-card-header">
            <div className="st-icon-box violet">
              <SettingsIcon size={20} />
            </div>
            <div className="st-header-text">
              <h2 className="st-title">General Settings</h2>
              <div className="st-subtitle">Depot & unit preferences</div>
            </div>
          </div>

          <div className="st-form-group">
            <label>Depot Name</label>
            <input 
              type="text" 
              className="st-input" 
              value={depotName} 
              onChange={e => setDepotName(e.target.value)} 
            />
          </div>

          <div className="st-form-group">
            <label>Currency</label>
            <select className="st-select" value={currency} onChange={e => setCurrency(e.target.value)}>
              <option value="INR">INR (₹)</option>
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR (€)</option>
              <option value="AED">AED (د.إ)</option>
            </select>
          </div>

          <div className="st-form-group">
            <label>Distance Unit</label>
            <select className="st-select" value={distanceUnit} onChange={e => setDistanceUnit(e.target.value)}>
              <option value="km">Kilometers</option>
              <option value="mi">Miles</option>
            </select>
          </div>

          <div className="st-save-area">
            <button className={`st-save-btn ${isSaved ? 'saved' : ''}`} onClick={handleSave}>
              <Check size={16} />
              {isSaved ? 'Saved' : 'Save changes'}
            </button>
            <div className={`st-save-hint ${isSaved ? 'show' : ''}`}>
              Saved just now
            </div>
          </div>
        </div>

        {/* Panel 2: RBAC */}
        <div className="st-card panel-2">
          <div className="st-card-header">
            <div className="st-icon-box blue">
              <Shield size={20} />
            </div>
            <div className="st-header-text">
              <h2 className="st-title">Role-Based Access (RBAC)</h2>
              <div className="st-subtitle">Click a cell to cycle permission</div>
            </div>
          </div>

          <table className="st-table">
            <thead>
              <tr>
                <th>Role</th>
                <th>Fleet</th>
                <th>Drivers</th>
                <th>Trips</th>
                <th>Fuel/Exp.</th>
                <th>Analytics</th>
              </tr>
            </thead>
            <tbody>
              {rbacData.map((row) => (
                <tr key={row.id}>
                  <td>
                    <div className="st-role-name">
                      <span className={`st-role-dot ${row.dotClass}`}></span>
                      {row.role}
                    </div>
                  </td>
                  <td>{renderPill(row.id, 'fleet', row.permissions.fleet)}</td>
                  <td>{renderPill(row.id, 'drivers', row.permissions.drivers)}</td>
                  <td>{renderPill(row.id, 'trips', row.permissions.trips)}</td>
                  <td>{renderPill(row.id, 'fuel', row.permissions.fuel)}</td>
                  <td>{renderPill(row.id, 'analytics', row.permissions.analytics)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="st-table-note">
            <span><span className="st-pill full" style={{minWidth: 'auto', padding: '0 0.4rem'}}>✓</span> full access</span>
            <span><span className="st-pill view" style={{minWidth: 'auto', padding: '0 0.4rem'}}>view</span> read-only</span>
            <span><span className="st-pill none" style={{minWidth: 'auto', padding: '0 0.4rem'}}>–</span> no access</span>
          </div>
        </div>

      </div>
    </div>
  );
}
