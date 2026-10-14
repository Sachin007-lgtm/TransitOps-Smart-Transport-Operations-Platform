import React, { useState } from 'react';
import {
  validateIndianLicenseNumber,
  formatIndianLicenseNumber,
  isLicenseExpired,
  INDIAN_LICENSE_CATEGORIES
} from './driverConstants';
import SideDrawer from '../common/SideDrawer';

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
      window.showToast('All fields marked with * are required.', 'error');
      return;
    }

    const licenseErr = validateIndianLicenseNumber(formData.license);
    if (licenseErr) {
      window.showToast(licenseErr, 'error');
      return;
    }

    const phoneDigits = formData.contact.replace(/\D/g, '');
    if (phoneDigits.length < 10) {
      window.showToast('Please enter a valid 10-digit contact number.', 'error');
      return;
    }

    if (isLicenseExpired(formData.expiry) && formData.status === 'Available') {
      window.showToast('Cannot set initial status to Available with an expired license.', 'error');
      return;
    }

    const formattedLicense = formatIndianLicenseNumber(formData.license.trim());

    if (
      existingDrivers.some(
        (d) => d.license_number.replace(/-/g, '').toLowerCase() === formattedLicense.replace(/-/g, '').toLowerCase()
      )
    ) {
      window.showToast('License number must be unique', 'error');
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

  return (
    <SideDrawer
      isOpen={isOpen}
      onClose={onClose}
      title="Register New Driver"
      subtitle="Register a licensed driver into your organization's fleet roster."
      width="460px"
    >
      <form onSubmit={handleSubmit}>
        <div className="flex flex-col gap-3">
          {/* Full Name */}
          <div className="input-group">
            <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>
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
            <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>
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

          {/* License Category */}
          <div className="input-group">
            <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>
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
            <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>
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
            <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>
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
            <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>Initial status</label>
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

        <div className="flex justify-end gap-3 mt-6 pt-4" style={{ borderTop: '1px solid #f1f5f9' }}>
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-plum-glow">
            Register Driver
          </button>
        </div>
      </form>
    </SideDrawer>
  );
}
