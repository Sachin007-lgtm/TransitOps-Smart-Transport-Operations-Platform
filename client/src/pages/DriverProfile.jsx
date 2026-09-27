import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, Download, RefreshCw } from 'lucide-react';
import { apiRequest } from '../utils/api';
import './VehicleProfile.css'; // Re-use identical profile styling
import { validateIndianLicenseNumber, formatIndianLicenseNumber, formatDateForInput, INDIAN_LICENSE_CATEGORIES } from '../components/drivers/driverConstants';

const REQUIRED_DOCS = [
  { type: 'License', iconColor: '#1F9254' }
];

export default function DriverProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [driver, setDriver] = useState(null);
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

  return (
    <div className="vp-container">
      <div className="vp-back-link">
        <Link to="/drivers">
          <ArrowLeft size={16} />
          Back to drivers
        </Link>
      </div>

      <div className="vp-header">
        <div className="vp-header-main">
          <h1>{driver.name}</h1>
          <span className={`vp-status-pill ${driver.status === 'Available' ? 'available' : 'other'}`}>
            {driver.status || 'Available'}
          </span>
        </div>
        <div className="vp-subtitle">
          {driver.phone} · {driver.license_number ? `DL: ${driver.license_number}` : 'No DL Provided'} · {driver.trips_completed || 0} Trips
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
      </div>

      <div className="vp-content">
        {activeTab === 'details' && (
          <div className="vp-card">
            <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text)' }}>Driver Details</h3>
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

        {activeTab !== 'details' && activeTab !== 'documents' && activeTab !== 'trips' && (
          <div className="vp-card vp-empty-state">
            <p>This section is under construction.</p>
          </div>
        )}
      </div>
    </div>
  );
}
