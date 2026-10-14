import React, { useState, useEffect, useCallback } from 'react';
import { Check, Download, Upload, RefreshCw, Wrench, AlertCircle, Plus, Calendar } from 'lucide-react';
import { useGlobalSearch } from '../contexts/GlobalSearchContext';
import { useConfirm } from '../contexts/ConfirmContext';
import { apiDownloadFile, apiRequest, apiUploadFile } from '../utils/api';
import PageToolbar from '../components/common/PageToolbar';
import StatStrip from '../components/common/StatStrip';
import SideDrawer from '../components/common/SideDrawer';
import './Maintenance.css';

const SERVICE_TYPES = [
  'Oil Change',
  'Engine Repair',
  'Tyre Replace',
  'Brake Service',
  'Battery Replace',
  'Clutch Repair',
  'Suspension Work',
  'Periodic Service'
];

const today = () => new Date().toISOString().slice(0, 10);

export default function Maintenance() {
  const { globalSearch } = useGlobalSearch();
  const confirm = useConfirm();

  const [vehicles, setVehicles] = useState([]);
  const [serviceRecords, setServiceRecords] = useState([]);
  const [driverReports, setDriverReports] = useState([]);
  const [reportsError, setReportsError] = useState('');
  const [uploadingReceiptId, setUploadingReceiptId] = useState(null);

  // Active top-level tab: 'records' | 'issues' | 'history'
  const [activeTab, setActiveTab] = useState('records');

  // Filters
  const [vehicleFilter, setVehicleFilter] = useState('');
  const [dateRangeFilter, setDateRangeFilter] = useState('all'); // 'all' | 'this_month' | 'last_30'

  // Log Service Drawer state
  const [isLogServiceOpen, setIsLogServiceOpen] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState('');
  const [serviceType, setServiceType] = useState('');
  const [cost, setCost] = useState('');
  const [date, setDate] = useState(today());
  const [vendor, setVendor] = useState('');
  const [status, setStatus] = useState('Active'); // 'Active' | 'Completed'
  const [isSaving, setIsSaving] = useState(false);

  // Animation State
  const [newRecordId, setNewRecordId] = useState(null);

  // Form Validation
  const isValid = selectedVehicle && serviceType && cost && date;

  const showToast = (message) => {
    window.dispatchEvent(new CustomEvent('app-toast', { detail: message }));
  };

  // Load vehicles
  const loadVehicles = useCallback(async (isBackground = false) => {
    try {
      const response = await apiRequest('GET', '/vehicles');
      setVehicles((response.data && (Array.isArray(response.data) ? response.data : response.data.vehicles)) || []);
    } catch (error) {
      if (!isBackground) showToast(error.message || 'Unable to load vehicles.');
    }
  }, []);

  // Service records: the MAINTENANCE/TYRES/GARAGE slice of the expense ledger.
  const loadServiceRecords = useCallback(async (isBackground = false) => {
    try {
      const response = await apiRequest('GET', '/expenses');
      const all = (response.data && response.data.expenses) || [];
      setServiceRecords(all.filter((e) => ['MAINTENANCE', 'TYRES', 'GARAGE'].includes(e.category)));
    } catch (error) {
      if (!isBackground) showToast(error.message || 'Unable to load service records.');
    }
  }, []);

  // Driver reports: active or history
  const loadDriverReports = useCallback(async (view = 'active', isBackground = false) => {
    try {
      const response = await apiRequest('GET', `/maintenance/driver-reports?view=${view}`);
      setDriverReports(response.data || []);
      setReportsError('');
    } catch (error) {
      if (!isBackground) setReportsError(error.message || 'Unable to load driver reports.');
    }
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([
      loadVehicles(true),
      loadServiceRecords(true),
      loadDriverReports(activeTab === 'history' ? 'history' : 'active', true)
    ]);
  }, [loadVehicles, loadServiceRecords, loadDriverReports, activeTab]);

  useEffect(() => {
    loadVehicles();
    loadServiceRecords();
    loadDriverReports(activeTab === 'history' ? 'history' : 'active');

    const interval = setInterval(() => {
      loadVehicles(true);
      loadServiceRecords(true);
      loadDriverReports(activeTab === 'history' ? 'history' : 'active', true);
    }, 15000);
    return () => clearInterval(interval);
  }, [loadVehicles, loadServiceRecords, loadDriverReports, activeTab]);

  const handleApproveReport = async (report) => {
    const ok = await confirm({
      title: 'Approve Repair Ticket',
      message: `Approve repair ticket #${report.id} for vehicle ${report.vehicle_registration}? The driver will be authorized to start the repair work.`,
      confirmText: 'Approve Ticket',
      variant: 'info'
    });
    if (!ok) return;

    try {
      const response = await apiRequest('PATCH', `/maintenance/driver-reports/${report.id}`, {
        status: 'Acknowledged'
      });
      showToast('Ticket approved — driver can start repair.');
      await loadDriverReports('active', true);
      return response.data;
    } catch (error) {
      showToast(error.message || 'Could not approve the ticket.');
    }
  };

  const handleUploadReceipt = async (report, event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.type)) {
      showToast('Upload the bill as a PDF, JPEG, or PNG file.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      showToast('The bill must be 10 MB or smaller.');
      return;
    }
    setUploadingReceiptId(report.id);
    try {
      await apiUploadFile(`/maintenance/driver-reports/${report.id}/receipt`, 'receipt', file);
      showToast('Bill uploaded.');
      await loadDriverReports(activeTab === 'history' ? 'history' : 'active', true);
    } catch (error) {
      showToast(error.message || 'Could not upload the bill.');
    } finally {
      setUploadingReceiptId(null);
    }
  };

  const handleDownloadReceipt = async (report) => {
    try {
      await apiDownloadFile(
        `/maintenance/driver-reports/${report.id}/receipt`,
        report.receipt_file_name || `repair-receipt-${report.id}`
      );
    } catch (error) {
      showToast(error.message || 'Unable to download repair receipt.');
    }
  };

  // Filter available vehicles for dropdown
  const availableVehicles = vehicles.filter((v) => v.status === 'Available');

  // Complete an open service record (Release from In Shop)
  const handleCompleteService = async (record) => {
    const ok = await confirm({
      title: 'Release Vehicle to Fleet',
      message: `Mark maintenance completed for vehicle ${record.vehicle_registration}? Its status will change from "In Shop" back to "Available" for dispatching. The recorded cost (₹${Number(record.amount || 0).toLocaleString('en-IN')}) will remain in the expense ledger.`,
      confirmText: 'Release Vehicle',
      variant: 'info'
    });
    if (!ok) return;

    try {
      await apiRequest('PATCH', `/vehicles/${record.vehicle_id}/status`, { status: 'Available' });
      showToast(`Vehicle ${record.vehicle_registration} marked available.`);
      await Promise.all([loadVehicles(true), loadServiceRecords(true)]);
    } catch (error) {
      showToast(error.message || 'Could not release the vehicle.');
    }
  };

  // Log a service record form submit
  const handleSave = async (e) => {
    e.preventDefault();
    if (!isValid) return;

    setIsSaving(true);
    try {
      const response = await apiRequest('POST', '/expenses', {
        vehicle_id: selectedVehicle,
        category: serviceType === 'Tyre Replace' ? 'TYRES' : 'MAINTENANCE',
        description: serviceType,
        amount: parseFloat(String(cost).replace(/[^0-9.]/g, '')),
        expense_date: date || undefined,
        vendor: vendor || undefined,
        payment_mode: 'Cash'
      });
      const created = response.data;

      if (status === 'Active') {
        await apiRequest('PATCH', `/vehicles/${selectedVehicle}/status`, { status: 'In Shop' });
        showToast('Vehicle moved to In Shop.');
      } else {
        showToast('Service record completed.');
      }

      setNewRecordId(created.id);
      setSelectedVehicle('');
      setServiceType('');
      setCost('');
      setDate(today());
      setVendor('');
      setStatus('Active');
      setIsLogServiceOpen(false);

      await Promise.all([loadVehicles(true), loadServiceRecords(true)]);
      setTimeout(() => setNewRecordId(null), 1500);
    } catch (error) {
      showToast(error.message || 'Could not save the service record.');
    } finally {
      setIsSaving(false);
    }
  };

  // Filter records
  const filteredRecords = serviceRecords.filter((record) => {
    const search = (globalSearch || '').toLowerCase();
    if (search) {
      const matches =
        String(record.vehicle_registration || '').toLowerCase().includes(search) ||
        String(record.description || '').toLowerCase().includes(search) ||
        String(record.vendor || '').toLowerCase().includes(search);
      if (!matches) return false;
    }
    if (vehicleFilter && record.vehicle_id !== vehicleFilter) {
      return false;
    }
    if (dateRangeFilter === 'this_month') {
      const curMonth = today().slice(0, 7);
      if (!String(record.expense_date || '').startsWith(curMonth)) return false;
    } else if (dateRangeFilter === 'last_30') {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      if (record.expense_date < thirtyDaysAgo) return false;
    }
    return true;
  });

  const totalServiceCost = filteredRecords.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

  // Counts
  const inShopCount = vehicles.filter((v) => v.status === 'In Shop' || v.status === 'In shop').length;
  const openReportsCount = driverReports.filter((r) => r.status === 'Open').length;
  const pendingApprovalCount = driverReports.filter((r) => r.status === 'Open' && r.approval_requested).length;

  return (
    <div className="maintenance-page fade-in">
      {/* 1. Page Toolbar */}
      <PageToolbar
        title="Maintenance"
        tooltip="Log service records, track driver-reported issues and monitor vehicle shop status."
        actions={
          <>
            <button
              className="btn btn-outline"
              onClick={refreshAll}
              title="Refresh maintenance data"
              style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem' }}
            >
              <RefreshCw size={14} /> Refresh
            </button>
            <button
              className="btn btn-primary"
              onClick={() => setIsLogServiceOpen(true)}
              style={{ padding: '0.4rem 0.85rem', fontSize: '0.8rem' }}
            >
              <Plus size={14} /> Log service
            </button>
          </>
        }
      >
        {/* Vehicle Filter */}
        <select
          className="select"
          style={{ padding: '0.35rem 0.65rem', fontSize: '0.8rem', minWidth: '160px' }}
          value={vehicleFilter}
          onChange={(e) => setVehicleFilter(e.target.value)}
        >
          <option value="">All Vehicles ({vehicles.length})</option>
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.registration_number} {v.status === 'In Shop' ? '(In Shop)' : ''}
            </option>
          ))}
        </select>

        {/* Date Filter */}
        <select
          className="select"
          style={{ padding: '0.35rem 0.65rem', fontSize: '0.8rem', minWidth: '130px' }}
          value={dateRangeFilter}
          onChange={(e) => setDateRangeFilter(e.target.value)}
        >
          <option value="all">All Dates</option>
          <option value="this_month">This Month</option>
          <option value="last_30">Last 30 Days</option>
        </select>
      </PageToolbar>

      {/* 2. Slim StatStrip */}
      <StatStrip
        items={[
          {
            label: 'In Shop',
            value: inShopCount,
            color: inShopCount > 0 ? 'var(--status-orange)' : undefined,
            isDimmed: inShopCount === 0
          },
          {
            label: 'Open Reports',
            value: openReportsCount,
            color: openReportsCount > 0 ? '#b54708' : undefined,
            isDimmed: openReportsCount === 0
          },
          {
            label: 'Need Approval',
            value: pendingApprovalCount,
            color: pendingApprovalCount > 0 ? 'var(--status-red)' : undefined,
            isDimmed: pendingApprovalCount === 0
          },
          {
            label: 'Total Records',
            value: serviceRecords.length
          }
        ]}
      />

      {/* 3. Navigation Tabs: Service records | Driver issues | History */}
      <div className="filter-chips-row mb-3" role="tablist">
        <button
          type="button"
          role="tab"
          className={`filter-chip ${activeTab === 'records' ? 'active' : ''}`}
          onClick={() => setActiveTab('records')}
        >
          Service records ({filteredRecords.length})
        </button>
        <button
          type="button"
          role="tab"
          className={`filter-chip ${activeTab === 'issues' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('issues');
            loadDriverReports('active', true);
          }}
        >
          Driver issues ({openReportsCount})
        </button>
        <button
          type="button"
          role="tab"
          className={`filter-chip ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('history');
            loadDriverReports('history', true);
          }}
        >
          History
        </button>
      </div>

      {reportsError && (
        <div className="driver-reports-error mb-3">{reportsError}</div>
      )}

      {/* 4. Tab 1: Service Records Table (Full Width, starts at y≈170) */}
      {activeTab === 'records' && (
        <div className="dense-table-wrapper">
          <div className="dense-table-scroll">
            <table className="dense-table">
              <thead>
                <tr>
                  <th>Vehicle</th>
                  <th>Service Description</th>
                  <th>Vendor / Garage</th>
                  <th className="num">Cost</th>
                  <th>Date</th>
                  <th style={{ textAlign: 'center' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--sub)' }}>
                      No service records found matching filters.
                    </td>
                  </tr>
                ) : (
                  filteredRecords.map((record) => (
                    <tr key={record.id} className={record.id === newRecordId ? 'row-bounce' : ''}>
                      <td>
                        <span className="vehicle-chip">{record.vehicle_registration}</span>
                      </td>
                      <td style={{ fontWeight: 600 }}>{record.description}</td>
                      <td>{record.vendor || '—'}</td>
                      <td className="num">₹{Number(record.amount).toLocaleString('en-IN')}</td>
                      <td className="mono">{record.expense_date}</td>
                      <td style={{ textAlign: 'center' }}>
                        {String(record.vehicle_status) === 'In Shop' ? (
                          <span
                            className="pill pill-orange status-interactive flex items-center gap-1.5"
                            onClick={() => handleCompleteService(record)}
                            title="Click to release the vehicle back to fleet"
                            style={{ cursor: 'pointer', display: 'inline-flex' }}
                          >
                            <span className="pulsing-dot" style={{ backgroundColor: 'var(--status-orange)' }} />
                            In Shop
                          </span>
                        ) : (
                          <span className="pill pill-green flex items-center gap-1" style={{ display: 'inline-flex' }}>
                            <Check size={13} /> Completed
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} style={{ textAlign: 'right' }}>
                    Filtered Service Total:
                  </td>
                  <td className="num">₹{Number(totalServiceCost).toLocaleString('en-IN')}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* 5. Tab 2 & 3: Driver Issues & History */}
      {(activeTab === 'issues' || activeTab === 'history') && (
        <div className="card p-4">
          {driverReports.length === 0 ? (
            <p className="text-sm text-muted py-6 text-center">
              {activeTab === 'issues'
                ? 'No open driver issues at this time. All fleet vehicles are operational.'
                : 'No historical maintenance repairs recorded yet.'}
            </p>
          ) : (
            <div className="driver-reports-list" style={{ marginTop: 0 }}>
              {driverReports
                .filter((report) => {
                  const search = (globalSearch || '').toLowerCase();
                  return (
                    !search ||
                    [
                      report.vehicle_registration,
                      report.driver_name,
                      report.description,
                      report.origin,
                      report.destination
                    ].some((val) => String(val || '').toLowerCase().includes(search))
                  );
                })
                .map((report) => (
                  <article className="driver-report-row" key={report.id} style={{ padding: '0.75rem 0' }}>
                    <div className="driver-report-main" style={{ width: '100%' }}>
                      <div className="driver-report-meta" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span className="vehicle-chip">{report.vehicle_registration}</span>
                          <span className={`driver-report-priority priority-${report.priority.toLowerCase()}`}>
                            {report.priority}
                          </span>
                          <span className={`driver-report-status status-${report.status.toLowerCase()}`}>
                            {report.status === 'Open'
                              ? report.approval_requested
                                ? 'Approval requested'
                                : 'Reported'
                              : report.status === 'Acknowledged'
                              ? 'Fixing'
                              : report.status}
                          </span>
                        </div>
                        <span style={{ fontSize: '0.72rem', color: 'var(--sub)' }}>
                          {new Date(report.created_at).toLocaleString('en-IN')}
                        </span>
                      </div>

                      <p className="driver-report-description" style={{ margin: '0.4rem 0', fontWeight: 500 }}>
                        {report.description}
                      </p>
                      <p className="driver-report-context" style={{ fontSize: '0.75rem', color: 'var(--sub)' }}>
                        {report.driver_name} · Route: {report.origin} → {report.destination}
                      </p>

                      <div
                        className="driver-report-financial"
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.5rem' }}
                      >
                        <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                          Cost: {report.repair_cost == null ? 'Pending' : `₹${Number(report.repair_cost).toLocaleString('en-IN')}`}
                        </span>

                        <div>
                          {report.status === 'Open' && report.approval_requested ? (
                            <button
                              type="button"
                              className="driver-report-approve"
                              onClick={() => handleApproveReport(report)}
                            >
                              <Check size={14} /> Approve Repair
                            </button>
                          ) : report.status === 'Open' ? (
                            <span style={{ fontSize: '0.75rem', color: 'var(--sub)' }}>Waiting for driver quote</span>
                          ) : report.has_receipt ? (
                            <button
                              type="button"
                              className="driver-report-download"
                              onClick={() => handleDownloadReceipt(report)}
                            >
                              <Download size={14} /> {report.receipt_file_name || 'Download bill'}
                            </button>
                          ) : report.receipt_pending ? (
                            <label className={`driver-report-upload${uploadingReceiptId === report.id ? ' is-uploading' : ''}`}>
                              <Upload size={14} /> {uploadingReceiptId === report.id ? 'Uploading…' : 'Upload bill'}
                              <input
                                type="file"
                                accept="application/pdf,image/jpeg,image/png"
                                hidden
                                disabled={uploadingReceiptId === report.id}
                                onChange={(event) => handleUploadReceipt(report, event)}
                              />
                            </label>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
            </div>
          )}
        </div>
      )}

      {/* 6. SideDrawer: Log Service Record */}
      <SideDrawer
        isOpen={isLogServiceOpen}
        onClose={() => setIsLogServiceOpen(false)}
        title="Log Service Record"
        subtitle="Vehicle status will flip to In Shop and cost lands in expense ledger."
      >
        <form onSubmit={handleSave}>
          <div className="input-group mb-4">
            <label>Vehicle *</label>
            {availableVehicles.length === 0 ? (
              <div
                className="text-sm flex items-center gap-1 p-2"
                style={{ background: 'var(--amber-bg)', color: 'var(--amber)', borderRadius: '6px' }}
              >
                <AlertCircle size={14} /> No currently available vehicles
              </div>
            ) : (
              <select
                className="select w-full"
                value={selectedVehicle}
                onChange={(e) => setSelectedVehicle(e.target.value)}
                required
              >
                <option value="" disabled>Select vehicle...</option>
                {availableVehicles.map((v) => (
                  <option key={v.id} value={v.id}>{v.registration_number}</option>
                ))}
              </select>
            )}
          </div>

          <div className="input-group mb-4">
            <label>Service Type *</label>
            <input
              type="text"
              className="input w-full"
              placeholder="e.g. Oil Change"
              list="service-types"
              value={serviceType}
              onChange={(e) => setServiceType(e.target.value)}
              required
            />
            <datalist id="service-types">
              {SERVICE_TYPES.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
            <div className="input-group">
              <label>Cost (₹) *</label>
              <input
                type="number"
                step="0.01"
                className="input w-full"
                placeholder="0.00"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                required
              />
            </div>
            <div className="input-group">
              <label>Date *</label>
              <input
                type="date"
                className="input w-full"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="input-group mb-4">
            <label>Workshop / Vendor (optional)</label>
            <input
              type="text"
              className="input w-full"
              placeholder="e.g. Sharma Auto Works"
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
            />
          </div>

          <div className="input-group mb-6">
            <label>Service Status</label>
            <div className="toggle-group" style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                className={`toggle-btn ${status === 'Active' ? 'active active-amber' : ''}`}
                onClick={() => setStatus('Active')}
                style={{ flex: 1, padding: '0.5rem', borderRadius: '6px', cursor: 'pointer' }}
              >
                Active (In Shop)
              </button>
              <button
                type="button"
                className={`toggle-btn ${status === 'Completed' ? 'active active-green' : ''}`}
                onClick={() => setStatus('Completed')}
                style={{ flex: 1, padding: '0.5rem', borderRadius: '6px', cursor: 'pointer' }}
              >
                Completed Directly
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', paddingTop: '1rem', borderTop: '1px solid var(--line)' }}>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setIsLogServiceOpen(false)}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!isValid || isSaving}
            >
              {isSaving ? 'Saving…' : 'Save record'}
            </button>
          </div>
        </form>
      </SideDrawer>
    </div>
  );
}
