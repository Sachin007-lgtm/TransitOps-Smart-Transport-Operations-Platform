import React, { useState, useEffect, useRef } from 'react';
import { Settings as SettingsIcon, Shield, Check, Lock, KeyRound, Eye, EyeOff, Loader2, CheckCircle2, AlertCircle, User, Camera, Upload, Trash2, Mail, Phone } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import './Settings.css';

const INITIAL_RBAC_DATA = [
  { id: 'admin', role: 'Platform Admin', dotClass: 'manager', permissions: { fleet: 'none', drivers: 'none', trips: 'none', fuel: 'none', billing: 'full' } },
  { id: 'manager', role: 'Owner/Manager', dotClass: 'manager', permissions: { fleet: 'full', drivers: 'full', trips: 'full', fuel: 'full', billing: 'full' } },
  { id: 'driver', role: 'Driver', dotClass: 'dispatcher', permissions: { fleet: 'none', drivers: 'none', trips: 'view', fuel: 'none', billing: 'none' } },
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
  const { user, changePassword, updateProfile } = useAuth();
  const profileFileInputRef = useRef(null);

  // Profile details states
  const [profileName, setProfileName] = useState(user?.name || '');
  const [profileEmail, setProfileEmail] = useState(user?.email || '');
  const [profilePhone, setProfilePhone] = useState(user?.phone_number || '');
  const [profileAvatar, setProfileAvatar] = useState(user?.avatar_url || '');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileError, setProfileError] = useState('');

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

  useEffect(() => {
    if (user) {
      setProfileName(user.name || '');
      setProfileEmail(user.email || '');
      setProfilePhone(user.phone_number || '');
      setProfileAvatar(user.avatar_url || '');
    }
  }, [user]);

  const handleProfileAvatarUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setProfileError('Please select a valid image file.');
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      setProfileError('Image size must be under 3 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      setProfileAvatar(event.target?.result);
      setProfileError('');
    };
    reader.readAsDataURL(file);
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!profileName.trim()) {
      setProfileError('Full name cannot be empty.');
      return;
    }
    setProfileSaving(true);
    setProfileError('');
    try {
      await updateProfile({
        name: profileName.trim(),
        email: profileEmail.trim() || null,
        phone_number: profilePhone.trim() || null,
        avatar_url: profileAvatar || null
      });
      setProfileSaved(true);
      window.dispatchEvent(
        new CustomEvent('app-toast', { detail: 'Profile updated successfully!' })
      );
      setTimeout(() => setProfileSaved(false), 2500);
    } catch (err) {
      setProfileError(err.message || 'Failed to update profile.');
    } finally {
      setProfileSaving(false);
    }
  };

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
          {/* Panel: Profile & Account Information */}
          <div className="st-card panel-profile" id="profile-panel">
            <div className="st-card-header">
              <div className="st-icon-box violet">
                <User size={20} />
              </div>
              <div className="st-header-text">
                <h2 className="st-title">Profile & Personal Details</h2>
                <div className="st-subtitle">Your real name & profile picture</div>
              </div>
            </div>

            {profileError && (
              <div className="st-error-banner">
                <AlertCircle size={15} style={{ flexShrink: 0 }} />
                <span>{profileError}</span>
              </div>
            )}

            {profileSaved && (
              <div className="st-success-banner">
                <CheckCircle2 size={15} style={{ flexShrink: 0 }} />
                <span>Profile updated successfully!</span>
              </div>
            )}

            <form onSubmit={handleSaveProfile}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem' }}>
                <div style={{ position: 'relative', width: '56px', height: '56px', borderRadius: '50%', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', flexShrink: 0 }}>
                  {profileAvatar ? (
                    <img src={profileAvatar} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  ) : (
                    <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, #7a4a63 0%, #4c2c3d 100%)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem', fontWeight: 700 }}>
                      {(profileName || 'U').trim().slice(0, 2).toUpperCase()}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <input
                    ref={profileFileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleProfileAvatarUpload}
                    style={{ display: 'none' }}
                  />
                  <button
                    type="button"
                    onClick={() => profileFileInputRef.current?.click()}
                    className="st-pill view"
                    style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '0.4rem 0.75rem' }}
                  >
                    <Camera size={13} /> Change Photo
                  </button>
                  {profileAvatar && (
                    <button
                      type="button"
                      onClick={() => setProfileAvatar('')}
                      className="st-pill none"
                      style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '0.4rem 0.75rem' }}
                    >
                      <Trash2 size={13} /> Remove
                    </button>
                  )}
                </div>
              </div>

              <div className="st-form-group">
                <label>Real Full Name</label>
                <input
                  type="text"
                  className="st-input"
                  placeholder="Enter full name"
                  value={profileName}
                  onChange={e => setProfileName(e.target.value)}
                  required
                />
              </div>

              <div className="st-form-group">
                <label>Email Address</label>
                <input
                  type="email"
                  className="st-input"
                  placeholder="Enter email"
                  value={profileEmail}
                  onChange={e => setProfileEmail(e.target.value)}
                />
              </div>

              <div className="st-form-group">
                <label>Phone Number</label>
                <input
                  type="tel"
                  className="st-input"
                  placeholder="Enter phone number"
                  value={profilePhone}
                  onChange={e => setProfilePhone(e.target.value)}
                />
              </div>

              <div className="st-save-area">
                <button
                  type="submit"
                  className={`st-save-btn ${profileSaved ? 'saved' : ''}`}
                  disabled={profileSaving}
                >
                  {profileSaving ? (
                    <>
                      <Loader2 size={15} className="animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Check size={16} />
                      <span>{profileSaved ? 'Saved' : 'Save Profile'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

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
                <th>Billing</th>
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
                  <td>{renderPill(row.id, 'billing', row.permissions.billing)}</td>
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
