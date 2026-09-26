import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { KeyRound, ShieldAlert, Eye, EyeOff, Lock, ArrowRight, Loader2, LogOut, CheckCircle2, AlertCircle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

export default function ForceChangePasswordModal() {
  const { user, changePassword, logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!user || !user.must_change_password) return null;

  const isLengthValid = newPassword.length >= 8;
  const isMatch = newPassword.length > 0 && newPassword === confirmPassword;
  const isDifferentFromCurrent = !currentPassword || (newPassword.length > 0 && newPassword !== currentPassword);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!currentPassword.trim()) {
      setError('Please enter your current (temporary) password.');
      return;
    }
    if (!isLengthValid) {
      setError('New password must be at least 8 characters long.');
      return;
    }
    if (newPassword === currentPassword) {
      setError('New password cannot be the same as your temporary password.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await changePassword(currentPassword.trim(), newPassword);
      window.dispatchEvent(
        new CustomEvent('app-toast', {
          detail: 'Password updated successfully! Welcome to your operations workspace.'
        })
      );
    } catch (err) {
      setError(err.message || 'Failed to update password. Please check your current password.');
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(10, 8, 14, 0.85)',
        backdropFilter: 'blur(8px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
        animation: 'fadeIn 0.2s ease-out'
      }}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: '460px',
          backgroundColor: '#1b1721',
          border: '1px solid rgba(224, 138, 30, 0.35)',
          borderRadius: '16px',
          padding: '2rem',
          boxShadow: '0 20px 45px rgba(0, 0, 0, 0.65), 0 0 40px rgba(224, 138, 30, 0.12)',
          color: 'var(--text)',
          animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
        }}
      >
        {/* Header Badge & Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', marginBottom: '1.25rem' }}>
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '12px',
              backgroundColor: 'rgba(224, 138, 30, 0.15)',
              border: '1px solid rgba(224, 138, 30, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--amber)',
              flexShrink: 0
            }}
          >
            <KeyRound size={22} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
              <span
                style={{
                  fontSize: '0.6875rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  padding: '2px 8px',
                  borderRadius: '999px',
                  backgroundColor: 'rgba(224, 138, 30, 0.2)',
                  color: 'var(--amber)',
                  border: '1px solid rgba(224, 138, 30, 0.3)'
                }}
              >
                Security Policy
              </span>
            </div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, letterSpacing: '-0.02em', color: '#fff' }}>
              Set Permanent Password
            </h2>
          </div>
        </div>

        <p style={{ fontSize: '0.875rem', color: 'var(--sub)', lineHeight: 1.5, marginBottom: '1.5rem' }}>
          Welcome, <strong style={{ color: '#fff' }}>{user.name}</strong>. Because this is your first login or temporary credentials were issued, you must create a new secure password before accessing your organization's fleet and driver portal.
        </p>

        {error && (
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.625rem',
              backgroundColor: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              padding: '0.75rem 1rem',
              borderRadius: '8px',
              color: '#f87171',
              fontSize: '0.8125rem',
              marginBottom: '1.25rem',
              lineHeight: 1.4
            }}
          >
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.125rem' }}>
          {/* Current / Temporary Password */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--sub)', marginBottom: '0.375rem' }}>
              Current (Temporary) Password
            </label>
            <div style={{ position: 'relative' }}>
              <Lock size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--sub)' }} />
              <input
                type={showCurrent ? 'text' : 'password'}
                className="input"
                placeholder="Enter the password provided by admin"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                style={{ width: '100%', paddingLeft: '2.5rem', paddingRight: '2.5rem' }}
              />
              <button
                type="button"
                onClick={() => setShowCurrent(!showCurrent)}
                style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--sub)', cursor: 'pointer', padding: '4px' }}
              >
                {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* New Password */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--sub)', marginBottom: '0.375rem' }}>
              New Permanent Password
            </label>
            <div style={{ position: 'relative' }}>
              <KeyRound size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--sub)' }} />
              <input
                type={showNew ? 'text' : 'password'}
                className="input"
                placeholder="At least 8 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                style={{ width: '100%', paddingLeft: '2.5rem', paddingRight: '2.5rem' }}
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--sub)', cursor: 'pointer', padding: '4px' }}
              >
                {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {/* Live requirement badges */}
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem', fontSize: '0.75rem' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: isLengthValid ? 'var(--teal)' : 'var(--sub)' }}>
                <CheckCircle2 size={12} style={{ opacity: isLengthValid ? 1 : 0.4 }} /> 8+ characters
              </span>
              {newPassword.length > 0 && (
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: isDifferentFromCurrent ? 'var(--teal)' : '#f87171' }}>
                  <CheckCircle2 size={12} style={{ opacity: isDifferentFromCurrent ? 1 : 0.4 }} /> Different from temporary
                </span>
              )}
            </div>
          </div>

          {/* Confirm New Password */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--sub)', marginBottom: '0.375rem' }}>
              Confirm New Password
            </label>
            <div style={{ position: 'relative' }}>
              <Lock size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--sub)' }} />
              <input
                type={showConfirm ? 'text' : 'password'}
                className="input"
                placeholder="Re-enter your new permanent password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                style={{ width: '100%', paddingLeft: '2.5rem', paddingRight: '2.5rem' }}
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--sub)', cursor: 'pointer', padding: '4px' }}
              >
                {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {confirmPassword.length > 0 && (
              <div style={{ marginTop: '0.375rem', fontSize: '0.75rem', color: isMatch ? 'var(--teal)' : '#f87171', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <CheckCircle2 size={12} /> {isMatch ? 'Passwords match' : 'Passwords do not match yet'}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.75rem' }}>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading || !currentPassword || !isLengthValid || !isMatch}
              style={{
                width: '100%',
                padding: '0.75rem',
                justifyContent: 'center',
                gap: '0.5rem',
                fontSize: '0.9375rem',
                fontWeight: 600
              }}
            >
              {loading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  <span>Updating Password...</span>
                </>
              ) : (
                <>
                  <span>Save Password & Continue</span>
                  <ArrowRight size={16} />
                </>
              )}
            </button>

            <button
              type="button"
              onClick={logout}
              className="btn btn-outline"
              style={{
                width: '100%',
                padding: '0.625rem',
                justifyContent: 'center',
                gap: '0.5rem',
                fontSize: '0.8125rem',
                color: 'var(--sub)',
                border: '1px solid rgba(255, 255, 255, 0.1)'
              }}
            >
              <LogOut size={14} />
              <span>Sign out and return later</span>
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
