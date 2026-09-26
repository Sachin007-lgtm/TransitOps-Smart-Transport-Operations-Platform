import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { KeyRound, AlertTriangle, Copy } from 'lucide-react';

export default function CredentialModal({ credential, onClose }) {
  const [copied, setCopied] = useState(false);

  if (!credential) return null;

  const handleCopyPassword = () => {
    navigator.clipboard.writeText(credential.temporaryPassword);
    setCopied(true);
    window.dispatchEvent(
      new CustomEvent('app-toast', { detail: 'Temporary password copied to clipboard!' })
    );
    setTimeout(() => setCopied(false), 2000);
  };

  return createPortal(
    <div
      className="modal-overlay"
      style={{ backgroundColor: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(6px)', zIndex: 9999 }}
      onMouseDown={onClose}
    >
      <div
        className="modal-content"
        style={{ maxWidth: '440px', padding: '1.75rem', borderRadius: '16px', border: '1px solid var(--line)' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-3">
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '10px',
              background: 'rgba(234, 138, 0, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#d97706',
              flexShrink: 0
            }}
          >
            <KeyRound size={22} />
          </div>
          <div>
            <h2 className="heading text-lg font-bold">Temporary Driver Password</h2>
            <p className="text-xs text-muted">Single-use initial credential</p>
          </div>
        </div>

        <div
          style={{
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            borderRadius: '10px',
            padding: '0.75rem 1rem',
            marginBottom: '1.25rem'
          }}
        >
          <div className="flex items-start gap-2">
            <AlertTriangle size={16} style={{ color: '#ef4444', flexShrink: 0, marginTop: '2px' }} />
            <p style={{ fontSize: '0.8125rem', color: '#b91c1c', margin: 0, lineHeight: 1.4 }}>
              This credential will only be shown <strong>once</strong>. Copy and share it securely with the driver now.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <div>
            <span className="text-xs text-muted">Driver Name</span>
            <p className="font-semibold text-sm" style={{ margin: '2px 0 0' }}>
              {credential.driverName}
            </p>
          </div>
          <div>
            <span className="text-xs text-muted">Mobile Login Identifier</span>
            <p className="mono font-semibold text-sm" style={{ margin: '2px 0 0' }}>
              {credential.contactNumber}
            </p>
          </div>
          <div>
            <span className="text-xs text-muted">Temporary Initial Password</span>
            <div className="flex items-center gap-2 mt-1">
              <input
                type="text"
                readOnly
                value={credential.temporaryPassword}
                className="input mono text-sm font-bold flex-1"
                style={{ letterSpacing: '0.05em', backgroundColor: 'var(--bg-app)' }}
              />
              <button
                type="button"
                className="btn btn-outline flex items-center gap-1.5"
                onClick={handleCopyPassword}
              >
                <Copy size={14} />
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-3" style={{ borderTop: '1px solid var(--line)' }}>
          <button type="button" className="btn btn-primary w-full" onClick={onClose}>
            I have securely shared this credential
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
