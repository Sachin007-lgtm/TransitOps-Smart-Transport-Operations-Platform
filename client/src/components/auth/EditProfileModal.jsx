import React, { useState, useEffect, useRef } from 'react';
import { X, Camera, Upload, Trash2, User, Mail, Phone, Building2, Shield, Loader2, Check } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import './EditProfileModal.css';

// Curated avatar presets for fleet managers & operators
const AVATAR_PRESETS = [
  { id: 'avatar-1', label: 'Fleet Executive', url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=256&q=80' },
  { id: 'avatar-2', label: 'Operations Lead', url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=256&q=80' },
  { id: 'avatar-3', label: 'Fleet Manager', url: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=256&q=80' },
  { id: 'avatar-4', label: 'Dispatcher Pro', url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=256&q=80' },
  { id: 'avatar-5', label: 'Logistics Director', url: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=256&q=80' },
  { id: 'avatar-6', label: 'Transport Lead', url: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=256&q=80' }
];

export default function EditProfileModal({ isOpen, onClose }) {
  const { user, updateProfile } = useAuth();
  const fileInputRef = useRef(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen && user) {
      setName(user.name || '');
      setEmail(user.email || '');
      setPhoneNumber(user.phone_number || '');
      setAvatarUrl(user.avatar_url || '');
      setError('');
    }
  }, [isOpen, user]);

  if (!isOpen) return null;

  const initials = (name || user?.name || 'User')
    .trim()
    .split(/\s+/)
    .map(n => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please select a valid image file (PNG, JPG, WEBP).');
      return;
    }

    if (file.size > 3 * 1024 * 1024) {
      setError('Image size must be under 3 MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64Data = event.target?.result;
      if (base64Data) {
        setAvatarUrl(base64Data);
        setError('');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Full name cannot be empty.');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      await updateProfile({
        name: name.trim(),
        email: email.trim() || null,
        phone_number: phoneNumber.trim() || null,
        avatar_url: avatarUrl || null
      });

      window.dispatchEvent(
        new CustomEvent('app-toast', { detail: 'Profile updated successfully!' })
      );
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to update profile. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="ep-modal-overlay" onClick={onClose}>
      <div className="ep-modal-content" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="ep-modal-header">
          <div className="ep-header-title">
            <div className="ep-header-icon">
              <User size={20} />
            </div>
            <div>
              <h3>Edit Profile</h3>
              <p>Update your personal info and profile photo</p>
            </div>
          </div>
          <button className="ep-close-btn" onClick={onClose} title="Close">
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="ep-error-banner">
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="ep-form">
          {/* Avatar Section */}
          <div className="ep-avatar-section">
            <div className="ep-avatar-preview-wrap">
              {avatarUrl ? (
                <img src={avatarUrl} alt="Avatar preview" className="ep-avatar-img" />
              ) : (
                <div className="ep-avatar-initials">
                  {initials}
                </div>
              )}
              <button
                type="button"
                className="ep-avatar-camera-btn"
                onClick={() => fileInputRef.current?.click()}
                title="Change Photo"
              >
                <Camera size={14} />
              </button>
            </div>

            <div className="ep-avatar-actions">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                style={{ display: 'none' }}
              />
              <button
                type="button"
                className="ep-btn-upload"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload size={14} />
                <span>Upload Photo</span>
              </button>
              {avatarUrl && (
                <button
                  type="button"
                  className="ep-btn-remove-avatar"
                  onClick={() => setAvatarUrl('')}
                >
                  <Trash2 size={14} />
                  <span>Remove</span>
                </button>
              )}
            </div>
          </div>

          {/* Quick Presets */}
          <div className="ep-presets-block">
            <label className="ep-label-sub">Or pick a preset avatar:</label>
            <div className="ep-presets-grid">
              {AVATAR_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={`ep-preset-chip ${avatarUrl === preset.url ? 'active' : ''}`}
                  onClick={() => setAvatarUrl(preset.url)}
                  title={preset.label}
                >
                  <img src={preset.url} alt={preset.label} />
                  {avatarUrl === preset.url && (
                    <div className="ep-preset-check">
                      <Check size={10} />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Form Fields */}
          <div className="ep-form-fields">
            <div className="ep-field-group">
              <label>Full Name <span className="req">*</span></label>
              <div className="ep-input-wrap">
                <User size={15} className="ep-field-icon" />
                <input
                  type="text"
                  className="ep-input"
                  placeholder="Enter your real full name"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="ep-field-group">
              <label>Email Address</label>
              <div className="ep-input-wrap">
                <Mail size={15} className="ep-field-icon" />
                <input
                  type="email"
                  className="ep-input"
                  placeholder="name@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="ep-field-group">
              <label>Phone Number</label>
              <div className="ep-input-wrap">
                <Phone size={15} className="ep-field-icon" />
                <input
                  type="tel"
                  className="ep-input"
                  placeholder="+91 98765 43210"
                  value={phoneNumber}
                  onChange={e => setPhoneNumber(e.target.value)}
                />
              </div>
            </div>

            {/* Read-only Context Badges */}
            <div className="ep-meta-row">
              <div className="ep-meta-badge">
                <Shield size={13} />
                <span>Role: <strong>{user?.role || 'Owner/Manager'}</strong></span>
              </div>
              <div className="ep-meta-badge">
                <Building2 size={13} />
                <span>Org: <strong>{user?.organization_name || 'Apex Freight'}</strong></span>
              </div>
            </div>
          </div>

          {/* Modal Footer */}
          <div className="ep-modal-footer">
            <button
              type="button"
              className="ep-btn-cancel"
              onClick={onClose}
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="ep-btn-save"
              disabled={isLoading || !name.trim()}
            >
              {isLoading ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Check size={15} />
                  <span>Save Changes</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
