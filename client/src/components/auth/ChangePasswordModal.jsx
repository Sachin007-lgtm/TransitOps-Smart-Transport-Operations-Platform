import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { KeyRound, X, Eye, EyeOff, Lock, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

export default function ChangePasswordModal({ isOpen, onClose }) {
  const { changePassword } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const isLengthValid = newPassword.length >= 8;
  const isMatch = newPassword.length > 0 && newPassword === confirmPassword;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!currentPassword.trim()) {
      setError('Current password is required.');
      return;
    }
    if (!isLengthValid) {
      setError('New password must be at least 8 characters long.');
      return;
    }
    if (newPassword === currentPassword) {
      setError('New password cannot be identical to current password.');
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
          detail: 'Password changed successfully.'
        })
      );
      handleClose();
    } catch (err) {
      setError(err.message || 'Failed to update password. Please check your current password.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setError('');
    onClose();
  };

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(10, 8, 14, 0.75)',
        backdropFilter: 'blur(6px)',
        zIndex: 99998,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
        animation: 'fadeIn 0.2s ease-out'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) handleClose();
      }}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: '440px',
          backgroundColor: '#1b1721',
          border: '1px solid var(--line)',
          borderRadius: '16px',
          padding: '2rem',
          boxShadow: '0 20px 45px rgba(0, 0, 0, 0.65)',
          color: 'var(--text)',
          animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                backgroundColor: 'rgba(124, 79, 214, 0.15)',
                border: '1px solid rgba(124, 79, 214, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--plum-1)'
              }}
            >
              <KeyRound size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.1875rem', fontWeight: 700, margin: 0, color: '#fff' }}>
                Change Password
              </h2>
              <p style={{ fontSize: '0.75rem', color: 'var(--sub)', margin: 0 }}>
                Update your account sign-in credentials
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={loading}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--sub)',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '6px',
              display: 'flex'
            }}
          >
            <X size={18} />
          </button>
        </div>

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
              marginBottom: '1.25rem'
            }}
          >
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.125rem' }}>
          {/* Current Password */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--sub)', marginBottom: '0.375rem' }}>
              Current Password
            </label>
            <div style={{ position: 'relative' }}>
              <Lock size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--sub)' }} />
              <input
                type={showCurrent ? 'text' : 'password'}
                className="input"
                placeholder="Enter your current password"
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
              New Password
            </label>
            <div style={{ position: 'relative' }}>
              <KeyRound size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--sub)' }} />
              <input
                type={showNew ? 'text' : 'password'}
                className="input"
                placeholder="Minimum 8 characters"
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
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.4rem', fontSize: '0.75rem' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: isLengthValid ? 'var(--teal)' : 'var(--sub)' }}>
                <CheckCircle2 size={12} style={{ opacity: isLengthValid ? 1 : 0.4 }} /> 8+ characters
              </span>
            </div>
          </div>

          {/* Confirm Password */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--sub)', marginBottom: '0.375rem' }}>
              Confirm New Password
            </label>
            <div style={{ position: 'relative' }}>
              <Lock size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--sub)' }} />
              <input
                type={showConfirm ? 'text' : 'password'}
                className="input"
                placeholder="Re-enter new password"
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

          {/* Buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
            <button
              type="button"
              className="btn btn-outline"
              onClick={handleClose}
              disabled={loading}
              style={{ padding: '0.5rem 1rem' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading || !currentPassword || !isLengthValid || !isMatch}
              style={{ padding: '0.5rem 1.25rem' }}
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Updating...</span>
                </>
              ) : (
                <span>Update Password</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
