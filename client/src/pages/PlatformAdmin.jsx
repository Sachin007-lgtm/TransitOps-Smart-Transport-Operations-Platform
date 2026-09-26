import React, { useState, useEffect, useMemo } from 'react';
import { 
  Building2, 
  Truck, 
  Users, 
  ShieldAlert, 
  Plus, 
  Search, 
  KeyRound, 
  Power, 
  RefreshCw, 
  AlertTriangle,
  Loader2,
  Calendar,
  CheckCircle2
} from 'lucide-react';
import { apiRequest } from '../utils/api';
import CreateOrganizationModal from '../components/admin/CreateOrganizationModal';
import AdminCredentialModal from '../components/admin/AdminCredentialModal';
import './PlatformAdmin.css';

export default function PlatformAdmin() {
  const [stats, setStats] = useState(null);
  const [organizations, setOrganizations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [credentialModalData, setCredentialModalData] = useState(null);

  // Confirmation Modals
  const [confirmSuspendOrg, setConfirmSuspendOrg] = useState(null);
  const [confirmResetOrg, setConfirmResetOrg] = useState(null);

  const fetchPlatformData = async () => {
    setLoading(true);
    try {
      const [statsRes, orgsRes] = await Promise.all([
        apiRequest('GET', '/platform/stats'),
        apiRequest('GET', '/platform/organizations')
      ]);

      if (statsRes?.data) setStats(statsRes.data);
      if (orgsRes?.data) setOrganizations(orgsRes.data);
    } catch (err) {
      window.dispatchEvent(
        new CustomEvent('app-toast', { 
          detail: `Failed to load platform data: ${err.message || 'Error'}`, 
          type: 'error' 
        })
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlatformData();
  }, []);

  // Filtered organizations
  const filteredOrganizations = useMemo(() => {
    return organizations.filter((org) => {
      const matchesStatus = 
        statusFilter === 'all' || 
        org.status.toLowerCase() === statusFilter.toLowerCase();

      const query = searchTerm.toLowerCase().trim();
      const matchesSearch = 
        !query ||
        org.name.toLowerCase().includes(query) ||
        org.slug.toLowerCase().includes(query) ||
        (org.owner_name && org.owner_name.toLowerCase().includes(query)) ||
        (org.owner_email && org.owner_email.toLowerCase().includes(query));

      return matchesStatus && matchesSearch;
    });
  }, [organizations, statusFilter, searchTerm]);

  // Handle status toggle (Suspend / Reactivate)
  const handleToggleStatus = async (org) => {
    const nextStatus = org.status === 'Active' ? 'Suspended' : 'Active';
    setActionLoadingId(org.id);

    try {
      const res = await apiRequest('PATCH', `/platform/organizations/${org.id}/status`, { status: nextStatus });
      if (res?.data) {
        window.dispatchEvent(
          new CustomEvent('app-toast', { 
            detail: `Organization ${org.name} has been ${nextStatus === 'Suspended' ? 'suspended' : 'reactivated'}.` 
          })
        );
        await fetchPlatformData();
      }
    } catch (err) {
      window.dispatchEvent(
        new CustomEvent('app-toast', { 
          detail: `Status update failed: ${err.message || 'Error'}`, 
          type: 'error' 
        })
      );
    } finally {
      setActionLoadingId(null);
      setConfirmSuspendOrg(null);
    }
  };

  // Handle password reset
  const handleResetPassword = async (org) => {
    setActionLoadingId(org.id);
    try {
      const res = await apiRequest('POST', `/platform/organizations/${org.id}/reset-manager-password`);
      if (res?.data) {
        setCredentialModalData({
          organizationName: org.name,
          slug: org.slug,
          managerName: res.data.owner.name,
          email: res.data.owner.email,
          phone: res.data.owner.phone_number,
          temporaryPassword: res.data.temporary_password,
          isReset: true
        });
        window.dispatchEvent(
          new CustomEvent('app-toast', { detail: `Manager password reset successfully!` })
        );
      }
    } catch (err) {
      window.dispatchEvent(
        new CustomEvent('app-toast', { 
          detail: `Password reset failed: ${err.message || 'Error'}`, 
          type: 'error' 
        })
      );
    } finally {
      setActionLoadingId(null);
      setConfirmResetOrg(null);
    }
  };

  // Handle onboarding modal success
  const handleOnboardSuccess = (data) => {
    setIsCreateModalOpen(false);
    setCredentialModalData({
      organizationName: data.organization.name,
      slug: data.organization.slug,
      managerName: data.owner.name,
      email: data.owner.email,
      phone: data.owner.phone_number,
      temporaryPassword: data.temporary_password,
      isReset: false
    });
    fetchPlatformData();
  };

  return (
    <div className="platform-admin-page">
      {/* Platform Header */}
      <div className="platform-header">
        <div className="platform-header-left">
          <div className="platform-header-badge">
            <ShieldAlert size={14} />
            <span>Root Operations</span>
          </div>
          <h1>Platform Administration</h1>
          <p>Multi-tenant organization registry, asset tracking, and tenant isolation controls.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button
            type="button"
            className="btn btn-outline"
            onClick={fetchPlatformData}
            disabled={loading}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setIsCreateModalOpen(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <Plus size={16} />
            <span>New Organization</span>
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="kpi-strip">
        <div className="kpi-card">
          <div className="kpi-info">
            <span className="kpi-label">Total Organizations</span>
            <span className="kpi-value">{stats ? stats.total_organizations : '-'}</span>
            <span className="kpi-subtext">
              {stats ? `${stats.active_organizations} active • ${stats.total_organizations - stats.active_organizations} suspended` : 'Loading...'}
            </span>
          </div>
          <div className="kpi-icon-box" style={{ background: 'var(--plum-1)', color: '#fff' }}>
            <Building2 size={24} />
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-info">
            <span className="kpi-label">Global Fleet Size</span>
            <span className="kpi-value">{stats ? stats.total_vehicles : '-'}</span>
            <span className="kpi-subtext">Vehicles across all tenants</span>
          </div>
          <div className="kpi-icon-box" style={{ background: 'var(--teal-bg)', color: 'var(--teal)' }}>
            <Truck size={24} />
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-info">
            <span className="kpi-label">Registered Drivers</span>
            <span className="kpi-value">{stats ? stats.total_drivers : '-'}</span>
            <span className="kpi-subtext">Active driver profiles</span>
          </div>
          <div className="kpi-icon-box" style={{ background: 'var(--blue-bg)', color: 'var(--blue)' }}>
            <Users size={24} />
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-info">
            <span className="kpi-label">Total Platform Users</span>
            <span className="kpi-value">{stats ? stats.total_users : '-'}</span>
            <span className="kpi-subtext">Admins, managers & operators</span>
          </div>
          <div className="kpi-icon-box" style={{ background: 'var(--amber-bg)', color: 'var(--amber)' }}>
            <CheckCircle2 size={24} />
          </div>
        </div>
      </div>

      {/* Table Toolbar */}
      <div className="table-toolbar">
        <div className="search-box-wrapper">
          <Search size={16} className="search-icon-inside" />
          <input
            type="text"
            className="admin-search-input"
            placeholder="Search organizations by name, slug, or owner..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="status-filter-pills">
          <button
            type="button"
            className={`filter-pill ${statusFilter === 'all' ? 'active' : ''}`}
            onClick={() => setStatusFilter('all')}
          >
            All ({organizations.length})
          </button>
          <button
            type="button"
            className={`filter-pill ${statusFilter === 'active' ? 'active' : ''}`}
            onClick={() => setStatusFilter('active')}
          >
            Active ({organizations.filter(o => o.status === 'Active').length})
          </button>
          <button
            type="button"
            className={`filter-pill ${statusFilter === 'suspended' ? 'active' : ''}`}
            onClick={() => setStatusFilter('suspended')}
          >
            Suspended ({organizations.filter(o => o.status === 'Suspended').length})
          </button>
        </div>
      </div>

      {/* Organizations Registry Table */}
      <div className="orgs-table-container">
        {loading && organizations.length === 0 ? (
          <div className="table-empty-state">
            <Loader2 size={32} className="animate-spin" style={{ margin: '0 auto 0.75rem', color: 'var(--plum-1)' }} />
            <p>Loading organizations registry...</p>
          </div>
        ) : filteredOrganizations.length === 0 ? (
          <div className="table-empty-state">
            <Building2 size={40} style={{ margin: '0 auto 0.75rem', opacity: 0.4 }} />
            <p style={{ fontWeight: 600, color: 'var(--text)', margin: '0 0 0.25rem' }}>No organizations found</p>
            <p style={{ fontSize: '0.8125rem', margin: 0 }}>Try clearing search keywords or filters.</p>
          </div>
        ) : (
          <table className="orgs-table">
            <thead>
              <tr>
                <th>Organization</th>
                <th>Primary Owner</th>
                <th>Assets & Utilization</th>
                <th>Status</th>
                <th>Onboarded</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrganizations.map((org) => {
                const isOrgLoading = actionLoadingId === org.id;
                const isSuspended = org.status === 'Suspended';
                const createdDate = org.created_at 
                  ? new Date(org.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                  : 'N/A';

                return (
                  <tr key={org.id}>
                    <td>
                      <div className="org-name-cell">
                        <div className="org-avatar">
                          {org.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="org-details-name">{org.name}</div>
                          <div className="org-details-slug">/{org.slug}</div>
                        </div>
                      </div>
                    </td>

                    <td>
                      {org.owner_name ? (
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 600 }}>{org.owner_name}</span>
                            {org.owner_must_change_password ? (
                              <span
                                style={{
                                  fontSize: '0.6875rem',
                                  padding: '1px 6px',
                                  borderRadius: '4px',
                                  backgroundColor: 'rgba(224, 138, 30, 0.15)',
                                  color: 'var(--amber)',
                                  border: '1px solid rgba(224, 138, 30, 0.3)',
                                  fontWeight: 600
                                }}
                                title="Temporary password has not yet been changed"
                              >
                                Setup Pending
                              </span>
                            ) : (
                              <span
                                style={{
                                  fontSize: '0.6875rem',
                                  padding: '1px 6px',
                                  borderRadius: '4px',
                                  backgroundColor: 'rgba(34, 160, 107, 0.15)',
                                  color: 'var(--teal)',
                                  border: '1px solid rgba(34, 160, 107, 0.3)',
                                  fontWeight: 600
                                }}
                                title="Permanent password set and account verified"
                              >
                                Verified
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--sub)' }}>{org.owner_email}</div>
                          {org.owner_phone && (
                            <div style={{ fontSize: '0.75rem', color: 'var(--sub)' }}>{org.owner_phone}</div>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--sub)', fontSize: '0.8125rem' }}>No manager assigned</span>
                      )}
                    </td>

                    <td>
                      <div className="asset-pills">
                        <span className="asset-pill" title="Vehicles in fleet">
                          <Truck size={12} style={{ color: 'var(--teal)' }} />
                          {org.vehicles_count} vehicles
                        </span>
                        <span className="asset-pill" title="Registered drivers">
                          <Users size={12} style={{ color: 'var(--blue)' }} />
                          {org.drivers_count} drivers
                        </span>
                        <span className="asset-pill" title="Users with login access">
                          {org.users_count} users
                        </span>
                      </div>
                    </td>

                    <td>
                      <span className={`status-badge ${isSuspended ? 'suspended' : 'active'}`}>
                        <span className="status-dot" />
                        {org.status}
                      </span>
                    </td>

                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', color: 'var(--sub)', fontSize: '0.8125rem' }}>
                        <Calendar size={13} />
                        <span>{createdDate}</span>
                      </div>
                    </td>

                    <td style={{ textAlign: 'right' }}>
                      <div className="action-buttons" style={{ justifyContent: 'flex-end' }}>
                        {/* Reset Password Button */}
                        <button
                          type="button"
                          className="action-btn reset-pwd-btn"
                          title="Reset Manager Password"
                          disabled={isOrgLoading || !org.owner_user_id}
                          onClick={() => setConfirmResetOrg(org)}
                        >
                          <KeyRound size={13} />
                          <span>Reset Pwd</span>
                        </button>

                        {/* Kill Switch Toggle */}
                        {isSuspended ? (
                          <button
                            type="button"
                            className="action-btn reactivate-btn"
                            title="Reactivate Organization"
                            disabled={isOrgLoading}
                            onClick={() => handleToggleStatus(org)}
                          >
                            {isOrgLoading ? (
                              <Loader2 size={13} className="animate-spin" />
                            ) : (
                              <Power size={13} />
                            )}
                            <span>Reactivate</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="action-btn suspend-btn"
                            title="Suspend Organization & Lockout Users"
                            disabled={isOrgLoading}
                            onClick={() => setConfirmSuspendOrg(org)}
                          >
                            {isOrgLoading ? (
                              <Loader2 size={13} className="animate-spin" />
                            ) : (
                              <Power size={13} />
                            )}
                            <span>Suspend</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Onboard Organization Modal */}
      <CreateOrganizationModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={handleOnboardSuccess}
      />

      {/* Credential Provisioning / Reset Modal */}
      <AdminCredentialModal
        credential={credentialModalData}
        onClose={() => setCredentialModalData(null)}
      />

      {/* Suspend Confirmation Dialog */}
      {confirmSuspendOrg && (
        <div
          className="modal-overlay"
          style={{
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(6px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem'
          }}
          onMouseDown={() => setConfirmSuspendOrg(null)}
        >
          <div
            className="modal-content"
            style={{
              maxWidth: '440px',
              width: '100%',
              padding: '1.75rem',
              borderRadius: '16px',
              backgroundColor: 'var(--card, #ffffff)',
              border: '1px solid var(--line, #eceaef)'
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '10px',
                  background: 'var(--red-bg, #fdeceb)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--red, #e0473f)',
                  flexShrink: 0
                }}
              >
                <AlertTriangle size={22} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 700, color: 'var(--text)' }}>
                  Suspend Organization?
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: '0.8125rem', color: 'var(--sub)' }}>
                  Instant kill-switch & access lockout
                </p>
              </div>
            </div>

            <p style={{ fontSize: '0.875rem', color: 'var(--text)', lineHeight: 1.5, marginBottom: '1.25rem' }}>
              Suspending <strong>{confirmSuspendOrg.name}</strong> will immediately revoke access and deactivate all <strong>{confirmSuspendOrg.users_count} users</strong> and drivers under this tenant.
            </p>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setConfirmSuspendOrg(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn"
                style={{ background: 'var(--red, #e0473f)', color: '#fff', border: 'none' }}
                onClick={() => handleToggleStatus(confirmSuspendOrg)}
              >
                Confirm Suspension
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Password Reset Confirmation Dialog */}
      {confirmResetOrg && (
        <div
          className="modal-overlay"
          style={{
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(6px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem'
          }}
          onMouseDown={() => setConfirmResetOrg(null)}
        >
          <div
            className="modal-content"
            style={{
              maxWidth: '440px',
              width: '100%',
              padding: '1.75rem',
              borderRadius: '16px',
              backgroundColor: 'var(--card, #ffffff)',
              border: '1px solid var(--line, #eceaef)'
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '10px',
                  background: 'var(--blue-bg, #e8f0fe)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--blue, #2f6fed)',
                  flexShrink: 0
                }}
              >
                <KeyRound size={22} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 700, color: 'var(--text)' }}>
                  Reset Manager Password?
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: '0.8125rem', color: 'var(--sub)' }}>
                  Support credential recovery
                </p>
              </div>
            </div>

            <p style={{ fontSize: '0.875rem', color: 'var(--text)', lineHeight: 1.5, marginBottom: '1.25rem' }}>
              A temporary password will be generated for <strong>{confirmResetOrg.owner_name}</strong> ({confirmResetOrg.owner_email}). They will be required to change it on their next login.
            </p>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setConfirmResetOrg(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => handleResetPassword(confirmResetOrg)}
              >
                Generate New Password
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
