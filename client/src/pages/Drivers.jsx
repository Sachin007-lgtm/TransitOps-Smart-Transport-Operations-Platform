import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ChevronDown, Plus, RefreshCw } from 'lucide-react';
import { useGlobalSearch } from '../contexts/GlobalSearchContext';
import { useConfirm } from '../contexts/ConfirmContext';
import { apiRequest } from '../utils/api';
import DriverTable from '../components/drivers/DriverTable';
import AddDriverModal from '../components/drivers/AddDriverModal';
import CredentialModal from '../components/drivers/CredentialModal';
import PageToolbar from '../components/common/PageToolbar';
import StatStrip from '../components/common/StatStrip';
import '../components/common/common.css';
import { isLicenseExpired, isLicenseExpiringSoon, DRIVER_STATUS_FILTERS } from '../components/drivers/driverConstants';
import './Drivers.css';

// n8n webhook: fires automatically whenever driver credentials are created or reset.
// Set VITE_N8N_DRIVER_WEBHOOK in client/.env to your n8n webhook URL.
// If the env var is not set, the webhook is silently skipped.
async function sendCredentialsWebhook({ driverName, contactNumber, temporaryPassword }) {
  const webhookUrl = import.meta.env.VITE_N8N_DRIVER_WEBHOOK;
  if (!webhookUrl) return; // Not configured — skip silently
  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      driver_name: driverName,
      contact_number: contactNumber,
      temporary_password: temporaryPassword,
      timestamp: new Date().toISOString()
    })
  });
}

export default function Drivers() {
  const navigate = useNavigate();
  const { globalSearch, setGlobalSearch } = useGlobalSearch();
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Status Filter in toolbar (Matching Vehicles.jsx standard)
  const [statusFilter, setStatusFilter] = useState('All');
  const [isStatusOpen, setIsStatusOpen] = useState(false);
  const statusRef = useRef(null);

  // Modal dialog states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingDriver, setEditingDriver] = useState(null);
  const [credentialModal, setCredentialModal] = useState(null);

  const loadDrivers = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await apiRequest('GET', '/drivers');
      if (data && Array.isArray(data.data)) {
        setDrivers(data.data);
      } else {
        setDrivers([]);
      }
    } catch (err) {
      console.warn('Failed to fetch drivers from backend:', err.message);
      setDrivers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDrivers();

    const handleOutsideClick = (e) => {
      if (statusRef.current && !statusRef.current.contains(e.target)) {
        setIsStatusOpen(false);
      }
    };
    document.addEventListener('pointerdown', handleOutsideClick);
    return () => document.removeEventListener('pointerdown', handleOutsideClick);
  }, []);

  // Standard in-table status change handler (matching Vehicles page UX)
  const handleStatusChange = async (driverId, newStatus) => {
    const currentDriver = drivers.find((d) => d.id === driverId);
    if (!currentDriver) return;

    if ((currentDriver.status === 'On Trip' || currentDriver.status === 'On trip') && newStatus !== 'On Trip') {
      window.dispatchEvent(
        new CustomEvent('app-toast', {
          detail: `Blocked — ${currentDriver.name} is currently On Trip. Complete the trip to release driver.`,
          type: 'error'
        })
      );
      return;
    }

    if (newStatus === 'On Trip') {
      window.dispatchEvent(
        new CustomEvent('app-toast', {
          detail: 'Driver status cannot be manually set to "On Trip". "On Trip" is assigned by trip dispatch.',
          type: 'error'
        })
      );
      return;
    }

    if (isLicenseExpired(currentDriver.license_expiry_date) && newStatus === 'Available') {
      window.dispatchEvent(
        new CustomEvent('app-toast', {
          detail: `Blocked — ${currentDriver.name}'s license is expired, cannot assign trips.`,
          type: 'error'
        })
      );
      return;
    }

    try {
      await apiRequest('PATCH', `/drivers/${driverId}/status`, { status: newStatus });
      window.dispatchEvent(
        new CustomEvent('app-toast', { detail: `${currentDriver.name} status updated to ${newStatus}` })
      );
      await loadDrivers();
    } catch (err) {
      // Optimistically update locally if backend offline
      setDrivers((prev) => prev.map((d) => (d.id === driverId ? { ...d, status: newStatus } : d)));
      window.dispatchEvent(
        new CustomEvent('app-toast', { detail: err.message || 'Status updated', type: 'info' })
      );
    }
  };

  // Create new driver handler
  const handleAddDriver = async (driverPayload) => {
    try {
      const res = await apiRequest('POST', '/drivers', driverPayload);

      setIsAddModalOpen(false);

      const creds = res?.data?.temporary_password ? {
        driverName: res.data.name || driverPayload.name,
        contactNumber: res.data.contact_number || driverPayload.contact_number,
        temporaryPassword: res.data.temporary_password
      } : null;

      if (creds) {
        setCredentialModal(creds);
        // Fire n8n webhook for automated credential delivery (WhatsApp/SMS)
        sendCredentialsWebhook(creds).catch(() => {/* silent — webhook is best-effort */});
      }

      window.dispatchEvent(
        new CustomEvent('app-toast', {
          detail: `${driverPayload.name} registered as ${driverPayload.status || 'Available'}`
        })
      );
      await loadDrivers();
    } catch (err) {
      window.dispatchEvent(
        new CustomEvent('app-toast', {
          detail: err.message || 'Failed to register driver.',
          type: 'error'
        })
      );
    }
  };

  // Update driver profile handler
  const handleUpdateDriver = async (payload) => {
    try {
      await apiRequest('PUT', `/drivers/${editingDriver.id}`, payload);
      setEditingDriver(null);
      window.dispatchEvent(
        new CustomEvent('app-toast', { detail: `${payload.name}'s profile updated` })
      );
      await loadDrivers();
    } catch (err) {
      window.dispatchEvent(
        new CustomEvent('app-toast', {
          detail: err.message || 'Failed to update driver profile.',
          type: 'error'
        })
      );
    }
  };

  const confirm = useConfirm();

  // Delete driver handler (with development-phase exception maintained)
  const handleDeleteDriver = async (driver) => {
    const ok = await confirm({
      title: 'Delete Driver',
      message: `Are you sure you want to delete ${driver.name}? This will remove them from the roster and revoke their mobile app login credentials.`,
      confirmText: 'Delete Driver',
      variant: 'danger'
    });

    if (!ok) return;

    try {
      await apiRequest('DELETE', `/drivers/${driver.id}`);
      window.dispatchEvent(
        new CustomEvent('app-toast', { detail: `${driver.name} removed from roster` })
      );
      await loadDrivers();
    } catch (err) {
      setDrivers((prev) => prev.filter((d) => d.id !== driver.id));
      window.dispatchEvent(
        new CustomEvent('app-toast', { detail: `${driver.name} removed from roster` })
      );
    }
  };

  // Reset driver password handler
  const handleResetDriverPassword = async (driver) => {
    const ok = await confirm({
      title: 'Reset Driver App Password',
      message: `Are you sure you want to reset the password for ${driver.name}? Their current mobile session will be terminated immediately and a one-time temporary password will be generated for them.`,
      confirmText: 'Reset Password',
      variant: 'warning'
    });

    if (!ok) return;

    try {
      const response = await apiRequest('POST', `/drivers/${driver.id}/reset-password`);
      const temporaryPassword = response.data?.temporary_password;
      if (temporaryPassword) {
        const creds = {
          driverName: driver.name,
          contactNumber: driver.contact_number,
          temporaryPassword
        };
        setCredentialModal(creds);
        // Fire n8n webhook for automated credential delivery
        sendCredentialsWebhook(creds).catch(() => {/* silent — webhook is best-effort */});
      }
      await loadDrivers();
    } catch (err) {
      window.dispatchEvent(
        new CustomEvent('app-toast', {
          detail: err.message || 'Failed to reset driver password',
          type: 'error'
        })
      );
    }
  };

  // Filter Data (global search & status filter)
  const filteredDrivers = drivers.filter((d) => {
    let matchesSearch = true;
    if (globalSearch && globalSearch.trim()) {
      const s = globalSearch.trim().toLowerCase();
      matchesSearch =
        (d.name || '').toLowerCase().includes(s) ||
        (d.license_number || '').toLowerCase().includes(s) ||
        (d.contact_number || '').toLowerCase().includes(s) ||
        (d.status || '').toLowerCase().includes(s);
    }
    const matchesStatus =
      statusFilter === 'All' ||
      statusFilter === 'All Statuses' ||
      (d.status || '').toLowerCase() === statusFilter.toLowerCase();

    return matchesSearch && matchesStatus;
  });

  // Stat strip calculations
  const availableCount = drivers.filter(d => (d.status || '').toLowerCase() === 'available').length;
  const onTripCount = drivers.filter(d => (d.status || '').toLowerCase() === 'on trip').length;
  const offDutyCount = drivers.filter(d => (d.status || '').toLowerCase() === 'off duty').length;
  const licenseAlertCount = drivers.filter(d => isLicenseExpired(d.license_expiry_date) || isLicenseExpiringSoon(d.license_expiry_date)).length;

  const statItems = [
    { label: 'Total Drivers', value: drivers.length },
    { label: 'Available', value: availableCount },
    { label: 'On Trip', value: onTripCount },
    { label: 'Off Duty', value: offDutyCount },
    { label: 'License Alerts', value: licenseAlertCount }
  ];

  return (
    <div className="fade-in">
      {/* Single-Row Toolbar */}
      <PageToolbar
        title="Drivers Roster"
        tooltip="Track licensing compliance, live duty states, and credential provisioning"
        filters={
          <>
            {/* Search */}
            <div style={{ position: 'relative', width: '220px' }}>
              <Search 
                size={14} 
                className="text-muted" 
                style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)' }} 
              />
              <input 
                type="text" 
                placeholder="Search driver name, license..." 
                className="input" 
                style={{ width: '100%', paddingLeft: '2.2rem', height: '34px', fontSize: '0.82rem' }}
                value={globalSearch || ''}
                onChange={(e) => setGlobalSearch && setGlobalSearch(e.target.value)}
              />
            </div>

            {/* Status Filter */}
            <div style={{ position: 'relative', width: '140px' }} ref={statusRef}>
              <div 
                className="input flex items-center justify-between" 
                style={{ cursor: 'pointer', height: '34px', fontSize: '0.82rem', padding: '0 0.65rem' }}
                onClick={() => setIsStatusOpen(!isStatusOpen)}
              >
                <span className="truncate">{statusFilter}</span>
                <ChevronDown size={14} className="text-muted" style={{ transform: isStatusOpen ? 'rotate(180deg)' : 'none', transition: '0.2s', flexShrink: 0 }} />
              </div>
              {isStatusOpen && (
                <div className="custom-dropdown-menu">
                  {DRIVER_STATUS_FILTERS.map(s => (
                    <div 
                      key={s} 
                      className="custom-dropdown-item" 
                      onClick={() => { 
                        setStatusFilter(s); 
                        setIsStatusOpen(false); 
                      }}
                    >
                      {s}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        }
        actions={
          <>
            <button 
              type="button" 
              className="btn btn-outline" 
              style={{ height: '34px', fontSize: '0.82rem', padding: '0 0.85rem' }} 
              onClick={loadDrivers} 
              title="Refresh roster"
            >
              <RefreshCw size={14} className={loading ? 'spin-icon' : ''} />
              <span>Refresh</span>
            </button>
            <button 
              type="button" 
              className="btn btn-plum-glow" 
              style={{ height: '34px', fontSize: '0.82rem' }} 
              onClick={() => setIsAddModalOpen(true)}
            >
              <Plus size={15} /> Add driver
            </button>
          </>
        }
      />

      {/* Slim 40px Stat Strip */}
      <StatStrip items={statItems} />

      {/* Driver Roster Table */}
      <DriverTable
        drivers={filteredDrivers}
        loading={loading}
        onStatusChange={handleStatusChange}
        onView={(driver) => navigate(`/drivers/${driver.id}`, { state: { tab: 'overview' } })}
        onEdit={(driver) => navigate(`/drivers/${driver.id}`, { state: { tab: 'documents' } })}
        onResetPassword={handleResetDriverPassword}
        onDelete={handleDeleteDriver}
      />

      {/* Add Driver Modal */}
      <AddDriverModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSubmit={handleAddDriver}
        existingDrivers={drivers}
      />

      {/* One-Time Credential Modal */}
      <CredentialModal
        credential={credentialModal}
        onClose={() => setCredentialModal(null)}
      />
    </div>
  );
}
