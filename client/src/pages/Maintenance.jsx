import React, { useState, useEffect } from 'react';
import { Plus, Check, Search, Info, Download } from 'lucide-react';
import { useGlobalSearch } from '../contexts/GlobalSearchContext';
import { apiDownloadFile, apiRequest } from '../utils/api';
import './Maintenance.css';

// Mock Data
const initialVehicles = [
  { id: '1', regNo: 'GJ01AB452', status: 'Available' },
  { id: '2', regNo: 'GJ01AB998', status: 'Available' },
  { id: '3', regNo: 'GJ01AB1120', status: 'In shop' },
  { id: '4', regNo: 'GJ01AB008', status: 'Available' }
];

const initialLogs = [
  { id: '101', vehicleId: '3', regNo: 'GJ01AB1120', service: 'Engine Repair', cost: '12,000', status: 'Active', date: '2023-10-24' }
];

export default function Maintenance() {
  const { globalSearch } = useGlobalSearch();
  const [vehicles, setVehicles] = useState(initialVehicles);
  const [logs, setLogs] = useState(initialLogs);
  const [driverReports, setDriverReports] = useState([]);
  const [reportsError, setReportsError] = useState('');
  const [reportView, setReportView] = useState('active');
  
  // Form State
  const [selectedVehicle, setSelectedVehicle] = useState('');
  const [serviceType, setServiceType] = useState('');
  const [cost, setCost] = useState('');
  const [date, setDate] = useState('');
  const [status, setStatus] = useState('Active'); // Active or Completed
  const [isSaving, setIsSaving] = useState(false);
  
  // Animation State
  const [flashType, setFlashType] = useState(null); // 'in' | 'out'
  const [newLogId, setNewLogId] = useState(null);

  // Form Validation
  const isValid = selectedVehicle && serviceType && cost && date;

  const loadDriverReports = async (view = reportView) => {
    try {
      const response = await apiRequest('GET', `/maintenance/driver-reports?view=${view}`);
      setDriverReports(response.data || []);
      setReportsError('');
    } catch (error) {
      setReportsError(error.message || 'Unable to load driver reports.');
    }
  };

  useEffect(() => {
    loadDriverReports(reportView);
    const interval = setInterval(() => loadDriverReports(reportView), 15000);
    return () => clearInterval(interval);
  }, [reportView]);

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

  // Filter logs for table (with global search)
  const filteredLogs = logs.filter(log => {
    return log.regNo.toLowerCase().includes(globalSearch.toLowerCase()) ||
           log.service.toLowerCase().includes(globalSearch.toLowerCase());
  });

  const showToast = (message) => {
    const evt = new CustomEvent('app-toast', { detail: message });
    window.dispatchEvent(evt);
  };

  const handleSave = (e) => {
    e.preventDefault();
    if (!isValid) return;

    setIsSaving(true);
    
    // Simulate network request
    setTimeout(() => {
      const v = vehicles.find(v => v.id === selectedVehicle);
      
      const newLog = {
        id: Date.now().toString(),
        vehicleId: v.id,
        regNo: v.regNo,
        service: serviceType,
        cost,
        status,
        date
      };

      setLogs([newLog, ...logs]);
      setNewLogId(newLog.id);
      
      if (status === 'Active') {
        setVehicles(vehicles.map(vh => vh.id === v.id ? { ...vh, status: 'In shop' } : vh));
        setFlashType('in');
      } else {
        // If logged as completed directly, vehicle stays available
        showToast('Service record completed.');
      }

      // Reset form
      setSelectedVehicle('');
      setServiceType('');
      setCost('');
      setDate('');
      setStatus('Active');
      setIsSaving(false);
      
      if (status === 'Active') {
        showToast(`Vehicle ${v.regNo} moved to In Shop.`);
      }

      setTimeout(() => {
        setFlashType(null);
        setNewLogId(null);
      }, 1500);
      
    }, 800);
  };

  const handleCompleteService = (logId, vehicleId, regNo) => {
    // Update log status
    setLogs(logs.map(l => l.id === logId ? { ...l, status: 'Completed' } : l));
    // Update vehicle status
    setVehicles(vehicles.map(v => v.id === vehicleId ? { ...v, status: 'Available' } : v));
    
    setFlashType('out');
    showToast(`Vehicle ${regNo} marked available.`);
    
    setTimeout(() => {
      setFlashType(null);
    }, 1500);
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
              {reportView === 'active' ? 'Open issues on dispatched trips.' : 'Resolved vehicle repairs and receipts.'}
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
                    {report.has_receipt ? (
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
          <p className="text-xs text-muted mb-6">Only vehicles currently available for dispatch can be logged for service.</p>
          
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
                    <option key={v.id} value={v.id}>{v.regNo}</option>
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
                <option value="Oil Change" />
                <option value="Engine Repair" />
                <option value="Tyre Replace" />
                <option value="Brake Service" />
                <option value="Battery Replace" />
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
              Save record
            </button>
          </form>
        </div>

        {/* Right Column: Table & Diagram */}
        <div className="flex flex-col gap-6">
          <div className="card p-0 overflow-hidden">
            <div className="table-container">
              <table className="maintenance-table w-full">
                <thead>
                  <tr>
                    <th>Vehicle</th>
                    <th>Service</th>
                    <th>Cost</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.length === 0 ? (
                    <tr>
                      <td colSpan="4" className="text-center py-8 text-muted">No service records found.</td>
                    </tr>
                  ) : (
                    filteredLogs.map(log => (
                      <tr key={log.id} className={log.id === newLogId ? 'row-bounce' : ''}>
                        <td>
                          <span className="vehicle-chip">{log.regNo}</span>
                        </td>
                        <td className="font-medium text-text-primary">{log.service}</td>
                        <td className="mono">₹{Number(String(log.cost).replace(/[^0-9.]/g, '')).toLocaleString('en-IN')}</td>
                        <td>
                          {log.status === 'Active' ? (
                            <span 
                              className="pill pill-orange status-interactive flex items-center gap-2"
                              onClick={() => handleCompleteService(log.id, log.vehicleId, log.regNo)}
                              title="Click to mark completed"
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
            
            <p className="text-xs text-muted mt-4">Note: In Shop vehicles are removed from the dispatch pool.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
