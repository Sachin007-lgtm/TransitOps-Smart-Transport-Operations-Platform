import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, FileText, Download, RefreshCw, User, Phone, CreditCard, Clock, Activity, MapPin, Calendar } from 'lucide-react';
import { apiRequest } from '../utils/api';
import './VehicleProfile.css'; // Re-use identical profile styling
import { validateIndianLicenseNumber, formatIndianLicenseNumber, formatDateForInput, INDIAN_LICENSE_CATEGORIES } from '../components/drivers/driverConstants';
import { getAvatarColor } from '../components/drivers/driverConstants';

const REQUIRED_DOCS = [
  { type: 'License', iconColor: '#1F9254' }
];

function LicenseCountdown({ expiryDate }) {
  if (!expiryDate) return null;
  const today = new Date(); today.setHours(0,0,0,0);
  const exp = new Date(expiryDate);
  const diffDays = Math.ceil((exp - today) / (24*60*60*1000));
  
  if (diffDays < 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1rem', background: '#FBE4E2', borderRadius: '10px', border: '1px solid #fca5a5' }}>
        <span style={{ fontSize: '1.5rem' }}>⚠️</span>
        <div>
          <div style={{ fontWeight: 700, color: '#C4453D', fontSize: '0.9rem' }}>License Expired</div>
          <div style={{ fontSize: '0.75rem', color: '#9a3d35' }}>Expired {Math.abs(diffDays)} days ago — renewal required</div>
        </div>
      </div>
    );
  }
  if (diffDays <= 30) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1rem', background: '#FEF3C7', borderRadius: '10px', border: '1px solid #fcd34d' }}>
        <span style={{ fontSize: '1.5rem' }}>⏳</span>
        <div>
          <div style={{ fontWeight: 700, color: '#92400E', fontSize: '0.9rem' }}>License Expiring Soon</div>
          <div style={{ fontSize: '0.75rem', color: '#78350f' }}>{diffDays} day{diffDays !== 1 ? 's' : ''} remaining — start renewal process</div>
        </div>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1rem', background: '#DFF5E6', borderRadius: '10px', border: '1px solid #86efac' }}>
      <span style={{ fontSize: '1.5rem' }}>✅</span>
      <div>
        <div style={{ fontWeight: 700, color: '#1F9254', fontSize: '0.9rem' }}>License Valid</div>
        <div style={{ fontSize: '0.75rem', color: '#166534' }}>{diffDays} days remaining until expiry</div>
      </div>
    </div>
  );
}

function InfoCard({ icon: Icon, label, value, mono = false }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', padding: '0.9rem 1rem', background: '#fafaf9', borderRadius: '10px', border: '1px solid #f0ede8' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--sub)', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {Icon && <Icon size={12} />} {label}
      </div>
      <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text)', fontFamily: mono ? 'var(--font-mono)' : 'inherit' }}>
        {value || '—'}
      </div>
    </div>
  );
}

export default function DriverProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [driver, setDriver] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  // Read initial tab from navigation state (avatar → overview, Documents btn → documents)
  const [activeTab, setActiveTab] = useState(location.state?.tab || 'overview');

  // Form states for Upload Document
  const [uploadingDoc, setUploadingDoc] = useState(null);
  const [uploadMethod, setUploadMethod] = useState('file');
  const [fileUrl, setFileUrl] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');

  // Form states for Edit Details
  const [editForm, setEditForm] = useState({
    name: '',
    license: '',
    category: 'LMV-TR',
    expiry: '',
    contact: '',
    status: 'Off Duty'
  });
  const [isSavingDetails, setIsSavingDetails] = useState(false);

  async function loadProfile() {
    try {
      setLoading(true);
      const dRes = await apiRequest('GET', `/drivers`); 
      const matched = dRes.data?.find(d => String(d.id) === String(id));
      if (matched) {
        setDriver(matched);
        setEditForm({
          name: matched.name || '',
          license: matched.license_number || '',
          category: matched.license_category || 'LMV-TR',
          expiry: formatDateForInput(matched.license_expiry_date),
          contact: (matched.contact_number || '').replace(/^\+91\s?/, ''),
          status: matched.status === 'On Trip' ? 'On Trip' : matched.status || 'Off Duty'
        });
      } else {
        window.showToast('Driver not found', 'error');
        navigate('/drivers');
        return;
      }

      const docRes = await apiRequest('GET', `/documents/DRIVER/${id}`);
      if (docRes && Array.isArray(docRes)) {
        setDocuments(docRes);
      }

      const tripsRes = await apiRequest('GET', `/trips`);
      if (tripsRes.data && Array.isArray(tripsRes.data)) {
        const myTrips = tripsRes.data.filter(t => String(t.driver_id) === String(id));
        setTrips(myTrips);
      }
    } catch (err) {
      console.error(err);
      window.showToast('Failed to load profile', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, navigate]);

  const handleSaveDocument = async (e, docType) => {
    e.preventDefault();
    if (!expiryDate || !fileUrl) {
      window.showToast('File URL and Expiry Date are required', 'error');
      return;
    }

    try {
      await apiRequest('POST', '/documents', {
        entity_type: 'DRIVER',
        entity_id: id,
        document_type: docType,
        file_url: fileUrl,
        issue_date: issueDate || null,
        expiry_date: expiryDate
      });
      
      window.showToast(`${docType} document updated`, 'success');
      setUploadingDoc(null);
      loadProfile();
    } catch (err) {
      console.error('Save failed', err);
      window.showToast('Failed to save document', 'error');
    }
  };

  const handleSaveDetails = async (e) => {
    e.preventDefault();
    if (!editForm.name.trim() || !editForm.license.trim() || !editForm.expiry.trim() || !editForm.contact.trim()) {
      window.showToast('All fields marked with * are required.', 'error');
      return;
    }

    const licenseErr = validateIndianLicenseNumber(editForm.license);
    if (licenseErr) {
      window.showToast(licenseErr, 'error');
      return;
    }

    const editPhoneDigits = editForm.contact.replace(/\D/g, '');
    if (editPhoneDigits.length < 10) {
      window.showToast('Please enter a valid 10-digit contact number.', 'error');
      return;
    }

    const formattedContact = editForm.contact.trim().startsWith('+91')
      ? editForm.contact.trim()
      : `+91 ${editForm.contact.trim()}`;

    const payload = {
      name: editForm.name.trim(),
      license_number: formatIndianLicenseNumber(editForm.license.trim()),
      license_category: editForm.category,
      license_expiry_date: editForm.expiry,
      contact_number: formattedContact
    };

    if (driver.status !== 'On Trip') {
      payload.status = editForm.status;
    }

    try {
      setIsSavingDetails(true);
      await apiRequest('PUT', `/drivers/${id}`, payload);
      window.showToast('Driver details updated', 'success');
      loadProfile();
    } catch (err) {
      console.error('Save failed', err);
      window.showToast(err.message || 'Failed to update driver', 'error');
    } finally {
      setIsSavingDetails(false);
    }
  };

  if (loading || !driver) {
    return <div className="p-8 text-center text-muted">Loading profile...</div>;
  }

  const combinedDocs = REQUIRED_DOCS.map(req => {
    const existing = documents.find(d => d.document_type.toUpperCase() === req.type.toUpperCase());
    return { ...req, existing };
  });

  const uploadedCount = combinedDocs.filter(d => d.existing).length;
  const progressPercent = (uploadedCount / REQUIRED_DOCS.length) * 100;
  const isOnTrip = driver.status === 'On Trip' || driver.status === 'On trip';

  // License expiry info
  const today = new Date(); today.setHours(0,0,0,0);
  const exp = driver.license_expiry_date ? new Date(driver.license_expiry_date) : null;
  const daysLeft = exp ? Math.ceil((exp - today) / (24*60*60*1000)) : null;

  // Avatar color
  const avatarBg = getAvatarColor ? getAvatarColor(driver.name) : '#3F1A32';

  // Completed trips
  const completedTrips = trips.filter(t => t.status === 'Completed').length;

  return (
    <div className="vp-container">
      <div className="vp-back-link">
        <Link to="/drivers">
          <ArrowLeft size={16} />
          Back to drivers
        </Link>
      </div>

      <div className="vp-tabs">
        <button 
          className={`vp-tab ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button 
          className={`vp-tab ${activeTab === 'details' ? 'active' : ''}`}
          onClick={() => setActiveTab('details')}
        >
          Edit Details
        </button>
        <button 
          className={`vp-tab ${activeTab === 'documents' ? 'active' : ''}`}
          onClick={() => setActiveTab('documents')}
        >
          Documents & Compliance
        </button>
        <button 
          className={`vp-tab ${activeTab === 'trips' ? 'active' : ''}`}
          onClick={() => setActiveTab('trips')}
        >
          Trip History
        </button>
      </div>

      <div className="vp-content">
        {/* ── OVERVIEW TAB (read-only, rich view) ── */}
        {activeTab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Driver Identity Card */}
            <div className="vp-card" style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
              {/* Avatar */}
              <div style={{
                width: '80px',
                height: '80px',
                borderRadius: '50%',
                background: avatarBg,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '2rem',
                fontWeight: 700,
                color: 'white',
                flexShrink: 0,
                boxShadow: `0 4px 20px ${avatarBg}55`
              }}>
                {driver.name ? driver.name.substring(0, 2).toUpperCase() : 'DR'}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--text)', marginBottom: '0.35rem' }}>{driver.name}</div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <span className={`vp-status-pill ${driver.status === 'Available' ? 'available' : 'other'}`}>{driver.status || 'Available'}</span>
                  {driver.license_category && (
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, padding: '0.2rem 0.6rem', borderRadius: '12px', background: '#EEF2FF', color: '#4F46E5' }}>
                      {driver.license_category}
                    </span>
                  )}
                  {driver.must_change_password ? (
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '0.2rem 0.6rem', borderRadius: '12px', background: '#FEF3C7', color: '#92400E' }}>
                      Pending 1st Login
                    </span>
                  ) : (
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '0.2rem 0.6rem', borderRadius: '12px', background: '#DCFCE7', color: '#166534' }}>
                      App Active
                    </span>
                  )}
                </div>
              </div>
              {/* Stats */}
              <div style={{ display: 'flex', gap: '1.5rem', flexShrink: 0 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text)', lineHeight: 1 }}>{driver.trips_count ?? driver.trips_completed ?? 0}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--sub)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '0.25rem' }}>Total Trips</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text)', lineHeight: 1 }}>{completedTrips}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--sub)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '0.25rem' }}>Completed</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '1.75rem', fontWeight: 700, color: uploadedCount === REQUIRED_DOCS.length ? '#1F9254' : '#C4453D', lineHeight: 1 }}>{uploadedCount}/{REQUIRED_DOCS.length}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--sub)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '0.25rem' }}>Docs</div>
                </div>
              </div>
            </div>

            {/* License Expiry Alert */}
            <LicenseCountdown expiryDate={driver.license_expiry_date} />

            {/* Details Grid */}
            <div className="vp-card">
              <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--sub)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '1rem' }}>Driver Information</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem' }}>
                <InfoCard icon={Phone} label="Contact" value={driver.contact_number || driver.phone} mono />
                <InfoCard icon={CreditCard} label="License No." value={driver.license_number} mono />
                <InfoCard icon={Activity} label="License Category" value={driver.license_category} />
                <InfoCard icon={Calendar} label="License Expiry" value={driver.license_expiry_date ? new Date(driver.license_expiry_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'} />
                <InfoCard icon={Clock} label="Time Left" value={daysLeft !== null ? (daysLeft < 0 ? 'Expired' : `${daysLeft} days`) : '—'} />
                <InfoCard icon={User} label="Status" value={driver.status || 'Available'} />
              </div>
            </div>

            {/* Recent Trips Preview */}
            {trips.length > 0 && (
              <div className="vp-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--sub)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Recent Trips</h3>
                  <button
                    onClick={() => setActiveTab('trips')}
                    style={{ fontSize: '0.78rem', fontWeight: 600, color: '#3F1A32', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    View all
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {trips.slice(0, 4).map(t => (
                    <div key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.6rem 0.75rem', borderRadius: '8px', background: '#fafaf9', border: '1px solid #f0ede8' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.84rem' }}>
                        <MapPin size={12} style={{ color: 'var(--sub)' }} />
                        <span style={{ color: 'var(--text)', fontWeight: 500 }}>{t.origin_name || t.origin}</span>
                        <span style={{ color: 'var(--sub)' }}>→</span>
                        <span style={{ color: 'var(--text)', fontWeight: 500 }}>{t.destination_name || t.destination}</span>
                      </div>
                      <span className={`vp-status-pill ${t.status === 'Completed' ? 'available' : 'other'}`} style={{ fontSize: '0.65rem' }}>
                        {t.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Quick actions */}
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button
                className="btn btn-primary"
                onClick={() => setActiveTab('details')}
                style={{ fontSize: '0.84rem' }}
              >
                Edit Driver Details
              </button>
              <button
                className="btn btn-outline"
                onClick={() => setActiveTab('documents')}
                style={{ fontSize: '0.84rem' }}
              >
                Manage Documents
              </button>
            </div>
          </div>
        )}

        {/* ── EDIT DETAILS TAB ── */}
        {activeTab === 'details' && (
          <div className="vp-card">
            <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text)' }}>Edit Driver Details</h3>
            <form onSubmit={handleSaveDetails} className="grid grid-cols-2 gap-4 max-w-2xl">
              <div className="input-group col-span-2">
                <label>Full name <span style={{ color: '#ef4444' }}>*</span></label>
                <input 
                  type="text" 
                  className="input text-sm" 
                  required 
                  value={editForm.name} 
                  onChange={e => setEditForm({...editForm, name: e.target.value})} 
                />
              </div>

              <div className="input-group">
                <label>License number <span style={{ color: '#ef4444' }}>*</span></label>
                <input 
                  type="text" 
                  className="input mono text-sm" 
                  required 
                  value={editForm.license} 
                  onChange={e => setEditForm({...editForm, license: e.target.value.toUpperCase()})} 
                />
              </div>

              <div className="input-group">
                <label>License category</label>
                <select 
                  className="select" 
                  value={editForm.category} 
                  onChange={e => setEditForm({...editForm, category: e.target.value})}
                >
                  {INDIAN_LICENSE_CATEGORIES.map((cat) => (
                    <option key={cat.value} value={cat.value}>{cat.label}</option>
                  ))}
                </select>
              </div>

              <div className="input-group">
                <label>License expiry date <span style={{ color: '#ef4444' }}>*</span></label>
                <input 
                  type="date" 
                  className="input" 
                  required
                  value={editForm.expiry} 
                  onChange={e => setEditForm({...editForm, expiry: e.target.value})} 
                />
              </div>

              <div className="input-group">
                <label>Contact number <span style={{ color: '#ef4444' }}>*</span></label>
                <input 
                  type="text" 
                  className="input mono text-sm" 
                  required
                  value={editForm.contact} 
                  onChange={e => setEditForm({...editForm, contact: e.target.value})} 
                />
              </div>

              <div className="input-group col-span-2">
                <label>Status</label>
                {isOnTrip ? (
                  <div className="pill pill-blue font-medium text-xs py-2 px-3 mt-1" title="Driver is currently on active trip">
                    On Trip (Auto-managed)
                  </div>
                ) : (
                  <select 
                    className="select w-1/2" 
                    value={editForm.status} 
                    onChange={e => setEditForm({...editForm, status: e.target.value})}
                  >
                    <option value="Available">Available</option>
                    <option value="Off Duty">Off Duty</option>
                    <option value="Suspended">Suspended</option>
                  </select>
                )}
              </div>

              <div className="col-span-2 mt-4">
                <button type="submit" className="btn btn-primary" disabled={isSavingDetails}>
                  {isSavingDetails ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ── DOCUMENTS TAB ── */}
        {activeTab === 'documents' && (
          <div className="vp-card">
            <div className="vp-progress-header">
              <span>{uploadedCount} of {REQUIRED_DOCS.length} uploaded</span>
            </div>
            <div className="vp-progress-bar">
              <div className="vp-progress-fill" style={{ width: `${progressPercent}%` }}></div>
            </div>

            <div className="vp-doc-list">
              {combinedDocs.map((doc) => {
                const ex = doc.existing;
                let statusLabel = 'MISSING';
                let statusClass = 'missing';
                
                if (ex) {
                  if (ex.status === 'Expired') {
                    statusLabel = 'EXPIRED';
                    statusClass = 'expired';
                  } else {
                    statusLabel = 'VALID';
                    statusClass = 'valid';
                  }
                }

                const isUploading = uploadingDoc === doc.type;

                return (
                  <div className="vp-doc-row" key={doc.type} style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div className="vp-doc-info">
                        <FileText size={18} color={ex ? (statusClass === 'expired' ? '#C4453D' : '#1F9254') : '#B3AEBB'} />
                        <div className="vp-doc-text">
                          <div className="vp-doc-title">{doc.type}</div>
                          <div className={`vp-doc-subtitle ${statusClass}`}>
                            {!ex 
                              ? 'Not uploaded' 
                              : statusClass === 'expired' 
                                ? `Expired ${new Date(ex.expiry_date).toLocaleDateString('en-GB', {day: 'numeric', month: 'short', year: 'numeric'})}`
                                : `Expires ${new Date(ex.expiry_date).toLocaleDateString('en-GB', {day: 'numeric', month: 'short', year: 'numeric'})}`
                            }
                          </div>
                        </div>
                      </div>
                      <div className="vp-doc-actions">
                        <span className={`vp-pill ${statusClass}`}>{statusLabel}</span>
                        
                        {!isUploading && (
                          <>
                            {statusClass === 'valid' && (
                              <>
                                <a href={ex?.file_url} target="_blank" rel="noopener noreferrer" className="vp-action-btn icon-only" title="Download">
                                  <Download size={14} />
                                </a>
                                <button className="vp-action-btn icon-only" title="Refresh" onClick={() => {
                                  setUploadingDoc(doc.type);
                                  setFileUrl(ex?.file_url || '');
                                  setIssueDate(ex?.issue_date ? ex.issue_date.split('T')[0] : '');
                                  setExpiryDate(ex?.expiry_date ? ex.expiry_date.split('T')[0] : '');
                                }}>
                                  <RefreshCw size={14} />
                                </button>
                              </>
                            )}
                            
                            {statusClass === 'expired' && (
                              <button className="vp-action-btn primary" onClick={() => {
                                setUploadingDoc(doc.type);
                                setFileUrl(ex?.file_url || '');
                                setIssueDate(ex?.issue_date ? ex.issue_date.split('T')[0] : '');
                                setExpiryDate('');
                              }}>
                                Renew
                              </button>
                            )}

                            {statusClass === 'missing' && (
                              <button className="vp-action-btn primary" onClick={() => {
                                setUploadingDoc(doc.type);
                                setFileUrl('');
                                setIssueDate('');
                                setExpiryDate('');
                              }}>
                                Upload
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    {isUploading && (
                      <form onSubmit={(e) => handleSaveDocument(e, doc.type)} className="mt-4 pt-3 border-t border-[var(--line)]">
                        <div className="flex flex-col gap-3">
                          <div className="flex gap-4 mb-2">
                            <label className="flex items-center gap-2 text-xs cursor-pointer">
                              <input type="radio" checked={uploadMethod === 'file'} onChange={() => setUploadMethod('file')} />
                              Upload from device
                            </label>
                            <label className="flex items-center gap-2 text-xs cursor-pointer">
                              <input type="radio" checked={uploadMethod === 'link'} onChange={() => setUploadMethod('link')} />
                              Google Drive / URL Link
                            </label>
                          </div>

                          {uploadMethod === 'link' ? (
                            <div className="input-group">
                              <label className="text-xs">Document URL*</label>
                              <input 
                                type="url" 
                                className="input text-sm" 
                                value={fileUrl} 
                                onChange={e => setFileUrl(e.target.value)} 
                                placeholder="https://example.com/doc.pdf" 
                                required 
                              />
                            </div>
                          ) : (
                            <div className="input-group">
                              <label className="text-xs">Select File*</label>
                              <input 
                                type="file" 
                                className="input text-sm" 
                                onChange={(e) => {
                                  const file = e.target.files[0];
                                  if (file) {
                                    if (file.size > 5 * 1024 * 1024) {
                                      window.showToast('File too large. Max 5MB.', 'error');
                                      e.target.value = '';
                                      return;
                                    }
                                    const reader = new FileReader();
                                    reader.onloadend = () => {
                                      setFileUrl(reader.result);
                                    };
                                    reader.readAsDataURL(file);
                                  } else {
                                    setFileUrl('');
                                  }
                                }}
                                required={!fileUrl || !fileUrl.startsWith('data:')}
                                accept="image/*,.pdf"
                              />
                            </div>
                          )}
                          <div className="grid grid-cols-2 gap-3">
                            <div className="input-group">
                              <label className="text-xs">Issue Date</label>
                              <input 
                                type="date" 
                                className="input text-sm" 
                                value={issueDate} 
                                onChange={e => setIssueDate(e.target.value)} 
                              />
                            </div>
                            <div className="input-group">
                              <label className="text-xs">Expiry Date*</label>
                              <input 
                                type="date" 
                                className="input text-sm" 
                                value={expiryDate} 
                                onChange={e => setExpiryDate(e.target.value)} 
                                required 
                              />
                            </div>
                          </div>
                          <div className="flex justify-end gap-2 mt-2">
                            <button type="button" className="btn btn-outline" style={{ padding: '0.3rem 0.75rem', fontSize: '0.8rem' }} onClick={() => setUploadingDoc(null)}>Cancel</button>
                            <button type="submit" className="btn btn-primary" style={{ padding: '0.3rem 0.75rem', fontSize: '0.8rem' }}>Save {doc.type}</button>
                          </div>
                        </div>
                      </form>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── TRIP HISTORY TAB ── */}
        {activeTab === 'trips' && (
          <div className="vp-card">
            <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text)' }}>Trip History</h3>
            {trips.length === 0 ? (
              <p className="text-sm text-muted">No trips recorded for this driver yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-[var(--line)]">
                      <th className="py-2 font-medium">Trip ID</th>
                      <th className="py-2 font-medium">Origin</th>
                      <th className="py-2 font-medium">Destination</th>
                      <th className="py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trips.map(t => (
                      <tr key={t.id} className="border-b border-[var(--line)] last:border-0 hover:bg-[#fcfcfc]">
                        <td className="py-3 pr-4 font-mono text-xs">{t.id.substring(0,8)}</td>
                        <td className="py-3 pr-4">{t.origin_name || t.origin}</td>
                        <td className="py-3 pr-4">{t.destination_name || t.destination}</td>
                        <td className="py-3">
                          <span className={`vp-status-pill ${t.status === 'Completed' ? 'available' : 'other'}`}>
                            {t.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
