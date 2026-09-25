import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  validateIndianLicenseNumber,
  formatIndianLicenseNumber,
  isLicenseExpired,
  INDIAN_LICENSE_CATEGORIES
} from './driverConstants';

export default function AddDriverModal({ isOpen, onClose, onSubmit, existingDrivers = [] }) {
  const [formData, setFormData] = useState({
    name: '',
    license: '',
    category: 'LMV-TR',
    expiry: '',
    contact: '',
    status: 'Available'
  });

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!formData.name.trim() || !formData.license.trim() || !formData.expiry.trim() || !formData.contact.trim()) {
      window.dispatchEvent(
        new CustomEvent('app-toast', { detail: 'All fields marked with * are required.', type: 'error' })
      );
      return;
    }

    const licenseErr = validateIndianLicenseNumber(formData.license);
    if (licenseErr) {
      window.dispatchEvent(new CustomEvent('app-toast', { detail: licenseErr, type: 'error' }));
      return;
    }

    const phoneDigits = formData.contact.replace(/\D/g, '');
    if (phoneDigits.length < 10) {
      window.dispatchEvent(
        new CustomEvent('app-toast', { detail: 'Please enter a valid 10-digit contact number.', type: 'error' })
      );
      return;
    }

    if (isLicenseExpired(formData.expiry) && formData.status === 'Available') {
      window.dispatchEvent(
        new CustomEvent('app-toast', { detail: 'Cannot set initial status to Available with an expired license.', type: 'error' })
      );
      return;
    }

    const formattedLicense = formatIndianLicenseNumber(formData.license.trim());

    if (
      existingDrivers.some(
        (d) => d.license_number.replace(/-/g, '').toLowerCase() === formattedLicense.replace(/-/g, '').toLowerCase()
      )
    ) {
      window.dispatchEvent(new CustomEvent('app-toast', { detail: 'License number must be unique', type: 'error' }));
      return;
    }

    const formattedContact = formData.contact.trim().startsWith('+91')
      ? formData.contact.trim()
      : `+91 ${formData.contact.trim()}`;

    onSubmit({
      name: formData.name.trim(),
      license_number: formattedLicense,
      license_category: formData.category || 'LMV-TR',
      license_expiry_date: formData.expiry,
      contact_number: formattedContact,
      status: formData.status || 'Available'
    });
  };

  return createPortal(
    <div
      className="modal-overlay"
      style={{ backgroundColor: 'rgba(15, 23, 42, 0.5)', backdropFilter: 'blur(5px)' }}
      onMouseDown={onClose}
    >
      <div className="modal-content" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-4">
          <h2 className="heading text-xl">Add Driver</h2>
          <p className="text-xs text-muted mt-1">Register a new driver into your organization's fleet roster.</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="flex flex-col gap-3">
            {/* Full Name */}
            <div className="input-group">
              <label>
                Full name <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="text"
                className="input w-full"
                required
                placeholder="Enter full name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            {/* License Number */}
            <div className="input-group">
              <label>
                License number <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="text"
                className="input mono text-sm w-full"
                required
                placeholder="e.g. MH-02-2020-0001234"
                value={formData.license}
                onChange={(e) => setFormData({ ...formData, license: e.target.value.toUpperCase() })}
              />
              <span className="text-muted text-xs mt-1">
                Format: SS-RR-YYYY-NNNNNNN (15 alphanumeric characters)
              </span>
            </div>

            {/* License Category (Optional, defaults to LMV-TR) */}
            <div className="input-group">
              <label>
                License category <span className="text-muted text-xs font-normal">(Optional, default: LMV-TR)</span>
              </label>
              <select
                className="select w-full"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              >
                {INDIAN_LICENSE_CATEGORIES.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </div>

            {/* License Expiry Date */}
            <div className="input-group">
              <label>
                License expiry date <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="date"
                className="input w-full"
                required
                value={formData.expiry}
                onChange={(e) => setFormData({ ...formData, expiry: e.target.value })}
              />
            </div>

            {/* Contact Number */}
            <div className="input-group">
              <label>
                Contact number <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="text"
                className="input mono text-sm w-full"
                required
                placeholder="10-digit mobile number"
                value={formData.contact}
                onChange={(e) => setFormData({ ...formData, contact: e.target.value })}
              />
            </div>

            {/* Initial Status */}
            <div className="input-group">
              <label>Initial status</label>
              <select
                className="select w-full"
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              >
                <option value="Available">Available</option>
                <option value="Off Duty">Off Duty</option>
                <option value="Suspended">Suspended</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-6 pt-4" style={{ borderTop: '1px solid var(--line)' }}>
            <button type="button" className="btn btn-outline" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Register driver
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
