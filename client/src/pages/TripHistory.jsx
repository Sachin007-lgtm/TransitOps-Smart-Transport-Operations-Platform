import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ChevronDown, Info, ArrowLeft, RefreshCw } from 'lucide-react';
import { apiRequest } from '../utils/api';
import { tripCode } from '../utils/tripCode';
import PageToolbar from '../components/common/PageToolbar';
import StatStrip from '../components/common/StatStrip';
import '../components/common/common.css';

// Billing-status filters: every trip here is already Completed, so the
// question this page answers is "what have we finished and is it billed yet?"
const HISTORY_STATUS_FILTERS = ['All', 'Billed', 'Unbilled'];

const fmtDate = (value) => {
  if (!value) return '--';
  const d = new Date(value);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const fmtMoney = (value) => {
  const n = parseFloat(value);
  return n > 0 ? `₹${n.toLocaleString('en-IN')}` : '--';
};

export default function TripHistory() {
  const navigate = useNavigate();
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  // Standard dropdown UI state (same pattern as Vehicles/Drivers toolbars)
  const [isStatusOpen, setIsStatusOpen] = useState(false);
  const statusRef = useRef(null);
  const [search, setSearch] = useState('');

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      setError('');
      const res = await apiRequest('GET', '/trips');
      // Completed trips only — this page is the record of finished work.
      setTrips((res.data || []).filter(t => t.status === 'Completed'));
    } catch (err) {
      if (!silent) setError(err.message || 'Failed to load trip history.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(() => load(true), 6000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (statusRef.current && !statusRef.current.contains(e.target)) {
        setIsStatusOpen(false);
      }
    };
    document.addEventListener('pointerdown', handleOutsideClick);
    return () => document.removeEventListener('pointerdown', handleOutsideClick);
  }, []);

  const filteredTrips = trips.filter(t => {
    if (statusFilter !== 'All' && t.billing_status !== statusFilter) return false;
    const q = (search || '').toLowerCase();
    if (!q) return true;
    return (
      String(t.id).toLowerCase().includes(q) ||
      (t.origin || '').toLowerCase().includes(q) ||
      (t.destination || '').toLowerCase().includes(q) ||
      (t.external_party_name || '').toLowerCase().includes(q) ||
      (t.vehicle?.registration_number || '').toLowerCase().includes(q) ||
      (t.driver?.name || '').toLowerCase().includes(q)
    );
  });

  // Stat strip calculations
  const billedCount = trips.filter(t => t.billing_status === 'Billed').length;
  const unbilledCount = trips.filter(t => t.billing_status === 'Unbilled').length;
  const totalRevenue = trips.reduce((sum, t) => sum + (parseFloat(t.revenue || t.fare_amount || 0) || 0), 0);

  const statItems = [
    { label: 'Completed Trips', value: trips.length },
    { label: 'Billed', value: billedCount },
    { label: 'Unbilled', value: unbilledCount },
    { label: 'Total Revenue', value: totalRevenue > 0 ? `₹${totalRevenue.toLocaleString('en-IN')}` : '₹0' }
  ];

  return (
    <div className="fade-in">
      {/* Single-Row Toolbar */}
      <PageToolbar
        title="Trip History"
        tooltip="Completed trips archive with customer, route, and billing audit trail"
        filters={
          <>
            {/* Search */}
            <div style={{ position: 'relative', width: '220px' }}>
              <Search size={14} className="text-muted" style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                placeholder="Search trip, customer, route..."
                className="input"
                style={{ width: '100%', paddingLeft: '2.2rem', height: '34px', fontSize: '0.82rem' }}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {/* Billing-status Filter Dropdown */}
            <div style={{ position: 'relative', width: '140px' }} ref={statusRef}>
              <div
                className="input flex items-center justify-between"
                style={{ cursor: 'pointer', height: '34px', fontSize: '0.82rem', padding: '0 0.65rem' }}
                onClick={() => setIsStatusOpen(!isStatusOpen)}
              >
                <span className="truncate">{statusFilter}</span>
                <ChevronDown
                  size={14}
                  className="text-muted"
                  style={{ transform: isStatusOpen ? 'rotate(180deg)' : 'none', transition: '0.2s' }}
                />
              </div>
              {isStatusOpen && (
                <div className="custom-dropdown-menu">
                  {HISTORY_STATUS_FILTERS.map(s => (
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
              onClick={() => navigate('/trips')}
              title="Return to Live Dispatcher"
            >
              <ArrowLeft size={14} />
              <span>Live Dispatcher</span>
            </button>
            <button
              type="button"
              className="btn btn-outline"
              style={{ height: '34px', fontSize: '0.82rem', padding: '0 0.85rem' }}
              onClick={() => load(false)}
              title="Refresh trip history"
            >
              <RefreshCw size={14} className={loading ? 'spin-icon' : ''} />
              <span>Refresh</span>
            </button>
          </>
        }
      />

      {/* Slim 40px Stat Strip */}
      <StatStrip items={statItems} />

      {/* History Table (Dense layout) */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-container" style={{ maxHeight: 'calc(100vh - 220px)', overflowY: 'auto' }}>
          <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 5, backgroundColor: '#fafafa' }}>
              <tr style={{ height: '38px' }}>
                <th style={{ paddingLeft: '1.5rem', padding: '0.5rem 1.5rem' }}>Trip</th>
                <th style={{ padding: '0.5rem 0.75rem' }}>Customer</th>
                <th style={{ padding: '0.5rem 0.75rem' }}>Route</th>
                <th style={{ padding: '0.5rem 0.75rem' }}>Vehicle</th>
                <th style={{ padding: '0.5rem 0.75rem' }}>Driver</th>
                <th style={{ padding: '0.5rem 0.75rem' }}>Date</th>
                <th style={{ textAlign: 'right', paddingRight: '1.5rem', padding: '0.5rem 1.5rem' }}>Fare</th>
                <th style={{ textAlign: 'center', padding: '0.5rem 0.75rem' }}>Billing</th>
              </tr>
            </thead>
            <tbody>
              {loading && trips.length === 0 ? (
                <tr>
                  <td colSpan="8" className="text-center py-12 text-muted">Loading trip history...</td>
                </tr>
              ) : filteredTrips.length === 0 ? (
                <tr>
                  <td colSpan="8" className="text-center py-12 text-muted">
                    {trips.length === 0
                      ? 'No completed trips yet. Finish a trip on the Trips page and it appears here.'
                      : 'No trips match this filter.'}
                  </td>
                </tr>
              ) : (
                filteredTrips.map((t, idx) => (
                  <tr
                    key={t.id || idx}
                    className="table-row-animate"
                    style={{ animationDelay: `${idx * 40}ms`, borderLeft: '4px solid rgba(34, 160, 107, 0.5)' }}
                  >
                    {/* Trip ID */}
                    <td className="mono text-xs font-medium" style={{ paddingLeft: '1.5rem' }}>
                      {tripCode(t.id)}
                    </td>

                    {/* Customer */}
                    <td className="text-sm">{t.external_party_name || <span className="text-muted">No customer</span>}</td>

                    {/* Route */}
                    <td className="text-sm">
                      <div className="flex items-center gap-2">
                        <span>{t.origin}</span>
                        <span className="text-muted">→</span>
                        <span>{t.destination}</span>
                      </div>
                    </td>

                    {/* Vehicle */}
                    <td className="mono text-xs">{t.vehicle?.registration_number || '--'}</td>

                    {/* Driver */}
                    <td className="text-sm">{t.driver?.name || '--'}</td>

                    {/* Date */}
                    <td className="mono text-xs">{fmtDate(t.actual_arrival || t.trip_date || t.start_time)}</td>

                    {/* Fare */}
                    <td className="mono text-sm font-medium" style={{ textAlign: 'right', paddingRight: '1.5rem' }}>
                      {fmtMoney(t.revenue)}
                    </td>

                    {/* Billing state */}
                    <td style={{ textAlign: 'center' }}>
                      <span
                        className={`pill mono text-xs font-semibold px-2.5 py-0.5 ${t.billing_status === 'Billed' ? 'pill-green' : 'pill-orange'}`}
                        title={t.billing_status === 'Billed' ? 'This trip is on a bill' : 'Not on a bill yet'}
                      >
                        {t.billing_status === 'Billed' ? 'Billed' : 'Unbilled'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {filteredTrips.length > 0 && (
              <tfoot style={{ position: 'sticky', bottom: 0, backgroundColor: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
                <tr style={{ height: '36px' }}>
                  <td colSpan="6" style={{ padding: '0.4rem 1.5rem', fontSize: '0.78rem', color: '#64748b' }}>
                    Showing {filteredTrips.length} of {trips.length} completed trips
                  </td>
                  <td style={{ textAlign: 'right', paddingRight: '1.5rem', padding: '0.4rem 1.5rem', fontSize: '0.82rem', fontWeight: 600, color: 'var(--plum-1, #3F1A32)' }}>
                    {fmtMoney(filteredTrips.reduce((sum, t) => sum + (parseFloat(t.revenue || t.fare_amount || 0) || 0), 0))}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Rules (Matches Vehicles/Drivers standard layout) */}
      <div className="mt-4 flex items-center gap-6">
        <div className="text-xs text-muted font-medium flex items-center gap-1">
          <Info size={14} /> Trips move here when they are marked Completed on the Trips page
        </div>
        <div className="text-xs text-muted font-medium flex items-center gap-1">
          <Info size={14} /> Billed trips are already on a customer statement
        </div>
      </div>
    </div>
  );
}
