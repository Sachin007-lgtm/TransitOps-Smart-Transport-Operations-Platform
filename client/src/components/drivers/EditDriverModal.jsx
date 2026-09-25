import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Lock } from 'lucide-react';
import {
  validateIndianLicenseNumber,
  formatIndianLicenseNumber,
  formatDateForInput,
  isLicenseExpired,
  INDIAN_LICENSE_CATEGORIES
} from './driverConstants';

export default function EditDriverModal({ driver, onClose, onSubmit }) {
  const [formData, setFormData] = useState({
    name: '',
    license: '',
    category: 'LMV-TR',
    expiry: '',
    contact: '',
    status: 'Off Duty'
  });

  useEffect(() => {
    if (driver) {
      const cleanContact = (driver.contact_number || '').replace(/^\+91\s?/, '');
      setFormData({
        name: driver.name || '',
        license: driver.license_number || '',
        category: driver.license_category || 'LMV-TR',
        expiry: formatDateForInput(driver.license_expiry_date),
        contact: cleanContact,
        status: driver.status === 'On Trip' ? 'On Trip' : driver.status || 'Off Duty'
      });
    }
  }, [driver]);

  if (!driver) return null;

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

    const editPhoneDigits = formData.contact.replace(/\D/g, '');
    if (editPhoneDigits.length < 10) {
      window.dispatchEvent(
        new CustomEvent('app-toast', { detail: 'Please enter a valid 10-digit contact number.', type: 'error' })
      );
      return;
    }

    if (isLicenseExpired(formData.expiry) && formData.status === 'Available') {
      window.dispatchEvent(
        new CustomEvent('app-toast', { detail: 'Cannot set status to Available when license is expired.', type: 'error' })
      );
      return;
    }

    const formattedLicense = formatIndianLicenseNumber(formData.license.trim());
    const formattedContact = formData.contact.trim().startsWith('+91')
      ? formData.contact.trim()
      : `+91 ${formData.contact.trim()}`;

    const payload = {
      name: formData.name.trim(),
      license_number: formattedLicense,
      license_category: formData.category || driver.license_category || 'LMV-TR',
      license_expiry_date: formData.expiry,
      contact_number: formattedContact
    };

    if (driver.status !== 'On Trip') {
      payload.status = formData.status;
    }

    onSubmit(payload);
  };

  const isOnTrip = driver.status === 'On Trip' || driver.status === 'On trip';

  return createPortal(
    <div
      className="modal-overlay"
      style={{ backgroundColor: 'rgba(15, 23, 42, 0.5)', backdropFilter: 'blur(5px)' }}
      onMouseDown={onClose}
    >
      <div className="modal-content" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-4">
          <h2 className="heading text-xl">Edit Driver Profile</h2>
          <p className="text-xs text-muted mt-1">Update license and contact details for {driver.name}.</p>
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
                Format: SS-RR-YYYY-NNNNNNN
              </span>
            </div>

            {/* License Category */}
            <div className="input-group">
              <label>
                License category <span className="text-muted text-xs font-normal">(Optional)</span>
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
                value={formData.contact}
                onChange={(e) => setFormData({ ...formData, contact: e.target.value })}
              />
            </div>

            {/* Status Field */}
            <div className="input-group">
              <label>Status</label>
              {isOnTrip ? (
                <div
                  className="pill pill-blue font-medium text-xs py-2 px-3 flex items-center justify-between"
                  title="Driver is currently on active trip"
                >
                  <span>On Trip (Managed automatically by trip dispatch)</span>
                  <Lock size={14} />
                </div>
              ) : (
                <select
                  className="select w-full"
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                >
                  <option value="Available">Available</option>
                  <option value="Off Duty">Off Duty</option>
                  <option value="Suspended">Suspended</option>
                </select>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-6 pt-4" style={{ borderTop: '1px solid var(--line)' }}>
            <button type="button" className="btn btn-outline" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Save changes
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
