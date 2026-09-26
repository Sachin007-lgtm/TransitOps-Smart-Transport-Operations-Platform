import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Lock } from 'lucide-react';
import EntityDocuments from '../documents/EntityDocuments';
import { validateIndianNumberPlate } from '../../utils/numberPlate';

export default function EditVehicleModal({ vehicle, onClose, onSubmit, customTypes, customSizes }) {
  const [formData, setFormData] = useState({
    numberPlate: '',
    type: 'Truck',
    size: 'Medium (14ft)',
    distanceCovered: '',
    status: 'Available'
  });
  
  const [formErrors, setFormErrors] = useState({});

  useEffect(() => {
    if (vehicle) {
      setFormData({
        numberPlate: vehicle.number_plate || vehicle.registration_number || '',
        type: vehicle.type || 'Truck',
        size: vehicle.size || 'Medium (14ft)',
        distanceCovered: vehicle.distance_covered || 0,
        status: vehicle.status || 'Available'
      });
    }
  }, [vehicle]);

  if (!vehicle) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    setFormErrors({});

    const rawPlate = formData.numberPlate.trim().toUpperCase();
    if (!rawPlate) {
      setFormErrors(prev => ({ ...prev, numberPlate: "Number plate is required" }));
      window.dispatchEvent(new CustomEvent('app-toast', { detail: "Number plate is required", type: 'error' }));
      return;
    }

    const plateErr = validateIndianNumberPlate(rawPlate);
    if (plateErr) {
      setFormErrors(prev => ({ ...prev, numberPlate: plateErr }));
      window.dispatchEvent(new CustomEvent('app-toast', { detail: plateErr, type: 'error' }));
      return;
    }

    onSubmit({
      ...formData,
      numberPlate: rawPlate,
      distanceCovered: formData.distanceCovered || 0
    });
  };

  const isOnTrip = formData.status === 'On trip' || formData.status === 'On Trip';

  return createPortal(
    <div className="modal-overlay" onMouseDown={onClose}>
      <div 
        className="modal-content fade-in" 
        onMouseDown={e => e.stopPropagation()} 
        style={{ maxWidth: '500px', width: '90%' }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl heading">Vehicle Profile</h2>
          <span className="pill pill-gray mono text-xs">{vehicle.number_plate}</span>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-2 gap-4">
            <div className="input-group col-span-2">
              <label>Number Plate <span style={{color: '#ef4444'}}>*</span></label>
              <input 
                type="text" 
                className="input mono text-sm" 
                required 
                value={formData.numberPlate} 
                onChange={e => {
                  setFormData({...formData, numberPlate: e.target.value.toUpperCase()});
                  if (formErrors.numberPlate) setFormErrors(prev => ({ ...prev, numberPlate: '' }));
                }} 
              />
            </div>

            <div className="input-group">
              <label>Vehicle Type</label>
              <select 
                className="select" 
                value={formData.type} 
                onChange={e => setFormData({...formData, type: e.target.value})}
              >
                {['Truck', 'Van', 'Mini', ...(customTypes || [])].map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <div className="input-group">
              <label>Vehicle Size</label>
              <select 
                className="select" 
                value={formData.size} 
                onChange={e => setFormData({...formData, size: e.target.value})}
              >
                {['Small (8ft)', 'Medium (14ft)', 'Heavy (24ft)', 'Extra Heavy (32ft)', ...(customSizes || [])].map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div className="input-group">
              <label>Distance Covered (km)</label>
              <input 
                type="text" 
                inputMode="decimal"
                className="input" 
                value={formData.distanceCovered} 
                onChange={e => {
                  const val = e.target.value;
                  if (val === '' || /^\d*\.?\d*$/.test(val)) {
                    setFormData({...formData, distanceCovered: val});
                  }
                }} 
              />
            </div>

            <div className="input-group">
              <label>Status</label>
              {isOnTrip ? (
                <div className="pill pill-blue font-medium text-xs py-2 px-3 flex items-center justify-between" title="Vehicle is on trip">
                  <span>On Trip (Auto-managed)</span>
                  <Lock size={14} />
                </div>
              ) : (
                <select 
                  className="select" 
                  value={formData.status} 
                  onChange={e => setFormData({...formData, status: e.target.value})}
                >
                  <option value="Available">Available</option>
                  <option value="Maintenance">Maintenance</option>
                </select>
              )}
            </div>
          </div>

          {/* Document Management Section */}
          {vehicle && vehicle.id && (
            <EntityDocuments entityType="VEHICLE" entityId={vehicle.id} />
          )}

          <div className="sticky bottom-0 bg-[var(--bg-card)] flex justify-end gap-3 mt-6 pt-4 pb-1 border-t border-[var(--border-color)] z-10">
            <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary">Save changes</button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
