import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Check, ChevronDown, Lock, ShieldCheck } from 'lucide-react';
import { useGlobalSearch } from '../contexts/GlobalSearchContext';
import { apiRequest } from '../utils/api';
import './Drivers.css';

const STATUS_OPTIONS = [
  { label: 'Available', color: 'green' },
  { label: 'On Trip', color: 'blue' },
  { label: 'Off Duty', color: 'gray' },
  { label: 'Suspended', color: 'red' }
];

// Circular Progress Component
const ProgressRing = ({ percentage }) => {
  const [offset, setOffset] = useState(100);
  
  useEffect(() => {
    const timer = setTimeout(() => {
      setOffset(100 - percentage);
    }, 100);
    return () => clearTimeout(timer);
  }, [percentage]);

  let color = 'var(--amber)';
  if (percentage >= 95) color = 'var(--green)';
  else if (percentage >= 85) color = 'var(--blue)';

  return (
    <div className="progress-ring-container">
      <svg viewBox="0 0 36 36" className="circular-chart">
        <path className="circle-bg"
          d="M18 2.0845
            a 15.9155 15.9155 0 0 1 0 31.831
            a 15.9155 15.9155 0 0 1 0 -31.831"
        />
        <path className="circle"
          strokeDasharray="100, 100"
          strokeDashoffset={offset}
          style={{ stroke: color }}
          d="M18 2.0845
            a 15.9155 15.9155 0 0 1 0 31.831
            a 15.9155 15.9155 0 0 1 0 -31.831"
        />
      </svg>
      <span className="percentage">{percentage}%</span>
    </div>
  );
};

export default function Drivers() {
  const { globalSearch } = useGlobalSearch();
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [activeFilter, setActiveFilter] = useState(null);
  const [popoverActiveRow, setPopoverActiveRow] = useState(null);
  const popoverRef = useRef(null);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newDriverHighlighted, setNewDriverHighlighted] = useState(null);

  // Add Driver Form State
  const [formData, setFormData] = useState({
    name: '', license: '', category: 'LMV', expiry: '', contact: ''
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

  const handleStatusChange = async (driverId, newStatusOption, isExpired, e) => {
    e.stopPropagation();
    if (isExpired && (newStatusOption.label === 'Available' || newStatusOption.label === 'On Trip')) {
      const optionEl = e.currentTarget;
      optionEl.classList.add('shake');
      setTimeout(() => optionEl.classList.remove('shake'), 500);

      const driverName = drivers.find(d => d.id === driverId)?.name;
      const evt = new CustomEvent('app-toast', { detail: `Blocked — ${driverName}'s license is expired, cannot assign trips.`, type: 'error' });
      window.dispatchEvent(evt);
      return;
    }

    try {
      // Map statuses correctly to match DB values (e.g. On Trip)
      const dbStatusValue = newStatusOption.label === 'On Trip' ? 'On Trip' : newStatusOption.label;
      await apiRequest('PUT', `/drivers/${driverId}`, { status: dbStatusValue });
      
      const dName = drivers.find(d => d.id === driverId)?.name || 'Driver';
      const evt = new CustomEvent('app-toast', { detail: `${dName} set to ${newStatusOption.label}` });
      window.dispatchEvent(evt);
      
      loadDrivers();
    } catch (err) {
      const evt = new CustomEvent('app-toast', { detail: err.message || 'Failed to update status', type: 'error' });
      window.dispatchEvent(evt);
    }
    setPopoverActiveRow(null);
  };

  const parseExpiryDate = (str) => {
    if (!str) return new Date().toISOString();
    const parts = str.split('/');
    if (parts.length === 2) {
      const month = parseInt(parts[0], 10);
      const year = parseInt(parts[1], 10);
      if (!isNaN(month) && !isNaN(year)) {
        return new Date(year, month - 1, 1).toISOString();
      }
    }
    return new Date(str).toISOString();
  };

  const handleAddDriver = async (e) => {
    e.preventDefault();
    
    // License duplicate check
    if (drivers.some(d => d.license_number.toLowerCase() === formData.license.toLowerCase())) {
      const evt = new CustomEvent('app-toast', { detail: 'License number must be unique', type: 'error' });
      window.dispatchEvent(evt);
      return;
    }

    try {
      const dateStr = parseExpiryDate(formData.expiry);
      
      const res = await apiRequest('POST', '/drivers', {
        name: formData.name,
        license_number: formData.license,
        license_category: formData.category,
        license_expiry_date: dateStr,
        contact_number: formData.contact,
        safety_score: 95
      });
      
      setIsModalOpen(false);
      setFormData({ name: '', license: '', category: 'LMV', expiry: '', contact: '' });
      
      const newId = res.data.id;
      setNewDriverHighlighted(newId);
      setTimeout(() => setNewDriverHighlighted(null), 2500);

      const evt = new CustomEvent('app-toast', { detail: `${formData.name} added to the roster` });
      window.dispatchEvent(evt);
      
      loadDrivers();
    } catch (err) {
      const evt = new CustomEvent('app-toast', { detail: err.message || 'Failed to register driver', type: 'error' });
      window.dispatchEvent(evt);
    }
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

  const getSafetyColor = (score) => {
    if (score >= 90) return 'green';
    if (score >= 75) return 'teal';
    if (score >= 60) return 'orange';
    return 'red';
  };

  const getSafetyText = (score) => {
    if (score >= 90) return 'Excellent';
    if (score >= 75) return 'Good';
    if (score >= 60) return 'Needs Review';
    return 'Critical';
  };

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
          <h1 className="text-2xl heading">Drivers & Safety Profiles</h1>
          <p className="text-sm text-muted mt-1">Track licensing, safety scores, and live availability across the roster.</p>
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
                <th style={{ paddingLeft: '2rem' }}>Driver</th>
                <th>License no.</th>
                <th>Category</th>
                <th>Expiry</th>
                <th>Contact</th>
                <th className="text-center">Trip compl.</th>
                <th>Safety</th>
                <th>Status</th>
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
                    <td><span className="pill pill-indigo category-pill">{d.license_category}</span></td>
                    <td>
                      <div className="flex items-center gap-2">
                        <span className="mono text-xs">{new Date(d.license_expiry_date).toLocaleDateString()}</span>
                        {expired && <span className="pill pill-red" style={{ fontSize: '0.6rem', padding: '0.15rem 0.35rem' }}>EXPIRED</span>}
                        {expiringSoon && <span className="pill pill-orange" style={{ fontSize: '0.6rem', padding: '0.15rem 0.35rem' }}>EXP IN 30D</span>}
                      </div>
                    </td>
                    <td className="mono text-xs">{d.contact_number}</td>
                    <td className="text-center">
                      <ProgressRing percentage={d.safety_score >= 80 ? 98 : 88} />
                    </td>
                    <td>
                      <span className={`pill pill-${getSafetyColor(d.safety_score)}`}>{getSafetyText(d.safety_score)}</span>
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
              <p className="text-xs text-muted">New drivers default to Off Duty.</p>
            </div>
            <form onSubmit={handleAddDriver}>
              <div className="flex flex-col gap-2">
                <div className="input-group mb-2">
                  <label>Full name</label>
                  <input type="text" className="input w-full" required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                </div>
                <div className="input-group mb-2">
                  <label>License no.</label>
                  <input type="text" className="input mono text-sm w-full" required value={formData.license} onChange={e => setFormData({...formData, license: e.target.value})} />
                </div>
                <div className="grid grid-cols-2 gap-4 mb-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="input-group">
                    <label>Category</label>
                    <select className="select w-full" value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})}>
                      <option value="LMV">LMV</option>
                      <option value="HMV">HMV</option>
                    </select>
                  </div>
                  <div className="input-group">
                    <label>License expiry</label>
                    <input type="text" className="input mono text-sm w-full" placeholder="MM/YYYY" required value={formData.expiry} onChange={e => setFormData({...formData, expiry: e.target.value})} />
                  </div>
                </div>
                <div className="input-group mb-4">
                  <label>Contact</label>
                  <input type="text" className="input mono text-sm w-full" required value={formData.contact} onChange={e => setFormData({...formData, contact: e.target.value})} />
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
    </div>
  );
}
