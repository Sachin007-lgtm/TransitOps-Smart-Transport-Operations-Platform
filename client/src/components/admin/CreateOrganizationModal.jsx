import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Building2, X, AlertCircle, ArrowRight, Loader2 } from 'lucide-react';
import { apiRequest } from '../../utils/api';

function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

export default function CreateOrganizationModal({ isOpen, onClose, onSuccess }) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [isSlugCustomized, setIsSlugCustomized] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleNameChange = (e) => {
    const val = e.target.value;
    setName(val);
    if (!isSlugCustomized) {
      setSlug(slugify(val));
    }
  };

  const handleSlugChange = (e) => {
    setIsSlugCustomized(true);
    setSlug(slugify(e.target.value));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const trimmedName = name.trim();
    const trimmedSlug = slug.trim();
    const trimmedOwnerName = ownerName.trim();
    const trimmedOwnerEmail = ownerEmail.trim();
    const trimmedOwnerPhone = ownerPhone.trim();

    if (!trimmedName) {
      setError('Organization name is required.');
      return;
    }
    if (!trimmedOwnerName) {
      setError('Manager full name is required.');
      return;
    }
    if (!trimmedOwnerEmail) {
      setError('Manager login email is required.');
      return;
    }
    if (!trimmedOwnerPhone) {
      setError('Manager contact phone number is required.');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        name: trimmedName,
        slug: trimmedSlug || undefined,
        owner: {
          name: trimmedOwnerName,
          email: trimmedOwnerEmail,
          phone_number: trimmedOwnerPhone
        }
      };

      const res = await apiRequest('POST', '/platform/organizations', payload);
      if (res?.data) {
        onSuccess(res.data);
      } else {
        throw new Error(res?.message || 'Failed to create organization');
      }
    } catch (err) {
      setError(err.message || 'An unexpected error occurred while onboarding organization.');
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <div
      className="modal-overlay"
      style={{
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(6px)',
        zIndex: 9998,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem'
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
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1)'
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: 'var(--teal-bg, #e2f5f1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--teal, #1fa88f)',
                flexShrink: 0
              }}
            >
              <Building2 size={22} />
            </div>
            <div>
              <h2 className="heading text-lg font-bold" style={{ margin: 0, color: 'var(--text)' }}>
                Onboard New Tenant
              </h2>
              <p className="text-xs text-muted" style={{ margin: '2px 0 0', color: 'var(--sub)' }}>
                Provision dedicated organization & manager access
              </p>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-outline"
            onClick={onClose}
            style={{ padding: '0.375rem', borderRadius: '8px', border: 'none', color: 'var(--sub)' }}
          >
            <X size={18} />
          </button>
        </div>

        {error && (
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.5rem',
              background: 'var(--red-bg, #fdeceb)',
              border: '1px solid rgba(224, 71, 63, 0.3)',
              borderRadius: '8px',
              padding: '0.75rem 1rem',
              marginBottom: '1.25rem',
              color: 'var(--red, #e0473f)',
              fontSize: '0.8125rem'
            }}
          >
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text)', marginBottom: '0.25rem' }}>
                Organization Name *
              </label>
              <input
                type="text"
                placeholder="e.g. Sahyadri Logistics Ltd"
                value={name}
                onChange={handleNameChange}
                required
                style={{
                  width: '100%',
                  padding: '0.625rem 0.875rem',
                  fontSize: '0.875rem',
                  borderRadius: '8px',
                  border: '1px solid var(--line, #eceaef)',
                  background: 'var(--bg, #f3f4f7)',
                  color: 'var(--text)',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text)', marginBottom: '0.25rem' }}>
                Tenant Identifier Slug *
              </label>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <span
                  style={{
                    padding: '0.625rem 0.75rem',
                    fontSize: '0.8125rem',
                    background: 'var(--line, #eceaef)',
                    color: 'var(--sub)',
                    borderTopLeftRadius: '8px',
                    borderBottomLeftRadius: '8px',
                    border: '1px solid var(--line)',
                    borderRight: 'none'
                  }}
                >
                  transitops.app/
                </span>
                <input
                  type="text"
                  placeholder="sahyadri-logistics"
                  value={slug}
                  onChange={handleSlugChange}
                  required
                  style={{
                    flex: 1,
                    padding: '0.625rem 0.875rem',
                    fontSize: '0.875rem',
                    borderTopRightRadius: '8px',
                    borderBottomRightRadius: '8px',
                    border: '1px solid var(--line, #eceaef)',
                    background: 'var(--bg, #f3f4f7)',
                    color: 'var(--text)',
                    fontFamily: 'monospace'
                  }}
                />
              </div>
              <span style={{ fontSize: '0.7rem', color: 'var(--sub)', display: 'block', marginTop: '0.25rem' }}>
                Auto-generated from organization name. Platform automatically ensures uniqueness across all tenants.
              </span>
            </div>

            <div style={{ height: '1px', background: 'var(--line, #eceaef)', margin: '0.25rem 0' }} />

            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--sub)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Primary Manager Details
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text)', marginBottom: '0.25rem' }}>
                Manager Full Name *
              </label>
              <input
                type="text"
                placeholder="e.g. Ramesh Kulkarni"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '0.625rem 0.875rem',
                  fontSize: '0.875rem',
                  borderRadius: '8px',
                  border: '1px solid var(--line, #eceaef)',
                  background: 'var(--bg, #f3f4f7)',
                  color: 'var(--text)',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text)', marginBottom: '0.25rem' }}>
                  Login Email *
                </label>
                <input
                  type="email"
                  placeholder="ramesh@sahyadri.in"
                  value={ownerEmail}
                  onChange={(e) => setOwnerEmail(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '0.625rem 0.875rem',
                    fontSize: '0.875rem',
                    borderRadius: '8px',
                    border: '1px solid var(--line, #eceaef)',
                    background: 'var(--bg, #f3f4f7)',
                    color: 'var(--text)',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text)', marginBottom: '0.25rem' }}>
                  Phone Number *
                </label>
                <input
                  type="tel"
                  placeholder="+91 98200 12345"
                  value={ownerPhone}
                  onChange={(e) => setOwnerPhone(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '0.625rem 0.875rem',
                    fontSize: '0.875rem',
                    borderRadius: '8px',
                    border: '1px solid var(--line, #eceaef)',
                    background: 'var(--bg, #f3f4f7)',
                    color: 'var(--text)',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="btn btn-outline"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Provisioning...</span>
                </>
              ) : (
                <>
                  <span>Create Organization</span>
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
