import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { 
  KeyRound, 
  AlertTriangle, 
  Copy, 
  Check, 
  Building2, 
  User, 
  Mail, 
  Phone, 
  Globe, 
  ShieldAlert, 
  Send,
  ExternalLink 
} from 'lucide-react';

export default function AdminCredentialModal({ credential, onClose }) {
  const [copiedPwd, setCopiedPwd] = useState(false);
  const [copiedMessage, setCopiedMessage] = useState(false);

  if (!credential) return null;

  const loginPortalUrl = typeof window !== 'undefined' ? `${window.location.origin}/login` : 'https://transitops.app/login';

  const formatRevertMessage = () => {
    return [
      `🎉 Welcome to TransitOps! Your organization account is ready.`,
      ``,
      `🏢 Organization: ${credential.organizationName || 'N/A'}`,
      `🔗 Tenant Identifier Slug: ${credential.slug || 'N/A'}`,
      `👤 Manager Name: ${credential.managerName || 'N/A'}`,
      `📧 Login Email: ${credential.email}`,
      credential.phone ? `📱 Phone Number: ${credential.phone}` : null,
      `🔑 Temporary Password: ${credential.temporaryPassword}`,
      `🌐 Login Portal: ${loginPortalUrl}`,
      ``,
      `⚠️ Instructions:`,
      `1. Visit the login portal and enter your Login Email and Temporary Password.`,
      `2. You will be prompted to set your personal permanent password upon first login.`,
      `3. Once signed in, you can start adding your fleet vehicles and drivers immediately.`,
      ``,
      `Reach out to the TransitOps platform team if you need any assistance.`
    ].filter(Boolean).join('\n');
  };

  const handleCopyPassword = () => {
    navigator.clipboard.writeText(credential.temporaryPassword);
    setCopiedPwd(true);
    window.dispatchEvent(
      new CustomEvent('app-toast', { detail: 'Temporary password copied to clipboard!' })
    );
    setTimeout(() => setCopiedPwd(false), 2000);
  };

  const handleCopyRevertMessage = () => {
    const text = formatRevertMessage();
    navigator.clipboard.writeText(text);
    setCopiedMessage(true);
    window.dispatchEvent(
      new CustomEvent('app-toast', { detail: 'Complete onboarding message copied to clipboard!' })
    );
    setTimeout(() => setCopiedMessage(false), 2000);
  };

  const handleEmailShare = () => {
    const subject = encodeURIComponent(`Welcome to TransitOps - Organization Credentials for ${credential.organizationName || 'your organization'}`);
    const body = encodeURIComponent(formatRevertMessage());
    window.open(`mailto:${credential.email}?subject=${subject}&body=${body}`, '_blank');
  };

  return createPortal(
    <div
      className="modal-overlay"
      style={{
        backgroundColor: 'rgba(15, 23, 42, 0.7)',
        backdropFilter: 'blur(6px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.25rem'
      }}
      onMouseDown={onClose}
    >
      <div
        className="modal-content"
        style={{
          maxWidth: '520px',
          width: '100%',
          padding: '1.75rem',
          borderRadius: '16px',
          backgroundColor: 'var(--card, #ffffff)',
          border: '1px solid var(--line, #eceaef)',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.25), 0 10px 10px -5px rgba(0, 0, 0, 0.1)',
          maxHeight: '90vh',
          overflowY: 'auto'
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '12px',
              background: credential.isReset ? 'rgba(47, 111, 237, 0.12)' : 'rgba(34, 160, 107, 0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: credential.isReset ? 'var(--blue, #2f6fed)' : 'var(--green, #22a06b)',
              flexShrink: 0
            }}
          >
            {credential.isReset ? <ShieldAlert size={26} /> : <KeyRound size={26} />}
          </div>
          <div>
            <h2 className="heading text-lg font-bold" style={{ margin: 0, color: 'var(--text)' }}>
              {credential.isReset ? 'Manager Password Reset' : 'Tenant Onboarded Successfully'}
            </h2>
            <p className="text-xs text-muted" style={{ margin: '2px 0 0', color: 'var(--sub)' }}>
              Revert back to the organization owner with these access credentials
            </p>
          </div>
        </div>

        <div
          style={{
            background: 'var(--amber-bg, #fdf1e0)',
            border: '1px solid rgba(224, 138, 30, 0.3)',
            borderRadius: '10px',
            padding: '0.75rem 1rem',
            marginBottom: '1.25rem'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
            <AlertTriangle size={18} style={{ color: 'var(--amber, #e08a1e)', flexShrink: 0, marginTop: '2px' }} />
            <p style={{ fontSize: '0.8125rem', color: '#92400e', margin: 0, lineHeight: 1.45 }}>
              This temporary password is encrypted with bcrypt in the database and is revealed strictly <strong>once</strong>. Share it with the owner now.
            </p>
          </div>
        </div>

        {/* Credentials Grid */}
        <div
          style={{
            background: 'var(--bg, #f3f4f7)',
            border: '1px solid var(--line, #eceaef)',
            borderRadius: '12px',
            padding: '1rem 1.25rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.875rem',
            marginBottom: '1.5rem'
          }}
        >
          {/* Org & Slug */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--line)', paddingBottom: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Building2 size={16} style={{ color: 'var(--plum-1, #7a4a63)' }} />
              <div>
                <span style={{ fontSize: '0.7rem', color: 'var(--sub)', textTransform: 'uppercase', fontWeight: 600, display: 'block' }}>
                  Organization Name
                </span>
                <span style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--text)' }}>
                  {credential.organizationName || 'N/A'}
                </span>
              </div>
            </div>
            {credential.slug && (
              <span
                style={{
                  fontSize: '0.75rem',
                  fontFamily: 'monospace',
                  background: 'var(--card)',
                  padding: '0.2rem 0.5rem',
                  borderRadius: '6px',
                  border: '1px solid var(--line)',
                  color: 'var(--sub)'
                }}
              >
                /{credential.slug}
              </span>
            )}
          </div>

          {/* Manager Name */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <User size={16} style={{ color: 'var(--sub)' }} />
            <div>
              <span style={{ fontSize: '0.7rem', color: 'var(--sub)', textTransform: 'uppercase', fontWeight: 600, display: 'block' }}>
                Manager Full Name
              </span>
              <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text)' }}>
                {credential.managerName || 'N/A'}
              </span>
            </div>
          </div>

          {/* Email & Phone */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Mail size={16} style={{ color: 'var(--sub)' }} />
              <div>
                <span style={{ fontSize: '0.7rem', color: 'var(--sub)', textTransform: 'uppercase', fontWeight: 600, display: 'block' }}>
                  Login Email
                </span>
                <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text)', fontFamily: 'monospace' }}>
                  {credential.email}
                </span>
              </div>
            </div>

            {credential.phone && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Phone size={16} style={{ color: 'var(--sub)' }} />
                <div>
                  <span style={{ fontSize: '0.7rem', color: 'var(--sub)', textTransform: 'uppercase', fontWeight: 600, display: 'block' }}>
                    Phone Number
                  </span>
                  <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text)', fontFamily: 'monospace' }}>
                    {credential.phone}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Temporary Password */}
          <div style={{ borderTop: '1px solid var(--line)', paddingTop: '0.75rem' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--sub)', textTransform: 'uppercase', fontWeight: 600, display: 'block', marginBottom: '0.375rem' }}>
              Temporary Access Password
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="text"
                readOnly
                value={credential.temporaryPassword}
                style={{
                  flex: 1,
                  padding: '0.625rem 0.875rem',
                  fontSize: '0.9375rem',
                  fontFamily: 'monospace',
                  fontWeight: 700,
                  letterSpacing: '0.05em',
                  background: 'var(--card, #ffffff)',
                  border: '1px solid var(--line, #eceaef)',
                  borderRadius: '8px',
                  color: 'var(--text)'
                }}
              />
              <button
                type="button"
                className="btn btn-outline"
                onClick={handleCopyPassword}
                style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', whiteSpace: 'nowrap' }}
              >
                {copiedPwd ? <Check size={14} style={{ color: 'var(--green)' }} /> : <Copy size={14} />}
                {copiedPwd ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        </div>

        {/* Action Buttons to Revert Back */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleCopyRevertMessage}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
            >
              {copiedMessage ? <Check size={16} /> : <Copy size={16} />}
              <span>{copiedMessage ? 'Message Copied!' : 'Copy Revert Message'}</span>
            </button>

            <button
              type="button"
              className="btn btn-outline"
              onClick={handleEmailShare}
              title="Open draft in email client"
              style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}
            >
              <Send size={15} />
              <span>Email</span>
            </button>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
            <button
              type="button"
              className="btn btn-outline"
              onClick={onClose}
              style={{ minWidth: '100px' }}
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
