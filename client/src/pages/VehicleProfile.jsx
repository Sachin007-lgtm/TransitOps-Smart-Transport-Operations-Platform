import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, Download, RefreshCw, Truck, Gauge, Activity, MapPin, CheckCircle, AlertCircle } from 'lucide-react';
import { apiRequest } from '../utils/api';
import './VehicleProfile.css';
import { formatIndianNumberPlate, validateIndianNumberPlate } from '../utils/numberPlate';

function VehicleInfoCard({ icon: Icon, label, value, mono = false }) {
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

const REQUIRED_DOCS = [
  { type: 'Insurance', iconColor: '#1F9254' },
  { type: 'Permit', iconColor: '#C4453D' },
  { type: 'RC', iconColor: '#B3AEBB' },
  { type: 'Fitness', iconColor: '#B3AEBB' },
  { type: 'Pollution', iconColor: '#B3AEBB' }
];

export default function VehicleProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [vehicle, setVehicle] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  // Form states for Upload Document
  const [uploadingDoc, setUploadingDoc] = useState(null);
  const [uploadMethod, setUploadMethod] = useState('file');
  const [fileUrl, setFileUrl] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');

  // Form states for Edit Details
  const [editForm, setEditForm] = useState({
    numberPlate: '',
    type: 'Truck',
    size: 'Medium (14ft)',
    distanceCovered: '',
    status: 'Available'
  });
  const [isSavingDetails, setIsSavingDetails] = useState(false);

  async function loadProfile() {
    try {
      setLoading(true);
      const vRes = await apiRequest('GET', `/vehicles`);
      const matched = vRes.data?.find(v => String(v.id) === String(id));
      if (matched) {
        setVehicle(matched);
        setEditForm({
          numberPlate: matched.number_plate || matched.registration_number || '',
          type: matched.type || 'Truck',
          size: matched.size || 'Medium (14ft)',
          distanceCovered: matched.distance_covered || 0,
          status: matched.status || 'Available'
        });
      } else {
        window.showToast('Vehicle not found', 'error');
        navigate('/vehicles');
        return;
      }

      const dRes = await apiRequest('GET', `/documents/VEHICLE/${id}`);
      if (dRes && Array.isArray(dRes)) {
        setDocuments(dRes);
      }

      const tripsRes = await apiRequest('GET', `/trips`);
      if (tripsRes.data && Array.isArray(tripsRes.data)) {
        const myTrips = tripsRes.data.filter(t => String(t.vehicle_id) === String(id));
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
        entity_type: 'VEHICLE',
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
    const rawPlate = editForm.numberPlate.trim().toUpperCase();
    const plateErr = validateIndianNumberPlate(rawPlate);
    if (plateErr) {
      window.showToast(plateErr, 'error');
      return;
    }

    const payload = {
      registration_number: formatIndianNumberPlate(rawPlate),
      number_plate: formatIndianNumberPlate(rawPlate),
      type: editForm.type,
      size: editForm.size,
      odometer: editForm.distanceCovered,
      status: editForm.status === 'On Trip' || editForm.status === 'On trip' ? 'On Trip' : (editForm.status === 'Maintenance' ? 'In Shop' : 'Available')
    };

    try {
      setIsSavingDetails(true);
      await apiRequest('PATCH', `/vehicles/${id}`, payload);
      window.showToast('Vehicle details updated', 'success');
      loadProfile();
    } catch (err) {
      console.error('Save failed', err);
      window.showToast(err.message || 'Failed to update vehicle', 'error');
    } finally {
      setIsSavingDetails(false);
    }
  };

  if (loading || !vehicle) {
    return <div className="p-8 text-center text-muted">Loading profile...</div>;
  }

  const combinedDocs = REQUIRED_DOCS.map(req => {
    const existing = documents.find(d => d.document_type.toUpperCase() === req.type.toUpperCase());
    return { ...req, existing };
  });

  const uploadedCount = combinedDocs.filter(d => d.existing).length;
  const progressPercent = (uploadedCount / REQUIRED_DOCS.length) * 100;
  const isOnTrip = vehicle.status === 'On Trip' || vehicle.status === 'On trip';

  // Vehicle status color
  const statusColor = vehicle.status === 'Available' ? '#1F9254' : vehicle.status === 'On Trip' || vehicle.status === 'On trip' ? '#2563eb' : vehicle.status === 'In Shop' || vehicle.status === 'In shop' ? '#ea580c' : '#736D7D';
  const statusBg = vehicle.status === 'Available' ? '#DFF5E6' : vehicle.status === 'On Trip' || vehicle.status === 'On trip' ? '#DBEAFE' : vehicle.status === 'In Shop' || vehicle.status === 'In shop' ? '#FFEDD5' : '#F0EEF3';
  const completedTrips = trips.filter(t => t.status === 'Completed').length;

  return (
    <div className="vp-container">
      <div className="vp-back-link">
        <Link to="/vehicles">
          <ArrowLeft size={16} />
          Back to fleet
        </Link>
      </div>

      <div className="vp-header">
        <div className="vp-header-main">
          <h1>{vehicle.number_plate || vehicle.registration_number}</h1>
          <span className={`vp-status-pill ${vehicle.status === 'Available' ? 'available' : 'other'}`}>
            {vehicle.status || 'Available'}
          </span>
        </div>
        <div className="vp-subtitle">
          {vehicle.type || 'Van'} · {vehicle.size || 'Medium'} · {vehicle.distance_covered || 0} km
        </div>
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
        <button 
          className={`vp-tab ${activeTab === 'maintenance' ? 'active' : ''}`}
          onClick={() => setActiveTab('maintenance')}
        >
          Maintenance
        </button>
        <button 
          className={`vp-tab ${activeTab === 'fuel' ? 'active' : ''}`}
          onClick={() => setActiveTab('fuel')}
        >
          Fuel & Cost
        </button>
      </div>

      <div className="vp-content">
        {/* ── OVERVIEW TAB (read-only, rich view) ── */}
        {activeTab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Vehicle Identity Card */}
            <div className="vp-card" style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
              {/* Vehicle icon */}
              <div style={{
                width: '80px',
                height: '80px',
                borderRadius: '16px',
                background: statusBg,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                border: `2px solid ${statusColor}33`
              }}>
                <Truck size={36} style={{ color: statusColor }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--text)', marginBottom: '0.35rem', fontFamily: 'var(--font-mono)' }}>
                  {vehicle.number_plate || vehicle.registration_number}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <span className={`vp-status-pill ${vehicle.status === 'Available' ? 'available' : 'other'}`}>{vehicle.status || 'Available'}</span>
                  {vehicle.type && (
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, padding: '0.2rem 0.6rem', borderRadius: '12px', background: '#F0EEF3', color: '#736D7D' }}>
                      {vehicle.type}
                    </span>
                  )}
                  {vehicle.size && (
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, padding: '0.2rem 0.6rem', borderRadius: '12px', background: '#EEF2FF', color: '#4F46E5' }}>
                      {vehicle.size}
                    </span>
                  )}
                </div>
              </div>
              {/* Stats */}
              <div style={{ display: 'flex', gap: '1.5rem', flexShrink: 0 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text)', lineHeight: 1 }}>{vehicle.trips_completed ?? 0}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--sub)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '0.25rem' }}>Trips Done</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text)', lineHeight: 1 }}>{uploadedCount}/{REQUIRED_DOCS.length}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--sub)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '0.25rem' }}>Docs</div>
                </div>
              </div>
            </div>

            {/* In Shop alert */}
            {(vehicle.status === 'In Shop' || vehicle.status === 'In shop') && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1rem', background: '#FFEDD5', borderRadius: '10px', border: '1px solid #fed7aa' }}>
                <AlertCircle size={20} style={{ color: '#ea580c', flexShrink: 0 }} />
                <div>
                  <div style={{ fontWeight: 700, color: '#ea580c', fontSize: '0.9rem' }}>Vehicle In Maintenance</div>
                  <div style={{ fontSize: '0.75rem', color: '#9a3412' }}>This vehicle is currently offline in service. Not available for dispatch.</div>
                </div>
              </div>
            )}

            {/* Doc compliance alert */}
            {uploadedCount < REQUIRED_DOCS.length && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1rem', background: '#FEF3C7', borderRadius: '10px', border: '1px solid #fcd34d' }}>
                <AlertCircle size={20} style={{ color: '#92400E', flexShrink: 0 }} />
                <div>
                  <div style={{ fontWeight: 700, color: '#92400E', fontSize: '0.9rem' }}>Compliance Incomplete</div>
                  <div style={{ fontSize: '0.75rem', color: '#78350f' }}>{REQUIRED_DOCS.length - uploadedCount} document(s) missing — go to Documents tab to upload.</div>
                </div>
              </div>
            )}

            {/* Details Grid */}
            <div className="vp-card">
              <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--sub)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '1rem' }}>Vehicle Information</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem' }}>
                <VehicleInfoCard icon={Truck} label="Vehicle Type" value={vehicle.type} />
                <VehicleInfoCard icon={Activity} label="Size / Category" value={vehicle.size || vehicle.sub_category} />
                <VehicleInfoCard icon={Gauge} label="Distance Covered" value={vehicle.distance_covered ? `${Number(vehicle.distance_covered).toLocaleString('en-IN')} km` : '0 km'} mono />
                <VehicleInfoCard icon={CheckCircle} label="Status" value={vehicle.status || 'Available'} />
              </div>
            </div>

            {/* Document compliance */}
            <div className="vp-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--sub)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Document Compliance</h3>
                <span style={{ fontSize: '0.78rem', color: 'var(--sub)', fontWeight: 500 }}>{uploadedCount} / {REQUIRED_DOCS.length}</span>
              </div>
              <div className="vp-progress-bar" style={{ marginBottom: '0.75rem' }}>
                <div className="vp-progress-fill" style={{ width: `${progressPercent}%`, background: uploadedCount === REQUIRED_DOCS.length ? '#1F9254' : '#ea580c' }}></div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {combinedDocs.map(doc => {
                  const ex = doc.existing;
                  const status = !ex ? 'missing' : ex.status === 'Expired' ? 'expired' : 'valid';
                  return (
                    <span key={doc.type} className={`vp-pill ${status}`}>
                      {doc.type} · {status.toUpperCase()}
                    </span>
                  );
                })}
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
                Edit Vehicle Details
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

        {activeTab === 'details' && (
          <div className="vp-card">
            <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text)' }}>Vehicle Details</h3>
            <form onSubmit={handleSaveDetails} className="grid grid-cols-2 gap-4 max-w-2xl">
              <div className="input-group col-span-2">
                <label>Number Plate <span style={{ color: '#ef4444' }}>*</span></label>
                <input 
                  type="text" 
                  className="input mono text-sm" 
                  required 
                  value={editForm.numberPlate} 
                  onChange={e => setEditForm({...editForm, numberPlate: e.target.value.toUpperCase()})} 
                />
              </div>

              <div className="input-group">
                <label>Vehicle Type</label>
                <select 
                  className="select" 
                  value={editForm.type} 
                  onChange={e => setEditForm({...editForm, type: e.target.value})}
                >
                  {['Truck', 'Van', 'Mini'].map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              <div className="input-group">
                <label>Vehicle Size</label>
                <select 
                  className="select" 
                  value={editForm.size} 
                  onChange={e => setEditForm({...editForm, size: e.target.value})}
                >
                  {['Small (8ft)', 'Medium (14ft)', 'Heavy (24ft)', 'Extra Heavy (32ft)'].map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div className="input-group">
                <label>Distance Covered (km)</label>
                <input 
                  type="text" 
                  inputMode="decimal"
                  className="input" 
                  value={editForm.distanceCovered} 
                  onChange={e => {
                    const val = e.target.value;
                    if (val === '' || /^\d*\.?\d*$/.test(val)) {
                      setEditForm({...editForm, distanceCovered: val});
                    }
                  }} 
                />
              </div>

              <div className="input-group">
                <label>Status</label>
                {isOnTrip ? (
                  <div className="pill pill-blue font-medium text-xs py-2 px-3 mt-1" title="Vehicle is on trip">
                    On Trip (Auto-managed)
                  </div>
                ) : (
                  <select 
                    className="select" 
                    value={editForm.status} 
                    onChange={e => setEditForm({...editForm, status: e.target.value})}
                  >
                    <option value="Available">Available</option>
                    <option value="Maintenance">Maintenance</option>
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

        {activeTab === 'trips' && (
          <div className="vp-card">
            <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text)' }}>Trip History</h3>
            {trips.length === 0 ? (
              <p className="text-sm text-muted">No trips recorded for this vehicle yet.</p>
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

        {activeTab !== 'overview' && activeTab !== 'details' && activeTab !== 'documents' && activeTab !== 'trips' && (
          <div className="vp-card vp-empty-state">
            <p>This section is under construction.</p>
          </div>
        )}
      </div>
    </div>
  );
}
