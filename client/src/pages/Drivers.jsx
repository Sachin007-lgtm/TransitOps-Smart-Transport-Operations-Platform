import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Check, ChevronDown, Lock, ShieldCheck, Edit2, Trash2, KeyRound, Copy, AlertTriangle } from 'lucide-react';
import { useGlobalSearch } from '../contexts/GlobalSearchContext';
import { apiRequest } from '../utils/api';
import './Drivers.css';

const STATUS_OPTIONS = [
  { label: 'Available', color: 'green' },
  { label: 'On Trip', color: 'blue' },
  { label: 'Off Duty', color: 'gray' },
  { label: 'Suspended', color: 'red' }
];

export default function Drivers() {
  const { globalSearch } = useGlobalSearch();
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [activeFilter, setActiveFilter] = useState(null);
  const [popoverActiveRow, setPopoverActiveRow] = useState(null);
  const popoverRef = useRef(null);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDriver, setEditingDriver] = useState(null);
  const [newDriverHighlighted, setNewDriverHighlighted] = useState(null);

  // One-time credential modal state
  const [credentialModal, setCredentialModal] = useState(null);
  const [copied, setCopied] = useState(false);

  // Add Driver Form State
  const [formData, setFormData] = useState({
    name: '', license: '', expiry: '', contact: '', status: 'Available'
  });

  // Edit Driver Form State
  const [editFormData, setEditFormData] = useState({
    name: '', license: '', expiry: '', contact: '', status: 'Off Duty'
  });

  const loadDrivers = async () => {
    try {
      setError('');
      const data = await apiRequest('GET', '/drivers');
      setDrivers(data.data || []);
    } catch (err) {
      console.error(err);
      setError('Failed to load driver profiles.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDrivers();

    const handleOutsideClick = (e) => {
      if (popoverActiveRow && popoverRef.current && !popoverRef.current.contains(e.target)) {
        setPopoverActiveRow(null);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [popoverActiveRow]);

  const toggleFilter = (status) => {
    setActiveFilter(prev => prev === status ? null : status);
  };

  const isLicenseExpired = (expiryDate) => {
    if (!expiryDate) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return new Date(expiryDate) < today;
  };

  const isLicenseExpiringSoon = (expiryDate) => {
    if (!expiryDate) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffTime = new Date(expiryDate) - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 && diffDays <= 30;
  };

  const formatDateForInput = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return d.toISOString().split('T')[0];
  };

  const formatExpiryMMDDYY = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const yy = String(d.getFullYear()).slice(-2);
    return `${mm}/${dd}/${yy}`;
  };

  const handleStatusChange = async (driverId, newStatusOption, isExpired, e) => {
    e.stopPropagation();
    const currentDriver = drivers.find(d => d.id === driverId);

    if (currentDriver?.status === 'On Trip' && newStatusOption.label !== 'On Trip') {
      const optionEl = e.currentTarget;
      optionEl.classList.add('shake');
      setTimeout(() => optionEl.classList.remove('shake'), 500);
      const evt = new CustomEvent('app-toast', { detail: `Blocked — ${currentDriver.name} is currently On Trip. Complete the trip to release driver.`, type: 'error' });
      window.dispatchEvent(evt);
      return;
    }

    if (isExpired && (newStatusOption.label === 'Available' || newStatusOption.label === 'On Trip')) {
      const optionEl = e.currentTarget;
      optionEl.classList.add('shake');
      setTimeout(() => optionEl.classList.remove('shake'), 500);

      const driverName = currentDriver?.name || 'Driver';
      const evt = new CustomEvent('app-toast', { detail: `Blocked — ${driverName}'s license is expired, cannot assign trips.`, type: 'error' });
      window.dispatchEvent(evt);
      return;
    }

    try {
      const dbStatusValue = newStatusOption.label === 'On Trip' ? 'On Trip' : newStatusOption.label;
      await apiRequest('PATCH', `/drivers/${driverId}/status`, { status: dbStatusValue });
      
      const dName = currentDriver?.name || 'Driver';
      const evt = new CustomEvent('app-toast', { detail: `${dName} set to ${newStatusOption.label}` });
      window.dispatchEvent(evt);
      
      loadDrivers();
    } catch (err) {
      const evt = new CustomEvent('app-toast', { detail: err.message || 'Failed to update status', type: 'error' });
      window.dispatchEvent(evt);
    }
    setPopoverActiveRow(null);
  };

  const handleAddDriver = async (e) => {
    e.preventDefault();
    
    // Strict mandatory field validation
    if (!formData.name.trim() || !formData.license.trim() || !formData.expiry.trim() || !formData.contact.trim()) {
      const evt = new CustomEvent('app-toast', { detail: 'All fields marked with * are required.', type: 'error' });
      window.dispatchEvent(evt);
      return;
    }

    const phoneDigits = formData.contact.replace(/\D/g, '');
    if (phoneDigits.length < 10) {
      const evt = new CustomEvent('app-toast', { detail: 'Please enter a valid 10-digit contact number.', type: 'error' });
      window.dispatchEvent(evt);
      return;
    }

    if (isLicenseExpired(formData.expiry) && ['Available', 'On Trip'].includes(formData.status || 'Available')) {
      const evt = new CustomEvent('app-toast', { detail: 'Cannot set initial status to Available or On Trip with an expired license.', type: 'error' });
      window.dispatchEvent(evt);
      return;
    }

    // License duplicate check
    if (drivers.some(d => d.license_number.toLowerCase() === formData.license.trim().toLowerCase())) {
      const evt = new CustomEvent('app-toast', { detail: 'License number must be unique', type: 'error' });
      window.dispatchEvent(evt);
      return;
    }

    const formattedContact = formData.contact.trim().startsWith('+91') 
      ? formData.contact.trim() 
      : `+91 ${formData.contact.trim()}`;

    try {
      const res = await apiRequest('POST', '/drivers', {
        name: formData.name.trim(),
        license_number: formData.license.trim(),
        license_category: 'LMV',
        license_expiry_date: formData.expiry,
        contact_number: formattedContact,
        status: formData.status || 'Available',
        safety_score: 95
      });
      
      setIsModalOpen(false);
      setFormData({ name: '', license: '', expiry: '', contact: '', status: 'Available' });

      if (res.data?.temporary_password) {
        setCredentialModal({
          driverName: res.data.name || formData.name.trim(),
          contactNumber: res.data.contact_number || formattedContact,
          temporaryPassword: res.data.temporary_password
        });
      }
      
      const newId = res.data.id;
      setNewDriverHighlighted(newId);
      setTimeout(() => setNewDriverHighlighted(null), 2500);

      const evt = new CustomEvent('app-toast', { detail: `${formData.name} registered as ${formData.status || 'Available'}` });
      window.dispatchEvent(evt);
      
      loadDrivers();
    } catch (err) {
      const evt = new CustomEvent('app-toast', { detail: err.message || 'Failed to register driver', type: 'error' });
      window.dispatchEvent(evt);
    }
  };

  const handleOpenEditModal = (driver) => {
    setEditingDriver(driver);
    // Strip leading +91 for clean editing input
    const cleanContact = (driver.contact_number || '').replace(/^\+91\s?/, '');
    setEditFormData({
      name: driver.name || '',
      license: driver.license_number || '',
      expiry: formatDateForInput(driver.license_expiry_date),
      contact: cleanContact,
      status: driver.status || 'Off Duty'
    });
  };

  const handleUpdateDriver = async (e) => {
    e.preventDefault();
    
    if (!editFormData.name.trim() || !editFormData.license.trim() || !editFormData.expiry.trim() || !editFormData.contact.trim()) {
      const evt = new CustomEvent('app-toast', { detail: 'All fields marked with * are required.', type: 'error' });
      window.dispatchEvent(evt);
      return;
    }

    const editPhoneDigits = editFormData.contact.replace(/\D/g, '');
    if (editPhoneDigits.length < 10) {
      const evt = new CustomEvent('app-toast', { detail: 'Please enter a valid 10-digit contact number.', type: 'error' });
      window.dispatchEvent(evt);
      return;
    }

    if (isLicenseExpired(editFormData.expiry) && ['Available', 'On Trip'].includes(editFormData.status)) {
      const evt = new CustomEvent('app-toast', { detail: 'Cannot set status to Available or On Trip when license is expired.', type: 'error' });
      window.dispatchEvent(evt);
      return;
    }

    const formattedContact = editFormData.contact.trim().startsWith('+91') 
      ? editFormData.contact.trim() 
      : `+91 ${editFormData.contact.trim()}`;

    try {
      await apiRequest('PUT', `/drivers/${editingDriver.id}`, {
        name: editFormData.name.trim(),
        license_number: editFormData.license.trim(),
        license_expiry_date: editFormData.expiry,
        contact_number: formattedContact,
        status: editFormData.status
      });

      setEditingDriver(null);
      const evt = new CustomEvent('app-toast', { detail: `${editFormData.name}'s profile updated` });
      window.dispatchEvent(evt);

      loadDrivers();
    } catch (err) {
      const evt = new CustomEvent('app-toast', { detail: err.message || 'Failed to update driver profile', type: 'error' });
      window.dispatchEvent(evt);
    }
  };

  const handleDeleteDriver = async (driver) => {
    if (driver.status === 'On Trip') {
      const evt = new CustomEvent('app-toast', { detail: `Cannot delete ${driver.name} while On Trip.`, type: 'error' });
      window.dispatchEvent(evt);
      return;
    }

    if (!window.confirm(`Are you sure you want to delete ${driver.name}?`)) {
      return;
    }

    try {
      await apiRequest('DELETE', `/drivers/${driver.id}`);
      const evt = new CustomEvent('app-toast', { detail: `${driver.name} removed from roster` });
      window.dispatchEvent(evt);
      loadDrivers();
    } catch (err) {
      const evt = new CustomEvent('app-toast', { detail: err.message || 'Failed to delete driver', type: 'error' });
      window.dispatchEvent(evt);
    }
  };

  const handleResetDriverPassword = async (driver) => {
    try {
      const response = await apiRequest('POST', `/drivers/${driver.id}/reset-password`);
      const temporaryPassword = response.data?.temporary_password;
      if (temporaryPassword) {
        setCredentialModal({
          driverName: driver.name,
          contactNumber: driver.contact_number,
          temporaryPassword: temporaryPassword
        });
      }
      loadDrivers();
    } catch (err) {
      const evt = new CustomEvent('app-toast', { detail: err.message || 'Failed to reset driver password', type: 'error' });
      window.dispatchEvent(evt);
    }
  };

  const handleCopyPassword = (password) => {
    navigator.clipboard.writeText(password);
    setCopied(true);
    const evt = new CustomEvent('app-toast', { detail: 'Temporary password copied to clipboard!' });
    window.dispatchEvent(evt);
    setTimeout(() => setCopied(false), 2000);
  };

  // Filter Data
  const filteredDrivers = drivers.filter(d => {
    let matchesSearch = true;
    if (globalSearch) {
      const s = globalSearch.toLowerCase();
      matchesSearch = (
        d.name.toLowerCase().includes(s) || 
        d.license_number.toLowerCase().includes(s) || 
        d.contact_number.toLowerCase().includes(s) || 
        d.status.toLowerCase().includes(s)
      );
    }
    let matchesFilter = true;
    if (activeFilter) {
      const normalizedStatus = d.status === 'On Trip' ? 'On Trip' : d.status;
      matchesFilter = normalizedStatus.toLowerCase() === activeFilter.toLowerCase();
    }
    return matchesSearch && matchesFilter;
  });

  const getStatusColor = (status) => {
    switch (status) {
      case 'Available': return 'green';
      case 'On Trip': 
      case 'On trip': 
        return 'blue';
      case 'Suspended': return 'red';
      default: return 'gray'; // Off Duty
    }
  };

  const getAvatarColor = (name) => {
    const colors = ['#7a4a63', '#22a06b', '#2f6fed', '#e08a1e', '#6a5acd'];
    const index = name ? name.charCodeAt(0) % colors.length : 0;
    return colors[index];
  };

  return (
    <div className="drivers-page fade-in">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl heading">Drivers Profile</h1>
          <p className="text-sm text-muted mt-1">Track licensing and live availability across the roster.</p>
        </div>
        <div>
          <button 
            className="btn btn-amber-gradient flex items-center gap-2" 
            onClick={() => setIsModalOpen(true)}
            style={{ flexShrink: 0, padding: '0.6rem 1.5rem' }}
          >
            <Plus size={16} /> Add Driver
          </button>
        </div>
      </div>

      {error && <div className="error-message mb-4" style={{ color: 'var(--status-red)', fontSize: '0.875rem' }}>{error}</div>}

      <div className="card mb-6 p-0 overflow-hidden">
        <div className="table-container">
          <table className="roster-table">
            <thead>
              <tr>
                <th style={{ paddingLeft: '2rem' }}>Driver Name</th>
                <th>License no.</th>
                <th>Driver Licence Expiry</th>
                <th>Contact</th>
                <th className="text-center">App access</th>
                <th className="text-center">Trips Count</th>
                <th>Status</th>
                <th className="text-right pr-6">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="8" className="text-center py-12 text-muted">Loading driver roster...</td>
                </tr>
              ) : filteredDrivers.map((d, index) => {
                const sColor = getStatusColor(d.status);
                const expired = isLicenseExpired(d.license_expiry_date);
                const expiringSoon = isLicenseExpiringSoon(d.license_expiry_date);
                
                return (
                  <tr 
                    key={d.id} 
                    className={`border-indicator border-${sColor} slide-in-row ${newDriverHighlighted === d.id ? 'highlight-bounce' : ''}`}
                    style={{ animationDelay: `${index * 0.05}s`, position: 'relative', zIndex: popoverActiveRow === d.id ? 50 : 1 }}
                  >
                    <td style={{ paddingLeft: '2rem' }}>
                      <div className="flex items-center gap-3">
                        <div className="driver-avatar" style={{ backgroundColor: getAvatarColor(d.name) }}>
                          {d.name ? d.name.substring(0, 2).toUpperCase() : 'US'}
                        </div>
                        <span className="font-medium text-sm">{d.name}</span>
                      </div>
                    </td>
                    <td className="mono text-xs">{d.license_number}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <span className="mono text-xs">{formatExpiryMMDDYY(d.license_expiry_date)}</span>
                        {expired && <span className="pill pill-red" style={{ fontSize: '0.6rem', padding: '0.15rem 0.35rem' }}>EXPIRED</span>}
                        {expiringSoon && <span className="pill pill-orange" style={{ fontSize: '0.6rem', padding: '0.15rem 0.35rem' }}>EXP IN 30D</span>}
                      </div>
                    </td>
                    <td className="mono text-xs">
                      {d.contact_number ? (d.contact_number.startsWith('+91') ? d.contact_number : `+91 ${d.contact_number}`) : ''}
                    </td>
                    <td className="text-center">
                      {d.must_change_password ? (
                        <span className="pill pill-orange mono text-xs font-semibold px-2.5 py-0.5" title="Driver must change password on first mobile login">
                          Pending 1st Login
                        </span>
                      ) : (
                        <span className="pill pill-green mono text-xs font-semibold px-2.5 py-0.5" title="Permanent password set">
                          Password Set
                        </span>
                      )}
                    </td>
                    <td className="text-center">
                      <span className="pill pill-indigo mono text-xs font-semibold px-3 py-1">
                        {d.trips_count ?? 0}
                      </span>
                    </td>
                    <td>
                      <div className="relative">
                        <button 
                          className={`pill pill-${sColor} status-trigger`}
                          onClick={(e) => { e.stopPropagation(); setPopoverActiveRow(popoverActiveRow === d.id ? null : d.id); }}
                        >
                          <span className={`live-dot sm bg-${sColor}-500 ${d.status !== 'Off Duty' ? 'pulsing-dot' : ''}`}></span>
                          {d.status}
                          <ChevronDown size={14} className="ml-1 opacity-70" />
                        </button>
                        
                        {popoverActiveRow === d.id && (
                          <div className="status-popover fade-in" ref={popoverRef}>
                            {STATUS_OPTIONS.map(opt => {
                              const isBlocked = expired && (opt.label === 'Available' || opt.label === 'On Trip');
                              return (
                                <div 
                                  key={opt.label} 
                                  className={`status-option ${isBlocked ? 'blocked' : ''}`}
                                  onClick={(e) => handleStatusChange(d.id, opt, isBlocked, e)}
                                >
                                  <div className="flex items-center gap-2">
                                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: `var(--${opt.color})` }}></span>
                                    <span>{opt.label}</span>
                                  </div>
                                  {isBlocked && <Lock size={12} className="text-muted" />}
                                  {d.status === opt.label && !isBlocked && <Check size={14} className="text-muted" />}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="text-right pr-6">
                      <div className="flex items-center justify-end gap-2">
                        <button 
                          className="btn-icon text-muted hover:text-primary" 
                          title="Generate temporary password"
                          onClick={(e) => { e.stopPropagation(); handleResetDriverPassword(d); }}
                          style={{ padding: '0.4rem', borderRadius: '6px', background: 'transparent', border: 'none', cursor: 'pointer' }}
                        >
                          <KeyRound size={15} />
                        </button>
                        <button 
                          className="btn-icon text-muted hover:text-primary" 
                          title="Edit Driver"
                          onClick={(e) => { e.stopPropagation(); handleOpenEditModal(d); }}
                          style={{ padding: '0.4rem', borderRadius: '6px', background: 'transparent', border: 'none', cursor: 'pointer' }}
                        >
                          <Edit2 size={15} />
                        </button>
                        <button 
                          className="btn-icon text-muted hover:text-red-500" 
                          title="Delete Driver"
                          onClick={(e) => { e.stopPropagation(); handleDeleteDriver(d); }}
                          style={{ padding: '0.4rem', borderRadius: '6px', background: 'transparent', border: 'none', cursor: 'pointer' }}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!loading && filteredDrivers.length === 0 && (
                <tr>
                  <td colSpan="8" className="text-center py-8 text-muted text-sm">No drivers found matching criteria.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card rules-panel">
        <h3 className="heading text-xs mb-3 uppercase tracking-wide text-muted">Status legend & rules — click a chip to filter</h3>
        <div className="flex gap-3 mb-4">
          {STATUS_OPTIONS.map(opt => (
            <button 
              key={opt.label}
              className={`pill pill-${opt.color} filter-chip ${activeFilter === opt.label ? 'active' : ''}`}
              onClick={() => toggleFilter(opt.label)}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-xs font-medium" style={{ color: 'var(--plum-3)' }}>
          <ShieldCheck size={16} className="text-status-orange" />
          Rule: <strong className="text-status-red">expired license</strong> or <strong className="text-status-red">suspended</strong> status → blocked from trip assignment.
        </div>
      </div>

      {/* Add Driver Modal */}
      {isModalOpen && createPortal(
        <div className="modal-overlay" style={{ backgroundColor: 'rgba(47, 111, 237, 0.25)', backdropFilter: 'blur(5px)' }} onClick={() => setIsModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="mb-4">
              <h2 className="heading text-xl">Add Driver</h2>
            </div>
            <form onSubmit={handleAddDriver}>
              <div className="flex flex-col gap-3">
                <div className="input-group">
                  <label>
                    Full name <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input 
                    type="text" 
                    className="input w-full" 
                    required 
                    placeholder="Enter full name"
                    value={formData.name} 
                    onChange={e => setFormData({...formData, name: e.target.value})} 
                  />
                </div>
                <div className="input-group">
                  <label>
                    License no. <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input 
                    type="text" 
                    className="input mono text-sm w-full" 
                    required 
                    placeholder="e.g. DL-MH-20240001"
                    value={formData.license} 
                    onChange={e => setFormData({...formData, license: e.target.value})} 
                  />
                </div>
                <div className="input-group">
                  <label>
                    License expiry <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input 
                    type="date" 
                    className="input mono text-sm w-full" 
                    required 
                    value={formData.expiry} 
                    onChange={e => setFormData({...formData, expiry: e.target.value})} 
                  />
                </div>
                <div className="input-group">
                  <label>
                    Contact <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <span style={{ 
                      position: 'absolute', 
                      left: '0.85rem', 
                      opacity: 0.45, 
                      fontSize: '0.875rem', 
                      fontFamily: 'monospace', 
                      pointerEvents: 'none',
                      userSelect: 'none',
                      fontWeight: 600
                    }}>
                      +91
                    </span>
                    <input 
                      type="text" 
                      className="input mono text-sm w-full" 
                      style={{ paddingLeft: '3.2rem' }}
                      required 
                      placeholder="9876543210"
                      value={formData.contact} 
                      onChange={e => setFormData({...formData, contact: e.target.value})} 
                    />
                  </div>
                </div>
                <div className="input-group">
                  <label>Initial Status</label>
                  <select 
                    className="select w-full" 
                    value={formData.status} 
                    onChange={e => setFormData({...formData, status: e.target.value})}
                  >
                    <option value="Available">Available</option>
                    <option value="Off Duty">Off Duty</option>
                    <option value="On Trip">On Trip</option>
                    <option value="Suspended">Suspended</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-4 pt-4" style={{ borderTop: '1px solid var(--line)' }}>
                <button type="button" className="btn btn-outline" onClick={() => setIsModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Add Driver</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Edit Driver Modal */}
      {editingDriver && createPortal(
        <div className="modal-overlay" style={{ backgroundColor: 'rgba(47, 111, 237, 0.25)', backdropFilter: 'blur(5px)' }} onClick={() => setEditingDriver(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="mb-4">
              <h2 className="heading text-xl">Edit Driver Profile</h2>
              <p className="text-xs text-muted">Update license details, contact info, or driver status.</p>
            </div>
            <form onSubmit={handleUpdateDriver}>
              <div className="flex flex-col gap-3">
                <div className="input-group">
                  <label>
                    Full name <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input 
                    type="text" 
                    className="input w-full" 
                    required 
                    value={editFormData.name} 
                    onChange={e => setEditFormData({...editFormData, name: e.target.value})} 
                  />
                </div>
                <div className="input-group">
                  <label>
                    License no. <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input 
                    type="text" 
                    className="input mono text-sm w-full" 
                    required 
                    value={editFormData.license} 
                    onChange={e => setEditFormData({...editFormData, license: e.target.value})} 
                  />
                </div>
                <div className="input-group">
                  <label>
                    License expiry <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input 
                    type="date" 
                    className="input mono text-sm w-full" 
                    required 
                    value={editFormData.expiry} 
                    onChange={e => setEditFormData({...editFormData, expiry: e.target.value})} 
                  />
                </div>
                <div className="input-group">
                  <label>
                    Contact <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <span style={{ 
                      position: 'absolute', 
                      left: '0.85rem', 
                      opacity: 0.45, 
                      fontSize: '0.875rem', 
                      fontFamily: 'monospace', 
                      pointerEvents: 'none',
                      userSelect: 'none',
                      fontWeight: 600
                    }}>
                      +91
                    </span>
                    <input 
                      type="text" 
                      className="input mono text-sm w-full" 
                      style={{ paddingLeft: '3.2rem' }}
                      required 
                      value={editFormData.contact} 
                      onChange={e => setEditFormData({...editFormData, contact: e.target.value})} 
                    />
                  </div>
                </div>
                <div className="input-group">
                  <label>Status</label>
                  <select 
                    className="select w-full" 
                    value={editFormData.status} 
                    onChange={e => setEditFormData({...editFormData, status: e.target.value})}
                  >
                    <option value="Available">Available</option>
                    <option value="On Trip">On Trip</option>
                    <option value="Off Duty">Off Duty</option>
                    <option value="Suspended">Suspended</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-4 pt-4" style={{ borderTop: '1px solid var(--line)' }}>
                <button type="button" className="btn btn-outline" onClick={() => setEditingDriver(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Changes</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* One-Time Credential Modal */}
      {credentialModal && createPortal(
        <div 
          className="modal-overlay" 
          style={{ backgroundColor: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(6px)', zIndex: 9999 }} 
          onClick={() => setCredentialModal(null)}
        >
          <div 
            className="modal-content" 
            style={{ maxWidth: '440px', padding: '1.75rem', borderRadius: '16px', border: '1px solid var(--line)' }} 
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-3">
              <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: 'rgba(234, 138, 0, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#d97706', flexShrink: 0 }}>
                <KeyRound size={22} />
              </div>
              <div>
                <h2 className="heading text-lg font-bold">Temporary Driver Password</h2>
                <p className="text-xs text-muted">Single-use initial credential</p>
              </div>
            </div>

            <div style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: '10px', padding: '0.75rem 1rem', marginBottom: '1.25rem' }}>
              <div className="flex items-start gap-2">
                <AlertTriangle size={16} style={{ color: '#ef4444', flexShrink: 0, marginTop: '2px' }} />
                <p className="text-xs" style={{ color: '#b91c1c', margin: 0, lineHeight: 1.4 }}>
                  <strong>Security notice:</strong> This temporary password is displayed <strong>ONLY ONCE</strong> and is not stored or retrievable after closing this window. Please copy and share it with the driver immediately.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3 mb-4">
              <div>
                <label className="text-xs text-muted font-medium">Driver Name</label>
                <div className="font-semibold text-sm">{credentialModal.driverName}</div>
              </div>
              <div>
                <label className="text-xs text-muted font-medium">Mobile Login Number</label>
                <div className="mono text-sm">{credentialModal.contactNumber}</div>
              </div>
              <div>
                <label className="text-xs text-muted font-medium">Temporary Password</label>
                <div className="flex items-center gap-2 mt-1">
                  <div style={{ flex: 1, padding: '0.65rem 0.85rem', background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: '8px', fontFamily: 'monospace', fontSize: '0.95rem', fontWeight: 600, letterSpacing: '0.05em' }}>
                    {credentialModal.temporaryPassword}
                  </div>
                  <button 
                    type="button" 
                    className="btn btn-outline flex items-center gap-1.5"
                    style={{ padding: '0.65rem 1rem', whiteSpace: 'nowrap' }}
                    onClick={() => handleCopyPassword(credentialModal.temporaryPassword)}
                  >
                    {copied ? <Check size={16} style={{ color: '#16a34a' }} /> : <Copy size={16} />}
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-3" style={{ borderTop: '1px solid var(--line)' }}>
              <button 
                type="button" 
                className="btn btn-primary w-full"
                onClick={() => setCredentialModal(null)}
              >
                Done / I Have Saved This Password
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
