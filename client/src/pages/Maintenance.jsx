import React, { useState, useEffect, useCallback } from 'react';
import { Check, Info, Download, RefreshCw } from 'lucide-react';
import { useGlobalSearch } from '../contexts/GlobalSearchContext';
import { apiDownloadFile, apiRequest } from '../utils/api';
import './Maintenance.css';

// Service records entered here ride the SAME consolidated expense ledger as
// the driver-reported repairs (migration 021): saving a record writes the cost
// into the ledger immediately, and logging it Active flips the vehicle In Shop
// through the real vehicle endpoint. The manager sees driver tickets from the
// mobile app in the Driver maintenance panel below.

const SERVICE_TYPES = ['Oil Change', 'Engine Repair', 'Tyre Replace', 'Brake Service', 'Battery Replace', 'Clutch Repair', 'Suspension Work', 'Periodic Service'];

const today = () => new Date().toISOString().slice(0, 10);

export default function Maintenance() {
  const { globalSearch } = useGlobalSearch();
  const [vehicles, setVehicles] = useState([]);
  const [serviceRecords, setServiceRecords] = useState([]);
  const [driverReports, setDriverReports] = useState([]);
  const [reportsError, setReportsError] = useState('');
  const [reportView, setReportView] = useState('active');

  // Form State
  const [selectedVehicle, setSelectedVehicle] = useState('');
  const [serviceType, setServiceType] = useState('');
  const [cost, setCost] = useState('');
  const [date, setDate] = useState(today());
  const [vendor, setVendor] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Animation State
  const [flashType, setFlashType] = useState(null); // 'in' | 'out'
  const [newRecordId, setNewRecordId] = useState(null);

  // Form Validation
  const isValid = selectedVehicle && serviceType && cost && date;

  const showToast = (message) => {
    const evt = new CustomEvent('app-toast', { detail: message });
    window.dispatchEvent(evt);
  };

  // Vehicles for the dropdown + the shop-status table.
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
      // A background refresh hiccup keeps the last good data.
      if (!isBackground) showToast(error.message || 'Unable to load service records.');
    }
  }, []);

  const loadDriverReports = useCallback(async (view = reportView, isBackground = false) => {
    try {
      const response = await apiRequest('GET', `/maintenance/driver-reports?view=${view}`);
      setDriverReports(response.data || []);
      setReportsError('');
    } catch (error) {
      if (!isBackground) setReportsError(error.message || 'Unable to load driver reports.');
    }
  }, [reportView]);

  useEffect(() => {
    loadVehicles();
    loadServiceRecords();
    loadDriverReports(reportView);
    // Auto-refresh: the tracking list's pattern - silent merges, no flash.
    const interval = setInterval(() => {
      loadVehicles(true);
      loadServiceRecords(true);
      loadDriverReports(reportView, true);
    }, 15000);
    return () => clearInterval(interval);
  }, [loadVehicles, loadServiceRecords, loadDriverReports, reportView]);

  // Approve a driver's ticket from the web: the manager marks it Fixing
  // (Acknowledged) through the real endpoint, so the driver sees it and can
  // start the repair. The driver's own self-approve from the app stays
  // allowed — this is the manager's mirror of the same transition.
  const handleApproveReport = async (report) => {
    try {
      const response = await apiRequest('PATCH', `/maintenance/driver-reports/${report.id}`, {
        status: 'Acknowledged'
      });
      showToast('Ticket approved — the driver can start the repair.');
      await loadDriverReports(reportView, true);
      return response.data;
    } catch (error) {
      showToast(error.message || 'Could not approve the ticket.');
    }
  };

  const handleDownloadReceipt = async (report) => {
    try {
      await apiDownloadFile(
        `/maintenance/driver-reports/${report.id}/receipt`,
        report.receipt_file_name || `repair-receipt-${report.id}`,
      );
    } catch (error) {
      showToast(error.message || 'Unable to download repair receipt.');
    }
  };

  // Filter available vehicles for dropdown
  const availableVehicles = vehicles.filter(v => v.status === 'Available');

  // Filter records for table (with global search)
  const filteredRecords = serviceRecords.filter(record => {
    const search = globalSearch.toLowerCase();
    return !search ||
      String(record.vehicle_registration || '').toLowerCase().includes(search) ||
      String(record.description || '').toLowerCase().includes(search) ||
      String(record.vendor || '').toLowerCase().includes(search);
  });

  // Log a service record: real endpoint (POST /expenses, category carried),
  // then flip the vehicle In Shop through the real vehicle endpoint when the
  // job is still open.
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
        setFlashType('in');
        showToast('Vehicle moved to In Shop.');
      } else {
        // Logged as completed directly: the vehicle stays available.
        showToast('Service record completed.');
      }

      setNewRecordId(created.id);
      setSelectedVehicle('');
      setServiceType('');
      setCost('');
      setDate(today());
      setVendor('');
      setStatus('Active');

      await Promise.all([loadVehicles(true), loadServiceRecords(true)]);

      setTimeout(() => {
        setFlashType(null);
        setNewRecordId(null);
      }, 1500);
    } catch (error) {
      showToast(error.message || 'Could not save the service record.');
    } finally {
      setIsSaving(false);
    }
  };

  // Complete an open service record: its cost is already in the ledger
  // (logged at save time); completing just releases the vehicle.
  const handleCompleteService = async (record) => {
    try {
      await apiRequest('PATCH', `/vehicles/${record.vehicle_id}/status`, { status: 'Available' });
      setFlashType('out');
      showToast(`Vehicle ${record.vehicle_registration} marked available.`);
      await Promise.all([loadVehicles(true), loadServiceRecords(true)]);
      setTimeout(() => setFlashType(null), 1500);
    } catch (error) {
      showToast(error.message || 'Could not release the vehicle.');
    }
  };

  return (
    <div className="maintenance-page fade-in">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl heading">Maintenance</h1>
        <p className="text-sm text-muted mt-1">Log a service record and track every vehicle's shop status in real time.</p>
      </div>

      <section className="driver-reports-section" aria-label="Driver-reported vehicle issues">
        <div className="driver-reports-heading">
          <div>
            <h2 className="heading text-lg">Driver maintenance</h2>
            <p className="text-xs text-muted">
              {reportView === 'active' ? 'Open issues reported from the mobile app on dispatched trips.' : 'Resolved vehicle repairs and receipts.'}
            </p>
          </div>
          <div className="driver-report-tabs" role="tablist" aria-label="Maintenance reports">
            <button
              type="button"
              role="tab"
              aria-selected={reportView === 'active'}
              className={reportView === 'active' ? 'active' : ''}
              onClick={() => setReportView('active')}
            >Active</button>
            <button
              type="button"
              role="tab"
              aria-selected={reportView === 'history'}
              className={reportView === 'history' ? 'active' : ''}
              onClick={() => setReportView('history')}
            >History</button>
          </div>
        </div>
        {reportsError ? <p className="driver-reports-error">{reportsError}</p> : null}
        {!reportsError && driverReports.length === 0 ? (
          <p className="driver-reports-empty">
            {reportView === 'active' ? 'No open driver issues.' : 'No completed maintenance repairs yet.'}
          </p>
        ) : null}
        {driverReports.length > 0 ? (
          <div className="driver-reports-list">
            {driverReports.filter(report => {
              const search = globalSearch.toLowerCase();
              return !search || [report.vehicle_registration, report.driver_name, report.description, report.origin, report.destination]
                .some(value => String(value || '').toLowerCase().includes(search));
            }).map(report => (
              <article className="driver-report-row" key={report.id}>
                <div className="driver-report-main">
                  <div className="driver-report-meta">
                    <span className="vehicle-chip">{report.vehicle_registration}</span>
                    <span className={`driver-report-priority priority-${report.priority.toLowerCase()}`}>{report.priority}</span>
                    <span className={`driver-report-status status-${report.status.toLowerCase()}`}>
                      {report.status === 'Open' ? 'Reported' : report.status === 'Acknowledged' ? 'Fixing' : report.status}
                    </span>
                  </div>
                  <p className="driver-report-description">{report.description}</p>
                  <p className="driver-report-context">
                    {report.driver_name} · Trip {report.origin} to {report.destination} · {new Date(report.created_at).toLocaleString()}
                  </p>
                  <div className="driver-report-financial">
                    <span>
                      Repair cost: {report.repair_cost == null ? 'Not recorded' : `₹${Number(report.repair_cost).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                    </span>
                    {report.status === 'Open' ? (
                      <button type="button" className="driver-report-approve" onClick={() => handleApproveReport(report)}>
                        <Check size={14} /> Approve
                      </button>
                    ) : report.has_receipt ? (
                      <button type="button" className="driver-report-download" onClick={() => handleDownloadReceipt(report)}>
                        <Download size={14} /> {report.receipt_file_name || 'Download bill'}
                      </button>
                    ) : report.receipt_pending ? (
                      <span className="receipt-pending-badge">Receipt pending</span>
                    ) : report.status === 'Resolved' && Number(report.repair_cost) === 0 ? (
                      <span>No bill required</span>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </section>

      <div className="maintenance-grid">
        {/* Left Column: Form */}
        <div className="card">
          <h2 className="heading text-lg mb-2">Log service record</h2>
          <p className="text-xs text-muted mb-6">Only vehicles currently available for dispatch can be logged for service. The cost lands in the expense ledger immediately.</p>

          <form onSubmit={handleSave}>
            <div className="input-group mb-4">
              <label>Vehicle</label>
              {availableVehicles.length === 0 ? (
                <div className="text-sm text-status-orange flex items-center gap-1 p-2 bg-status-orange" style={{ background: 'var(--amber-bg)', borderRadius: '4px' }}>
                  <Info size={14} /> No available vehicles
                </div>
              ) : (
                <select className="select w-full" value={selectedVehicle} onChange={e => setSelectedVehicle(e.target.value)}>
                  <option value="" disabled>Select vehicle...</option>
                  {availableVehicles.map(v => (
                    <option key={v.id} value={v.id}>{v.registration_number}</option>
                  ))}
                </select>
              )}
            </div>

            <div className="input-group mb-4">
              <label>Service Type</label>
              <input
                type="text"
                className="input w-full"
                placeholder="e.g. Oil Change"
                list="service-types"
                value={serviceType}
                onChange={e => setServiceType(e.target.value)}
              />
              <datalist id="service-types">
                {SERVICE_TYPES.map((t) => <option key={t} value={t} />)}
              </datalist>
            </div>

            <div className="flex gap-4 mb-4">
              <div className="input-group flex-1">
                <label>Cost</label>
                <div className="currency-input-wrapper">
                  <span className="currency-symbol">₹</span>
                  <input
                    type="text"
                    className="input"
                    placeholder="0.00"
                    value={cost}
                    onChange={e => setCost(e.target.value)}
                  />
                </div>
              </div>
              <div className="input-group flex-1">
                <label>Date</label>
                <input
                  type="date"
                  className="input w-full"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                />
              </div>
            </div>

            <div className="input-group mb-4">
              <label>Workshop / vendor (optional)</label>
              <input
                type="text"
                className="input w-full"
                placeholder="e.g. Sharma Auto Works"
                value={vendor}
                onChange={e => setVendor(e.target.value)}
              />
            </div>

            <div className="input-group mb-6">
              <label>Status</label>
              <div className="toggle-group">
                <div
                  className={`toggle-btn ${status === 'Active' ? 'active active-amber' : ''}`}
                  onClick={() => setStatus('Active')}
                >
                  Active
                </div>
                <div
                  className={`toggle-btn ${status === 'Completed' ? 'active active-green' : ''}`}
                  onClick={() => setStatus('Completed')}
                >
                  Completed
                </div>
              </div>
            </div>

            <button
              type="submit"
              className={`btn btn-amber-gradient w-full ${isSaving ? 'btn-loading' : ''}`}
              disabled={!isValid || isSaving}
            >
              {isSaving ? 'Saving…' : 'Save record'}
            </button>
          </form>
        </div>

        {/* Right Column: Table & Diagram */}
        <div className="flex flex-col gap-6">
          <div className="card p-0 overflow-hidden">
            <div className="card-header-row">
              <h3 className="heading text-sm">Service records</h3>
              <button className="btn-refresh-sm" onClick={() => { loadServiceRecords(true); loadVehicles(true); }} title="Refresh">
                <RefreshCw size={14} />
              </button>
            </div>
            <div className="table-container">
              <table className="maintenance-table w-full">
                <thead>
                  <tr>
                    <th>Vehicle</th>
                    <th>Service</th>
                    <th>Vendor</th>
                    <th>Cost</th>
                    <th>Date</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRecords.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="text-center py-8 text-muted">No service records found.</td>
                    </tr>
                  ) : (
                    filteredRecords.map(record => (
                      <tr key={record.id} className={record.id === newRecordId ? 'row-bounce' : ''}>
                        <td>
                          <span className="vehicle-chip">{record.vehicle_registration}</span>
                        </td>
                        <td className="font-medium text-text-primary">{record.description}</td>
                        <td>{record.vendor || '—'}</td>
                        <td className="mono">₹{Number(record.amount).toLocaleString('en-IN')}</td>
                        <td className="mono">{record.expense_date}</td>
                        <td>
                          {String(record.vehicle_status) === 'In Shop' ? (
                            <span
                              className="pill pill-orange status-interactive flex items-center gap-2"
                              onClick={() => handleCompleteService(record)}
                              title="Click to release the vehicle"
                            >
                              <span className="pulsing-dot" style={{ backgroundColor: 'var(--status-orange)' }}></span>
                              In Shop
                            </span>
                          ) : (
                            <span className="pill pill-green flex items-center gap-1">
                              <Check size={14} /> Completed
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="diagram-panel">
            <h3 className="heading text-sm mb-4">Vehicle status transitions</h3>

            <div className={`flow-row ${flashType === 'in' ? 'diagram-flash-in' : ''}`}>
              <div className="node green">Available</div>
              <div className="path-container">
                <div className="dashed-line"></div>
                <div className="path-label">logging an active repair</div>
                <div className="moving-dot orange"></div>
              </div>
              <div className="node orange">In Shop</div>
            </div>

            <div className={`flow-row ${flashType === 'out' ? 'diagram-flash-out' : ''}`}>
              <div className="node orange">In Shop</div>
              <div className="path-container">
                <div className="dashed-line"></div>
                <div className="path-label">closing a completed repair</div>
                <div className="moving-dot green"></div>
              </div>
              <div className="node green">Available</div>
            </div>

            <p className="text-xs text-muted mt-4">Note: In Shop vehicles are removed from the dispatch pool. Driver-reported repairs resolve from the mobile app; the repair cost lands in the ledger either way.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
