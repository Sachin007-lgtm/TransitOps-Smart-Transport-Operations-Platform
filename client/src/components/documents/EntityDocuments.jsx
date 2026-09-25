import React, { useState, useEffect } from 'react';
import { apiRequest } from '../../utils/api';
import { FileText, Upload, Calendar, AlertTriangle, CheckCircle } from 'lucide-react';

const REQUIRED_DOCS = {
  DRIVER: ['LICENSE'],
  VEHICLE: ['RC', 'INSURANCE', 'PERMIT', 'FITNESS', 'POLLUTION']
};

export default function EntityDocuments({ entityType, entityId }) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(null);

  // Form states for uploading
  const [fileUrl, setFileUrl] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');

  const requiredTypes = REQUIRED_DOCS[entityType] || [];

  const loadDocuments = async () => {
    try {
      setLoading(true);
      const res = await apiRequest('GET', `/documents/${entityType}/${entityId}`);
      if (res && Array.isArray(res)) {
        setDocuments(res);
      }
    } catch (err) {
      console.error('Failed to load documents', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (entityId) {
      loadDocuments();
    }
  }, [entityId, entityType]);

  const handleSave = async (e, docType) => {
    e.preventDefault();
    if (!expiryDate || !fileUrl) {
      window.dispatchEvent(new CustomEvent('app-toast', { detail: 'File URL and Expiry Date are required', type: 'error' }));
      return;
    }

    try {
      await apiRequest('POST', '/documents', {
        entity_type: entityType,
        entity_id: entityId,
        document_type: docType,
        file_url: fileUrl,
        issue_date: issueDate || null,
        expiry_date: expiryDate
      });
      
      window.dispatchEvent(new CustomEvent('app-toast', { detail: `${docType} document updated` }));
      setUploadingDoc(null);
      setFileUrl('');
      setIssueDate('');
      setExpiryDate('');
      loadDocuments();
    } catch (err) {
      console.error('Save failed', err);
      window.dispatchEvent(new CustomEvent('app-toast', { detail: 'Failed to save document', type: 'error' }));
    }
  };

  return (
    <div className="entity-documents-section mt-5 pt-4 mb-6 border-t border-[var(--border-color)]">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Documents & Compliance</h3>
        <span className="text-xs text-muted font-mono">{documents.length}/{requiredTypes.length} Uploaded</span>
      </div>
      
      {loading ? (
        <div className="text-muted text-xs py-3 text-center">Loading documents...</div>
      ) : (
        <div className="flex flex-col gap-3">
          {requiredTypes.map(docType => {
            const existing = documents.find(d => d.document_type === docType);
            const isUploading = uploadingDoc === docType;
            
            return (
              <div key={docType} className="border border-[var(--border-color)] rounded-lg p-3 bg-[var(--bg-app)]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText size={15} className="text-muted" />
                    <span className="font-medium text-xs text-[var(--text-primary)]">{docType}</span>
                    {existing ? (
                      <span className={`pill ${existing.status === 'Expired' ? 'pill-red' : existing.status === 'Expiring Soon' ? 'pill-orange' : 'pill-green'}`} style={{ fontSize: '0.65rem', padding: '2px 6px' }}>
                        {existing.status}
                      </span>
                    ) : (
                      <span className="pill pill-gray" style={{ fontSize: '0.65rem', padding: '2px 6px' }}>
                        Missing
                      </span>
                    )}
                  </div>
                  {!isUploading && (
                    <button 
                      type="button" 
                      className="btn btn-outline" 
                      style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
                      onClick={() => {
                        setUploadingDoc(docType);
                        if (existing) {
                          setFileUrl(existing.file_url || '');
                          setIssueDate(existing.issue_date ? existing.issue_date.split('T')[0] : '');
                          setExpiryDate(existing.expiry_date ? existing.expiry_date.split('T')[0] : '');
                        } else {
                          setFileUrl('');
                          setIssueDate('');
                          setExpiryDate('');
                        }
                      }}
                    >
                      {existing ? 'Update' : 'Upload'}
                    </button>
                  )}
                </div>

                {existing && !isUploading && (
                  <div className="text-xs text-muted mt-2 pt-2 border-t border-[var(--border-color)] grid grid-cols-2 gap-2">
                    <div><span>Issue:</span> <strong className="font-medium text-[var(--text-primary)]">{existing.issue_date ? new Date(existing.issue_date).toLocaleDateString() : 'N/A'}</strong></div>
                    <div><span>Expiry:</span> <strong className="font-medium text-[var(--text-primary)]">{new Date(existing.expiry_date).toLocaleDateString()}</strong></div>
                    <div className="col-span-2 mt-0.5">
                      <a href={existing.file_url} target="_blank" rel="noopener noreferrer" className="text-[var(--plum-1)] hover:underline font-medium inline-flex items-center gap-1">
                        View File &rarr;
                      </a>
                    </div>
                  </div>
                )}

                {isUploading && (
                  <form onSubmit={(e) => handleSave(e, docType)} className="mt-3 pt-2 border-t border-[var(--border-color)] flex flex-col gap-2.5">
                    <div className="input-group">
                      <label className="text-xs">Document URL (Mock File Upload)*</label>
                      <input 
                        type="text" 
                        className="input text-xs" 
                        value={fileUrl} 
                        onChange={e => setFileUrl(e.target.value)} 
                        placeholder="https://example.com/doc.pdf" 
                        required 
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="input-group">
                        <label className="text-xs">Issue Date</label>
                        <input 
                          type="date" 
                          className="input text-xs" 
                          value={issueDate} 
                          onChange={e => setIssueDate(e.target.value)} 
                        />
                      </div>
                      <div className="input-group">
                        <label className="text-xs">Expiry Date*</label>
                        <input 
                          type="date" 
                          className="input text-xs" 
                          value={expiryDate} 
                          onChange={e => setExpiryDate(e.target.value)} 
                          required 
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 mt-1">
                      <button type="button" className="btn btn-outline" style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }} onClick={() => setUploadingDoc(null)}>Cancel</button>
                      <button type="submit" className="btn btn-primary" style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}>Save {docType}</button>
                    </div>
                  </form>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
