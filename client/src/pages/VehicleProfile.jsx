import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, Download, RefreshCw } from 'lucide-react';
import { apiRequest } from '../utils/api';
import './VehicleProfile.css';
import { formatIndianNumberPlate, validateIndianNumberPlate } from '../utils/numberPlate';

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
  const [activeTab, setActiveTab] = useState('documents');

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
          className={`vp-tab ${activeTab === 'details' ? 'active' : ''}`}
          onClick={() => setActiveTab('details')}
        >
          Details
        </button>
        <button 
          className={`vp-tab ${activeTab === 'documents' ? 'active' : ''}`}
          onClick={() => setActiveTab('documents')}
        >
          Documents and compliance
        </button>
        <button 
          className={`vp-tab ${activeTab === 'trips' ? 'active' : ''}`}
          onClick={() => setActiveTab('trips')}
        >
          Trip history
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
          Fuel and cost
        </button>
      </div>

      <div className="vp-content">
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

        {activeTab !== 'details' && activeTab !== 'documents' && activeTab !== 'trips' && (
          <div className="vp-card vp-empty-state">
            <p>This section is under construction.</p>
          </div>
        )}
      </div>
    </div>
  );
}
