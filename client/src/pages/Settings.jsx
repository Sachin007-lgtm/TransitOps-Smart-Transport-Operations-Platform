import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Shield, Check, Lock, KeyRound, Eye, EyeOff, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import './Settings.css';

const INITIAL_RBAC_DATA = [
  { id: 'admin', role: 'Platform Admin', dotClass: 'manager', permissions: { fleet: 'none', drivers: 'none', trips: 'none', fuel: 'none', analytics: 'full' } },
  { id: 'manager', role: 'Owner/Manager', dotClass: 'manager', permissions: { fleet: 'full', drivers: 'full', trips: 'full', fuel: 'full', analytics: 'full' } },
  { id: 'driver', role: 'Driver', dotClass: 'dispatcher', permissions: { fleet: 'none', drivers: 'none', trips: 'view', fuel: 'none', analytics: 'none' } },
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
  const { changePassword } = useAuth();
  const [depotName, setDepotName] = useState('Gandhinagar Depot GJ4');
  const [currency, setCurrency] = useState('INR');
  const [distanceUnit, setDistanceUnit] = useState('km');

  const [isSaved, setIsSaved] = useState(false);
  const [rbacData, setRbacData] = useState(INITIAL_RBAC_DATA);
  const [popState, setPopState] = useState({ roleId: null, module: null, ts: 0 });

  // Security & Password Change States
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPwd, setShowCurrentPwd] = useState(false);
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);
  const [pwdLoading, setPwdLoading] = useState(false);
  const [pwdError, setPwdError] = useState('');
  const [pwdSuccess, setPwdSuccess] = useState(false);

  // Smooth scroll and pulse highlight if #security hash is in URL
  useEffect(() => {
    if (window.location.hash === '#security') {
      setTimeout(() => {
        const el = document.getElementById('security-panel');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.classList.add('highlight-pulse');
          setTimeout(() => el.classList.remove('highlight-pulse'), 2500);
        }
      }, 100);
    }
  }, []);

  const handleSave = () => {
    if (isSaved) return;
    setIsSaved(true);
    setTimeout(() => {
      setIsSaved(false);
    }, 1800);
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setPwdError('');
    setPwdSuccess(false);

    if (!currentPassword.trim()) {
      setPwdError('Current password is required.');
      return;
    }
    if (newPassword.length < 8) {
      setPwdError('New password must be at least 8 characters long.');
      return;
    }
    if (newPassword === currentPassword) {
      setPwdError('New password cannot be identical to your current password.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwdError('New passwords do not match.');
      return;
    }

    setPwdLoading(true);
    try {
      await changePassword(currentPassword.trim(), newPassword);
      setPwdSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      window.dispatchEvent(
        new CustomEvent('app-toast', { detail: 'Password updated successfully!' })
      );
      setTimeout(() => setPwdSuccess(false), 4000);
    } catch (err) {
      setPwdError(err.message || 'Failed to update password. Please check your current password.');
    } finally {
      setPwdLoading(false);
    }
  };

  const handleCyclePermission = (roleId, module) => {
    setRbacData(prev => prev.map(row => {
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
    }));
    // Trigger animation pop
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
    <div className="settings-page">
      <div className="st-grid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          {/* Panel 1: General */}
          <div className="st-card panel-1">
            <div className="st-card-header">
              <div className="st-icon-box violet">
                <SettingsIcon size={20} />
              </div>
              <div className="st-header-text">
                <h2 className="st-title">General</h2>
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

          {/* Panel: Security & Password */}
          <div className="st-card panel-security" id="security-panel">
            <div className="st-card-header">
              <div className="st-icon-box amber">
                <KeyRound size={20} />
              </div>
              <div className="st-header-text">
                <h2 className="st-title">Security & Password</h2>
                <div className="st-subtitle">Update account sign-in password</div>
              </div>
            </div>

            {pwdError && (
              <div className="st-error-banner">
                <AlertCircle size={15} style={{ flexShrink: 0 }} />
                <span>{pwdError}</span>
              </div>
            )}

            {pwdSuccess && (
              <div className="st-success-banner">
                <CheckCircle2 size={15} style={{ flexShrink: 0 }} />
                <span>Password updated successfully!</span>
              </div>
            )}

            <form onSubmit={handlePasswordChange}>
              <div className="st-form-group">
                <label>Current Password</label>
                <div className="st-input-wrapper">
                  <Lock size={15} className="st-input-icon" />
                  <input
                    type={showCurrentPwd ? 'text' : 'password'}
                    className="st-input has-icon"
                    placeholder="Enter current password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="st-eye-btn"
                    onClick={() => setShowCurrentPwd(!showCurrentPwd)}
                    title={showCurrentPwd ? 'Hide password' : 'Show password'}
                  >
                    {showCurrentPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div className="st-form-group">
                <label>New Password</label>
                <div className="st-input-wrapper">
                  <KeyRound size={15} className="st-input-icon" />
                  <input
                    type={showNewPwd ? 'text' : 'password'}
                    className="st-input has-icon"
                    placeholder="Minimum 8 characters"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="st-eye-btn"
                    onClick={() => setShowNewPwd(!showNewPwd)}
                    title={showNewPwd ? 'Hide password' : 'Show password'}
                  >
                    {showNewPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <div className="st-pwd-requirements">
                  <span className={`st-pwd-req ${newPassword.length >= 8 ? 'met' : ''}`}>
                    <CheckCircle2 size={12} /> 8+ characters
                  </span>
                </div>
              </div>

              <div className="st-form-group">
                <label>Confirm New Password</label>
                <div className="st-input-wrapper">
                  <Lock size={15} className="st-input-icon" />
                  <input
                    type={showConfirmPwd ? 'text' : 'password'}
                    className="st-input has-icon"
                    placeholder="Re-enter new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="st-eye-btn"
                    onClick={() => setShowConfirmPwd(!showConfirmPwd)}
                    title={showConfirmPwd ? 'Hide password' : 'Show password'}
                  >
                    {showConfirmPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {confirmPassword && (
                  <div className="st-pwd-requirements">
                    <span className={`st-pwd-req ${newPassword === confirmPassword ? 'met' : 'unmet'}`}>
                      <CheckCircle2 size={12} /> {newPassword === confirmPassword ? 'Passwords match' : 'Passwords do not match'}
                    </span>
                  </div>
                )}
              </div>

              <div className="st-save-area" style={{ marginTop: '1.5rem' }}>
                <button
                  type="submit"
                  className="st-save-btn"
                  disabled={pwdLoading || !currentPassword || newPassword.length < 8 || newPassword !== confirmPassword}
                  style={{
                    opacity: (!currentPassword || newPassword.length < 8 || newPassword !== confirmPassword) ? 0.6 : 1,
                    cursor: (!currentPassword || newPassword.length < 8 || newPassword !== confirmPassword) ? 'not-allowed' : 'pointer'
                  }}
                >
                  {pwdLoading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>Updating...</span>
                    </>
                  ) : (
                    <>
                      <Lock size={15} />
                      <span>Update Password</span>
                    </>
                  )}
                </button>
              </div>
            </form>
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
