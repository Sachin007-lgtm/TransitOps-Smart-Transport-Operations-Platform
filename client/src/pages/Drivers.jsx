import React, { useState, useEffect } from 'react';
import { useGlobalSearch } from '../contexts/GlobalSearchContext';
import { apiRequest } from '../utils/api';
import DriverToolbar from '../components/drivers/DriverToolbar';
import DriverTable from '../components/drivers/DriverTable';
import AddDriverModal from '../components/drivers/AddDriverModal';
import EditDriverModal from '../components/drivers/EditDriverModal';
import CredentialModal from '../components/drivers/CredentialModal';
import { INITIAL_DRIVERS, isLicenseExpired } from '../components/drivers/driverConstants';
import './Drivers.css';

export default function Drivers() {
  const { globalSearch, setGlobalSearch } = useGlobalSearch();
  const [drivers, setDrivers] = useState(INITIAL_DRIVERS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Status Filter in toolbar (Matching Vehicles.jsx standard)
  const [statusFilter, setStatusFilter] = useState('All');

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
      }
    } catch (err) {
      console.warn('Backend unavailable, using active roster:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDrivers();
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

      if (res?.data?.temporary_password) {
        setCredentialModal({
          driverName: res.data.name || driverPayload.name,
          contactNumber: res.data.contact_number || driverPayload.contact_number,
          temporaryPassword: res.data.temporary_password
        });
      }

      window.dispatchEvent(
        new CustomEvent('app-toast', {
          detail: `${driverPayload.name} registered as ${driverPayload.status || 'Available'}`
        })
      );
      await loadDrivers();
    } catch (err) {
      // Local addition fallback
      const localNewDriver = {
        id: `drv-${Date.now()}`,
        ...driverPayload,
        trips_count: 0,
        must_change_password: true
      };
      setDrivers((prev) => [localNewDriver, ...prev]);
      setIsAddModalOpen(false);
      window.dispatchEvent(
        new CustomEvent('app-toast', { detail: `${driverPayload.name} added to roster` })
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
      setDrivers((prev) =>
        prev.map((d) =>
          d.id === editingDriver.id
            ? {
                ...d,
                ...payload,
                status: editingDriver.status === 'On Trip' ? 'On Trip' : payload.status || d.status
              }
            : d
        )
      );
      setEditingDriver(null);
      window.dispatchEvent(
        new CustomEvent('app-toast', { detail: `${payload.name}'s profile updated` })
      );
    }
  };

  // Delete driver handler (with development-phase exception maintained)
  const handleDeleteDriver = async (driver) => {
    /* -------------------------------------------------------------
     * [PRODUCTION CONSTRAINT - TEMPORARILY COMMENTED FOR DEVELOPMENT PHASE]
     * In production, drivers on active trips or with history cannot be deleted.
     *
     * if (driver.status === 'On Trip') {
     *   window.dispatchEvent(
     *     new CustomEvent('app-toast', { detail: `Cannot delete ${driver.name} while On Trip.`, type: 'error' })
     *   );
     *   return;
     * }
     * ------------------------------------------------------------- */

    if (!window.confirm(`Are you sure you want to delete ${driver.name}?`)) {
      return;
    }

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
    try {
      const response = await apiRequest('POST', `/drivers/${driver.id}/reset-password`);
      const temporaryPassword = response.data?.temporary_password;
      if (temporaryPassword) {
        setCredentialModal({
          driverName: driver.name,
          contactNumber: driver.contact_number,
          temporaryPassword: temporaryPassword
        });
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

  return (
    <div className="fade-in">
      {/* Header Row */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl heading">Drivers Profile</h1>
          <p className="text-sm text-muted mt-1">
            Track licensing, live duty states, and credential provisioning.
          </p>
        </div>
        {error && <span className="text-xs text-status-red">{error}</span>}
      </div>

      {/* Toolbar: Search, Status filter, Add Driver button */}
      <DriverToolbar
        globalSearch={globalSearch}
        setGlobalSearch={setGlobalSearch}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        onOpenAddModal={() => setIsAddModalOpen(true)}
      />

      {/* Driver Roster Table */}
      <DriverTable
        drivers={filteredDrivers}
        loading={loading}
        onStatusChange={handleStatusChange}
        onEdit={(driver) => setEditingDriver(driver)}
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

      {/* Edit Driver Modal */}
      <EditDriverModal
        driver={editingDriver}
        onClose={() => setEditingDriver(null)}
        onSubmit={handleUpdateDriver}
      />

      {/* One-Time Credential Modal */}
      <CredentialModal
        credential={credentialModal}
        onClose={() => setCredentialModal(null)}
      />
    </div>
  );
}
