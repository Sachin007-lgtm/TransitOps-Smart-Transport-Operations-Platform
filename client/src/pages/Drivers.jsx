import React, { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { apiRequest } from '../utils/api';

export default function Drivers() {
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [name, setName] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [licenseCategory, setLicenseCategory] = useState('B');
  const [licenseExpiryDate, setLicenseExpiryDate] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [safetyScore, setSafetyScore] = useState('100');

  const loadDrivers = async () => {
    try {
      setError('');
      const data = await apiRequest('GET', '/drivers');
      setDrivers(data.data || []);
    } catch (err) {
      console.error(err);
      setError('Failed to load driver profiles.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDrivers();
  }, []);

  const handleAddDriver = async (e) => {
    e.preventDefault();
    setError('');

    try {
      await apiRequest('POST', '/drivers', {
        name,
        license_number: licenseNumber,
        license_category: licenseCategory,
        license_expiry_date: licenseExpiryDate,
        contact_number: contactNumber,
        safety_score: Number(safetyScore)
      });

      // Reset & Refresh
      setName('');
      setLicenseNumber('');
      setLicenseExpiryDate('');
      setContactNumber('');
      setSafetyScore('100');
      setShowAddForm(false);
      loadDrivers();
    } catch (err) {
      setError(err.message || 'Failed to register driver.');
    }
  };

  const isExpired = (expiryDate) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return new Date(expiryDate) < today;
  };

  return (
    <div className="fade-in">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl heading">Drivers & Safety Profiles</h1>
        <button 
          className="btn btn-primary"
          onClick={() => setShowAddForm(!showAddForm)}
        >
          <Plus size={16} /> {showAddForm ? 'Close Form' : 'Add Driver'}
        </button>
      </div>

      {error && <div className="error-message mb-4" style={{ color: 'var(--status-red)', fontSize: '0.875rem' }}>{error}</div>}

      {showAddForm && (
        <div className="card mb-6" style={{ maxWidth: '600px' }}>
          <h2 className="heading text-lg mb-4">Register New Driver</h2>
          <form onSubmit={handleAddDriver} style={{ display: 'grid', gap: '1rem' }}>
            <div className="input-group">
              <label>Full Name</label>
              <input type="text" className="input" value={name} onChange={e => setName(e.target.value)} required placeholder="e.g. Sarah Connor" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="input-group">
                <label>License Number (Unique)</label>
                <input type="text" className="input" value={licenseNumber} onChange={e => setLicenseNumber(e.target.value)} required placeholder="e.g. DL-VAL-888" />
              </div>
              <div className="input-group">
                <label>License Category</label>
                <select className="select" value={licenseCategory} onChange={e => setLicenseCategory(e.target.value)}>
                  <option>A</option>
                  <option>B</option>
                  <option>C</option>
                  <option>D</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="input-group">
                <label>License Expiry Date</label>
                <input type="date" className="input" value={licenseExpiryDate} onChange={e => setLicenseExpiryDate(e.target.value)} required />
              </div>
              <div className="input-group">
                <label>Contact Number</label>
                <input type="text" className="input" value={contactNumber} onChange={e => setContactNumber(e.target.value)} required placeholder="e.g. 9876543210" />
              </div>
            </div>
            <div className="input-group">
              <label>Initial Safety Score (0-100)</label>
              <input type="number" className="input" min="0" max="100" value={safetyScore} onChange={e => setSafetyScore(e.target.value)} />
            </div>
            <button type="submit" className="btn btn-primary" style={{ justifySelf: 'start', padding: '0.5rem 1.5rem' }}>
              Submit
            </button>
          </form>
        </div>
      )}

      <div className="card mb-6">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Driver</th>
                <th>License No</th>
                <th>Category</th>
                <th>Expiry</th>
                <th>Contact</th>
                <th>Safety</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="7" className="text-center py-4 text-xs text-muted">Loading driver registry...</td>
                </tr>
              ) : drivers.map(drv => {
                const expired = isExpired(drv.license_expiry_date);
                return (
                  <tr key={drv.id} className={`border-indicator ${
                    drv.status === 'Available' ? 'border-green' : 
                    drv.status === 'On Trip' ? 'border-blue' : 'border-gray'
                  }`}>
                    <td className="font-medium">{drv.name}</td>
                    <td className="mono">{drv.license_number}</td>
                    <td>{drv.license_category}</td>
                    <td className={`mono ${expired ? 'text-status-red' : ''}`}>
                      {new Date(drv.license_expiry_date).toLocaleDateString()}
                      {expired && <span className="pill pill-red ml-2" style={{ fontSize: '0.65rem' }}>Expired</span>}
                    </td>
                    <td className="mono">{drv.contact_number}</td>
                    <td>
                      <span className={`pill ${
                        drv.safety_score >= 90 ? 'pill-green' : 
                        drv.safety_score >= 75 ? 'pill-orange' : 'pill-red'
                      }`}>
                        {drv.safety_score}%
                      </span>
                    </td>
                    <td>
                      <span className={`pill ${
                        drv.status === 'Available' ? 'pill-green' : 
                        drv.status === 'On Trip' ? 'pill-blue' : 
                        drv.status === 'Off Duty' ? 'pill-gray' : 'pill-red'
                      }`}>
                        {drv.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {!loading && drivers.length === 0 && (
                <tr>
                  <td colSpan="7" className="text-center py-4 text-xs text-muted">No drivers registered yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h3 className="heading text-sm mb-3 uppercase tracking-wide text-muted">Status Legend & Rules</h3>
        <div className="flex gap-4 mb-3">
          <span className="pill pill-green">Available</span>
          <span className="pill pill-blue">On Trip</span>
          <span className="pill pill-gray">Off Duty</span>
          <span className="pill pill-red">Suspended</span>
        </div>
        <div className="text-xs text-status-orange font-medium">
          Rule: Expired license or Suspended status → blocked from trip assignment
        </div>
      </div>
    </div>
  );
}
